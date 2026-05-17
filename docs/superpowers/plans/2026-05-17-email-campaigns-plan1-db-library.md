# Email Campaigns — Plan 1: DB + Email Library

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the campaigns/campaign_sends DB tables, install nodemailer, and build the email sending library that Plans 2 and 3 depend on.

**Architecture:** Migration 008 creates two tables. `src/lib/email/transporter.ts` manages a module-level nodemailer singleton with STARTTLS/SSL fallback. `src/lib/email/send-campaign.ts` handles template substitution, click URL rewriting, and single-email send with spam-bypass headers.

**Tech Stack:** Supabase SQL, nodemailer, TypeScript.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/008_campaigns.sql` | Create |
| `src/lib/email/transporter.ts` | Create |
| `src/lib/email/send-campaign.ts` | Create |
| `CLAUDE.md` | Modify — add FROM_NAME, NEXT_PUBLIC_APP_URL to env table |

---

## Task 1: Migration 008

**Files:**
- Create: `supabase/migrations/008_campaigns.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/008_campaigns.sql`:

```sql
-- ============================================================
-- 008: Email campaigns + per-send tracking (Phase: Email Campaigns)
-- Apply in Supabase Dashboard SQL editor.
-- ============================================================

create table campaigns (
  id                   uuid        primary key default gen_random_uuid(),
  name                 text        not null,
  subject_template     text        not null,
  body_text_template   text        not null,
  body_html_template   text        not null,
  status               text        not null default 'draft',  -- draft | sending | sent
  created_at           timestamptz default now()
);

create table campaign_sends (
  id            uuid        primary key default gen_random_uuid(),
  campaign_id   uuid        not null references campaigns(id) on delete cascade,
  youtube_id    text        not null,
  email         text        not null,
  channel_name  text        not null,
  status        text        not null default 'pending',  -- pending | sent | failed | clicked
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
-- Mutations go through the service role (bypasses RLS).
```

- [ ] **Step 2: Apply in Supabase Dashboard**

Open Supabase project → SQL Editor → paste the migration → Run.
Expected: no errors. Confirm `campaigns` and `campaign_sends` tables appear in the Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_campaigns.sql
git commit -m "feat(db): migration 008 — campaigns and campaign_sends tables"
```

---

## Task 2: Install nodemailer

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected: `package.json` and `package-lock.json` updated. No errors.

- [ ] **Step 2: Verify TypeScript resolves the types**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit
```

Expected: zero errors (nodemailer types resolved).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): install nodemailer for email sending"
```

---

## Task 3: `src/lib/email/transporter.ts`

**Files:**
- Create: `src/lib/email/transporter.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/email/transporter.ts
// Module-level nodemailer transporter singleton.
// Tries STARTTLS on port 587 first; falls back to SSL on 465.
// Call resetTransporter() if a send fails to force reconnection on next use.

import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

export function resetTransporter(): void {
  _transporter = null;
}

export async function getTransporter(): Promise<nodemailer.Transporter> {
  if (_transporter) return _transporter;

  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env.local');
  }

  // Attempt STARTTLS on 587
  try {
    const t = nodemailer.createTransport({
      host: 'send.one.com',
      port: 587,
      secure: false,   // STARTTLS
      auth: { user, pass },
    });
    await t.verify();
    _transporter = t;
    console.log('[email] Connected via STARTTLS (port 587)');
    return _transporter;
  } catch (err) {
    console.warn('[email] STARTTLS failed, falling back to SSL port 465:', err);
  }

  // Fallback: SSL on 465
  _transporter = nodemailer.createTransport({
    host: 'send.one.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  console.log('[email] Connected via SSL (port 465)');
  return _transporter;
}
```

- [ ] **Step 2: TypeScript check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "error TS"
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/transporter.ts
git commit -m "feat(email): nodemailer transporter singleton with STARTTLS/SSL fallback"
```

---

## Task 4: `src/lib/email/send-campaign.ts`

**Files:**
- Create: `src/lib/email/send-campaign.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/email/send-campaign.ts
// Template substitution, click URL rewriting, and single-email send.
// All spam-bypass headers applied here.

import { getTransporter, resetTransporter } from './transporter';

export interface SendVariables {
  ChannelName: string;
  TopGames: string;    // pipe-separated, e.g. "Hades | Celeste"
  Genre:    string;
  Platform: string;
}

// Replace {{Variable}} placeholders with values.
export function substituteVariables(template: string, vars: SendVariables): string {
  return template
    .replace(/\{\{ChannelName\}\}/g, vars.ChannelName)
    .replace(/\{\{TopGames\}\}/g,    vars.TopGames)
    .replace(/\{\{Genre\}\}/g,       vars.Genre)
    .replace(/\{\{Platform\}\}/g,    vars.Platform);
}

// Rewrite href="https://..." in HTML body to route through click tracker.
// Plain text body is NOT rewritten (avoids spam signal).
export function rewriteClickUrls(html: string, sendId: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!appUrl) return html;
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url: string) =>
      `href="${appUrl}/api/track/click?id=${encodeURIComponent(sendId)}&url=${encodeURIComponent(url)}"`,
  );
}

// Seconds between sends — one.com limit: 25 / 5 min = 1 per 12 s.
export const SEND_DELAY_MS = 12_000;

export interface SendEmailOptions {
  to:       string;
  subject:  string;
  textBody: string;
  htmlBody: string;
  sendId:   string;   // campaign_sends.id — used as Message-ID token + click tracking
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const user      = process.env.SMTP_USER  ?? '';
  const fromName  = process.env.FROM_NAME  ?? 'Outreach';
  const domain    = user.includes('@') ? user.split('@')[1] : 'mail';

  const htmlWithTracking = rewriteClickUrls(opts.htmlBody, opts.sendId);

  let transporter = await getTransporter();

  const mail = {
    from:      `"${fromName}" <${user}>`,
    replyTo:   user,
    to:        opts.to,
    subject:   opts.subject,
    messageId: `<${opts.sendId}@${domain}>`,
    headers: {
      'List-Unsubscribe': `<mailto:${user}?subject=unsubscribe>`,
    },
    text: opts.textBody,
    html: htmlWithTracking,
  };

  try {
    await transporter.sendMail(mail);
  } catch (err) {
    // Connection may have dropped — reset and retry once.
    resetTransporter();
    transporter = await getTransporter();
    await transporter.sendMail(mail);
  }
}
```

- [ ] **Step 2: TypeScript check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "error TS"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/send-campaign.ts
git commit -m "feat(email): template substitution, click URL rewriting, sendEmail with spam-bypass headers"
```

---

## Task 5: Update CLAUDE.md env table

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add two rows to the environment variable table**

Find the env table in `CLAUDE.md` (the `| Variable | Purpose |` table). Add after the existing `TWITCH_CLIENT_SECRET` row:

```
| `FROM_NAME`              | Sender display name in outreach emails, e.g. "Martin at Studio" |
| `NEXT_PUBLIC_APP_URL`    | Deployed Vercel URL used for click tracking links, e.g. https://yourapp.vercel.app |
```

Also add to `.env.local` manually (not committed):
```
FROM_NAME=Your Name
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add FROM_NAME and NEXT_PUBLIC_APP_URL to env table"
```
