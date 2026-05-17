# Email Campaigns — Plan 2: API Routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all five API route handlers for campaign CRUD, the send loop, per-channel status, and the public click tracker.

**Architecture:** Five Route Handlers under `src/app/api/campaigns/`. All except `GET /api/track/click` are auth-gated via `supabase.auth.getUser()`. The send loop in `[id]/send/route.ts` iterates `campaign_sends` rows, calls `sendEmail()` from Plan 1, and sleeps 12 s between sends — designed for local execution with no timeout constraints.

**Tech Stack:** Next.js 16 Route Handlers, Supabase service role, nodemailer (via Plan 1 library).

**Depends on:** Plan 1 (migration 008 applied, `src/lib/email/` library exists).

---

## File Map

| File | Action |
|------|--------|
| `src/app/api/campaigns/route.ts` | Create — GET (list) + POST (create) |
| `src/app/api/campaigns/[id]/route.ts` | Create — DELETE |
| `src/app/api/campaigns/[id]/send/route.ts` | Create — POST send loop |
| `src/app/api/campaigns/[id]/sends/route.ts` | Create — GET per-channel status |
| `src/app/api/track/click/route.ts` | Create — GET public click tracker |

---

## Task 1: `GET /api/campaigns` + `POST /api/campaigns`

**Files:**
- Create: `src/app/api/campaigns/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/campaigns/route.ts
// GET  — list all campaigns with sent/clicked counts
// POST — create campaign + campaign_sends rows for selected channels

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach send counts
  const ids = (campaigns ?? []).map((c: { id: string }) => c.id);
  const { data: sends } = await supabase
    .from('campaign_sends')
    .select('campaign_id, status')
    .in('campaign_id', ids.length > 0 ? ids : ['__none__']);

  const countMap: Record<string, { sent: number; clicked: number; total: number }> = {};
  for (const s of sends ?? []) {
    const row = s as { campaign_id: string; status: string };
    if (!countMap[row.campaign_id]) countMap[row.campaign_id] = { sent: 0, clicked: 0, total: 0 };
    countMap[row.campaign_id].total++;
    if (row.status === 'sent' || row.status === 'clicked') countMap[row.campaign_id].sent++;
    if (row.status === 'clicked') countMap[row.campaign_id].clicked++;
  }

  const result = (campaigns ?? []).map((c: Record<string, unknown>) => ({
    id:          c.id,
    name:        c.name,
    status:      c.status,
    createdAt:   c.created_at,
    sentCount:   countMap[c.id as string]?.sent    ?? 0,
    clickedCount: countMap[c.id as string]?.clicked ?? 0,
    totalCount:  countMap[c.id as string]?.total   ?? 0,
  }));

  return NextResponse.json({ campaigns: result });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, subjectTemplate, bodyTextTemplate, bodyHtmlTemplate, channelIds } = body as {
    name: string;
    subjectTemplate: string;
    bodyTextTemplate: string;
    bodyHtmlTemplate: string;
    channelIds: string[];
  };

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!subjectTemplate?.trim()) return NextResponse.json({ error: 'subjectTemplate is required' }, { status: 400 });
  if (!Array.isArray(channelIds) || channelIds.length === 0)
    return NextResponse.json({ error: 'channelIds must be a non-empty array' }, { status: 400 });

  const sb = createServiceClient();

  // Create campaign
  const { data: campaign, error: campErr } = await sb
    .from('campaigns')
    .insert({
      name,
      subject_template:    subjectTemplate,
      body_text_template:  bodyTextTemplate ?? '',
      body_html_template:  bodyHtmlTemplate ?? '',
      status: 'draft',
    })
    .select('id')
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: campErr?.message ?? 'Insert failed' }, { status: 500 });

  // Fetch channel data for sends
  const { data: channels } = await sb
    .from('outreach_channels')
    .select('youtube_id, name, email')
    .in('youtube_id', channelIds);

  const sends = (channels ?? [])
    .filter((c: { email: string | null }) => c.email)
    .map((c: { youtube_id: string; name: string; email: string }) => ({
      campaign_id:  campaign.id,
      youtube_id:   c.youtube_id,
      email:        c.email,
      channel_name: c.name,
      status:       'pending',
    }));

  if (sends.length > 0) {
    await sb.from('campaign_sends').insert(sends);
  }

  return NextResponse.json({ campaignId: campaign.id, sendsCreated: sends.length });
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
git add src/app/api/campaigns/route.ts
git commit -m "feat(api): GET/POST /api/campaigns — list and create campaigns"
```

---

## Task 2: `DELETE /api/campaigns/[id]`

**Files:**
- Create: `src/app/api/campaigns/[id]/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/campaigns/[id]/route.ts
// DELETE — remove a campaign and all its sends (cascade)

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = createServiceClient();

  const { error } = await sb.from('campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({});
}
```

- [ ] **Step 2: TypeScript check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "error TS"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/[id]/route.ts
git commit -m "feat(api): DELETE /api/campaigns/[id]"
```

---

## Task 3: `POST /api/campaigns/[id]/send` — the send loop

**Files:**
- Create: `src/app/api/campaigns/[id]/send/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/campaigns/[id]/send/route.ts
// POST — iterate all pending sends for a campaign, send each email, sleep 12 s between.
// Designed to run locally (no Vercel timeout applies).

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendEmail, substituteVariables, SEND_DELAY_MS, type SendVariables } from '@/lib/email/send-campaign';

