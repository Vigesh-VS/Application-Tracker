# Migrating data from the old Supabase version

One-time steps to move profiles, applications and admin roles from Supabase CSV exports into Firestore.


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

