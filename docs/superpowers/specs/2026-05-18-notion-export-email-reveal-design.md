# Design: Notion Export + Email Reveal

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Two independent features — Notion-compatible CSV export and InnerTube email reveal

---

## Feature 1: Notion Export

### Problem

The existing "Export CSV" columns (`Channel name, URL, Subscribers, Top games, Genre, Median views, Last enriched, Email, Platform`) don't match the user's Notion database schema, making import messy.

### Solution

A second **"Export for Notion"** button in the Outreach List toolbar. Exports only rows with an email address (blank contact rows are useless in Notion), respects all active filters, produces exactly 7 columns in Notion's expected format.

### CSV format

| Column | Source |
|--------|--------|
| `channel` | `name` |
| `contact` | `email` |
| `contact method` | `"Email"` (hardcoded) |
| `contact person` | _(blank)_ |
| `date contacted` | _(blank)_ |
| `steam key sent` | _(blank)_ |
| `comment` | _(blank)_ |

- Rows without email are excluded
- All active filters (genre, views, subscribers, activity, gaming-only, score) apply
- UTF-8 with BOM for clean Notion import
- Filename: `notion-outreach-YYYY-MM-DD.csv`

### Files changed

- `src/components/outreach/outreach-list.tsx` — add `handleExportNotion` function + "Export for Notion" button alongside existing "Export CSV"

---

## Feature 2: Email Reveal

### Problem

Many YouTube creators set a "business email" visible only behind the "View email address" button in their About page. The current pipeline only runs a regex on the description text and follows website links — it never attempts the InnerTube reveal call.

### Solution: Approach A — InnerTube reveal call

YouTubei.js exposes `can_reveal_email: boolean` and `email_reveal: NavigationEndpoint` on the About page response (`ChannelAboutFullMetadata`). Calling `email_reveal.call(client.actions)` is the programmatic equivalent of clicking the button.

Two integration points:

### 2a — Auto-reveal during enrichment

**File:** `src/lib/outreach/fetch-channel-data.ts`

After the existing website-email fallback block, add a reveal attempt:

```
if (about.can_reveal_email && !email_found_so_far) {
  try {
    const result = await about.email_reveal.call(client.actions);
    // parse result for email address — response shape determined at implementation time
    // assign to emailFromReveal
  } catch { /* silent */ }
}
```

Priority order for email: description text → website link → InnerTube reveal.

Silent failure: if the reveal call throws, times out, or returns no parseable email, enrichment continues normally. `websiteEmail` is already in `OutreachChannelData` — add `revealEmail: string | null` alongside it, or fold into existing `websiteEmail` (implementer decides based on actual response shape).

### 2b — "Find emails" batch sweep

**New route:** `POST /api/outreach/find-emails`
- Auth-gated
- Fetches all YouTube channels in `outreach_channels` where `email IS NULL`
- For each: calls `getChannel(youtubeId)` → `getAbout()` → checks `can_reveal_email` → if true, calls `email_reveal.call(client.actions)`
- Updates `email` column on success via service role
- Returns `{ updated: number, failed: number }`

**UI:** "Find emails" button in the Outreach List toolbar (visible when any visible rows have no email). Shows progress "Checking N of M…" while running. Updates rows in-place on completion. Respects current filters — only sweeps currently visible rows.

### Implementation note on response shape

The `email_reveal.call(client.actions)` response shape is unknown at design time — it needs to be investigated at implementation time by inspecting the raw response. The implementer should `console.log` the full response on first call to determine how to parse the email. If the response shape cannot be parsed, add a `// TODO: update parser` comment and return null.

---

## Out of Scope

- Broader email regex patterns (Approach B — deferred)
- Per-row manual "Reveal email" button (the batch sweep covers this)
- Caching reveal results separately (email field already stores the result)
- Notion API push integration (CSV import is sufficient)
