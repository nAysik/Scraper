// src/lib/outreach/fetch-channel-data.ts
// InnerTube channel fetch for outreach enrichment.
//
// Why this is NOT getChannelRecentVideos(): that function applies a NINETY_DAYS_MS cutoff
// (src/lib/scraper/videos.ts line 47, 92, 107). Outreach must enrich a channel whose
// last upload was 6 months ago — the user's outreach target is small/quiet indie channels.
// We inline a thin variant here that grabs literally the 10 most recent videos with no
// date filter (CONTEXT.md D-12).
//
// Retry semantics (CONTEXT.md "Claude's Discretion"):
//   - One retry with 500ms backoff on the InnerTube fetch (resolveURL succeeded, but
//     getChannel/getAbout/getVideos blipped).
//   - Second failure → return null. Route handler categorises as `failed[]` with reason 'not_found'.

import { getClient } from '@/lib/scraper/innertube';
import { parseViewCount, parseRelativeDate, type VideoMeta } from '@/lib/scraper/videos';
import { getChannelSubscriberCount } from '@/lib/scraper/shorts';

export interface OutreachChannelData {
  name: string;
  subscriberCount: number;
  description: string;
  videos: VideoMeta[];
}

async function fetchChannelDataOnce(channelId: string): Promise<OutreachChannelData> {
  const client = await getClient();
  const channel = await client.getChannel(channelId);

  // Channel name: Channel.d.ts line 23 — metadata.title is always populated.
  const name: string = (channel.metadata as any)?.title ?? '';

  // About / description: getAbout() returns ChannelAboutFullMetadata | AboutChannel
  // (Channel.d.ts line 88-90; both shapes verified in d.ts files).
  // Defensive chain handles both shapes plus a final fallback to channel.metadata.description.
  let description = '';
  try {
    const about = (await channel.getAbout()) as any;
    description =
      about?.description?.toString?.() ??
      about?.metadata?.description ??
      '';
  } catch {
    description = '';
  }
  if (!description) {
    description = (channel.metadata as any)?.description ?? '';
  }

  // Last 10 videos with NO date cutoff (CONTEXT.md D-12, RESEARCH Pitfall 4).
  // youtubei.js node types are unreliable — cast to any per project convention.
  const videoTab = await channel.getVideos();
  const videos: VideoMeta[] = [];
  for (const item of videoTab.videos) {
    if (videos.length >= 10) break;
    const v = item as any;
    const id: string = v.video_id ?? v.id ?? '';
    const title: string = v.title?.toString() ?? '';
    if (!id || !title) continue;

    const viewText: string = v.view_count?.text ?? v.short_view_count?.text ?? '0';
    const publishedText: string = v.published?.text ?? v.published?.toString() ?? '';

    videos.push({
      youtubeId: id,
      title,
      viewCount: parseViewCount(viewText),
      publishedAt: parseRelativeDate(publishedText),
    });
  }

  // Reuse existing helper (verified src/lib/scraper/shorts.ts line 64).
  const subscriberCount = await getChannelSubscriberCount(channelId);

  return { name, subscriberCount, description, videos };
}

export async function fetchChannelData(channelId: string): Promise<OutreachChannelData | null> {
  try {
    return await fetchChannelDataOnce(channelId);
  } catch (err) {
    console.error('[outreach/fetch] retry after 500ms', err);
    await new Promise(r => setTimeout(r, 500));
    try {
      return await fetchChannelDataOnce(channelId);
    } catch (err2) {
      console.error('[outreach/fetch] failed after retry', err2);
      return null;
    }
  }
}
