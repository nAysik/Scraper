---
phase: 04-outreach-dashboard-export
plan: "02"
subsystem: outreach-ui
tags: [tanstack-table, client-component, csv-export, optimistic-ui]
dependency_graph:
  requires: [04-01]
  provides: [outreach-list-ui]
  affects: [src/components/outreach/discovery-table.tsx]
tech_stack:
  added: []
  patterns: [tanstack-table, optimistic-deletion, useCallback-useMemo-columns, plain-function-after-table-constant]
key_files:
  created:
    - src/components/outreach/outreach-list.tsx
  modified:
    - src/components/outreach/discovery-table.tsx
decisions:
  - handleExportCsv declared as plain function after table constant to avoid stale closure on table.getRowModel()
  - CSV uses UTF-8 BOM (U+FEFF literal) for Excel/Notion compatibility
  - OutreachList only mounts on tab activation (&&render), triggering fetch on first visit
  - Optimistic deletion with backup/restore on API failure for both per-row and bulk delete
  - Filtered empty state includes hint text per UI-SPEC copywriting contract
  - onValueChange handler wraps setGenreFilter with null-coalescing to satisfy shadcn Select type signature
metrics:
  duration: "~10 minutes"
  completed: "2026-05-15"
  tasks_completed: 2
  files_changed: 2
---

# Phase 4 Plan 02: OutreachList Component + OutreachTabs 3rd Tab Summary

**Status:** Complete
**Date:** 2026-05-15

**One-liner:** TanStack Table client component with genre/views/subs filters, per-row re-enrich with optimistic status, per-row and bulk delete with rollback, and UTF-8 BOM CSV export of filtered rows.

## What was built

- `src/components/outreach/outreach-list.tsx` — OutreachList client component: filterable TanStack Table with re-enrich, per-row delete, bulk delete, CSV export
- `src/components/outreach/discovery-table.tsx` — OutreachTabs extended with 3rd tab "Outreach list"

## Key decisions

- `handleExportCsv` declared as plain function after `table` constant (avoids stale closure — `table.getRowModel()` is in scope)
- CSV uses UTF-8 BOM (`﻿`) for Excel/Notion compatibility
- `OutreachList` only mounts on tab activation (`&&` render), triggering fetch on first visit
- Optimistic deletion with backup/restore on API failure
- Filtered empty state includes hint text per UI-SPEC copywriting contract
- shadcn `Select` `onValueChange` receives `string | null` — wrapped with `?? ''` to satisfy `Dispatch<SetStateAction<string>>` (Rule 1 auto-fix, deviation from plan spec which passed `setGenreFilter` directly)

## Commits

| Hash | Message |
|------|---------|
| 71fa7eb | feat(04-02): OutreachList component + OutreachTabs 3rd tab |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] shadcn Select onValueChange type mismatch**
- **Found during:** Task 1 TypeScript check
- **Issue:** The shadcn `Select` component in this project types `onValueChange` as `(value: string | null, ...) => void`, but `setGenreFilter` (a `Dispatch<SetStateAction<string>>`) does not accept `null`. Passing `setGenreFilter` directly caused TS2322.
- **Fix:** Wrapped in an arrow function: `(v) => setGenreFilter(v ?? '')`
- **Files modified:** `src/components/outreach/outreach-list.tsx` line 337
- **Commit:** 71fa7eb (same commit — fix applied before commit)

## Known Stubs

None — all data sources are wired to live API routes from Plan 01.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All mutations go through auth-gated Route Handlers. CSV is generated client-side from already-authenticated session data; Blob URL is immediately revoked.

## Self-Check: PASSED

- [x] `src/components/outreach/outreach-list.tsx` exists
- [x] `src/components/outreach/discovery-table.tsx` modified with 3rd tab
- [x] Commit 71fa7eb confirmed in git log
- [x] `npx tsc --noEmit` exits 0 (no output)
