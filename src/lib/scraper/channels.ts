import { getClient } from './innertube';

export interface ChannelMeta {
  youtubeId: string;
  name: string;
  subscriberCount: number;
}

function parseSubscriberCount(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, '').toUpperCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.endsWith('B')) return Math.round(num * 1_000_000_000);
  if (cleaned.endsWith('M')) return Math.round(num * 1_000_000);
  if (cleaned.endsWith('K')) return Math.round(num * 1_000);
  return Math.round(num);
}

export async function searchChannelsByKeyword(keyword: string, limit = 10): Promise<ChannelMeta[]> {
  const client = await getClient();
  const results = await client.search(keyword, { type: 'channel' });

  const channels: ChannelMeta[] = [];

  for (const item of results.results) {
    if (channels.length >= limit) break;
    if (item.type !== 'Channel') continue;

    const ch = item as any;
    const id: string = ch.id ?? ch.channel_id ?? '';
    const name: string = ch.author?.name ?? ch.long_byline?.toString() ?? '';
    const subText: string = ch.subscriber_count?.text ?? ch.subscriber_count?.toString() ?? '0';

    if (!id) continue;

    channels.push({
      youtubeId: id,
      name,
      subscriberCount: parseSubscriberCount(subText),
    });
  }

  return channels;
}
