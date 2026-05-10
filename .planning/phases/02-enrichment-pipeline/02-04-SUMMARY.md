---
phase: 02-enrichment-pipeline
plan: 04
subsystem: outreach-ui
tags: [outreach, ui, form, dashboard, react, client-component, nav, server-component, auth]
dependency_graph:
  requires: [02-03-SUMMARY]
  provides:
    - src/components/outreach/enrich-form.tsx
    - src/app/dashboard/outreach/page.tsx
    - src/components/dashboard-nav.tsx
  affects: [02-05-PLAN, 04-outreach-dashboard]
tech_stack:
  added: []
  patterns:
    - use-client-form-with-fetch
    - server-component-auth-gate
    - controlled-textarea-with-line-counter
    - details-summary-expandable
key_files:
  created:
    - src/components/outreach/enrich-form.tsx
    - src/app/dashboard/outreach/page.tsx
  modified:
    - src/components/dashboard-nav.tsx
decisions:
  - "EnrichForm is self-contained — no onComplete callback (Phase 4 adds the table below)"
  - "Plain <textarea> styled with Tailwind inline (no shadcn Textarea — @base-ui/react has none; confirmed by RESEARCH)"
  - "Native <details><summary> for expandable failure list — no Radix accordion needed"
  - "Partial entries annotated 'llm_failed (saved without games/genre)' per RESEARCH Pitfall 6"
  - "OutreachPage intentionally minimal — Phase 4 expands with filterable table + CSV export"
  - "Nav tabs now 4 — future phases appending tabs should continue appending at end of array"
metrics:
  duration: ~15min
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_count: 3
---

# Phase 2 Plan 4: Enrich Form UI + Outreach Page Summary

**One-liner:** `'use client'` EnrichForm with textarea, live line counter, MAX_BATCH=15 cap, spinner, and three-colour summary panel wired to POST /api/outreach/enrich; auth-gated Server Component page at /dashboard/outreach; Outreach tab added to dashboard nav.

## Form Interaction State Machine

```
IDLE         → textarea empty or partially filled; button reads "Enrich N channels"; button
               disabled when lines.length === 0 or tooMany
LOADING      → handleSubmit fires; setLoading(true); button disabled; button text changes to
               "Enriching N…" with animate-spin SVG; textarea disabled
SUCCESS      → res.ok; setResult(data); setText(''); loading stops; SummaryPanel renders below
ERROR (HTTP) → !res.ok; setError(data.error ?? 'Enrich failed'); textarea PRESERVED; loading stops
ERROR (NET)  → fetch throws; setError('Network error — please try again'); textarea PRESERVED
TOO_MANY     → lines.length > 15; button disabled; inline red message "Maximum 15 channels per batch."
```

## Summary Panel Render Rules

The `<SummaryPanel>` component is rendered when `result` is non-null (after a successful HTTP 200 response).

- **Header:** "Enrichment complete — N processed" (N = succeeded + partial.length + failed.length)
- **Count row:** three coloured spans — `Succeeded: N` (green-400), `Partial: N` (yellow-400), `Failed: N` (red-400)
- **Expandable details:** only rendered if `failed.length > 0 || partial.length > 0`
  - Uses native `<details><summary>Show details</summary>` — no accordion library
  - Partial entries: `{url} — llm_failed (saved without games/genre)` (yellow-300)
  - Failed entries: `{url} — {reason}` where reason is the raw server value (red-300)
- **Collapsed default:** `<details>` is collapsed by default; user clicks to expand

## OutreachPage Notes

`src/app/dashboard/outreach/page.tsx` is intentionally minimal for Phase 2:

- Auth gate only: `createClient().auth.getUser()` → redirect('/login') if no user
- `export const dynamic = 'force-dynamic'` — mirrors all other dashboard pages
- Renders heading + `<EnrichForm />` only
- No Supabase queries — Phase 4 adds the `outreach_channels` SELECT + filterable table + CSV export

## Dashboard Nav: 4-Tab State

