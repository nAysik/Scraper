// POST /api/outreach/discover-twitch { game: string }
// Auth-gated. Searches live Twitch streamers for a game, sets alreadySaved flag on results.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { searchTwitchStreamers, searchTwitchVods } from '@/lib/twitch/search';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse and validate body
  let game: string;
  let mode: 'live' | 'vods';
  try {
    const body = await request.json() as { game?: unknown; mode?: unknown };
    if (typeof body.game !== 'string' || !body.game.trim()) {
      return NextResponse.json({ error: 'game is required' }, { status: 400 });
    }
    game = body.game.trim().slice(0, 200);
    mode = body.mode === 'vods' ? 'vods' : 'live';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Search Twitch
  let channels;
  try {
    channels = mode === 'vods'
      ? await searchTwitchVods(game)
      : await searchTwitchStreamers(game);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Twitch search failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Mark already-saved channels (match by login + platform='twitch')
  if (channels.length > 0) {
    const logins = channels.map(c => c.login);
    const sb = createServiceClient();
    const { data: saved } = await sb
      .from('outreach_channels')
      .select('youtube_id')
      .in('youtube_id', logins)
      .eq('platform', 'twitch');
    const savedSet = new Set((saved ?? []).map((r: { youtube_id: string }) => r.youtube_id));
    channels = channels.map(c => ({ ...c, alreadySaved: savedSet.has(c.login) }));
  }

  return NextResponse.json({ channels });
}
