# Contributing to Application Tracker

Thanks for wanting to help! Bug reports, ideas, docs fixes and code are all welcome, and first-time contributors are very welcome too.

## Ways to contribute

- **Report a bug:** open an [issue](https://github.com/Vigesh-VS/Application-Tracker/issues/new/choose) using the *Bug report* template.
- **Suggest a feature:** open an issue using the *Feature request* template.
- **Fix something:** look for issues labelled [`good first issue`](https://github.com/Vigesh-VS/Application-Tracker/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/Vigesh-VS/Application-Tracker/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
- **Improve the docs:** typos, unclear setup steps, missing screenshots.

For anything bigger than a small fix, please **open an issue first** so we can agree on the approach before you spend time on it.

## Setting up locally

You need Node.js 20+ and a free Firebase project (plus a free Gemini key if you want to work on *Import from URL*). The full steps are in the [README → Getting started](README.md#getting-started).

```bash
git clone https://github.com/<your-username>/Application-Tracker.git
cd Application-Tracker
npm install
cp .env.example .env   # fill in your own Firebase / Gemini values
npm run dev            # http://localhost:8080
```

Use **your own** Firebase project and keys. Never commit `.env`, service-account files or any API key.

## Making a change

1. **Fork** the repo and create a branch from `main`:
   `git checkout -b fix/short-description`
2. Make your change. Keep it focused on one thing.
3. Run the checks (CI runs the same ones on every pull request):
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
4. Add or update tests in `src/test/` when you change behaviour.
5. Commit with a clear message, e.g. `Fix salary range showing NaN when max is empty`.
6. Push to your fork and open a **pull request** against `main`. Fill in the template and add screenshots for UI changes.

## Guidelines

- **Match the existing style:** TypeScript, React function components, Tailwind classes, shadcn/ui components from `src/components/ui`.
- **Security matters:** don't weaken `firestore.rules`, the sign-in token check or the URL safety checks in `api/_lib/extract.ts`. If a change needs them to change, explain why in the PR.
- **No new heavy dependencies** without discussing it in an issue first. The app is tuned to load fast.
- **Data model changes** (Firestore fields) also need matching updates to `firestore.rules` and the README.
- Be kind and constructive. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

Please **don't** open a public issue for security problems. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
