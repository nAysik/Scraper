# Playlist-Hybrid top_games Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the video-titles-only `top_games` signal with a hybrid approach that uses channel playlist video counts as the primary signal and recent video titles as a secondary recency signal.

**Architecture:** `fetch-channel-data.ts` gains a `getPlaylists()` call that parses the LockupView shape (same pattern already used for videos) and returns top-20 playlists sorted by video count. `extract-games.ts` accepts the playlist data as an optional third parameter and includes it in the GPT-4o-mini prompt when present. The route handler passes the new field through with a one-line change.

**Tech Stack:** TypeScript, youtubei.js (InnerTube), OpenAI gpt-4o-mini, Next.js App Router route handlers.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/outreach/fetch-channel-data.ts` | Add `PlaylistMeta` interface, `playlists` field, `getPlaylists()` fetch + LockupView parser |
| `src/lib/outreach/extract-games.ts` | Add optional `playlists` param, update system prompt and user message |
| `src/app/api/outreach/enrich/route.ts` | Pass `data.playlists` at the `extractGamesGenre` call site |

---

## Task 1: Add PlaylistMeta type + playlist fetching to fetch-channel-data.ts

**Files:**
- Modify: `src/lib/outreach/fetch-channel-data.ts`

- [ ] **Step 1: Replace the file with the updated version**

Replace the entire file content with:

```typescript
// src/lib/outreach/fetch-channel-data.ts
// InnerTube channel fetch for outreach enrichment.
//
// Why this is NOT getChannelRecentVideos(): that function applies a NINETY_DAYS_MS cutoff
// (src/lib/scraper/videos.ts line 47, 92, 107). Outreach must enrich a channel whose
// last upload was 6 months ago — the user's outreach target is small/quiet indie channels.
// We inline a thin variant here that grabs literally the 10 most recent videos with no
// date filter (CONTEXT.md D-12).
//
// Retry semantics (CONTEXT.md "Claude's Discretion"):
//   - One retry with 500ms backoff on the InnerTube fetch (resolveURL succeeded, but
//     getChannel/getAbout/getVideos blipped).
//   - Second failure → return null. Route handler categorises as `failed[]` with reason 'not_found'.

import { getClient } from '@/lib/scraper/innertube';
import { parseViewCount, parseRelativeDate, type VideoMeta } from '@/lib/scraper/videos';
import { getChannelSubscriberCount } from '@/lib/scraper/shorts';

export interface PlaylistMeta {
  title: string;
  videoCount: number;
}

export interface OutreachChannelData {
  name: string;
  subscriberCount: number;
  description: string;
  videos: VideoMeta[];
  playlists: PlaylistMeta[];
}

