# Security Policy

## Reporting a vulnerability

If you find a security problem (for example a way to read another user's data, bypass the Firestore rules, abuse the import API, or a leaked key), **please report it privately**:

- Use GitHub's **[Report a vulnerability](https://github.com/Vigesh-VS/Application-Tracker/security/advisories/new)** button (Security tab), or
- Email **thevigesh17@gmail.com** with "Security" in the subject.

Please include steps to reproduce and what an attacker could do. Don't open a public issue, and don't test against other people's accounts or data.

You'll get a reply within a few days. Once it's fixed, you'll be credited in the release notes if you'd like.

## Scope

- The web app and `firestore.rules`
- The `/api/extract-job-details` serverless function (auth, rate limits, URL safety, prompt-injection guardrails)

Out of scope: denial-of-service via heavy traffic, issues in third-party services (Firebase, Vercel, Google Gemini) themselves, and self-hosted copies that are misconfigured.
