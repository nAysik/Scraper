// POST /api/outreach/save-twitch { channels: TwitchChannel[] }
// Auth-gated. Upserts selected Twitch channels into outreach_channels with platform='twitch'.
// Max 15 channels per request (same cap as YouTube discovery save).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { upsertOutreachChannel } from '@/lib/outreach/upsert-outreach';
import type { TwitchChannel } from '@/lib/twitch/search';

const MAX_SAVE = 15;

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse body
  let channels: TwitchChannel[];
  try {
    const body = await request.json() as { channels?: unknown };
    if (!Array.isArray(body.channels)) {
      return NextResponse.json({ error: 'channels must be an array' }, { status: 400 });
    }
    channels = body.channels as TwitchChannel[];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (channels.length > MAX_SAVE) {
    return NextResponse.json({ error: `Maximum ${MAX_SAVE} channels per save` }, { status: 400 });
  }

  // Upsert each channel with platform='twitch'
  let saved = 0;
  let failed = 0;
  for (const ch of channels) {
    try {
      await upsertOutreachChannel({
        youtubeId:       ch.login,          // Twitch login used as the identifier
        name:            ch.displayName,
        url:             ch.url,
        subscriberCount: null,              // follower count not fetched — viewer count is in the UI
        topGames:        null,
        genre:           null,
        email:           ch.email,
        medianViews:     null,
        lastEnrichedAt:  new Date().toISOString(),
        platform:        'twitch',
      });
      saved++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ saved, failed });
}