async function fetchChannelDataOnce(channelId: string): Promise<OutreachChannelData> {
  const client = await getClient();
  const channel = await client.getChannel(channelId);

  // Channel name: Channel.d.ts line 23 — metadata.title is always populated.
  const name: string = (channel.metadata as any)?.title ?? '';

  // About / description: getAbout() returns ChannelAboutFullMetadata | AboutChannel
  // (Channel.d.ts line 88-90; both shapes verified in d.ts files).
  // Defensive chain handles both shapes plus a final fallback to channel.metadata.description.
  let description = '';
  try {
    const about = (await channel.getAbout()) as any;
    description =
      about?.description?.toString?.() ??
      about?.metadata?.description ??
      '';
  } catch {
    description = '';
  }
  if (!description) {
    description = (channel.metadata as any)?.description ?? '';
  }

  // Last 10 videos with NO date cutoff (CONTEXT.md D-12, RESEARCH Pitfall 4).
  // youtubei.js node types are unreliable — cast to any per project convention.
  //
  // YouTube returns two shapes (both observed Nov 2025):
  //   OLD: videoTab.videos is an array of Video nodes with .video_id/.title/.view_count/.published
  //   NEW: videoTab.current_tab.content.contents[i].content is a LockupView with .content_id
  //        + .metadata.title.text + .metadata.metadata.metadata_rows[0].metadata_parts[0|1].text.text
  // youtubei.js's .videos getter only recognises the OLD shape, returning [] for NEW-shape
  // channels (e.g. Northernlion's UC3tNpTOHsTnkmbwztCs30sA). Parse both.
  const videoTab = await channel.getVideos();
  const videos: VideoMeta[] = [];

  // Try OLD shape first (cheap, no-ops on empty array)
  for (const item of (videoTab as any).videos ?? []) {
    if (videos.length >= 10) break;
    const v = item as any;
    const id: string = v.video_id ?? v.id ?? '';
    const title: string = v.title?.toString() ?? '';
    if (!id || !title) continue;
    const viewText: string = v.view_count?.text ?? v.short_view_count?.text ?? '0';
    const publishedText: string = v.published?.text ?? v.published?.toString() ?? '';
    videos.push({
      youtubeId: id,
      title,
      viewCount: parseViewCount(viewText),
      publishedAt: parseRelativeDate(publishedText),
    });
  }

  // Fallback to NEW shape (LockupView in current_tab.content.contents)
  if (videos.length === 0) {
    const contents = (videoTab as any).current_tab?.content?.contents ?? [];
    for (const item of contents) {
      if (videos.length >= 10) break;
      const lockup = (item as any)?.content;
      if (!lockup || lockup.type !== 'LockupView' || lockup.content_type !== 'VIDEO') continue;
      const id: string = lockup.content_id ?? '';
      const title: string = lockup.metadata?.title?.text ?? '';
      if (!id || !title) continue;
      const parts = lockup.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts ?? [];
      const viewText: string = parts[0]?.text?.text ?? '0';
      const publishedText: string = parts[1]?.text?.text ?? '';
      videos.push({
        youtubeId: id,
        title,
        viewCount: parseViewCount(viewText),
        publishedAt: parseRelativeDate(publishedText),
      });
    }
  }

  // Playlists: primary signal for top_games extraction.
  // YouTube returns LockupView nodes (same new shape as videos tab).
  //   title:      item.metadata.title.text
  //   videoCount: overlay badge text, e.g. "68 videos" → 68
  // Wrapped in try/catch — failure is non-fatal; falls back to video-titles-only extraction.
  let playlists: PlaylistMeta[] = [];
  try {
    if (channel.has_playlists) {
      const playlistTab = await channel.getPlaylists();
      for (const item of (playlistTab as any).playlists ?? []) {
        const title: string = (item as any).metadata?.title?.text ?? '';
        if (!title) continue;
        const overlays: any[] = (item as any).content_image?.primary_thumbnail?.overlays ?? [];
        let countText = '';
        for (const o of overlays) {
          const badge: string = (o as any).badges?.[0]?.text ?? '';
          if (badge && /\d/.test(badge)) { countText = badge; break; }
        }
        const videoCount = countText ? parseInt(countText.replace(/[^0-9]/g, ''), 10) : 0;
        if (videoCount > 0) playlists.push({ title, videoCount });
      }
      playlists.sort((a, b) => b.videoCount - a.videoCount);
      playlists = playlists.slice(0, 20);
    }
  } catch {
    playlists = [];
  }

  // Reuse existing helper (verified src/lib/scraper/shorts.ts line 64).
  const subscriberCount = await getChannelSubscriberCount(channelId);

  return { name, subscriberCount, description, videos, playlists };
}

export async function fetchChannelData(channelId: string): Promise<OutreachChannelData | null> {
  try {
    return await fetchChannelDataOnce(channelId);
  } catch (err) {
    console.error('[outreach/fetch] retry after 500ms', err);
    await new Promise(r => setTimeout(r, 500));
    try {
      return await fetchChannelDataOnce(channelId);
    } catch (err2) {
      console.error('[outreach/fetch] failed after retry', err2);
      return null;
    }
  }
}
```

- [ ] **Step 2: Type-check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
```

Expected: no errors. If you see `Property 'playlists' does not exist on type 'OutreachChannelData'`, the interface change didn't save — check the file.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/outreach/fetch-channel-data.ts
git commit -m "feat(outreach): add playlist fetching to fetchChannelData"
```

---

## Task 2: Update extract-games.ts to accept and use playlists

**Files:**
- Modify: `src/lib/outreach/extract-games.ts`

- [ ] **Step 1: Replace the file with the updated version**

```typescript
// src/lib/outreach/extract-games.ts
// Single OpenAI gpt-4o-mini call per channel (CONTEXT.md D-08, D-10).
// Strict JSON Schema: returns { games: string[], genre: Genre }.
//
// Failure semantics (CONTEXT.md D-11):
//   - This module THROWS on any failure (timeout, parse error, missing parsed result, network).
//   - The route handler (Plan 03) catches the throw and routes the channel into the `partial[]`
//     array, saving the row with InnerTube data only and `top_games`/`genre` set to null.
//
// Strict-mode constraints (RESEARCH §5 + Pitfall 2):
//   - additionalProperties: false (REQUIRED at every object level)
//   - All properties listed in `required` (REQUIRED)
//   - minItems / maxItems NOT supported — enforce ≤3 in prompt + post-process .slice(0, 3)
//   - genre is a string enum — strict mode enforces exact match

import OpenAI from 'openai';
import { GENRES, type Genre } from './genre-taxonomy';
import type { VideoMeta } from '@/lib/scraper/videos';
import type { PlaylistMeta } from './fetch-channel-data';

export interface GameGenreResult {
  games: string[];   // 0..3 entries (≤3 enforced via prompt + .slice(0, 3))
  genre: Genre;
}

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return openai;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    games: { type: 'array', items: { type: 'string' } },
    genre: { type: 'string', enum: [...GENRES] },
  },
  required: ['games', 'genre'],
} as const;

const OPENAI_TIMEOUT_MS = 20_000;   // RESEARCH Pitfall 5

