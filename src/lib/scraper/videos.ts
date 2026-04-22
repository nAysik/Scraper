import { getClient } from './innertube';

export interface VideoMeta {
  youtubeId: string;
  title: string;
  viewCount: number;
  publishedAt: Date;
}

function parseViewCount(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, '').toUpperCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.endsWith('B')) return Math.round(num * 1_000_000_000);
  if (cleaned.endsWith('M')) return Math.round(num * 1_000_000);
  if (cleaned.endsWith('K')) return Math.round(num * 1_000);
  return Math.round(num);
}

function parseRelativeDate(text: string): Date {
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

export async function getChannelRecentVideos(channelId: string, limit = 30): Promise<VideoMeta[]> {
  const client = await getClient();
  const channel = await client.getChannel(channelId);
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

  return videos;
}
