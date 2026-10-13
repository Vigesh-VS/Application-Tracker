/**
 * "Import from URL" backend — replaces the old Supabase edge function `extract-job-details`.
 *
 * Flow: verify Firebase ID token → validate URL (SSRF guard) → get page content
 * (Firecrawl if FIRECRAWL_API_KEY is set, otherwise a direct fetch) → Gemini extracts
 * structured job details → JSON back to the form.
 *
 * Framework-free: takes a standard Request and returns a standard Response, so the same
 * code runs on Vercel (api/extract-job-details.ts) and in `npm run dev` (vite.config.ts).
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type Env = Record<string, string | undefined>;

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const MAX_PAGE_BYTES = 3_000_000;
const MAX_CONTENT_CHARS = 15_000;
const FETCH_TIMEOUT_MS = 15_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Auth: verify the Firebase ID token sent by the browser (no service account needed)
// ---------------------------------------------------------------------------
const firebaseJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export async function verifyFirebaseToken(authHeader: string | null, projectId: string) {
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const { payload } = await jwtVerify(token, firebaseJwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub) throw new Error('missing subject');
    return payload.sub;
  } catch {
    throw new HttpError(401, 'Invalid authentication');
  }
}

// ---------------------------------------------------------------------------
// URL validation (SSRF protection)
// ---------------------------------------------------------------------------
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast / reserved
    );
  }
  if (isIP(ip) === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('::ffff:')) return isPrivateAddress(ip.slice(7)); // IPv4-mapped
    return /^(fe[89ab][0-9a-f]|fc|fd|ff)/.test(ip);
  }
  return false;
}

export function validateJobUrl(url: unknown): URL {
  if (!url || typeof url !== 'string') throw new HttpError(400, 'URL is required');
  if (url.length > 2048) throw new HttpError(400, 'URL is too long');

  let parsed: URL;
  try {
    const trimmed = url.trim();
    // Only add https:// when no scheme was given (so "ftp://…" is rejected, not rewritten)
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^:]+\.[^:]+:\d/.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new HttpError(400, 'Invalid URL format');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, 'Only HTTP/HTTPS URLs are allowed');
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || isPrivateAddress(host)) {
    throw new HttpError(400, 'Private/internal URLs are not allowed');
  }
  if (parsed.username || parsed.password) throw new HttpError(400, 'URLs with credentials are not allowed');
  return parsed;
}

/** Also check what the hostname resolves to, so a public name can't point at a private IP. */
async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return; // already checked in validateJobUrl
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new HttpError(400, 'Could not resolve that website. Check the URL.');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new HttpError(400, 'Private/internal URLs are not allowed');
  }
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------
const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Most job boards (LinkedIn, Indeed, Greenhouse, Lever, Workday…) embed schema.org JobPosting data. */
export function extractJobPostingJsonLd(html: string): unknown[] {
  const found: unknown[] = [];
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) found.push(obj);
    if (obj['@graph']) visit(obj['@graph']);
  };
  for (const [, raw] of blocks) {
    try {
      visit(JSON.parse(raw.trim()));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return found;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? '').trim() || null : null;
}

export function buildPageContent(html: string): string {
  const parts: string[] = [];
  const jsonLd = extractJobPostingJsonLd(html);
  if (jsonLd.length > 0) {
    parts.push('Structured data (schema.org JobPosting):\n' + JSON.stringify(jsonLd).slice(0, 8000));
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const meta = [
    title && `Page title: ${decodeEntities(title).trim()}`,
    metaContent(html, 'og:title') && `og:title: ${metaContent(html, 'og:title')}`,
    metaContent(html, 'og:site_name') && `Site: ${metaContent(html, 'og:site_name')}`,
    metaContent(html, 'description') && `Description: ${metaContent(html, 'description')}`,
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join('\n'));
  parts.push('Page text:\n' + htmlToText(html));
  return parts.join('\n\n').slice(0, MAX_CONTENT_CHARS);
}

async function fetchDirect(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(url);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      url = validateJobUrl(new URL(location, url).toString()); // re-check every redirect
      continue;
    }
    if (!response.ok) {
      throw new HttpError(
        502,
        response.status === 403 || response.status === 429
          ? 'That site blocked the automatic import. Please fill the form manually (or set FIRECRAWL_API_KEY).'
          : `Could not open the job page (HTTP ${response.status})`
      );
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_PAGE_BYTES) throw new HttpError(400, 'The page is too large to import');
    const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
    return buildPageContent(html);
  }
  throw new HttpError(400, 'Too many redirects');
}

async function fetchWithFirecrawl(url: URL, apiKey: string): Promise<string> {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.toString(), formats: ['markdown'], onlyMainContent: true }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    console.error('Firecrawl error:', response.status, data?.error);
    throw new HttpError(502, 'Failed to scrape the job posting page');
  }
  const markdown: string | undefined = data.data?.markdown ?? data.markdown;
  if (!markdown) throw new HttpError(400, 'No content found on the page');
  return markdown.slice(0, MAX_CONTENT_CHARS);
}

