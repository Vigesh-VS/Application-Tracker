#!/usr/bin/env node
/**
 * Import your old Supabase data (CSV exports) into Firestore.
 *
 * 1. Export these tables from Supabase (Table Editor → table → "Export" → CSV) into scripts/data/:
 *      profiles.csv, job_applications.csv, user_roles.csv (optional, for admins)
 * 2. Sign in to the NEW app once with each Google account you want to migrate
 *    (users are matched by email, and that creates their Firebase account).
 * 3. Download a service account key: Firebase console → Project settings → Service accounts →
 *    "Generate new private key". Save it as service-account.json in the project root (it's git-ignored).
 * 4. Preview:  npm run import-data -- --dry-run
 *    Import:   npm run import-data
 *
 * Safe to run more than once: applications keep their original IDs, so re-running overwrites
 * instead of duplicating.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const DRY_RUN = args.includes('--dry-run');
const dataDir = flag('data', 'scripts/data');
const serviceAccountPath = flag('service-account', 'service-account.json');
const files = {
  profiles: resolve(dataDir, flag('profiles', 'profiles.csv')),
  applications: resolve(dataDir, flag('applications', 'job_applications.csv')),
  roles: resolve(dataDir, flag('roles', 'user_roles.csv')),
};

for (const [name, path] of Object.entries({ profiles: files.profiles, applications: files.applications, 'service account': serviceAccountPath })) {
  if (!existsSync(path)) {
    console.error(`✖ Missing ${name} file: ${path}`);
    process.exit(1);
  }
}

// ---------- helpers ----------
const readCsv = (path) =>
  parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });

const blank = (v) => v === undefined || v === null || v === '' || v === 'NULL' || v === 'null';
const str = (v) => (blank(v) ? null : String(v));
const int = (v) => {
  if (blank(v)) return null;
  const n = Math.round(Number(String(v).replace(/[^\d.-]/g, '')));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const date = (v) => (blank(v) ? null : /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const iso = (v) => {
  if (blank(v)) return new Date().toISOString();
  const d = new Date(String(v).replace(' ', 'T').replace(/\+00$/, 'Z'));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};
/** Supabase text[] exports look like ["a","b"] or {a,b} */
const list = (v) => {
  if (blank(v)) return null;
  const s = String(v).trim();
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* not JSON */ }
  const items = s.replace(/^\{|\}$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
  return items.length ? items : null;
};

const STATUSES = ['pending', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];
const JOB_TYPES = ['remote', 'hybrid', 'onsite'];

// ---------- firebase ----------
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

console.log(`\nProject: ${serviceAccount.project_id}${DRY_RUN ? '   (DRY RUN — nothing will be written)' : ''}\n`);

// ---------- map old Supabase user ids → Firebase uids by email ----------
const profiles = readCsv(files.profiles);
const oldIdToUid = new Map();
const missing = [];

for (const p of profiles) {
  const email = str(p.email)?.toLowerCase();
  if (!email) continue;
  try {
    const user = await auth.getUserByEmail(email);
    oldIdToUid.set(p.user_id, { uid: user.uid, email: user.email ?? email, profile: p });
  } catch {
    missing.push(email);
  }
}

console.log(`Users matched: ${oldIdToUid.size}/${profiles.length}`);
if (missing.length) {
  console.log(`  ⚠ Not signed in to the new app yet (skipped): ${missing.join(', ')}`);
  console.log('    → Sign in once with these accounts, then run this script again.\n');
}

// ---------- write in batches ----------
let batch = db.batch();
let pending = 0;
let written = 0;
const queue = async (fn) => {
  if (DRY_RUN) return;
  fn(batch);
  if (++pending >= 400) {
    await batch.commit();
    written += pending;
    batch = db.batch();
    pending = 0;
  }
};

// Profiles (only the fields the security rules allow)
for (const { uid, email, profile: p } of oldIdToUid.values()) {
  const ref = db.doc(`users/${uid}`);
  const existing = DRY_RUN ? null : await ref.get();
  await queue((b) =>
    b.set(ref, {
      user_id: uid,
      email,
      full_name: str(p.full_name) ?? existing?.get('full_name') ?? null,
      phone: str(p.phone),
      resume_url: str(p.resume_url),
      skills: list(p.skills),
      preferred_currency: str(p.preferred_currency) ?? 'INR',
      created_at: iso(p.created_at),
      updated_at: new Date().toISOString(),
    })
  );
}

// Applications
const applications = readCsv(files.applications);
let imported = 0;
let skipped = 0;
for (const a of applications) {
  const owner = oldIdToUid.get(a.user_id);
  const company = str(a.company_name)?.trim();
  const position = str(a.position_title)?.trim();
  if (!owner || !company || !position) {
    skipped++;
    continue;
  }
  const status = STATUSES.includes(a.status) ? a.status : 'applied';
  const jobType = JOB_TYPES.includes(a.job_type) ? a.job_type : null;
  const doc = {
    user_id: owner.uid,
    company_name: company.slice(0, 300),
    position_title: position.slice(0, 300),
    job_description: str(a.job_description),
    job_url: str(a.job_url),
    status,
    job_type: jobType,
    location: str(a.location),
    salary_min: int(a.salary_min),
    salary_max: int(a.salary_max),
    salary_currency: str(a.salary_currency),
    notes: str(a.notes),
    applied_date: date(a.applied_date) ?? iso(a.created_at).slice(0, 10),
    follow_up_date: date(a.follow_up_date),
    response_date: date(a.response_date),
    created_at: iso(a.created_at),
    updated_at: iso(a.updated_at),
  };
  imported++;
  await queue((b) => b.set(db.doc(`users/${owner.uid}/applications/${a.id}`), doc));
}

// Admins
let admins = 0;
if (existsSync(files.roles)) {
  for (const r of readCsv(files.roles)) {
    const owner = oldIdToUid.get(r.user_id);
    if (r.role !== 'admin' || !owner) continue;
    admins++;
    await queue((b) => b.set(db.doc(`admins/${owner.uid}`), { email: owner.email, created_at: iso(r.created_at) }));
  }
}

if (!DRY_RUN && pending > 0) {
  await batch.commit();
  written += pending;
}

console.log(`Applications: ${imported} to import, ${skipped} skipped (owner not matched or missing company/position)`);
console.log(`Admins:       ${admins}`);
console.log(DRY_RUN ? '\nDry run finished. Run again without --dry-run to import.\n' : `\n✔ Done. ${written} documents written.\n`);
process.exit(0);
