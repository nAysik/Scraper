---
phase: 02-enrichment-pipeline
plan: 03
subsystem: outreach-api
tags: [outreach, api, route-handler, auth, batch, vercel, smoke-test]
dependency_graph:
  requires: [02-02-SUMMARY]
  provides: [src/app/api/outreach/enrich/route.ts, scripts/verify-outreach-pipeline.ts]
  affects: [02-04-PLAN, 02-05-PLAN]
tech_stack:
  added: []
  patterns: [auth-gate-first, sequential-for-await, per-iteration-try-catch, outer-try-catch, partial-save-on-llm-failure]
key_files:
  created:
    - src/app/api/outreach/enrich/route.ts
    - scripts/verify-outreach-pipeline.ts
  modified: []
decisions:
  - "Auth gate (supabase.auth.getUser) runs before body parse — 401 beats all 400s"
  - "Sequential for-loop (not Promise.all) per CONTEXT.md Claude's Discretion — simple, no InnerTube rate-limit risk"
  - "LLM failure caught per D-11: row is saved with null top_games/genre, channel counted in partial[]"
  - "No-videos (data.videos.length === 0) produces failed[] with reason 'no_videos' and NO row written (D-12)"
  - "fetchChannelData returning null produces failed[] with reason 'not_found' (InnerTube hard failure after retry)"
  - "Smoke test deferred — exercises only the auth gate (401 path); full E2E requires manual browser session"
metrics:
  duration: ~10min
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_count: 2
---

# Phase 2 Plan 3: Enrich Route Handler Summary

**One-liner:** Auth-gated POST /api/outreach/enrich route that orchestrates all six Plan 02-02 pipeline modules sequentially, returning a single `{succeeded, failed, partial}` JSON response with a four-value reason taxonomy.

## Response Shape (exact, with example values)

```json
{
  "succeeded": 2,
  "failed": [
    { "url": "https://youtube.com/@nonexistent", "reason": "not_found" },
    { "url": "https://youtube.com/@quietchannel", "reason": "no_videos" }
  ],
  "partial": [
    { "url": "https://youtube.com/@validchannel", "reason": "llm_failed" }
  ]
}
```

`succeeded` is a count (number), not an array. `failed` and `partial` are arrays of `{url, reason}` objects where `url` is the original raw string submitted by the user (not the canonicalized form). Status is always 200 when the pipeline runs; 401/400/500 are outer-level errors only.

## Reason Code Conditions

| Code | Array | Condition |
|------|-------|-----------|
| `not_found` | `failed[]` | `canonicalizeUrl()` returned `null`, OR `resolveChannel()` returned `null`, OR `fetchChannelData()` returned `null` (after one 500ms retry) |
| `no_videos` | `failed[]` | `fetchChannelData()` returned a non-null result but `data.videos.length === 0` — CONTEXT.md D-12 |
| `llm_failed` | `partial[]` | `extractGamesGenre()` threw (timeout / parse error / network) — CONTEXT.md D-11. Row IS saved with `top_games: null, genre: null`. |
| `unknown_error` | `failed[]` | Any other thrown exception caught by the per-iteration `try/catch` — programmer error or unexpected failure. Row is NOT saved. |

## Auth Gate Order

Auth gate runs **before** body parse and before body validation:

```
POST → supabase.auth.getUser() → 401 if no user
     → request.json().catch(() => ({}))
     → validate text/lines/unique
     → 400 if 0 URLs or >15 URLs
     → pipeline loop
```

The smoke script (`scripts/verify-outreach-pipeline.ts`) explicitly asserts this order by sending a POST with empty body `{}` unauthenticated and confirming it returns 401 (not 400).

## Smoke Script Assertions