export async function extractGamesGenre(
  videos: VideoMeta[],
  description: string,
  playlists: PlaylistMeta[] = [],
): Promise<GameGenreResult> {
  const client = getOpenAI();

  const systemPrompt = playlists.length > 0
    ? `You analyse a YouTube gaming channel. Playlist data shows the creator's total body of work — ` +
      `weight it heavily when identifying top games. Recent video titles indicate only what was uploaded recently. ` +
      `Return the up-to-3 games most prominently covered (strings; prefer fewer if uncertain) and the channel's ` +
      `primary genre — exactly one of: ${GENRES.join(', ')}. ` +
      `Use "Other" only when none of the listed genres fit. ` +
      `Use "Variety" for general gaming channels not focused on one genre.`
    : `You analyse a YouTube gaming channel's recent videos and About page.\n` +
      `Return the up-to-3 games most prominently covered (strings; pick at most 3, ` +
      `prefer fewer if uncertain) and the channel's primary genre — ` +
      `exactly one of: ${GENRES.join(', ')}. ` +
      `Use "Other" only when none of the listed genres fit. ` +
      `Use "Variety" for general gaming channels not focused on one genre.`;

  const userContent = playlists.length > 0
    ? JSON.stringify({
        playlists_by_video_count: playlists.map(p => `${p.title}: ${p.videoCount}`).join(', '),
        recent_video_titles: videos.map(v => v.title),
        channel_about: description,
      })
    : JSON.stringify({
        recent_video_titles: videos.map(v => v.title),
        channel_about: description,
      });

  const completionPromise = client.chat.completions.parse({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'channel_extraction', strict: true, schema: SCHEMA },
    },
  });

  const completion = await Promise.race([
    completionPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('openai_timeout')), OPENAI_TIMEOUT_MS),
    ),
  ]);

  const parsed = completion.choices[0]?.message?.parsed as GameGenreResult | null;
  if (!parsed) throw new Error('No parsed result from gpt-4o-mini');

  return { games: parsed.games.slice(0, 3), genre: parsed.genre };
}
```

- [ ] **Step 2: Type-check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
```

Expected: no errors. The import of `PlaylistMeta` from `./fetch-channel-data` must resolve cleanly.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/outreach/extract-games.ts
git commit -m "feat(outreach): playlist-weighted prompt for top_games extraction"
```

---

## Task 3: Wire route handler + final type-check + smoke test

**Files:**
- Modify: `src/app/api/outreach/enrich/route.ts` (line 67)

- [ ] **Step 1: Update the extractGamesGenre call site**

In `src/app/api/outreach/enrich/route.ts`, find line 67 (the `extractGamesGenre` call) and change:

```typescript
        const extracted = await extractGamesGenre(data.videos, data.description)
          .catch(() => null);
```

to:

```typescript
        const extracted = await extractGamesGenre(data.videos, data.description, data.playlists)
          .catch(() => null);
```

No other changes to this file.

- [ ] **Step 2: Final type-check — all three files together**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
```

Expected: zero errors. This is the full integration check — all three modified files compile together.

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/outreach/enrich/route.ts
git commit -m "feat(outreach): pass playlists to extractGamesGenre in enrich route"
```

- [ ] **Step 4: Manual smoke test**

Start the dev server:
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm run dev
```

Go to `http://localhost:3000/dashboard/outreach`. Paste a real gaming channel URL with known playlists (e.g. `https://youtube.com/@Northernlion`). Click Submit.

Expected outcomes:
1. Spinner resolves — no 500 error
2. Summary panel shows `Enriched: 1 / Failed: 0`
3. In Supabase → `outreach_channels` → check `top_games` — should reflect heavy games (Super Auto Pets, Spelunky, etc.) rather than whatever was uploaded in the last 10 videos
4. `genre` is populated (e.g. "Roguelikes")

If OpenAI billing is unavailable: summary shows `Partial: 1` (unchanged behavior — partial-save path still works).

---

## Self-Review

**Spec coverage:**
- ✓ `PlaylistMeta` interface added to `fetch-channel-data.ts`
- ✓ `playlists` field added to `OutreachChannelData`
- ✓ `getPlaylists()` called, LockupView parsed, sorted + sliced to top 20
- ✓ `try/catch` wraps playlist fetch — non-fatal
- ✓ `has_playlists` guard
- ✓ `extractGamesGenre` third param `playlists: PlaylistMeta[] = []`
- ✓ System prompt updated to weight playlists
- ✓ User message includes `playlists_by_video_count` when present, omits it when empty
- ✓ Route handler passes `data.playlists`
- ✓ Fallback: empty playlists → identical behavior to before
- ✓ TypeScript compilation verified at each task

**Type consistency:** `PlaylistMeta` defined in `fetch-channel-data.ts`, imported in `extract-games.ts`. Same shape `{ title: string; videoCount: number }` used throughout.

**No placeholders:** All code is complete and exact.
