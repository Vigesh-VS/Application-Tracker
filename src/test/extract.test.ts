// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  validateJobUrl,
  isPrivateAddress,
  htmlToText,
  extractJobPostingJsonLd,
  buildPageContent,
  sanitizeExtracted,
  handleExtractRequest,
} from '../../api/_lib/extract';

describe('validateJobUrl (SSRF guard)', () => {
  it('accepts normal job URLs and adds https when missing', () => {
    expect(validateJobUrl('https://www.linkedin.com/jobs/view/123').hostname).toBe('www.linkedin.com');
    expect(validateJobUrl('careers.google.com/jobs/1').protocol).toBe('https:');
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1/admin',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.20.1.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://0.0.0.0',
    'http://metadata.google.internal',
    'ftp://example.com/file',
    'http://user:pass@example.com',
  ])('rejects %s', (url) => {
    expect(() => validateJobUrl(url)).toThrow();
  });

  it('rejects empty and overly long input', () => {
    expect(() => validateJobUrl('')).toThrow('URL is required');
    expect(() => validateJobUrl('https://a.com/' + 'x'.repeat(3000))).toThrow('too long');
  });
});

describe('isPrivateAddress', () => {
  it('detects private and public addresses', () => {
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('fd12::1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});

const SAMPLE_HTML = `<!doctype html><html><head>
<title>Frontend Intern - Acme | Careers</title>
<meta name="description" content="Join Acme as a frontend intern">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme"},
{"@type":"JobPosting","title":"Frontend Intern","hiringOrganization":{"name":"Acme Corp"},"jobLocationType":"TELECOMMUTE"}]}</script>
<style>.x{color:red}</style><script>var secret = 1;</script>
</head><body><h1>Frontend Intern</h1><p>Build UIs &amp; ship features.</p><ul><li>React</li><li>TypeScript</li></ul></body></html>`;

describe('page content extraction', () => {
  it('strips scripts/styles and keeps readable text', () => {
    const text = htmlToText(SAMPLE_HTML);
    expect(text).toContain('Build UIs & ship features.');
    expect(text).toContain('- React');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('color:red');
  });

  it('finds schema.org JobPosting data, including inside @graph', () => {
    const postings = extractJobPostingJsonLd(SAMPLE_HTML) as Array<{ title: string }>;
    expect(postings).toHaveLength(1);
    expect(postings[0].title).toBe('Frontend Intern');
  });

  it('builds a combined, length-limited content block', () => {
    const content = buildPageContent(SAMPLE_HTML);
    expect(content).toContain('Structured data');
    expect(content).toContain('Page title: Frontend Intern - Acme | Careers');
    expect(content).toContain('Description: Join Acme as a frontend intern');
    expect(buildPageContent('<p>' + 'a '.repeat(50000) + '</p>').length).toBeLessThanOrEqual(15000);
  });
});

describe('sanitizeExtracted', () => {
  it('normalises AI output', () => {
    expect(
      sanitizeExtracted({
        company_name: '  Acme ',
        position_title: 'Intern',
        job_type: 'On-site',
        salary_min: '1,200,000',
        salary_max: 600000,
        salary_currency: 'inr',
        location: 'null',
        job_description: 'Do things.',
      })
    ).toEqual({
      company_name: 'Acme',
      position_title: 'Intern',
      job_type: 'onsite',
      salary_min: 600000,
      salary_max: 1200000,
      salary_currency: 'INR',
      location: null,
      job_description: 'Do things.',
    });
  });

  it('drops currency when there is no salary and rejects unknown job types', () => {
    const out = sanitizeExtracted({ salary_currency: 'USD', job_type: 'flexible', salary_min: 0 });
    expect(out.salary_currency).toBeNull();
    expect(out.job_type).toBeNull();
    expect(out.salary_min).toBeNull();
  });
});

describe('handleExtractRequest', () => {
  const env = { VITE_FIREBASE_PROJECT_ID: 'demo-project', GEMINI_API_KEY: 'x' };
  const post = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/extract-job-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ url: 'https://example.com/job' }),
    });

  it('requires sign-in', async () => {
    const res = await handleExtractRequest(post(), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'Authentication required' });
  });

  it('rejects forged tokens', async () => {
    const fake = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IngifQ.eyJzdWIiOiJ1In0.c2ln';
    const res = await handleExtractRequest(post({ Authorization: `Bearer ${fake}` }), env);
    expect(res.status).toBe(401);
  });

  it('handles CORS preflight and wrong methods', async () => {
    expect((await handleExtractRequest(new Request('http://x', { method: 'OPTIONS' }), env)).status).toBe(204);
    expect((await handleExtractRequest(new Request('http://x', { method: 'GET' }), env)).status).toBe(405);
  });

  it('reports missing server config clearly', async () => {
    const res = await handleExtractRequest(post({ Authorization: 'Bearer x' }), {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/FIREBASE_PROJECT_ID/);
  });
});

describe('validateJobUrl scheme handling', () => {
  it('keeps host:port inputs and rejects odd schemes', () => {
    expect(validateJobUrl('jobs.example.com:8443/role/1').port).toBe('8443');
    expect(() => validateJobUrl('javascript:alert(1)')).toThrow();
    expect(() => validateJobUrl('file:///etc/passwd')).toThrow();
  });
});
