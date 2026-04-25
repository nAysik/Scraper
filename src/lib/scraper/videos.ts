import { getClient } from './innertube';

export interface VideoMeta {
  youtubeId: string;
  title: string;
  viewCount: number;
  publishedAt: Date;
}

export interface ChannelVideosResult {
  subscriberCount: number;
  videos: VideoMeta[];
}

export function parseViewCount(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, '').toUpperCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.endsWith('B')) return Math.round(num * 1_000_000_000);
  if (cleaned.endsWith('M')) return Math.round(num * 1_000_000);
  if (cleaned.endsWith('K')) return Math.round(num * 1_000);
  return Math.round(num);
}

export function parseRelativeDate(text: string): Date {
  const now = new Date();
  const lower = text.toLowerCase();

  const match = lower.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return now;

  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms = {
    second: 1000,
    minute: 60 * 1000,
    hour:   60 * 60 * 1000,
    day:    24 * 60 * 60 * 1000,
    week:   7 * 24 * 60 * 60 * 1000,
    month:  30 * 24 * 60 * 60 * 1000,
    year:   365 * 24 * 60 * 60 * 1000,
  }[unit] ?? 0;

  return new Date(now.getTime() - n * ms);
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function parseSubscriberCount(text: string): number {
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

export async function getChannelRecentVideos(channelId: string, limit = 30): Promise<ChannelVideosResult> {
  const client = await getClient();
  const channel = await client.getChannel(channelId);

  // Read subscriber count from the channel page header (reliable source)
  const header = channel.header as any;

  // PageHeader stores subscriber count inside content.metadata.metadata_rows[*].metadata_parts[*].text
  // C4TabbedHeader stores it directly in header.subscribers
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

  const subscriberCount = parseSubscriberCount(subText);

  const videoTab = await channel.getVideos();

  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const videos: VideoMeta[] = [];

  for (const item of videoTab.videos) {
    if (videos.length >= limit) break;

    const v = item as any;
    const id: string = v.video_id ?? v.id ?? '';
    const title: string = v.title?.toString() ?? '';
    const viewText: string = v.view_count?.text ?? v.short_view_count?.text ?? '0';
    const publishedText: string = v.published?.text ?? v.published?.toString() ?? '';

    if (!id || !title) continue;

    const publishedAt = parseRelativeDate(publishedText);
    if (publishedAt < cutoff) continue;

    videos.push({
      youtubeId: id,
      title,
      viewCount: parseViewCount(viewText),
      publishedAt,
    });
  }

  return { subscriberCount, videos };
}
