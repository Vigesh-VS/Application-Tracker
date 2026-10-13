// Vercel serverless function: POST /api/extract-job-details
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   GEMINI_API_KEY          required  (free key from https://aistudio.google.com/apikey)
//   VITE_FIREBASE_PROJECT_ID required (already set for the frontend; used to verify sign-in)
//   FIRECRAWL_API_KEY       optional  (better scraping for JavaScript-heavy job sites)
//   GEMINI_MODEL            optional  (defaults to gemini-3.5-flash-lite)
import { handleExtractRequest } from './_lib/extract.js';

export const config = { maxDuration: 60 };

export function POST(request: Request) {
  return handleExtractRequest(request, process.env);
}

export function OPTIONS(request: Request) {
  return handleExtractRequest(request, process.env);
}
