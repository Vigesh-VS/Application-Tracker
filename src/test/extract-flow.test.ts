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

import { handleExtractRequest } from '../../api/_lib/extract';
import { lookup } from 'node:dns/promises';

const JOB_HTML = `<html><head><title>SDE Intern</title>
<script type="application/ld+json">{"@type":"JobPosting","title":"SDE Intern","hiringOrganization":{"name":"Acme"}}</script>
</head><body><p>We are hiring an SDE intern in Bengaluru. Stipend 50,000 per month. Hybrid work.</p></body></html>`;

const geminiReply = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), {
    status: 200,
  });

const request = (url: string) =>
  new Request('http://localhost/api/extract-job-details', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

const env = { VITE_FIREBASE_PROJECT_ID: 'demo', GEMINI_API_KEY: 'key' };

describe('extract-job-details full flow (network mocked)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the page directly, asks Gemini, returns cleaned data', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JOB_HTML, { status: 200 }))
      .mockResolvedValueOnce(
        geminiReply({
          company_name: 'Acme',
          position_title: 'SDE Intern',
          location: 'Bengaluru, India',
          job_type: 'hybrid',
          salary_min: 600000,
          salary_max: 600000,
          salary_currency: 'INR',
          job_description: 'Build things.',
        })
      );

    const res = await handleExtractRequest(request('acme.com/jobs/1'), env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      company_name: 'Acme',
      job_type: 'hybrid',
      salary_currency: 'INR',
      job_url: 'https://acme.com/jobs/1',
    });

    // Gemini got the page content incl. structured data, with the key in a header (not the URL)
    const [geminiUrl, geminiInit] = fetchMock.mock.calls[1];
    expect(String(geminiUrl)).toContain('generativelanguage.googleapis.com');
    expect(String(geminiUrl)).not.toContain('key=');
    expect(geminiInit.headers['x-goog-api-key']).toBe('key');
    expect(geminiInit.body).toContain('JobPosting');
    expect(geminiInit.body).toContain('Stipend 50,000 per month');
  });

  it('uses Firecrawl when FIRECRAWL_API_KEY is set', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { markdown: '# SDE Intern at Acme\nGreat role in Pune, remote friendly. Work on the payments platform with React and Go.' } }))
      )
      .mockResolvedValueOnce(geminiReply({ company_name: 'Acme', position_title: 'SDE Intern', job_description: 'x' }));

    const res = await handleExtractRequest(request('https://acme.com/jobs/1'), { ...env, FIRECRAWL_API_KEY: 'fc' });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.firecrawl.dev');
  });

  it('refuses hostnames that resolve to private IPs (DNS rebinding)', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.7', family: 4 }] as never);
    const res = await handleExtractRequest(request('https://evil.example.com'), env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-checks redirect targets', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    const res = await handleExtractRequest(request('https://acme.com/r'), env);
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives a helpful message when a site blocks scraping', async () => {
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    const res = await handleExtractRequest(request('https://acme.com/jobs/1'), env);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/blocked/);
  });

  it('surfaces Gemini rate limits after retrying', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response(JOB_HTML))
      .mockResolvedValue(new Response('slow down', { status: 429 }));
    const pending = handleExtractRequest(request('https://acme.com/jobs/1'), env);
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(4); // page + 3 Gemini attempts
  });
});
