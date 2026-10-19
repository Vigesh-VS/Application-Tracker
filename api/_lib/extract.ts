/**
 * "Import from URL" backend — replaces the old Supabase edge function `extract-job-details`.
 *
 * Flow: verify Firebase ID token → validate URL (SSRF guard) → get page content
 * (Firecrawl first if FIRECRAWL_API_KEY is set, then a direct fetch; site adapters for
 * LinkedIn and Unstop) → Gemini extracts structured job details → JSON back to the form.
 * Instead of a URL the browser can also send pasted job description text.
 *
 * Errors come back as { success: false, error, code } so the form can react, e.g.
 * code "needs_text" means "this page can't be read automatically, paste the text instead".
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
const MAX_PASTED_CHARS = 50_000;
const MIN_PASTED_CHARS = 50;
const MIN_PAGE_TEXT_CHARS = 200;
const FETCH_TIMEOUT_MS = 15_000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

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

/** Machine-readable error kinds; the form uses `needs_text` to offer the paste-text fallback. */
export type ErrorCode =
  | 'config'
  | 'needs_text'
  | 'not_found'
  | 'fetch_failed'
  | 'timeout'
  | 'rate_limit'
  | 'ai_error';

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: ErrorCode) {
    super(message);
  }
}

const isTimeoutError = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

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
  } catch (error) {
    const code = (error as { code?: string })?.code ?? (error as Error)?.name;
    const claim = (error as { claim?: string })?.claim;
    console.error(`Firebase token rejected (${code}${claim ? `, claim ${claim}` : ''}): ${(error as Error)?.message}`);
    if (code === 'ERR_JWT_EXPIRED') {
      throw new HttpError(401, 'Your sign-in has expired. Refresh the page and try again.');
    }
    if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && (claim === 'iss' || claim === 'aud')) {
      throw new HttpError(
        401,
        'Sign-in token belongs to a different Firebase project. Check VITE_FIREBASE_PROJECT_ID on the server.'
      );
    }
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
    throw new HttpError(400, 'Could not resolve that website. Check the URL.', 'fetch_failed');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new HttpError(400, 'Private/internal URLs are not allowed');
  }
}

// ---------------------------------------------------------------------------
// Site-specific URL handling
// ---------------------------------------------------------------------------
const isHost = (url: URL, domain: string) => url.hostname === domain || url.hostname.endsWith(`.${domain}`);

/**
 * Rewrites links that only work when logged in to their public equivalent.
 * LinkedIn: ".../jobs/search/?currentJobId=123" or ".../jobs/collections/...?currentJobId=123"
 * redirect to a login page, but "/jobs/view/123" is public.
 */
export function normalizeJobUrl(url: URL): URL {
  if (isHost(url, 'linkedin.com')) {
    const id =
      url.searchParams.get('currentJobId') ?? url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/)?.[1];
    if (id && /^\d+$/.test(id)) return new URL(`https://www.linkedin.com/jobs/view/${id}`);
  }
  return url;
}

