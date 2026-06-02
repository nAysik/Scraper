# Phase 11: Hidden Email Signal — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture YouTube's `can_reveal_email` signal during enrichment and surface it in the Outreach List so the user knows exactly which email-less channels have a hidden business email waiting to be manually revealed (behind YouTube's reCAPTCHA).

In scope: migration 010, enrichment pipeline captures `can_reveal_email`, upsert stores it, GET route exposes it, Outreach List shows a "Has hidden email ↗" badge replacing the generic icon.
Out of scope: programmatic email reveal (blocked by reCAPTCHA), auto-clicking the reveal button.

</domain>

<decisions>
## Implementation Decisions

### DB
- **D-01:** Add `has_hidden_email boolean` (nullable, no default) to `outreach_channels` via Migration 010.
- **D-02:** Null = not yet enriched with this signal. True = hidden email exists. False = confirmed no hidden email. No backfill — existing rows stay null until re-enriched.

### Enrichment pipeline
- **D-03:** In `fetchChannelDataOnce` (`src/lib/outreach/fetch-channel-data.ts`), after `getAbout()`, read `(about as any)?.can_reveal_email ?? false` and return it as `canRevealEmail: boolean` on `OutreachChannelData`.
- **D-04:** In `enrich/route.ts`, pass `canRevealEmail: data.canRevealEmail` to `upsertOutreachChannel`.
- **D-05:** In `upsert-outreach.ts`, add `hasHiddenEmail?: boolean | null` to `OutreachUpsertRow` and include `has_hidden_email: row.hasHiddenEmail ?? null` in the upsert object. **Always upsert this field** (unlike email which is preserved — this is a factual signal, not user data).
- **D-06:** In `GET /api/outreach/channels`, add `has_hidden_email` to SELECT and `hasHiddenEmail: c.has_hidden_email ?? null` to the camelCase mapping.

### UI — Outreach List email column
- **D-07:** Three states for email-less YouTube channels:
  - `hasHiddenEmail === true` → `<Badge variant="outline" className="text-purple-400 cursor-pointer" onClick={...openAboutPage}>Has hidden email ↗</Badge>` — clicking opens `{url}/about` in new tab.
  - `hasHiddenEmail === false` → plain `"Add email"` button only (no icon — confirmed nothing there).
  - `hasHiddenEmail === null` (existing channels) → `"Add email"` + generic ↗ icon (as built in Phase 10-02, unchanged).
- **D-08:** The badge replaces the generic ↗ icon entirely for `hasHiddenEmail === true` rows. The ↗ icon from Phase 10-02 remains for null rows only.
- **D-09:** `OutreachRow` interface gets `hasHiddenEmail: boolean | null`.

### Claude's Discretion
- Placement of `canRevealEmail` in `OutreachChannelData` return (after existing `websiteEmail` field).
- Whether to use a `<Badge>` or an `<a>` tag for the "Has hidden email" indicator — planner picks the cleaner option.

</decisions>

<canonical_refs>
## Canonical References

- `src/lib/outreach/fetch-channel-data.ts` — add `canRevealEmail` to `OutreachChannelData` + capture from `about`
- `src/lib/outreach/upsert-outreach.ts` — add `hasHiddenEmail` field
- `src/app/api/outreach/enrich/route.ts` — pass `canRevealEmail` to upsert
- `src/app/api/outreach/channels/route.ts` — expose `hasHiddenEmail`
- `src/components/outreach/outreach-list.tsx` — update `OutreachRow` + email column cell
- `supabase/migrations/010_hidden_email.sql` — new migration

</canonical_refs>

<deferred>
## Deferred Ideas

- Programmatic email reveal (reCAPTCHA blocks this)
- Auto-retry reveal for all `has_hidden_email = true` channels
- Batch "re-enrich to detect hidden emails" action
</deferred>

---

*Phase: 11-Hidden Email Signal*
*Context gathered: 2026-05-19*
