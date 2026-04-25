import { NextResponse, type NextRequest } from 'next/server';
import { scrapeViralShorts, getChannelSubscriberCount } from '@/lib/scraper/shorts';
import { calcOutlierScore } from '@/lib/pipeline/outlier';
import { upsertChannel, upsertVideo, getNicheIdMap } from '@/lib/pipeline/upsert';
import { categorizeByKeywords } from '@/lib/pipeline/keyword-categorize';

const SHORTS_KEYWORDS = [
  // Broad & Evergreen
  'shorts', 'youtube shorts', 'in 60 seconds', 'under 1 minute', 'viral', 'trending', 'fyp',
  'how to', 'satisfying', 'pov', 'transformation', 'before and after', 'asmr',

  // Entertainment & Humor
  'pranks', 'street interview', 'challenge', 'oddly satisfying', 'mrbeast challenge',
  'brain rot', 'funny moments', 'standup comedy clips', 'fail compilation',
  'tiktok trends', 'dance challenge', 'magic trick', 'plot twist', 'celebrity moments',
  'satisfying videos', 'sports highlights', 'nba shorts', 'soccer goals',

  // Gaming
  'gta 5 funny moments', 'gta 5 stunts', 'minecraft shorts', 'minecraft hacks',
  'roblox edits', 'roblox gameplay', 'fortnite clips', 'fortnite highlights',
  'gaming setup', 'streamer clips', 'vtuber clips', 'gaming highlights',
  'speedrun', 'gaming rage', 'mobile gaming', 'retro gaming',

  // Food & Cooking
  'quick recipes', '30 second recipe', 'food hacks', 'easy meals', 'cooking tips',
  'lunchbox ideas', 'mukbang shorts', 'spicy food challenge', 'chocolate hacks',
  'gordon ramsay clips', 'street food', 'meal prep', 'baking hacks', 'food asmr',

  // Productivity, Education & Hacks
  'life hacks', 'cleaning hacks', 'organization tips', 'study tips', 'productivity hacks',
  'fun facts', 'history facts', 'geography facts', 'animal facts', 'space facts', 'finance tips',
  'productivity', 'did you know', 'science facts', 'math tricks', 'book summary',
  'language learning', 'self improvement',

  // Tech, AI & E-commerce
  'tech review', 'unboxing', 'gadget review', 'amazon finds', 'tiktok made me buy it',
  'tech deals', 'desk setup', 'smartphone hacks', 'hidden features', 'dropshipping products',
  'ai tools', 'chatgpt', 'artificial intelligence', 'midjourney', 'coding shorts',

  // Finance & Business
  'finance', 'investing', 'stock market', 'crypto', 'passive income',
  'side hustle', 'money hacks', 'entrepreneur tips', 'budget tips',

  // Lifestyle, Health & Beauty
  'mini vlog', 'day in the life', 'morning routine', 'skincare hacks', '5 minute makeup',
  'fashion finds', 'try on haul', 'fitness tips', 'quick workout', 'gym hacks',
  'travel goals', 'hidden gems travel', 'workout', 'weight loss', 'abs workout',
  'hiit workout', 'yoga shorts', 'glow up', 'thrift flip', 'apartment tour',

  // Motivation & Mindset
  'motivational shorts', 'mindset', 'success tips',

  // Family, Animals & Crafts
  'diy crafts', 'upcycling', 'room transformation', 'parenting hacks', 'gender reveal',
  'wedding moments', 'fatherhood', 'pet tricks', 'cute animals',
  'dog tricks', 'wildlife', 'baby animals',
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
