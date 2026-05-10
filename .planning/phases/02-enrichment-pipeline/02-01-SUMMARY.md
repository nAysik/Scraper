---
phase: 02-enrichment-pipeline
plan: "01"
subsystem: pipeline
tags: [cleanup, dead-code, deletion, perplexity, openai]
decisions_addressed: [D-09]

dependency_graph:
  requires: []
  provides: [categorize.ts deleted]
  affects: [src/lib/pipeline/]

tech_stack:
  added: []
  patterns: []

key_files:
  created: []
  modified: []
  deleted:
    - src/lib/pipeline/categorize.ts

key_decisions:
  - "D-09 executed: deleted Perplexity-flavoured categorize.ts confirmed as dead code (zero non-self imports)"

metrics:
  duration: "< 5 minutes"
  completed: "2026-05-10"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 2 Plan 01: Delete Dead Categorize.ts Summary

**One-liner:** Deleted `src/lib/pipeline/categorize.ts`, the Perplexity-based AI video categorizer never referenced by any route handler — confirmed dead code with zero external callers.

## What Was Done

Executed decision D-09 from Phase 2 CONTEXT.md: removed `src/lib/pipeline/categorize.ts` (78 lines, Perplexity-flavoured OpenAI SDK wrapper using `sonar` model). This file exported `categorizeVideos()` and `categorizeInBatches()` but neither function was imported anywhere outside the file itself.

## Pre-Deletion Verification

Import patterns searched across all `src/` files before deletion:

| Pattern | Matches outside categorize.ts |
|---------|-------------------------------|
| `from '@/lib/pipeline/categorize'` | 0 |
| `from '../pipeline/categorize'` | 0 |
| `require(.*pipeline/categorize` | 0 |
| `categorizeVideos(` | 0 (only self-reference in the file) |
| `categorizeInBatches(` | 0 (only self-reference in the file) |

All three active route handlers (`/api/scrape`, `/api/cron/scrape`, `/api/cron/shorts`) confirmed to import from `keyword-categorize`, not `categorize`.

## Deleted File Reference

**File:** `src/lib/pipeline/categorize.ts`  
**Commit that removed it:** `9eb9e58`  
**Content summary:** 78 lines. Configured OpenAI SDK client to point at Perplexity API (`baseURL: 'https://api.perplexity.ai'`), used `PERPLEXITY_API_KEY`. Exported `categorizeVideos(videos)` and `categorizeInBatches(videos, batchSize)`.

## Post-Deletion Verification

| Check | Result |
|-------|--------|
| `Test-Path src/lib/pipeline/categorize.ts` | False (file deleted) |
| `npx tsc --noEmit` | Exit 0 — silent success |
| `npm run lint` | 18 pre-existing issues (15 errors, 3 warnings); count identical before and after deletion — zero new issues introduced |
| `src/lib/pipeline/keyword-categorize.ts` | Unchanged (`git diff` shows no modifications) |
| `package.json` | Unchanged — `openai` package retained for Plan 02 |

## Note for Plan 05

The `PERPLEXITY_API_KEY` environment variable in `.env.local` and `CLAUDE.md`'s env table is now inert — no code reads it after this deletion. Plan 05 (CLAUDE.md documentation update) is safe to perform the env-table swap: replace `PERPLEXITY_API_KEY` row with `OPENAI_API_KEY`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/lib/pipeline/categorize.ts` confirmed deleted (bash `test -f` returns false)
- Commit `9eb9e58` exists in git log
- `src/lib/pipeline/keyword-categorize.ts` unmodified
- `package.json` unmodified
