import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('outreach_channels')
    .select('youtube_id, name, url, subscriber_count, top_games, genre, median_views, last_enriched_at, last_video_at, email, platform, priority_score, priority_reason, has_hidden_email')
    .order('last_enriched_at', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const channels = (data ?? []).map((c: Record<string, unknown>) => ({
    youtubeId:       c.youtube_id,
    name:            c.name,
    url:             c.url,
    subscriberCount: c.subscriber_count,
    topGames:        c.top_games,
    genre:           c.genre,
    medianViews:     c.median_views,
    lastEnrichedAt:  c.last_enriched_at,
    lastVideoAt:     c.last_video_at ?? null,
    email:           c.email,
    platform:        c.platform ?? 'youtube',
    priorityScore:   c.priority_score  ?? null,
    priorityReason:  c.priority_reason  ?? null,
    hasHiddenEmail:  c.has_hidden_email  ?? null,
  }));

  return NextResponse.json({ channels });
}
