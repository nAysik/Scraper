import { NextResponse, type NextRequest } from 'next/server';
import { scrapeViralShorts, getChannelSubscriberCount } from '@/lib/scraper/shorts';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { upsertChannel, upsertVideo, getNicheIdMap } from '@/lib/pipeline/upsert';
import { categorizeByKeywords } from '@/lib/pipeline/keyword-categorize';

// One representative keyword per niche — keep in sync with keyword-categorize.ts
const SHORTS_KEYWORDS = [
  'finance',            // Faceless Finance
  'tech review',        // Tech Reviews
  'ai tools',           // AI Tools
  'productivity',       // Productivity
  'workout',            // Health & Fitness
  'gaming highlights',  // Gaming Clips
  'how to',             // Education
] as const;

export async function GET(request: NextRequest) {
  const token = (request.headers.get('authorization') ?? '').replace('Bearer ', '');
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [shorts, nicheMap] = await Promise.all([
      scrapeViralShorts(Array.from(SHORTS_KEYWORDS)),
      getNicheIdMap(),
    ]);

    // Fetch subscriber counts once per unique channel, not once per Short
    const uniqueChannelIds = [...new Set(shorts.map(s => s.channelYoutubeId))];
    const subCountMap = new Map<string, number>();
    for (const channelId of uniqueChannelIds) {
      try {
        subCountMap.set(channelId, await getChannelSubscriberCount(channelId));
      } catch {
        // 0 subs → outlierScore 0, Short sinks to bottom of table rather than crashing the run
        subCountMap.set(channelId, 0);
      }
    }

    // Upsert channels before videos (FK dependency)
    const channelDbIdMap = new Map<string, string>();
    for (const channelId of uniqueChannelIds) {
      const short = shorts.find(s => s.channelYoutubeId === channelId)!;
      const nicheId = nicheMap[categorizeByKeywords(short.channelName)];
      const dbId = await upsertChannel({
        youtubeId:       channelId,
        name:            short.channelName,
        subscriberCount: subCountMap.get(channelId) ?? 0,
        nicheId,
      });
      channelDbIdMap.set(channelId, dbId);
    }

    let upserted = 0;
    for (const short of shorts) {
      const channelId = channelDbIdMap.get(short.channelYoutubeId);
      if (!channelId) continue;
      await upsertVideo({
        youtubeId:    short.youtubeId,
        title:        short.title,
        viewCount:    short.viewCount,
        publishedAt:  short.publishedAt,
        channelId,
        outlierScore: calcOutlierScore(short.viewCount, subCountMap.get(short.channelYoutubeId) ?? 0),
        nicheId:      nicheMap[categorizeByKeywords(short.title)],
        isShort:      true,
      });
      upserted++;
    }

    return NextResponse.json({
      found:          shorts.length,
      uniqueChannels: uniqueChannelIds.length,
      upserted,
    });
  } catch (err: unknown) {
    console.error('[cron/shorts]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cron failed' },
      { status: 500 },
    );
  }
}
