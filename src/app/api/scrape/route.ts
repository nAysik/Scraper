import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchChannelsByKeyword } from '@/lib/scraper/channels';
import { getChannelRecentVideos } from '@/lib/scraper/videos';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { upsertChannel, upsertVideo, getNicheIdMap } from '@/lib/pipeline/upsert';
import { categorizeByKeywords } from '@/lib/pipeline/keyword-categorize';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // [APPROVED OVERRIDE]: tolerate empty/malformed body — the !keyword check
  // below returns 400 with a clear message, which is the desired UX.
  const body = await request.json().catch(() => ({}));
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';

  if (!keyword) {
    return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
  }

  try {
    const [channels, nicheMap] = await Promise.all([
      searchChannelsByKeyword(keyword, 10),
      getNicheIdMap(),
    ]);

    let channelsScraped = 0;
    let videosUpserted = 0;

    for (const channel of channels) {
      const { subscriberCount, videos } = await getChannelRecentVideos(channel.youtubeId, 30);
      const channelId = await upsertChannel({ ...channel, subscriberCount });
      channelsScraped++;
      for (const video of videos) {
        const score = calcOutlierScore(video.viewCount, subscriberCount);
        const nicheName = categorizeByKeywords(video.title);
        const nicheId = nicheMap[nicheName];
        await upsertVideo({ ...video, channelId, outlierScore: score, nicheId });
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
