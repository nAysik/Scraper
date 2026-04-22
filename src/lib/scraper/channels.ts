import { getClient } from './innertube';

export interface ChannelMeta {
  youtubeId: string;
  name: string;
  subscriberCount: number;
}

function parseSubscriberCount(text: string): number {
  const match = text.match(/([\d.]+)\s*([KMB])/i);
  if (!match) {
    const n = parseFloat(text.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : Math.round(n);
  }
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'K') return Math.round(num * 1_000);
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
    const subRaw = ch.subscriber_count;
    const subText: string = subRaw?.toString() ?? subRaw?.text ?? subRaw?.runs?.[0]?.text ?? '0';

    if (!id) continue;

    channels.push({
      youtubeId: id,
      name,
      subscriberCount: parseSubscriberCount(subText),
    });
  }

  return channels;
}
