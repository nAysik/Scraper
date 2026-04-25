import { getClient } from './innertube';
import { parseViewCount, parseRelativeDate, parseSubscriberCount } from './videos';

export interface ShortMeta {
  youtubeId: string;
  title: string;
  viewCount: number;
  publishedAt: Date;
  channelYoutubeId: string;
  channelName: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function scrapeViralShorts(
  keywords: string[],
  minViews = 1_000_000,
): Promise<ShortMeta[]> {
  const client = await getClient();
  // Map keyed by youtubeId — silently drops duplicates across keywords
  const seen = new Map<string, ShortMeta>();
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

  for (const keyword of keywords) {
    let results;
    try {
      results = await client.search(keyword, { type: 'shorts', upload_date: 'week' });
    } catch (err) {
      console.error(`[shorts] search failed for "${keyword}"`, err);
      continue;
    }

    for (const item of results.results ?? []) {
      const v = item as any;
      const youtubeId: string = v.video_id ?? v.id ?? '';
      const channelYoutubeId: string = v.author?.id ?? v.channel_id ?? '';
      if (!youtubeId || !channelYoutubeId || seen.has(youtubeId)) continue;

      const viewText: string =
        v.view_count?.text ?? v.short_view_count?.text ?? v.short_view_count?.toString() ?? '0';
      const viewCount = parseViewCount(viewText);
      if (viewCount < minViews) continue;

      const publishedAt = parseRelativeDate(
        v.published?.text ?? v.published?.toString() ?? '',
      );
      // Guard against upload_date:'week' returning slightly stale results
      if (publishedAt < cutoff) continue;

      seen.set(youtubeId, {
        youtubeId,
        title: v.title?.toString() ?? '',
        viewCount,
        publishedAt,
        channelYoutubeId,
        channelName: v.author?.name ?? '',
      });
    }
  }

  return Array.from(seen.values());
}

export async function getChannelSubscriberCount(channelYoutubeId: string): Promise<number> {
  const client = await getClient();
  const channel = await client.getChannel(channelYoutubeId);
  const header = channel.header as any;

  let subText = '0';
  if (header?.subscribers) {
    subText = header.subscribers.toString();
  } else if (header?.content?.metadata?.metadata_rows) {
    for (const row of header.content.metadata.metadata_rows) {
      for (const part of row.metadata_parts ?? []) {
        const t: string = part.text?.toString() ?? '';
        if (t.toLowerCase().includes('subscriber')) {
          subText = t;
          break;
        }
      }
      if (subText !== '0') break;
    }
  }

  return parseSubscriberCount(subText);
}
