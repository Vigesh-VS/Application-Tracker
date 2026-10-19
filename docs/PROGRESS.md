# Progress

## Done

### Firebase rebuild
- Firebase Auth (Google) and Firestore replace Supabase; security rules mirror the old policies.
- AI *Import from URL* moved to a Vercel function using Gemini.
- Supabase CSV import script.

### Import from URL fixed
- Cause: JavaScript-rendered pages (e.g. Unstop) gave the server an empty page.
- LinkedIn link rewriting and guest endpoint, Unstop API adapter, JSON-LD and meta tags first, login-wall and empty-page detection, *Paste job description* fallback, specific error messages.
- Tested with real links: LinkedIn, Unstop, Internshala, Lever, Greenhouse work; Naukri blocks automated reads and uses the paste fallback.

### Performance

| Metric (production build) | Before | After |
|---|---|---|
| First-visit JavaScript (gzip) | 534 KB | 180 KB |
| Lighthouse mobile, landing page | 50 (TBT 5.9 s) | 73–87 (TBT 0–220 ms) |
| Lighthouse desktop, landing page | 68 | 100 |
| Idle frame rate (Intel Iris Xe, 1904×929) | 34 fps | 60 fps |
| Idle GPU-process CPU per 10 s | 4.0 s | ~1.0 s |

- three.js background replaced by a WebGL2 renderer in a Web Worker (same look, verified by screenshot diff).
- Sign-in no longer waits for Firestore; one profile read instead of two; admin check cached.
- Firestore and charts load on demand; 60 unused packages and 31 unused UI components removed.
- `backdrop-blur` kept: removing or shrinking it visibly changes the frosted look (it costs about 1.9 s GPU-process CPU per 10 s with 24 cards on screen).

### Security guardrails
- Prompt-injection protection, output cap, answer sanitising and leak check.
- Live evaluation against Gemini: 6/6 attack inputs handled safely (no leaked instructions, no attacker-chosen values, no links or images, no hangs); 3/3 normal postings extracted correctly; about 1–1.6 s per import.
- Rate limit, request/page size caps, non-web-page links refused, same-origin API, private logs.
- Security headers with CSP (tested in Chrome on the landing and login pages and the Google sign-in popup: no violations).
- Job links only clickable for `http(s)` addresses (blocked `javascript:` links).
- Dependency fixes; remaining advisories are build-only or not reachable.

### Repository
- README rewritten for the public repository: screenshots (sample data), feature list, flowcharts, setup, security and performance.
- Supabase migration steps moved to `docs/MIGRATION.md`.

### Landing page
- Hero: single centered *Get Started Free* button.
- *Everything You Need*: three features (Bulk Operations removed), evenly aligned.
- *Take Control*: benefits in one aligned column.
- *Ready to Get Organized?*: description rewritten to describe this app.
- Footer: *Contribute* button (links to the GitHub repository) replaces the logo.

## Known limits
- The rate limit lives in server memory, so it is per Vercel instance.
- Naukri blocks automated reads; use *Paste job description*.
- The Google Fonts `@import` in `src/index.css` comes after other rules, so browsers ignore it and the site uses the system font. Left as is to keep the current look.
- Remaining `npm audit` items need Tailwind CSS 4 and React Router 7 migrations.

## Next
- Push to a new GitHub repository, deploy as a new Vercel project, add the domain to Firebase authorized domains, then delete the old Vercel project.