/** LinkedIn's public guest endpoint returns just the job card: smaller and cleaner than the full page. */
export function linkedInGuestUrl(url: URL): URL | null {
  const id = isHost(url, 'linkedin.com') ? url.pathname.match(/^\/jobs\/view\/(\d+)$/)?.[1] : undefined;
  return id ? new URL(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`) : null;
}

/** Unstop pages are an empty JavaScript shell, but every listing has a public JSON endpoint. */
export function unstopApiUrl(url: URL): URL | null {
  if (!isHost(url, 'unstop.com')) return null;
  const id = url.pathname.match(/(?:-|\/)(\d{4,})\/?$/)?.[1];
  return id ? new URL(`https://unstop.com/api/public/competition/${id}`) : null;
}

export function unstopToContent(data: unknown): string {
  const root = (data as { data?: { competition?: unknown } })?.data;
  const o = ((root?.competition ?? root) || {}) as Record<string, unknown>;
  const org = (o.organisation as { name?: string } | undefined)?.name;
  const locations = Array.isArray(o.locations)
    ? (o.locations as Array<Record<string, string | null>>)
        .map((l) => [l.city, l.state, l.country].filter(Boolean).join(', '))
        .filter(Boolean)
    : [];
  return [
    o.title && `Title: ${o.title}`,
    org && `Company: ${org}`,
    o.type && `Listing type: ${o.type}`,
    locations.length > 0 && `Locations: ${locations.join(' | ')}`,
    o.region && `Region (online = remote, offline = on-site): ${o.region}`,
    o.job_detail && `Job details: ${JSON.stringify(o.job_detail)}`,
    typeof o.details === 'string' && `Description:\n${htmlToText(o.details)}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_CONTENT_CHARS);
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
  return analyzePage(html).content;
}

export interface PageAnalysis {
  content: string;
  hasJobPosting: boolean;
  hasOgTitle: boolean;
  textChars: number;
}

/** Structured data and meta tags first (they survive JavaScript-rendered pages), then visible text. */
export function analyzePage(html: string): PageAnalysis {
  const parts: string[] = [];
  const jsonLd = extractJobPostingJsonLd(html);
  if (jsonLd.length > 0) {
    parts.push('Structured data (schema.org JobPosting):\n' + JSON.stringify(jsonLd).slice(0, 8000));
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const ogTitle = metaContent(html, 'og:title');
  const siteName = metaContent(html, 'og:site_name');
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description');
  const meta = [
    title && `Page title: ${decodeEntities(title).trim()}`,
    ogTitle && `og:title: ${ogTitle}`,
    siteName && `Site: ${siteName}`,
    description && `Description: ${description}`,
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join('\n'));
  const text = htmlToText(html);
  parts.push('Page text:\n' + text);
  return {
    content: parts.join('\n\n').slice(0, MAX_CONTENT_CHARS),
    hasJobPosting: jsonLd.length > 0,
    hasOgTitle: !!ogTitle,
    textChars: text.replace(/\s/g, '').length,
  };
}

const PASTE_HINT = 'Paste the job description below instead.';

function pageStatusError(status: number, host: string): HttpError {
  if (status === 403 || status === 429 || status === 999) {
    // 999 is LinkedIn's "we think you're a bot" status
    return new HttpError(502, `${host} blocked the automatic import (HTTP ${status}). ${PASTE_HINT}`, 'needs_text');
  }
  if (status === 401) return new HttpError(502, `${host} requires a login to view this job. ${PASTE_HINT}`, 'needs_text');
  if (status === 404 || status === 410) {
    return new HttpError(502, `Job page not found on ${host} (HTTP ${status}). The listing may have expired.`, 'not_found');
  }
  return new HttpError(502, `Could not open the job page on ${host} (HTTP ${status})`, 'fetch_failed');
}

/** Fetches a public URL, re-running the SSRF checks on every redirect hop. */
async function fetchPublic(start: URL, accept: string): Promise<{ body: string; finalUrl: URL }> {
  let url = start;
  let retried = false;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(url);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { ...BROWSER_HEADERS, Accept: accept },
      });
    } catch (error) {
      if (isTimeoutError(error)) throw new HttpError(504, `${url.hostname} took too long to respond`, 'timeout');
      console.error(`Fetch to ${url.hostname} failed:`, error);
      throw new HttpError(502, `Couldn't connect to ${url.hostname}`, 'fetch_failed');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      url = validateJobUrl(new URL(location, url).toString()); // re-check every redirect
      continue;
    }
    if (response.status === 429 && !retried) {
      // Job boards often rate-limit briefly; one short retry usually gets through
      retried = true;
      hop--;
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!response.ok) throw pageStatusError(response.status, url.hostname);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_PAGE_BYTES) throw new HttpError(400, 'The page is too large to import');
    return { body: (await response.text()).slice(0, MAX_PAGE_BYTES), finalUrl: url };
  }
  throw new HttpError(400, 'Too many redirects');
}

const LOGIN_PATH = /(^|\/)(login|signin|sign-in|authwall|uas\/login|checkpoint)(\/|$)/i;

async function fetchDirect(start: URL): Promise<string> {
  const unstop = unstopApiUrl(start);
  if (unstop) {
    const { body } = await fetchPublic(unstop, 'application/json');
    try {
      return unstopToContent(JSON.parse(body));
    } catch {
      throw new HttpError(502, 'Unstop returned an unexpected response', 'fetch_failed');
    }
  }

  const accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';
  const guest = linkedInGuestUrl(start);
  if (guest) {
    try {
      const { body } = await fetchPublic(guest, accept);
      const page = analyzePage(body);
      if (page.textChars >= MIN_PAGE_TEXT_CHARS) return page.content;
    } catch (error) {
      console.warn('LinkedIn guest endpoint failed, trying the job page:', (error as Error).message);
    }
  }

  const { body: html, finalUrl } = await fetchPublic(start, accept);
  const page = analyzePage(html);
  if (!page.hasJobPosting && LOGIN_PATH.test(finalUrl.pathname)) {
    throw new HttpError(422, `${start.hostname} requires a login to view this job. ${PASTE_HINT}`, 'needs_text');
  }
  if (!page.hasJobPosting && !page.hasOgTitle && page.textChars < MIN_PAGE_TEXT_CHARS) {
    throw new HttpError(
      422,
      `${start.hostname} builds this page with JavaScript, so it can't be read automatically. ${PASTE_HINT}`,
      'needs_text'
    );
  }
  return page.content;
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
    throw new HttpError(502, `Firecrawl could not read the page (HTTP ${response.status})`, 'fetch_failed');
  }
  const markdown: string | undefined = data.data?.markdown ?? data.markdown;
  if (!markdown) throw new HttpError(400, 'No content found on the page', 'needs_text');
  return markdown.slice(0, MAX_CONTENT_CHARS);
}

