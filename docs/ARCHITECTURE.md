# Architecture

Author: **Vigesh**

## Overview

```
Browser (React app, Vite build, hosted on Vercel)
 ├─ Firebase Auth ........... Google sign-in
 ├─ Cloud Firestore ......... users/{uid}, users/{uid}/applications/{id}, admins/{uid}
 ├─ Web Worker .............. WebGL2 dithered background (OffscreenCanvas)
 └─ POST /api/extract-job-details  (Vercel serverless function)
       verify Firebase token → rate limit → validate URL (SSRF guard)
       → read page (site adapters, JSON-LD, meta tags, text; optional Firecrawl)
         or use pasted text
       → Gemini (system instruction + fenced untrusted text, JSON schema, output cap)
       → sanitise and leak-check the answer → JSON to the form
```

## Frontend

| Area | Files | Notes |
|---|---|---|
| Routing and pages | `src/App.tsx`, `src/pages/*` | Dashboard, Profile and Admin load on demand |
| Auth | `src/lib/auth.tsx`, `src/lib/firebase.ts` | Shows the app as soon as Firebase Auth knows the user; no database wait |
| Database access | `src/lib/firestore.ts`, `src/lib/profileStore.ts`, `src/hooks/*` | Firestore SDK is a separate chunk, loaded only when signed in |
| Profile | `src/lib/profileQuery.ts`, `src/hooks/useProfile.ts` | One shared TanStack Query; creates the profile on first sign-in |
| Admin check | `src/hooks/useAdmin.ts` | Cached query, one read per session |
| Charts | `src/components/AnalyticsDashboard.tsx` | recharts chunk, prefetched when the browser is idle |
| Background | `src/components/Dither.tsx`, `src/components/dither/*` | Renders one pixel per 2×2 dither block at 30 fps in a worker; pauses when hidden; still frame for reduced motion |
| Import dialog | `src/components/ApplicationForm.tsx` | URL import, paste-text fallback when the server answers `code: "needs_text"` |

Build output is split into `react-vendor`, `firebase-auth`, the app chunk, and on-demand chunks (Firestore, charts, pages).

## Import API

`api/extract-job-details.ts` (Vercel) and the `localApi` plugin in `vite.config.ts` (`npm run dev`) both call `handleExtractRequest` in `api/_lib/extract.ts`.

Content sources, in order:
1. Pasted text (nothing is fetched).
2. Firecrawl, if `FIRECRAWL_API_KEY` is set (falls back to 3 on failure).
3. Direct fetch with site adapters: LinkedIn links are rewritten to the public `/jobs/view/{id}` page and read through the guest endpoint; Unstop uses its public JSON API. Other pages: schema.org JobPosting JSON-LD, meta tags, then visible text. JavaScript-only shells and login walls return `needs_text`.

Errors return `{ success: false, error, code? }`. Codes: `needs_text`, `not_found`, `fetch_failed`, `timeout`, `rate_limit`, `config`, `ai_error`.

## Security

See the *Security and privacy* section of the README. Tests: `src/test/guardrails.test.ts` (attack and normal cases), `src/test/extract*.test.ts`.

## Environment variables

| Name | Where | Required |
|---|---|---|
| `VITE_FIREBASE_*` | browser and server | yes |
| `GEMINI_API_KEY` | server only | yes |
| `GEMINI_MODEL` | server only | no (default `gemini-3.5-flash-lite`) |
| `FIRECRAWL_API_KEY` | server only | no |
