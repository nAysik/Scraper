// scripts/verify-outreach-pipeline.ts
// One-shot smoke test for POST /api/outreach/enrich.
// Run with: $env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx tsx scripts/verify-outreach-pipeline.ts
//
// Requires .env.local with:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   OPENAI_API_KEY (Phase 2 new — sourced from CONTEXT.md D-08).
// Optionally OUTREACH_BASE_URL (defaults to http://localhost:3000).
//
// What this asserts (Phase 2 v1):
//   1. Required env vars are present
//   2. POST /api/outreach/enrich without auth returns 401 (auth gate works)
//   3. POST with empty body returns 401 (auth runs BEFORE body validation — confirms order)
// What this DOES NOT assert (out of scope for the lean v1 — manual browser test covers):
//   - The full pipeline end-to-end with a real authenticated session (would require cookie wiring)
//   - InnerTube/OpenAI side effects (covered by manual browser test per RESEARCH §Sampling Rate)
//
// Per Phase 1 SUMMARY line 86: programmatic run is deferred when .env.local is missing.

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
] as const;

const baseUrl = process.env.OUTREACH_BASE_URL ?? 'http://localhost:3000';

let exitCode = 0;
function fail(msg: string, err?: unknown) {
  console.error(`FAIL: ${msg}`, err ?? '');
  exitCode = 1;
}
function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

async function main() {
  // 1. Env vars present
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars in .env.local: ${missing.join(', ')}`);
    process.exit(1);
  }
  ok(`env vars present (${REQUIRED_ENV.length} required)`);

  // 2. Unauthenticated POST → 401 (auth gate works)
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/outreach/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'https://youtube.com/@mkbhd' }),
    });
  } catch (err) {
    fail(`fetch ${baseUrl}/api/outreach/enrich — is the dev server running?`, err);
    process.exit(exitCode);
  }

  if (res.status === 401) {
    ok('unauthenticated POST returns 401 (auth gate works)');
  } else {
    fail(`unauthenticated POST returned ${res.status}, expected 401`);
  }

  // 3. Unauthenticated POST with empty body → still 401 (order: auth before validation)
  const res2 = await fetch(`${baseUrl}/api/outreach/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res2.status === 401) {
    ok('unauthenticated POST with empty body still returns 401 (auth runs first)');
  } else {
    fail(`empty-body unauth POST returned ${res2.status}, expected 401`);
  }

  console.log('');
  console.log('Note: full pipeline assertion (canonicalize → resolve → fetch → extract → upsert)');
  console.log('      is covered by manual browser smoke test — log in at /login, navigate to');
  console.log('      /dashboard/outreach, paste 3 URLs, verify the summary panel renders.');

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('FAIL: uncaught', err);
  process.exit(1);
});
