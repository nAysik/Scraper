import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchChannelsByKeyword } from '@/lib/scraper/channels';
import { getChannelRecentVideos } from '@/lib/scraper/videos';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { categorizeInBatches } from '@/lib/pipeline/categorize';
import { upsertChannel, upsertVideo, getNicheIdMap } from '@/lib/pipeline/upsert';

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
    const nicheMap = await getNicheIdMap();
    const channels = await searchChannelsByKeyword(keyword, 10);

    let channelsScraped = 0;
    let videosUpserted = 0;

    const allVideoTitles: { videoId: string; title: string }[] = [];
    const videoBuffer: Array<{
      youtubeId: string; title: string; viewCount: number;
      publishedAt: Date; channelId: string; outlierScore: number;
    }> = [];

    for (const channel of channels) {
      const channelId = await upsertChannel({ ...channel });
      channelsScraped++;

      const videos = await getChannelRecentVideos(channel.youtubeId, 30);

      for (const video of videos) {
        const score = calcOutlierScore(video.viewCount, channel.subscriberCount);
        if (score < 1) continue;

        allVideoTitles.push({ videoId: video.youtubeId, title: video.title });
        videoBuffer.push({ ...video, channelId, outlierScore: score });
      }
    }

    const categorized = await categorizeInBatches(allVideoTitles, 20);
    const nicheByVideoId = Object.fromEntries(categorized.map(c => [c.videoId, c.niche]));

    for (const video of videoBuffer) {
      const nicheName = nicheByVideoId[video.youtubeId];
      const nicheId = nicheName ? nicheMap[nicheName] : undefined;
      await upsertVideo({ ...video, nicheId });
      videosUpserted++;
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
