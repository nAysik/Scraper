// src/app/api/outreach/score-all/route.ts
// POST — auth-gated. Scores all YouTube channels in outreach_channels using gpt-4o-mini.
// Processes in batches of 20; returns { scored, failed } when all batches complete.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { scoreBatch, type ChannelToScore } from '@/lib/outreach/score-channels';

export const maxDuration = 300;

const BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const gameName:    string = typeof body.gameName    === 'string' ? body.gameName.trim()    : '';
  const comparables: string = typeof body.comparables === 'string' ? body.comparables.trim() : '';

  if (!gameName)    return NextResponse.json({ error: 'gameName is required' },    { status: 400 });
  if (!comparables) return NextResponse.json({ error: 'comparables is required' }, { status: 400 });

  const sb = createServiceClient();

  // Fetch all YouTube channels (skip Twitch — no top_games/genre)
  const { data: channels, error: fetchErr } = await sb
    .from('outreach_channels')
    .select('youtube_id, name, genre, top_games, platform')
    .or('platform.eq.youtube,platform.is.null');

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!channels || channels.length === 0) return NextResponse.json({ scored: 0, failed: 0 });

  const toScore: ChannelToScore[] = (channels as Array<{
    youtube_id: string; name: string; genre: string | null;
    top_games: string[] | null; platform: string | null;
  }>).map(c => ({
    youtubeId: c.youtube_id,
    name:      c.name,
    genre:     c.genre,
    topGames:  c.top_games,
  }));

  let scored = 0;
  let failed = 0;

  for (let i = 0; i < toScore.length; i += BATCH_SIZE) {
    const batch = toScore.slice(i, i + BATCH_SIZE);
    try {
      const results = await scoreBatch(batch, gameName, comparables);
      for (const r of results) {
        const { error: updateErr } = await sb
          .from('outreach_channels')
          .update({ priority_score: r.score, priority_reason: r.reason })
          .eq('youtube_id', r.youtubeId);
        if (updateErr) {
          console.error('[score-all] update failed for', r.youtubeId, updateErr);
          failed++;
        } else {
          scored++;
        }
      }
    } catch (err) {
      console.error('[score-all] batch failed at offset', i, err);
      failed += batch.length;
    }
  }

  return NextResponse.json({ scored, failed });
}
