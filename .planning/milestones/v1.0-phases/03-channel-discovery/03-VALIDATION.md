# Phase 3: Channel Discovery - Validation Architecture

**Source:** Extracted from `03-RESEARCH.md` §Validation Architecture.
**Nyquist compliance:** `nyquist_validation: true` in config.json.

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test suite exists (per CLAUDE.md) |
| Config file | none |
| Quick run command | `npx.cmd tsc --noEmit` (type-check as proxy for correctness) |
| Full suite command | `npm run build` (compilation + lint) |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIS-01 | Keyword input triggers search and returns channels | manual-only | `npx.cmd tsc --noEmit` (type check) | n/a |
| DIS-02 | Video search returns deduped channel list | manual-only | `npx.cmd tsc --noEmit` | n/a |
| DIS-03 | Enrichment available on save (show-first model) | manual-only | `npm run build` | n/a |
| DIS-04 | Selected channels saved to outreach_channels | manual-only | `npx.cmd tsc --noEmit` | n/a |
| DIS-05 | email column exists and is populated on save | manual-only (DB migration + enrichment run) | `npx.cmd tsc --noEmit` | n/a |

*No test suite exists per CLAUDE.md. All validation is manual UAT + type-check + build. No Wave 0 gaps — there is no test infrastructure to scaffold.*

---

## Sampling Rate

- **Per task commit:** `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx.cmd tsc --noEmit`
- **Per wave merge:** `npm run build`
- **Phase gate:** `npm run build` green + manual UAT checklist (see 03-03-PLAN.md Task 3) before `/gsd-verify-work`

---

## Wave 0 Gaps

None — existing test infrastructure covers all phase requirements (test infrastructure = none, so no gaps to scaffold).

---

## Verification Commands Reference

```powershell
# Type check (quick, ~10s)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit

# Full build (slower, ~60s — includes lint)
npm run build

# Smoke-test the discover endpoint (post-build, requires auth cookie)
curl -X POST http://localhost:3000/api/outreach/discover `
  -H "Content-Type: application/json" `
  -d '{\"keyword\":\"hades indie\"}' --cookie "<your-supabase-auth-cookie>"

# Smoke-test the enrich endpoint (post-build, requires auth cookie)
curl -X POST http://localhost:3000/api/outreach/enrich `
  -H "Content-Type: application/json" `
  -d '{\"text\":\"https://youtube.com/@mkbhd\"}' --cookie "<your-supabase-auth-cookie>"
```

---

## DB Verification (Post-Save)

After running the discovery → save flow with at least one channel:

```sql
-- In the Supabase Dashboard SQL editor:
select youtube_id, name, email, top_games, genre, median_views, last_enriched_at
from outreach_channels
order by last_enriched_at desc nulls last
limit 10;
```

Expected: saved channels appear with `top_games` and `genre` populated for successes, and `email` populated for any channel whose About page contained a matching string.

---

**Phase:** 3-Channel Discovery
**Validation extracted:** 2026-05-14
