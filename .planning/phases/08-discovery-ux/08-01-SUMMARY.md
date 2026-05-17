---
phase: 08-discovery-ux
plan: "01"
subsystem: outreach/discovery
tags: [ux, discovery, search, save-all, chip-input]
dependency_graph:
  requires: []
  provides: [UX-01, UX-02]
  affects: [src/components/outreach/discovery-table.tsx]
tech_stack:
  added: []
  patterns: [sequential-batch-loop, shared-fetch-helper]
key_files:
  created: []
  modified:
    - src/components/outreach/discovery-table.tsx
decisions:
  - "saveBatch extracted as shared helper so both handleSave and handleSaveAll reuse identical fetch + row-update logic"
  - "handleSaveAll snapshots eligible rows before the loop to avoid reading stale React state mid-iteration"
  - "Submit button disabled prop changed to allow pending inputValue as a trigger so no chip commit is required before Search"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-17"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 8 Plan 01: Chip-input Search Regression Fix + Save All Auto-Batch Summary

Single-file change to `DiscoveryPanel` in `discovery-table.tsx`: fixes the search button regression introduced in Phase 5 when chip input was added, and adds a `handleSaveAll` function with a Save all button that sequentially saves all eligible rows in batches of 15 with per-batch progress display.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | State additions, saveBatch extraction, handleSaveAll, handleSearch fix | ae9a450 | src/components/outreach/discovery-table.tsx |
| 2 | JSX updates — submit button disabled fix and Save all buttons | ae9a450 | src/components/outreach/discovery-table.tsx |

Both tasks were committed together in a single atomic commit (no JSX-only commit needed since the logic was finalized first and both changes were verified together).

## What Was Built

**Search regression fix (UX-01):** `handleSearch` now derives an `activeChips` variable by auto-committing any `inputValue` text before the `chips.length === 0` guard. The submit button's `disabled` prop now uses `(chips.length === 0 && !inputValue.trim()) || searching` — the button is enabled whenever either committed chips or typed text is present.

**Save all auto-batch (UX-02):**
- `saveBatch(batch: DiscoveryRow[])` — extracted shared helper. Called by both `handleSave` and `handleSaveAll`. Handles status transitions (`idle → saving → saved/partial/failed`), enrichedMap patching, and error recovery.
- `handleSaveAll()` — snapshots all `!alreadySaved && status === 'idle'` rows, then iterates in `MAX_SAVE`-sized slices, calling `setBatchProgress` per iteration and accumulating totals. Final `setSummary` totals across all batches.
- Both the filter row (top) and the save row (bottom) show: a "Save all (N)" outline button when eligible rows exist, and a "Saving batch X of Y…" span while `autoSaving` is true.

## Deviations from Plan

None — plan executed exactly as written. The two tasks were committed as one commit since they were both in the same file and verified together.

## Self-Check: PASSED

- `src/components/outreach/discovery-table.tsx` — modified and committed
- Commit ae9a450 confirmed in git log
- `tsc --noEmit` — zero output (zero errors)
- `saveBatch` function present and called by both `handleSave` and `handleSaveAll`
- `handleSearch` uses `activeChips` variable and passes it to fetch body
- Both Save button instances have `|| autoSaving` in disabled prop
- Both filter row and save row contain Save all button and progress span
