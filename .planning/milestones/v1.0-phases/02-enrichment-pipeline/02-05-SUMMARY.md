---
phase: 02-enrichment-pipeline
plan: "05"
subsystem: docs
tags: [docs, claude-md, env-table, data-flow, openai, perplexity-removal, D-08, D-09]
decisions_addressed: [D-08, D-09]

dependency_graph:
  requires: [02-01-SUMMARY, 02-02-SUMMARY, 02-03-SUMMARY, 02-04-SUMMARY]
  provides: [CLAUDE.md accurate for Phase 2]
  affects: []

tech_stack:
  added: []
  patterns: []

key_files:
  created: []
  modified:
    - CLAUDE.md
  deleted: []

key_decisions:
  - "D-08 executed: env table row swapped from PERPLEXITY_API_KEY to OPENAI_API_KEY"
  - "D-09 executed: all Perplexity references removed from CLAUDE.md including stale data-flow comment"
  - "Rule 1 auto-fix: updated stale categorizeInBatches() comment in regular-video data flow to reflect actual keyword-based route"

metrics:
  duration: "< 5 minutes"
  completed: "2026-05-10"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 2 Plan 05: CLAUDE.md Documentation Update Summary

**One-liner:** Updated CLAUDE.md to reflect Phase 2 reality — swapped PERPLEXITY_API_KEY for OPENAI_API_KEY, added outreach enrichment data-flow diagram, and refreshed library boundaries to describe src/lib/outreach/ and remove the deleted categorize.ts.

## What Was Done

Applied four discrete edits to `CLAUDE.md` (three planned plus one auto-fix):

### Edit 1: Env table row swap (D-08)

**Before:**
```
| `PERPLEXITY_API_KEY` | Perplexity `sonar` model for niche categorization |
```

**After:**
```
| `OPENAI_API_KEY` | OpenAI gpt-4o-mini for outreach game/genre extraction |
```

### Edit 2: Outreach data-flow block (new subsection)

Inserted `### Data flow — outreach enrichment` after the Shorts data-flow block and before `### Key library boundaries`. The block documents the full pipeline:

```
POST /api/outreach/enrich {text}    # newline-separated URLs, max 15
  → canonicalizeUrl()
  → resolveChannel()
  → fetchChannelData()
  → medianViews()
  → extractGamesGenre()
  → upsertOutreachChannel()

Response: { succeeded: number, failed: [{url,reason}], partial: [{url,reason}] }
```

Plus a paragraph describing auth-gating, UI spinner behavior, and per-channel partial-save semantics.

### Edit 3: Key library boundaries refresh

- Updated `src/lib/pipeline/` bullet: removed stale `categorize.ts` claim (file was deleted in Plan 01), added note that `keyword-categorize.ts` serves all three legacy route handlers.
- Added new `src/lib/outreach/` bullet describing the Phase 2 bounded context: youtubei.js singleton reuse, openai, createServiceClient(), and the canonical helper (no direct @supabase/supabase-js import).

### Auto-fix (Rule 1): Stale data-flow comment in regular-video block

**Found during:** task verification
**Issue:** The "Data flow — regular videos" code block still referenced `categorizeInBatches()` with a Perplexity comment. This function was deleted in Plan 01, and the actual scrape route handler (`src/app/api/scrape/route.ts`) now calls `categorizeByKeywords()` from `keyword-categorize.ts`.
**Fix:** Updated the comment line to `categorizeByKeywords()  # keyword-based niche assignment (no LLM), per-video`
**Files modified:** CLAUDE.md (same file as planned edits, no extra file touched)

## Verification Results

| Check | Result |
|-------|--------|
| `PERPLEXITY_API_KEY` count in CLAUDE.md | 0 (pass) |
| Any `Perplexity` mention in CLAUDE.md | 0 (pass) |
| `OPENAI_API_KEY` count | 1 (pass) |
| `Data flow — outreach enrichment` heading count | 1 (pass) |
| `categorize.ts owns the niche taxonomy` stale claim | 0 (pass) |
| `src/lib/outreach/` references | 1 (pass) |
| `POST /api/outreach/enrich` in data-flow block | 1 (pass) |
| `extractGamesGenre` referenced | 1 (pass) |
| `createServiceClient()` referenced | 2 (pass) |

## Confirmation: No Other Files Modified

Only `CLAUDE.md` was modified. Verified via `git diff` showing four hunks (three planned + one Rule 1 auto-fix), all within `CLAUDE.md`.

## Phase 2 Deliverable Complete

- Plan 01: Deleted dead `categorize.ts` (Perplexity-based, zero callers)
- Plan 02: Added seven `src/lib/outreach/` pipeline primitives
- Plan 03: Auth-gated `POST /api/outreach/enrich` route handler
- Plan 04: Outreach tab, enrich form, and summary panel in UI
- Plan 05: CLAUDE.md updated to reflect the above reality

The orchestrator may proceed to `/gsd-verify-phase` for the Phase 2 manual smoke test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale Perplexity comment in regular-video data flow**
- **Found during:** Task 1 (post-edit verification — grep for Perplexity found 1 residual hit)
- **Issue:** `categorizeInBatches() # Perplexity sonar via OpenAI SDK` was still in the regular-video data-flow code block. The function was deleted in Plan 01 and the route handler now calls `categorizeByKeywords()`.
- **Fix:** Updated the comment to `categorizeByKeywords() # keyword-based niche assignment (no LLM), per-video`
- **Files modified:** CLAUDE.md (within-scope, same file as planned task)

## Threat Flags

None — documentation-only edit, no runtime surface introduced.

## Self-Check: PASSED

- [x] CLAUDE.md modified (not a new file)
- [x] Zero Perplexity mentions in CLAUDE.md
- [x] OPENAI_API_KEY in env table
- [x] Data flow — outreach enrichment subsection present
- [x] src/lib/outreach/ documented in library boundaries
- [x] categorize.ts stale claim removed
- [x] No source code files modified
- [x] git diff shows only CLAUDE.md changes