**What is asserted (can run without a live session):**
1. All 4 required env vars are present (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`)
2. Unauthenticated POST returns 401 — confirms the auth gate is wired
3. Unauthenticated POST with empty body still returns 401 — confirms auth runs before body validation

**What is deferred to manual browser test (requires a real session cookie):**
- Full pipeline: canonicalize → resolveChannel → fetchChannelData → medianViews → extractGamesGenre → upsertOutreachChannel
- InnerTube side effects (channel resolution, video fetch)
- OpenAI side effects (game/genre extraction)

**How to run:**
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
# Start dev server in another terminal: npm run dev
npx tsx scripts/verify-outreach-pipeline.ts
```

## Deviations from Plan

None — the route matches the RESEARCH §Code Examples §2 skeleton verbatim, adapted only for the actual Plan 02-02 module import paths.

## Known Stubs

None. The route is fully wired to all six pipeline modules. The smoke script documents why the full E2E is a manual browser test (cookie wiring out of scope), which is intentional and consistent with Phase 1 precedent.

## Threat Mitigations Implemented

| Threat | Mitigation |
|--------|-----------|
| T-02-11: Unauthenticated access | `supabase.auth.getUser()` at top of POST — 401 before any work begins. Smoke-asserted. |
| T-02-12: DoS via large paste | Hard cap at 15 unique URLs (400 returned before any InnerTube/OpenAI call). Combined with `maxDuration = 300`, worst case ≈ 60s. |
| T-02-14: Error message info disclosure | Outer catch returns `{error: err.message}` only — no stack trace, no env-var content. Static 400/401 strings contain no secrets. |
| T-02-15: LLM prompt injection | Inherits mitigation from `extract-games.ts` (strict JSON schema, `additionalProperties: false`, genre enum constraint). Route does not add new injection surface. |
| T-02-16: Per-channel throw aborts batch | Per-iteration `try/catch` logs to `console.error` and pushes `{url, reason: 'unknown_error'}` to `failed[]`, then `continue`s. Other channels unaffected. |

## Self-Check: PASSED

- [x] `src/app/api/outreach/enrich/route.ts` — exists
- [x] `export const maxDuration = 300` — declared at top of route file
- [x] `export async function POST(` — exported
- [x] Imports `createClient` from `'@/lib/supabase/server'`
- [x] Imports all six Plan 02-02 functions: `canonicalizeUrl`, `resolveChannel`, `fetchChannelData`, `medianViews`, `extractGamesGenre`, `upsertOutreachChannel`
- [x] 401 path: `{ error: 'Unauthorized' }, { status: 401 }`
- [x] 400 paths: `'No URLs provided'` and `'Maximum 15 channels per batch'`
- [x] 15-cap check: `unique.length > 15`
- [x] Deduplication: `Array.from(new Set(lines))`
- [x] All four reason codes present: `'not_found'`, `'no_videos'`, `'llm_failed'`, `'unknown_error'`
- [x] LLM catch: `.catch(() => null)` on `extractGamesGenre`
- [x] No import from `'@/lib/pipeline/upsert'` or `'@/lib/pipeline/categorize'`
- [x] No SSE strings (`text/event-stream`, `ReadableStream`)
- [x] `scripts/verify-outreach-pipeline.ts` — exists
- [x] Async-IIFE wrapper: `async function main()` + `main().catch(`
- [x] Loads `.env.local` via dotenv
- [x] Checks `OPENAI_API_KEY` in REQUIRED_ENV
- [x] POSTs to `/api/outreach/enrich`
- [x] Asserts `res.status === 401` on unauth POST
- [x] Defaults `baseUrl` to `'http://localhost:3000'`
- [x] Uses `OK:` and `FAIL:` log markers
- [x] `npx tsc --noEmit` exits 0
- [x] `npx eslint src/app/api/outreach/enrich/route.ts` exits 0 (no errors in new file)
- [x] `npx eslint scripts/verify-outreach-pipeline.ts` exits 0 (no errors in new file)
- [x] Pre-existing lint errors (21 errors in other files) confirmed pre-existing via git stash test — out of scope
- [x] Task 1 commit: 6060076
- [x] Task 2 commit: 5a964ac
