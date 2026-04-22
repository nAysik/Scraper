import { NextResponse, type NextRequest } from 'next/server';
import { getChannelRecentVideos } from '@/lib/scraper/videos';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { upsertVideo, getStaleChannels } from '@/lib/pipeline/upsert';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');

  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const sb = getServiceClient();
    const channels = await getStaleChannels(50);

    let updated = 0;

    for (const channel of channels) {
      const { subscriberCount, videos } = await getChannelRecentVideos(channel.youtubeId, 30);

      for (const video of videos) {
        const score = calcOutlierScore(video.viewCount, subscriberCount);
        await upsertVideo({ ...video, channelId: channel.id, outlierScore: score });
        updated++;
      }

      await sb
        .from('channels')
        .update({ last_scraped: new Date().toISOString() })
        .eq('id', channel.id);
    }

    return NextResponse.json({ updated });
  } catch (err: unknown) {
    console.error('[cron/scrape]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron failed' },
      { status: 500 }
    );
  }
}
