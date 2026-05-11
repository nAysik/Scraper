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
  //
  // YouTube returns two shapes (both observed Nov 2025):
  //   OLD: videoTab.videos is an array of Video nodes with .video_id/.title/.view_count/.published
  //   NEW: videoTab.current_tab.content.contents[i].content is a LockupView with .content_id
  //        + .metadata.title.text + .metadata.metadata.metadata_rows[0].metadata_parts[0|1].text.text
  // youtubei.js's .videos getter only recognises the OLD shape, returning [] for NEW-shape
  // channels (e.g. Northernlion's UC3tNpTOHsTnkmbwztCs30sA). Parse both.
  const videoTab = await channel.getVideos();
  const videos: VideoMeta[] = [];

  // Try OLD shape first (cheap, no-ops on empty array)
  for (const item of (videoTab as any).videos ?? []) {
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

  // Fallback to NEW shape (LockupView in current_tab.content.contents)
  if (videos.length === 0) {
    const contents = (videoTab as any).current_tab?.content?.contents ?? [];
    for (const item of contents) {
      if (videos.length >= 10) break;
      const lockup = (item as any)?.content;
      if (!lockup || lockup.type !== 'LockupView' || lockup.content_type !== 'VIDEO') continue;
      const id: string = lockup.content_id ?? '';
      const title: string = lockup.metadata?.title?.text ?? '';
      if (!id || !title) continue;
      const parts = lockup.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts ?? [];
      const viewText: string = parts[0]?.text?.text ?? '0';
      const publishedText: string = parts[1]?.text?.text ?? '';
      videos.push({
        youtubeId: id,
        title,
        viewCount: parseViewCount(viewText),
        publishedAt: parseRelativeDate(publishedText),
      });
    }
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
