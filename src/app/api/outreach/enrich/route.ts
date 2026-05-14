// src/app/api/outreach/enrich/route.ts
// POST /api/outreach/enrich  (Phase 2)
// Auth-gated bulk channel enrichment endpoint.
//
// Request:  { text: string }            # newline-separated URLs/handles/IDs, up to 15
// Response: { succeeded: number,
//             failed:    Array<{url: string, reason: string}>,
//             partial:   Array<{url: string, reason: string}> }
//
// CONTEXT.md decisions implemented:
//   D-01 textarea split   D-02 liberal accept   D-04 cap 15
//   D-05 submit-and-wait  D-11 partial save     D-12 no_videos
// Claude's Discretion: sequential for-await, one-retry-500ms (inside fetchChannelData),
// reason taxonomy { not_found | no_videos | llm_failed | unknown_error }.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeUrl } from '@/lib/outreach/canonicalize-url';
import { resolveChannel } from '@/lib/outreach/resolve-channel';
import { fetchChannelData, extractEmail } from '@/lib/outreach/fetch-channel-data';
import { medianViews } from '@/lib/outreach/median';
import { extractGamesGenre } from '@/lib/outreach/extract-games';
import { upsertOutreachChannel } from '@/lib/outreach/upsert-outreach';

export const maxDuration = 300;   // Vercel Pro default 300s, Hobby max 300s

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // [APPROVED OVERRIDE]: tolerate empty/malformed body — the validation below
  // returns a clear 400, mirroring the /api/scrape pattern.
  const body = await request.json().catch(() => ({}));
  const text: string = typeof body.text === 'string' ? body.text : '';
  const lines = text.split('\n').map((s: string) => s.trim()).filter(Boolean);
  const unique = Array.from(new Set(lines));

  if (unique.length === 0) {
    return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
  }
  if (unique.length > 15) {
    return NextResponse.json({ error: 'Maximum 15 channels per batch' }, { status: 400 });
  }

  const succeeded: Array<{ url: string }> = [];
  const failed:    Array<{ url: string; reason: string }> = [];
  const partial:   Array<{ url: string; reason: string }> = [];
  const enriched: Record<string, {
    topGames: string[] | null;
    genre: string | null;
    email: string | null;
    subscriberCount: number | null;
    medianViews: number | null;
  }> = {};

  try {
    for (const raw of unique) {
      try {
        const canonical = canonicalizeUrl(raw);
        if (!canonical) { failed.push({ url: raw, reason: 'not_found' }); continue; }

        const resolved = await resolveChannel(canonical);
        if (!resolved) { failed.push({ url: raw, reason: 'not_found' }); continue; }

        const data = await fetchChannelData(resolved.youtubeId);
        if (!data) { failed.push({ url: raw, reason: 'not_found' }); continue; }
        if (data.videos.length === 0) {
          failed.push({ url: raw, reason: 'no_videos' });
          continue;
        }

        const median = medianViews(data.videos.map(v => v.viewCount));
        const extracted = await extractGamesGenre(data.videos, data.description, data.playlists)
          .catch(() => null);

        const email = extractEmail(data.description);

        enriched[resolved.canonicalUrl] = {
          topGames:        extracted?.games ?? null,
          genre:           extracted?.genre ?? null,
          email,
          subscriberCount: data.subscriberCount,
          medianViews:     median,
        };

        await upsertOutreachChannel({
          youtubeId:       resolved.youtubeId,
          name:            data.name,
          url:             resolved.canonicalUrl,
          subscriberCount: data.subscriberCount,
          topGames:        extracted?.games ?? null,
          genre:           extracted?.genre ?? null,
          email,
          medianViews:     median,
          lastEnrichedAt:  new Date().toISOString(),
        });

        if (extracted) succeeded.push({ url: raw });
        else           partial.push({ url: raw, reason: 'llm_failed' });
      } catch (err) {
        console.error('[outreach/enrich]', raw, err);
        failed.push({ url: raw, reason: 'unknown_error' });
      }
    }

    return NextResponse.json({ succeeded: succeeded.length, failed, partial, enriched });
  } catch (err: unknown) {
    console.error('[outreach/enrich] outer', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