/** Firecrawl is an optional extra: when it's configured but fails, fall back to the direct fetch. */
async function getPageContent(url: URL, env: Env): Promise<string> {
  if (env.FIRECRAWL_API_KEY && !unstopApiUrl(url)) {
    try {
      return await fetchWithFirecrawl(url, env.FIRECRAWL_API_KEY);
    } catch (error) {
      console.warn('Firecrawl failed, falling back to a direct fetch:', (error as Error).message);
    }
  }
  return fetchDirect(url);
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

/** Turns a failed Gemini response into a message that says exactly what went wrong. */
export function geminiError(status: number, detail: string, model: string): HttpError {
  let message = '';
  let reason = '';
  try {
    const parsed = JSON.parse(detail)?.error;
    message = String(parsed?.message ?? '');
    reason = String(parsed?.details?.find((d: { reason?: string }) => d?.reason)?.reason ?? parsed?.status ?? '');
  } catch {
    message = detail;
  }
  if (status === 429) {
    return new HttpError(429, 'Gemini rate limit or free-tier quota reached. Try again in a minute.', 'rate_limit');
  }
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(reason + message)) {
    return new HttpError(500, 'Gemini API key is invalid or expired. Check GEMINI_API_KEY (Google AI Studio).', 'config');
  }
  if (status === 403) {
    return new HttpError(500, `Gemini API key is not allowed to use this API: ${message.slice(0, 200)}`, 'config');
  }
  if (status === 404) {
    return new HttpError(500, `Gemini model "${model}" not found for this key. Set GEMINI_MODEL to a current model.`, 'config');
  }
  if (status === 400) return new HttpError(502, `Gemini rejected the request: ${message.slice(0, 200)}`, 'ai_error');
  return new HttpError(502, `Gemini is unavailable right now (HTTP ${status}). Try again shortly.`, 'ai_error');
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
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      if (isTimeoutError(error)) throw new HttpError(504, 'Gemini took too long to respond. Try again.', 'timeout');
      console.error('Gemini request failed:', error);
      throw new HttpError(502, "Couldn't reach the Gemini API", 'ai_error');
    }
    if (response.status !== 429 && response.status !== 503) break;
    await new Promise((r) => setTimeout(r, 2 ** (attempt + 1) * 1000 + Math.random() * 500));
  }

  if (!response!.ok) {
    const detail = await response!.text().catch(() => '');
    console.error('Gemini API error:', response!.status, detail.slice(0, 500));
    throw geminiError(response!.status, detail, model);
  }

  const data = await response!.json();
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new HttpError(422, `Gemini refused to process this content (${blockReason})`, 'ai_error');
  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) {
    const finish = data?.candidates?.[0]?.finishReason;
    throw new HttpError(502, `Gemini returned no answer${finish ? ` (${finish})` : ''}`, 'ai_error');
  }
  try {
    return sanitizeExtracted(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
  } catch {
    throw new HttpError(502, 'Gemini returned malformed job details. Try again.', 'ai_error');
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
    if (!projectId) throw new HttpError(500, 'FIREBASE_PROJECT_ID is not configured on the server', 'config');
    const uid = await verifyFirebaseToken(request.headers.get('authorization'), projectId);

    const geminiKey = env.GEMINI_API_KEY;
    if (!geminiKey) throw new HttpError(500, 'AI service not configured (GEMINI_API_KEY missing)', 'config');

    const body = (await request.json().catch(() => ({}))) as { url?: unknown; text?: unknown };

    let content: string;
    let jobUrl: string | null;
    if (typeof body.text === 'string' && body.text.trim()) {
      // Pasted job description: nothing is fetched, the URL (if any) is only stored on the application
      const text = body.text.trim();
      if (text.length < MIN_PASTED_CHARS) {
        throw new HttpError(400, 'Paste a bit more of the job description (at least a few sentences).');
      }
      if (text.length > MAX_PASTED_CHARS) throw new HttpError(400, 'The pasted text is too long');
      content = 'Pasted job description:\n' + text.slice(0, MAX_CONTENT_CHARS);
      try {
        jobUrl = body.url ? validateJobUrl(body.url).toString() : null;
      } catch {
        jobUrl = null;
      }
      console.log(`User ${uid} importing pasted text (${text.length} chars)`);
    } else {
      const url = normalizeJobUrl(validateJobUrl(body.url));
      jobUrl = url.toString();
      console.log(`User ${uid} importing job URL from ${url.hostname}`);
      content = await getPageContent(url, env);
      console.log(`Page content: ${content.length} chars`);
      if (content.replace(/\s/g, '').length < 50) {
        throw new HttpError(422, `No readable content on that page. ${PASTE_HINT}`, 'needs_text');
      }
    }

    const extracted = await extractWithGemini(content, geminiKey, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    console.log(`Gemini result: company=${!!extracted.company_name} title=${!!extracted.position_title}`);
    if (!extracted.company_name && !extracted.position_title) {
      throw new HttpError(
        422,
        `Couldn't find job details there. The page may need a login. ${PASTE_HINT}`,
        'needs_text'
      );
    }

    return json({ success: true, data: { ...extracted, job_url: jobUrl } });
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn(`Import failed (${error.status}${error.code ? ` ${error.code}` : ''}): ${error.message}`);
      return json({ success: false, error: error.message, ...(error.code && { code: error.code }) }, error.status);
    }
    console.error('Error extracting job details:', error);
    return json({ success: false, error: 'Failed to extract job details', code: 'ai_error' }, 500);
  }
}
