// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fake a valid Firebase token and public DNS so the full flow can run offline
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: vi.fn(async () => ({ payload: { sub: 'user-123' } })),
}));
vi.mock('node:dns/promises', () => {
  const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
  return { lookup, default: { lookup } };
});

import {
  handleExtractRequest,
  normalizeJobUrl,
  linkedInGuestUrl,
  unstopApiUrl,
  unstopToContent,
  analyzePage,
  geminiError,
} from '../../api/_lib/extract';
import { jwtVerify } from 'jose';

const geminiReply = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }));

const post = (body: unknown) =>
  new Request('http://localhost/api/extract-job-details', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const env = { VITE_FIREBASE_PROJECT_ID: 'demo', GEMINI_API_KEY: 'key' };
const JOB = { company_name: 'Acme', position_title: 'SDE Intern', job_description: 'Build things.' };
const LONG_TEXT = 'We are hiring a backend intern to build APIs in Go and Postgres. '.repeat(10);
const SPA_SHELL = '<html><head><title>Unstop</title></head><body><app-root></app-root><script src="main.js"></script></body></html>';

describe('site-specific URL handling', () => {
  it('rewrites logged-in LinkedIn links to the public job page', () => {
    const u = (s: string) => normalizeJobUrl(new URL(s)).toString();
    expect(u('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4480150200')).toBe(
      'https://www.linkedin.com/jobs/view/4480150200'
    );
    expect(u('https://in.linkedin.com/jobs/view/python-backend-engineer-at-hitachi-4471319619/?trk=x')).toBe(
      'https://www.linkedin.com/jobs/view/4471319619'
    );
    expect(u('https://www.linkedin.com/jobs/search/?currentJobId=abc')).toContain('currentJobId=abc');
    expect(u('https://jobs.lever.co/acme/123')).toBe('https://jobs.lever.co/acme/123');
  });

  it('maps LinkedIn job pages to the guest endpoint', () => {
    expect(linkedInGuestUrl(new URL('https://www.linkedin.com/jobs/view/123456'))?.toString()).toBe(
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/123456'
    );
    expect(linkedInGuestUrl(new URL('https://www.linkedin.com/feed/'))).toBeNull();
    expect(linkedInGuestUrl(new URL('https://notlinkedin.com/jobs/view/123456'))).toBeNull();
  });

  it('maps Unstop listings to the public API', () => {
    expect(unstopApiUrl(new URL('https://unstop.com/jobs/business-development-executive-yhills-1580585'))?.toString()).toBe(
      'https://unstop.com/api/public/competition/1580585'
    );
    expect(unstopApiUrl(new URL('https://unstop.com/internships/'))).toBeNull();
    expect(unstopApiUrl(new URL('https://example.com/jobs/x-1580585'))).toBeNull();
  });

  it('turns the Unstop API response into readable content', () => {
    const content = unstopToContent({
      data: {
        competition: {
          title: 'BD Executive',
          organisation: { name: 'YHills' },
          locations: [{ city: 'Bengaluru', state: 'Karnataka', country: 'India' }],
          region: 'offline',
          job_detail: { min_salary: 300000, max_salary: 500000 },
          details: '<p>Sell &amp; grow.</p>',
        },
      },
    });
    expect(content).toContain('Title: BD Executive');
    expect(content).toContain('Company: YHills');
    expect(content).toContain('Bengaluru, Karnataka, India');
    expect(content).toContain('"max_salary":500000');
    expect(content).toContain('Sell & grow.');
  });
});

describe('analyzePage', () => {
  it('flags JavaScript-only shells and keeps meta tags', () => {
    const shell = analyzePage(SPA_SHELL);
    expect(shell.hasJobPosting).toBe(false);
    expect(shell.textChars).toBeLessThan(200);

    const withMeta = analyzePage(
      '<html><head><meta property="og:title" content="Data Intern at Acme"><meta property="og:description" content="Pune, 30k/month"></head><body></body></html>'
    );
    expect(withMeta.hasOgTitle).toBe(true);
    expect(withMeta.content).toContain('og:title: Data Intern at Acme');
    expect(withMeta.content).toContain('Description: Pune, 30k/month');
  });
});

describe('geminiError', () => {
  const err = (status: number, body: unknown) => geminiError(status, JSON.stringify(body), 'gemini-x');
  it('names the exact problem', () => {
    expect(
      err(400, { error: { message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } }).message
    ).toMatch(/Gemini API key is invalid/);
    expect(err(404, { error: { message: 'models/gemini-x is not found' } }).message).toMatch(/model "gemini-x" not found/);
    expect(err(400, { error: { message: 'Invalid JSON payload: responseSchema' } }).message).toBe(
      'Gemini rejected the request: Invalid JSON payload: responseSchema'
    );
    expect(err(429, {}).code).toBe('rate_limit');
    expect(err(503, {}).message).toMatch(/unavailable/);
  });
});

describe('fallbacks (network mocked)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('extracts from pasted text without fetching any page', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply(JOB));
    const res = await handleExtractRequest(post({ text: LONG_TEXT, url: 'acme.com/jobs/1' }), env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ company_name: 'Acme', job_url: 'https://acme.com/jobs/1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
    expect(fetchMock.mock.calls[0][1].body).toContain('Pasted job description');
  });

  it('pasted text: ignores an unusable URL and rejects too-short text', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply(JOB));
    const ok = await handleExtractRequest(post({ text: LONG_TEXT, url: 'http://127.0.0.1/x' }), env);
    expect((await ok.json()).data.job_url).toBeNull();

    const short = await handleExtractRequest(post({ text: 'Intern at Acme' }), env);
    expect(short.status).toBe(400);
    expect((await short.json()).error).toMatch(/a bit more/);
  });

  it('asks for pasted text when the page is a JavaScript shell (no Gemini call)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(SPA_SHELL));
    const res = await handleExtractRequest(post({ url: 'https://www.naukri.com/job-listings-x-123' }), env);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe('needs_text');
    expect(body.error).toMatch(/JavaScript/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('detects login walls after redirects', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://acme.com/login?next=/jobs/1' } }))
      .mockResolvedValueOnce(new Response('<html><body>' + '<p>Sign in to continue</p>'.repeat(50) + '</body></html>'));
    const res = await handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), env);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body).toMatchObject({ code: 'needs_text' });
    expect(body.error).toMatch(/requires a login/);
  });

  it('asks for pasted text when Gemini finds no job on the page', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(`<html><body><p>${LONG_TEXT}</p></body></html>`))
      .mockResolvedValueOnce(geminiReply({ company_name: null, position_title: null, job_description: null }));
    const res = await handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), env);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('needs_text');
  });

  it('uses the Unstop API instead of the empty page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { competition: { title: 'BD Executive', organisation: { name: 'YHills' }, details: `<p>${LONG_TEXT}</p>` } } }))
      )
      .mockResolvedValueOnce(geminiReply({ ...JOB, company_name: 'YHills' }));
    const res = await handleExtractRequest(post({ url: 'https://unstop.com/jobs/bd-executive-yhills-1580585' }), env);
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://unstop.com/api/public/competition/1580585');
    expect(fetchMock.mock.calls[1][1].body).toContain('Company: YHills');
  });

  it('rewrites LinkedIn links, reads the guest endpoint and stores the public URL', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(`<section><h2>SDE Intern</h2><p>${LONG_TEXT}</p></section>`))
      .mockResolvedValueOnce(geminiReply(JOB));
    const res = await handleExtractRequest(
      post({ url: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4480150200' }),
      env
    );
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/jobs-guest/jobs/api/jobPosting/4480150200');
    expect((await res.json()).data.job_url).toBe('https://www.linkedin.com/jobs/view/4480150200');
  });

  it('retries a page once after HTTP 429, then explains the block', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }));
    const pending = handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), env);
    await vi.runAllTimersAsync();
    const res = await pending;
    const body = await res.json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ code: 'needs_text' });
    expect(body.error).toMatch(/acme\.com blocked the automatic import \(HTTP 429\)/);
  });

  it('falls back to a direct fetch when Firecrawl fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'quota' }), { status: 402 }))
      .mockResolvedValueOnce(new Response(`<html><body><p>${LONG_TEXT}</p></body></html>`))
      .mockResolvedValueOnce(geminiReply(JOB));
    const res = await handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), { ...env, FIRECRAWL_API_KEY: 'fc' });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.firecrawl.dev');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://acme.com/jobs/1');
  });

  it('reports expired page-not-found and invalid Gemini key specifically', async () => {
    fetchMock.mockResolvedValueOnce(new Response('gone', { status: 404 }));
    const gone = await handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), env);
    expect((await gone.json()).error).toMatch(/not found.*expired/);

    fetchMock
      .mockResolvedValueOnce(new Response(`<html><body><p>${LONG_TEXT}</p></body></html>`))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } }), {
          status: 400,
        })
      );
    const badKey = await handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), env);
    expect(badKey.status).toBe(500);
    expect(await badKey.json()).toMatchObject({ code: 'config', error: expect.stringMatching(/GEMINI_API_KEY/) });
  });

  it('tells the user when their sign-in has expired', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(Object.assign(new Error('"exp" claim timestamp check failed'), { code: 'ERR_JWT_EXPIRED' }));
    const res = await handleExtractRequest(post({ url: 'https://acme.com/jobs/1' }), env);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign-in has expired/);
  });
});