The tabs array in `src/components/dashboard-nav.tsx` now has 4 entries:

```typescript
const tabs = [
  { label: 'Keywords Scraper', href: '/dashboard' },
  { label: 'Top Viral Charts', href: '/dashboard/charts' },
  { label: 'Niche Insights',   href: '/dashboard/niches' },
  { label: 'Outreach',         href: '/dashboard/outreach' },  // added in Plan 04
];
```

**Note for future plans (Phase 4, Plan 05, etc.):** If adding new dashboard tabs, continue appending at the end of this array. The active-state logic (`pathname === tab.href`) works correctly for exact path matching — no changes needed for new sub-route tabs.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx eslint src/components/outreach/enrich-form.tsx` | PASS (0 errors) |
| `npx eslint src/app/dashboard/outreach/page.tsx` | PASS (0 errors) |
| `npx eslint src/components/dashboard-nav.tsx` | PASS (0 errors) |
| `npm run build` | PASS — `/dashboard/outreach` appears in route output |

Note: `npm run lint` (full project) reports 21 pre-existing errors in unrelated files (confirmed pre-existing in 02-03-SUMMARY.md). All 3 new/modified files in this plan are error-free.

## Threat Mitigations Implemented

| Threat | Mitigation |
|--------|-----------|
| T-02-18: Unauthenticated /dashboard/outreach | Middleware guards /dashboard/*; page adds second check via createClient().auth.getUser() + redirect('/login') |
| T-02-19: XSS in summary panel | React auto-escapes all string children; no dangerouslySetInnerHTML; URLs displayed as text, not links |
| T-02-21: Client-side cap bypass | Client-side cap is UX only; server re-validates and returns 400 for >15 |
| T-02-22: CSRF | Supabase cookies SameSite=Lax; forged cross-origin POST lacks session cookie → 401 |

## Deviations from Plan

None — implemented exactly as specified in the plan. The concrete code skeleton from the plan's `<action>` block was used verbatim (with minor line-counter UX addition: "N URLs entered" helper text below the textarea for clearer feedback — does not affect behaviour or criteria).

## Self-Check: PASSED

- [x] `src/components/outreach/enrich-form.tsx` exists
- [x] Starts with `'use client';` directive on line 1
- [x] `export default function EnrichForm()` — default export present
- [x] `<textarea` with `rows={6}` and `value={text}` — present
- [x] `fetch('/api/outreach/enrich', { method: 'POST', ...` — present
- [x] `JSON.stringify({ text })` body shape — present
- [x] `MAX_BATCH = 15` — present
- [x] `Succeeded:`, `Partial:`, `Failed:` — all three labels present
- [x] `llm_failed (saved without games/genre)` annotation — present
- [x] `animate-spin` SVG spinner — present
- [x] `'Network error — please try again'` — present
- [x] `setText('')` on success — present
- [x] No `EventSource` or `text/event-stream` — absent (confirmed)
- [x] File is 130 lines (>= 60 min_lines)
- [x] Task 1 commit: a493dfd
- [x] `src/app/dashboard/outreach/page.tsx` exists
- [x] Imports `createClient` from `'@/lib/supabase/server'` — present
- [x] Imports `EnrichForm` from `'@/components/outreach/enrich-form'` — present
- [x] Imports `redirect` from `'next/navigation'` — present
- [x] `export const dynamic = 'force-dynamic'` — present
- [x] `redirect('/login')` in no-user branch — present
- [x] `<EnrichForm />` rendered — present
- [x] No `outreach_channels` query — absent (confirmed)
- [x] `src/components/dashboard-nav.tsx` has label: 'Outreach' — present
- [x] `src/components/dashboard-nav.tsx` has href: '/dashboard/outreach' — present
- [x] All 3 original tabs retained — present
- [x] Task 2 commit: ef75bf1
- [x] `npx tsc --noEmit` exits 0
- [x] New files lint clean
- [x] `npm run build` exits 0; `/dashboard/outreach` in route list