export const maxDuration = 300;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;
  const sb = createServiceClient();

  // Load campaign templates
  const { data: campaign, error: campErr } = await sb
    .from('campaigns')
    .select('id, subject_template, body_text_template, body_html_template, status')
    .eq('id', campaignId)
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status === 'sent') return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 });

  // Load pending sends with channel data
  const { data: sends, error: sendsErr } = await sb
    .from('campaign_sends')
    .select('id, youtube_id, email, channel_name, status')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (sendsErr) return NextResponse.json({ error: sendsErr.message }, { status: 500 });
  if (!sends || sends.length === 0) return NextResponse.json({ sent: 0, failed: 0 });

  // Load channel data for variable substitution
  const youtubeIds = sends.map((s: { youtube_id: string }) => s.youtube_id);
  const { data: channels } = await sb
    .from('outreach_channels')
    .select('youtube_id, top_games, genre, platform')
    .in('youtube_id', youtubeIds);

  const channelMap = new Map(
    (channels ?? []).map((c: { youtube_id: string; top_games: string[] | null; genre: string | null; platform: string }) =>
      [c.youtube_id, c]
    )
  );

  // Mark campaign as sending
  await sb.from('campaigns').update({ status: 'sending' }).eq('id', campaignId);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < sends.length; i++) {
    const s = sends[i] as { id: string; youtube_id: string; email: string; channel_name: string };
    const ch = channelMap.get(s.youtube_id) as { top_games: string[] | null; genre: string | null; platform: string } | undefined;

    const vars: SendVariables = {
      ChannelName: s.channel_name,
      TopGames:    (ch?.top_games ?? []).join(' | ') || '—',
      Genre:       ch?.genre ?? '—',
      Platform:    ch?.platform ?? 'YouTube',
    };

    const subject  = substituteVariables(campaign.subject_template, vars);
    const textBody = substituteVariables(campaign.body_text_template, vars);
    const htmlBody = substituteVariables(campaign.body_html_template, vars);

    try {
      await sendEmail({ to: s.email, subject, textBody, htmlBody, sendId: s.id });
      await sb.from('campaign_sends').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', s.id);
      sent++;
    } catch (err) {
      console.error('[send] failed for', s.email, err);
      await sb.from('campaign_sends').update({ status: 'failed' }).eq('id', s.id);
      failed++;
    }

    // Rate limit: sleep between sends (skip after last one)
    if (i < sends.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  await sb.from('campaigns').update({ status: 'sent' }).eq('id', campaignId);

  return NextResponse.json({ sent, failed });
}
```

- [ ] **Step 2: TypeScript check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "error TS"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/[id]/send/route.ts
git commit -m "feat(api): POST /api/campaigns/[id]/send — rate-limited send loop"
```

---

## Task 4: `GET /api/campaigns/[id]/sends`

**Files:**
- Create: `src/app/api/campaigns/[id]/sends/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/campaigns/[id]/sends/route.ts
// GET — per-channel send status for a campaign

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;

  const { data, error } = await supabase
    .from('campaign_sends')
    .select('id, youtube_id, email, channel_name, status, sent_at, clicked_at')
    .eq('campaign_id', campaignId)
    .order('channel_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sends = (data ?? []).map((s: Record<string, unknown>) => ({
    id:          s.id,
    youtubeId:   s.youtube_id,
    email:       s.email,
    channelName: s.channel_name,
    status:      s.status,
    sentAt:      s.sent_at,
    clickedAt:   s.clicked_at,
  }));

  return NextResponse.json({ sends });
}
```

- [ ] **Step 2: TypeScript check + commit**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "error TS"
```

```bash
git add src/app/api/campaigns/[id]/sends/route.ts
git commit -m "feat(api): GET /api/campaigns/[id]/sends — per-channel send status"
```

---

## Task 5: `GET /api/track/click` — public click tracker

**Files:**
- Create: `src/app/api/track/click/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/track/click/route.ts
// PUBLIC (unauthenticated) — log a click and redirect to the original URL.
// The send_id is an opaque UUID from campaign_sends.id; not guessable.

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sendId     = searchParams.get('id')  ?? '';
  const encodedUrl = searchParams.get('url') ?? '';

  let destination = '/';
  try {
    destination = decodeURIComponent(encodedUrl) || '/';
  } catch {
    destination = '/';
  }

  // Log click — use service role (no session cookie in recipient's browser).
  // Silent failure: always redirect regardless of DB outcome.
  if (sendId) {
    try {
      const sb = createServiceClient();
      await sb
        .from('campaign_sends')
        .update({ status: 'clicked', clicked_at: new Date().toISOString() })
        .eq('id', sendId)
        .is('clicked_at', null);  // only update first click
    } catch {
      // silent
    }
  }

  return NextResponse.redirect(destination);
}
```

- [ ] **Step 2: TypeScript check + commit**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit 2>&1 | Select-String "error TS"
```

```bash
git add src/app/api/track/click/route.ts
git commit -m "feat(api): GET /api/track/click — public click tracker with redirect"
```
