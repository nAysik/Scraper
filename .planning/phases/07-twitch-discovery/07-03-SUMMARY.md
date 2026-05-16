---
phase: 07-twitch-discovery
plan: "03"
subsystem: outreach-ui
tags: [twitch, discovery, ui, react, tanstack-table]
dependency_graph:
  requires:
    - 07-02  # discover-twitch and save-twitch API routes + DB schema
  provides:
    - TwitchDiscoveryPanel component
    - OutreachTabs 4th tab (twitch-discover)
    - OutreachList platform column + Re-enrich guard + CSV Platform column
    - channels GET route platform field
  affects:
    - src/app/dashboard/outreach  # visible to any user on the Outreach page
tech_stack:
  added: []
  patterns:
    - TanStack Table v8 (same pattern as DiscoveryPanel and OutreachList)
    - useMemo-computed filtered rows + client-side max-viewers filter
    - Row-level status tracking (idle/saving/saved/failed)
key_files:
  created:
    - src/components/outreach/twitch-discovery-panel.tsx
  modified:
    - src/components/outreach/discovery-table.tsx
    - src/components/outreach/outreach-list.tsx
    - src/app/api/outreach/channels/route.ts
decisions:
  - "Platform guard for Re-enrich uses !== 'twitch' so any future third platform also gets Re-enrich by default (safe opt-out)"
  - "CSV Platform column appended as last field to avoid breaking existing column-order assumptions in downstream tooling"
  - "platform fallback defaults to 'youtube' in both the route mapper and useEffect mapper, matching existing row semantics"
metrics:
  duration: "~15 min"
  completed: "2026-05-16"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase 7 Plan 03: Twitch Discovery UI Summary

TwitchDiscoveryPanel with game-search, viewer-count filter, and batch save; wired as the 4th tab ("Discover on Twitch") in OutreachTabs; Outreach List extended with Platform badge column, Re-enrich guard for Twitch rows, and Platform field in CSV export.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create TwitchDiscoveryPanel component | 70abfcd | src/components/outreach/twitch-discovery-panel.tsx (created) |
| 2 | 4th tab + Platform column + channels route | fa4349d | discovery-table.tsx, outreach-list.tsx, channels/route.ts |

## What Was Built

### TwitchDiscoveryPanel (`twitch-discovery-panel.tsx`)

- Game name text input + "Search Twitch" button → `POST /api/outreach/discover-twitch`
- After search: "Max live viewers" filter input; count badge; sortable TanStack Table
- Columns: checkbox, Streamer (purple link), Live viewers, Email, Status
- Row selection capped at 15; "Save streamers" → `POST /api/outreach/save-twitch`
- Row-level status lifecycle: idle → saving → saved/failed; `alreadySaved` disables checkbox
- Summary panel on save complete with saved/failed counts

### OutreachTabs 4th tab (`discovery-table.tsx`)

- Imports `TwitchDiscoveryPanel`
- Tab union type extended: `'discover' | 'enrich' | 'outreach-list' | 'twitch-discover'`
- "Discover on Twitch" button added after "Outreach list"
- `{tab === 'twitch-discover' && <TwitchDiscoveryPanel />}` render added

### Outreach List (`outreach-list.tsx`)

- `OutreachRow.platform: string` field added
- Platform column: YouTube → `<Badge variant="secondary">YouTube</Badge>`; Twitch → `<Badge variant="secondary" className="text-purple-400">Twitch</Badge>`
- Re-enrich button wrapped in `{row.original.platform !== 'twitch' && (...)}` guard
- CSV headers: `'Platform'` appended; row data: `o.platform ?? 'youtube'` appended
- useEffect mapper: `platform: (c as OutreachRow).platform ?? 'youtube'` added

### Channels GET route (`channels/route.ts`)

- `.select(...)` now includes `platform`
- camelCase mapping: `platform: c.platform ?? 'youtube'`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data is wired from the API response. Platform defaults to `'youtube'` for legacy rows that predate the column.

## Threat Flags

No new threat surface beyond what was declared in the plan's threat model.

## Self-Check: PASSED

- `src/components/outreach/twitch-discovery-panel.tsx` — created, exports default `TwitchDiscoveryPanel`
- Commits 70abfcd and fa4349d exist
- `npx tsc --noEmit` — zero errors
