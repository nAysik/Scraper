import { NextResponse, type NextRequest } from 'next/server';
import { getChannelRecentVideos } from '@/lib/scraper/videos';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { upsertVideo, upsertSnapshot, getStaleChannels, getNicheIdMap } from '@/lib/pipeline/upsert';
import { categorizeByKeywords } from '@/lib/pipeline/keyword-categorize';
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
    const [channels, nicheMap] = await Promise.all([
      getStaleChannels(50),
      getNicheIdMap(),
    ]);

    let updated = 0;

    for (const channel of channels) {
      const { subscriberCount, videos } = await getChannelRecentVideos(channel.youtubeId, 30);

      for (const video of videos) {
        const score = calcOutlierScore(video.viewCount, subscriberCount);
        const nicheName = categorizeByKeywords(video.title);
        const nicheId = nicheMap[nicheName];
        const videoDbId = await upsertVideo({ ...video, channelId: channel.id, outlierScore: score, nicheId });
        await upsertSnapshot(videoDbId, video.viewCount);
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
