# Design: Email Campaigns

**Date:** 2026-05-17
**Status:** Approved
**Scope:** In-dashboard email campaign sender with click tracking, built on one.com SMTP via nodemailer

---

## Problem

The Python script (`scripts/send_outreach.py`) sends batch emails but requires manual CSV preparation and has no visibility into who clicked. The workflow needs to live inside the dashboard where channel data already is.

---

## Solution

A "Campaigns" tab in `OutreachTabs` that lets the user select channels with emails, write a personalised template, send via one.com SMTP (running locally — no Vercel timeout), and see per-channel click status.

---

## Data Model

### Migration 008 — two new tables

```sql
create table campaigns (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  subject_template     text not null,
  body_text_template   text not null,
  body_html_template   text not null,
  status               text not null default 'draft',  -- draft | sending | sent
  created_at           timestamptz default now()
);

create table campaign_sends (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  youtube_id    text not null,      -- outreach_channels.youtube_id
  email         text not null,      -- copied at send time
  channel_name  text not null,      -- copied at send time
  status        text not null default 'pending',  -- pending | sent | failed | clicked
  sent_at       timestamptz,
  clicked_at    timestamptz
);

create index campaign_sends_campaign_id_idx on campaign_sends (campaign_id);

alter table campaigns      enable row level security;
alter table campaign_sends enable row level security;

create policy "Authenticated read campaigns"
  on campaigns for select using (auth.role() = 'authenticated');

create policy "Authenticated read campaign_sends"
  on campaign_sends for select using (auth.role() = 'authenticated');
-- Writes go through service role only
```

### Template variables

Available in subject, body_text, and body_html:
- `{{ChannelName}}`
- `{{TopGames}}`
- `{{Genre}}`
- `{{Platform}}`

---

## Email Sending Pipeline

### Library

`nodemailer` — install with `npm install nodemailer @types/nodemailer`.

### SMTP configuration

```typescript
// Try STARTTLS on 587 first; fall back to SSL on 465
const transporter = nodemailer.createTransport({
  host: 'send.one.com',
  port: 587,
  secure: false,   // STARTTLS
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
// If connection fails, retry with port 465, secure: true
```

Module-level singleton — connection reused across a batch.

### Spam bypass headers (applied to every email)

```
From:             "{{FROM_NAME}} <SMTP_USER>"
Reply-To:         SMTP_USER
Message-ID:       <uuid@domain-extracted-from-SMTP_USER>
List-Unsubscribe: <mailto:SMTP_USER?subject=unsubscribe>
```

- No `X-Priority` header (screams spam)
- No URL shorteners
- Always send `multipart/alternative` with both plain text and HTML
- Plain text version keeps original URLs (not wrapped)

### Click tracking

Before sending, every `href="https://..."` in the HTML body is replaced with:
```
href="https://APP_URL/api/track/click?id=SEND_UUID&url=ENCODED_ORIGINAL_URL"
```

`APP_URL` = `process.env.NEXT_PUBLIC_APP_URL` (set in `.env.local` to the Vercel deployment URL).

`SEND_UUID` = `campaign_sends.id` — opaque UUID, unguessable.

Plain text body is NOT rewritten (spam filter signal).

### Rate limiting

12-second `setTimeout` between each send inside the API route. Running locally — no function timeout applies.

### New environment variables

```
SMTP_USER=you@domain.com
SMTP_PASS=yourpassword
FROM_NAME=Your Name
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
```

---

## API Routes

### `POST /api/campaigns`
Auth-gated. Creates campaign row + one `campaign_sends` row per selected channel. Body: `{ name, subjectTemplate, bodyTextTemplate, bodyHtmlTemplate, channelIds: string[] }`.

Returns `{ campaignId }`.

### `POST /api/campaigns/[id]/send`
Auth-gated. Iterates all `pending` `campaign_sends` rows for this campaign. For each:
1. Substitute template variables
2. Rewrite HTML hrefs with click tracking URLs
3. Send via nodemailer with spam-bypass headers
4. Update `campaign_sends` row: `status = 'sent'`, `sent_at = now()`
5. Sleep 12 seconds
6. Update campaign `status = 'sending'` at start, `status = 'sent'` when done

Returns `{ sent, failed }`.

### `GET /api/campaigns`
Auth-gated. Returns all campaigns with `sent_count` and `clicked_count` derived from `campaign_sends`.

### `GET /api/campaigns/[id]/sends`
Auth-gated. Returns all `campaign_sends` rows for a campaign (per-channel status).

### `GET /api/track/click` — **PUBLIC, unauthenticated**
Query params: `id` (campaign_sends UUID), `url` (encoded destination URL).
- Finds the `campaign_sends` row by `id`
- If `clicked_at` is null, sets `clicked_at = now()` and `status = 'clicked'` via service role client
- Returns 302 redirect to the decoded `url`
- Silent on any error (always redirects)

---

## UI

### Location

5th tab in `OutreachTabs`: `Discover channels | Bulk enrich | Outreach list | Discover on Twitch | Campaigns`

### View 1 — Campaign list (default)

Toolbar with "New campaign" button. Table columns: Name, Recipients, Sent, Clicked, Status badge, Actions (View / Send / Delete).

- "Send" triggers `POST /api/campaigns/[id]/send` and shows inline progress
- "View" switches to per-channel send status table

### View 2 — Compose

Three sections in a scrollable form:

**Recipients:** Checkbox list of outreach channels with emails. Shows channel name + email. "Select all" checkbox. Counter: `N of M channels have emails — X selected`.

**Template:**
- Campaign name input
- Subject input (hint: `Use {{ChannelName}}, {{TopGames}}, {{Genre}}`)
- Plain text textarea
- HTML textarea
- Live preview panel: renders substituted output for first selected channel

**Send:**
- "Create & send" button — creates campaign then starts sending loop
- Progress: `Sending 3 of 45… (~9 min remaining)`
- Per-row status updates as sends complete

---

## New files

| File | What |
|------|------|
| `supabase/migrations/008_campaigns.sql` | campaigns + campaign_sends tables |
| `src/lib/email/transporter.ts` | nodemailer singleton with STARTTLS/SSL fallback |
| `src/lib/email/send-campaign.ts` | template substitution, click-URL rewriting, send logic |
| `src/app/api/campaigns/route.ts` | GET (list) + POST (create) |
| `src/app/api/campaigns/[id]/route.ts` | DELETE |
| `src/app/api/campaigns/[id]/send/route.ts` | POST — triggers send loop |
| `src/app/api/campaigns/[id]/sends/route.ts` | GET per-channel status |
| `src/app/api/track/click/route.ts` | GET public click tracker |
| `src/components/outreach/campaigns-panel.tsx` | full Campaigns UI |
| `src/components/outreach/discovery-table.tsx` | add 5th tab to OutreachTabs |

---

## Out of Scope

- Follow-up sequences / drip campaigns
- Open tracking (1×1 pixel — aggressive spam signal, skipped deliberately)
- Unsubscribe landing page (header only)
- Multi-account inbox rotation
- Email scheduling (send now only)
- Deployed sending (local only for v1)