// ---------------------------------------------------------------------------
// Gemini extraction
// ---------------------------------------------------------------------------
export interface ExtractedJob {
  company_name: string | null;
  position_title: string | null;
  location: string | null;
  job_type: 'remote' | 'hybrid' | 'onsite' | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  job_description: string | null;
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    company_name: { type: 'STRING', nullable: true, description: 'Company that is hiring' },
    position_title: { type: 'STRING', nullable: true, description: 'Job title' },
    location: { type: 'STRING', nullable: true, description: 'City, state/region, country' },
    job_type: { type: 'STRING', nullable: true, enum: ['remote', 'hybrid', 'onsite'] },
    salary_min: { type: 'NUMBER', nullable: true, description: 'Minimum annual salary' },
    salary_max: { type: 'NUMBER', nullable: true, description: 'Maximum annual salary' },
    salary_currency: { type: 'STRING', nullable: true, description: 'ISO 4217 code, e.g. INR, USD' },
    job_description: { type: 'STRING', nullable: true, description: '2-3 sentence summary of the role' },
  },
  required: ['company_name', 'position_title', 'job_description'],
};

const PROMPT = `You extract structured data from job and internship postings.
Return only the JSON object described by the schema.

Rules:
- company_name: the employer (not the job board, e.g. not "LinkedIn" or "Indeed").
- job_type: "remote", "hybrid" or "onsite"; null if not stated.
- Salary: use the currency stated in the posting and give its ISO code in salary_currency
  (e.g. INR, USD, EUR, GBP, AED, SGD, CAD, AUD). Convert to an ANNUAL amount:
  monthly x 12, hourly x 2080. Indian "LPA" means lakh per annum (12 LPA = 1200000 INR).
  If no salary or stipend is given, use null for salary_min, salary_max and salary_currency.
- job_description: a brief 2-3 sentence summary of the role.
- Use null for anything that cannot be determined. Do not invent details.

Job posting content:
`;

export function sanitizeExtracted(raw: Record<string, unknown>): ExtractedJob {
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : null;
  const num = (v: unknown) => {
    const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const jobType = typeof raw.job_type === 'string' ? raw.job_type.toLowerCase().replace(/[-\s]/g, '') : null;
  let salary_min = num(raw.salary_min);
  let salary_max = num(raw.salary_max);
  if (salary_min && salary_max && salary_min > salary_max) [salary_min, salary_max] = [salary_max, salary_min];
  const currency = str(raw.salary_currency, 10)?.toUpperCase() ?? null;
  return {
    company_name: str(raw.company_name, 300),
    position_title: str(raw.position_title, 300),
    location: str(raw.location, 300),
    job_type: jobType === 'remote' || jobType === 'hybrid' || jobType === 'onsite' ? jobType : null,
    salary_min,
    salary_max,
    salary_currency: salary_min || salary_max ? currency : null,
    job_description: str(raw.job_description, 5000),
  };
}

async function extractWithGemini(content: string, apiKey: string, model: string): Promise<ExtractedJob> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: PROMPT + content }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    if (response.status !== 429 && response.status !== 503) break;
    await new Promise((r) => setTimeout(r, 2 ** (attempt + 1) * 1000 + Math.random() * 500));
  }

  if (!response!.ok) {
    const detail = await response!.text().catch(() => '');
    console.error('Gemini API error:', response!.status, detail.slice(0, 500));
    if (response!.status === 429) throw new HttpError(429, 'AI rate limit reached. Please try again in a minute.');
    if (response!.status === 400 && /API key/i.test(detail)) throw new HttpError(500, 'GEMINI_API_KEY is invalid');
    if (response!.status === 404) throw new HttpError(500, `Gemini model "${model}" not found. Set GEMINI_MODEL.`);
    throw new HttpError(502, 'Failed to extract job details');
  }

  const data = await response!.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) throw new HttpError(502, 'Failed to parse job details');
  try {
    return sanitizeExtracted(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
  } catch {
    throw new HttpError(502, 'Failed to parse job details');
  }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------
export async function handleExtractRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) throw new HttpError(500, 'FIREBASE_PROJECT_ID is not configured on the server');
    const uid = await verifyFirebaseToken(request.headers.get('authorization'), projectId);

    const geminiKey = env.GEMINI_API_KEY;
    if (!geminiKey) throw new HttpError(500, 'AI service not configured (GEMINI_API_KEY missing)');

    const body = await request.json().catch(() => ({}));
    const url = validateJobUrl((body as { url?: unknown }).url);

    console.log(`User ${uid} importing job URL from ${url.hostname}`);
    const content = env.FIRECRAWL_API_KEY ? await fetchWithFirecrawl(url, env.FIRECRAWL_API_KEY) : await fetchDirect(url);
    if (content.replace(/\s/g, '').length < 50) throw new HttpError(400, 'No content found on the page');

    const extracted = await extractWithGemini(content, geminiKey, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    if (!extracted.company_name && !extracted.position_title) {
      throw new HttpError(422, "Couldn't find job details on that page. It may need a login — try filling it manually.");
    }

    return json({ success: true, data: { ...extracted, job_url: url.toString() } });
  } catch (error) {
    if (error instanceof HttpError) return json({ success: false, error: error.message }, error.status);
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('Error extracting job details:', error);
    return json(
      { success: false, error: isTimeout ? 'The job page took too long to respond' : 'Failed to extract job details' },
      isTimeout ? 504 : 500
    );
  }
}
