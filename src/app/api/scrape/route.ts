import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchChannelsByKeyword } from '@/lib/scraper/channels';
import { getChannelRecentVideos } from '@/lib/scraper/videos';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { upsertChannel, upsertVideo } from '@/lib/pipeline/upsert';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';

  if (!keyword) {
    return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
  }

  try {
    const channels = await searchChannelsByKeyword(keyword, 10);

    let channelsScraped = 0;
    let videosUpserted = 0;

    for (const channel of channels) {
      const channelId = await upsertChannel({ ...channel });
      channelsScraped++;

      const videos = await getChannelRecentVideos(channel.youtubeId, 30);

      for (const video of videos) {
        const score = calcOutlierScore(video.viewCount, channel.subscriberCount);
        if (score < 1) continue;

        await upsertVideo({ ...video, channelId, outlierScore: score });
        videosUpserted++;
      }
    }

    return NextResponse.json({ channelsScraped, videosUpserted });
  } catch (err: unknown) {
    console.error('[scrape]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
