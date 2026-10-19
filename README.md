# 📋 Job / Internship Application Tracker

Track job and internship applications with AI-powered import from a job link, analytics, bulk actions and an admin panel.

**Stack:** React 18 · TypeScript · Vite · Tailwind + shadcn/ui · TanStack Query · Recharts · WebGL2 dithered background (runs in a Web Worker)
**Backend:** Firebase Authentication (Google) · Cloud Firestore · one Vercel serverless function (AI import with Gemini)

Everything runs on free tiers. Firebase projects on the free Spark plan don't get paused for inactivity.

---

## Features

- Sign in with Google (account picker every time)
- Profile with full name (required before using the dashboard) and preferred currency
- Add, edit and delete applications: company, position, status, job type, location, salary range + currency, job URL, notes, applied / follow-up / response dates
- **Import from URL**: paste a LinkedIn / Internshala / Unstop / Greenhouse / Lever / company careers link and the form fills itself. For sites that can't be read automatically (login walls, JavaScript-only pages such as Naukri) the dialog switches to **Paste job description** and extracts from the text instead
- Search by company, position or location; filter by status and job type
- Bulk select → change status or delete
- Analytics: totals, offer / rejection / response rates, average response time, pipeline pie chart, top companies, top locations, average salary
- 8 currencies (INR, USD, EUR, GBP, AED, SGD, CAD, AUD)
- Admin dashboard: every user with application counts per status, new users this month, active users

---

## 1. One-time setup (about 15 minutes)

### Firebase
1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics is optional).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Build → Firestore Database → Create database** → choose a location (e.g. `asia-south1 (Mumbai)`) → **Production mode**.
4. **Firestore → Rules** tab → paste the whole contents of [`firestore.rules`](firestore.rules) → **Publish**.
5. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register an app (no Hosting needed) → copy the `firebaseConfig` values.

### Gemini (for Import from URL)
6. Get a free API key at <https://aistudio.google.com/apikey>.

### Local config
7. Copy `.env.example` to `.env` and fill it in:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   GEMINI_API_KEY=...
   ```
   `FIRECRAWL_API_KEY` is optional. Without it the server reads the job page directly (plus built-in handling for LinkedIn and Unstop). With it, Firecrawl is tried first and the direct read is the fallback.

## 2. Run it on your computer

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open <http://localhost:8080>. Import from URL works locally too: `npm run dev` also runs the API.

## 3. Make yourself admin

1. Sign in to the app once.
2. Firebase console → **Authentication → Users** → copy your **User UID**.
3. **Firestore → Start collection** → Collection ID `admins` → Document ID = *your UID* → add any field (e.g. `email` = your email) → Save.
4. Reload the app. An **Admin** button appears on the dashboard.

Admins can only be added from the console. The security rules block anyone from making themselves admin through the app.

## 4. Move your old data from Supabase

1. In Supabase, restore the paused project (Dashboard → project → **Restore**), then **Table Editor** → open each table → **Export → CSV**:
   `profiles`, `job_applications`, `user_roles`. Save them in `scripts/data/` (git-ignored).
2. Sign in to the **new** app once with each Google account you want to move. Users are matched by email.
3. Firebase console → **Project settings → Service accounts → Generate new private key** → save as `service-account.json` in the project folder (git-ignored, never commit it).
4. Preview, then import:
   ```bash
   npm run import-data -- --dry-run
   npm run import-data
   ```
   Running it twice is safe, because applications keep their original IDs. Admin roles come across too.
   Afterwards you can delete `service-account.json`.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel. The Vite framework is detected automatically.
2. **Vercel → Project → Settings → Environment Variables**: add every variable from your `.env`.
3. Deploy, then in Firebase: **Authentication → Settings → Authorized domains → Add domain** → your `*.vercel.app` domain (and any custom domain).

If you reuse your old Vercel project, replace its old `VITE_SUPABASE_*` variables with the ones above.

---

## How it fits together

```
Browser (React app)
 ├─ Firebase Auth ............ Google sign-in, session
 ├─ Cloud Firestore .......... users/{uid}                      profile
 │                             users/{uid}/applications/{id}    applications
 │                             admins/{uid}                     admin role
 └─ POST /api/extract-job-details   (Vercel function: api/)
       1. verifies the Firebase sign-in token
       2. blocks private/internal URLs (also after DNS lookup and on every redirect)
       3. reads the page: JSON-LD / meta tags / text (LinkedIn guest page, Unstop API,
          Firecrawl first if FIRECRAWL_API_KEY is set) — or uses text pasted in the dialog
       4. Gemini returns company, title, location, job type, salary (+ currency), summary
       Errors carry a code; "needs_text" makes the dialog offer the paste-text fallback
```

**Security** ([`firestore.rules`](firestore.rules)): users can only read and write their own profile and applications. Field types and allowed values are validated. Profiles can't be deleted and email can't be changed. Admins get read-only access to everyone's data for the admin dashboard.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | App + API at http://localhost:8080 |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests (URL safety checks, page parsing, AI import flow) |
| `npm run typecheck` | TypeScript check for app, API and config |
| `npm run lint` | ESLint |
| `npm run import-data` | Import Supabase CSV exports into Firestore |

## Project structure

```
api/
  extract-job-details.ts     Vercel function entry
  _lib/extract.ts            AI import logic (shared with npm run dev)
scripts/
  import-supabase-csv.mjs    one-time data migration
src/
  lib/firebase.ts            Firebase setup
  lib/firestore.ts           Firestore (separate, so signed-out pages don't download it)
  lib/auth.tsx               Google sign-in (doesn't wait for the database)
  lib/profileStore.ts        profile read (creates it on first login) / update
  hooks/useApplications.ts   applications CRUD + bulk actions (Firestore)
  hooks/useProfile.ts        profile query, shared by every component (one read)
  components/Dither.tsx      animated background; WebGL code in components/dither/
  hooks/useAdmin.ts          admin check + admin stats
  pages/, components/        UI (unchanged from the original app)
firestore.rules              database security rules
```

## Troubleshooting

- **"This domain is not authorised"** when signing in: add the domain under Firebase → Authentication → Settings → Authorized domains (`localhost` is there by default).
- **Sign-in popup closes immediately**: allow popups for the site.
- **"Missing or insufficient permissions"**: the rules from `firestore.rules` weren't published, or the Firestore database wasn't created.
- **Import from URL says the site blocked it / needs a login / uses JavaScript**: the dialog switches to *Paste job description*. Copy the posting text from the site and paste it there. Optionally add a `FIRECRAWL_API_KEY`.
- **Import errors in general**: the toast shows the exact step that failed. `npm run dev` (or Vercel → Logs) shows a line per step: `importing job URL`, `Page content: N chars`, `Gemini result`, `Import failed (...)`.
- **"Gemini model not found"**: Google retires model names over time. Set `GEMINI_MODEL` to a current Flash or Flash-Lite model from <https://ai.google.dev/gemini-api/docs/models>.
