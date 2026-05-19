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

export interface PlaylistMeta {
  title: string;
  videoCount: number;
}

export interface OutreachChannelData {
  name: string;
  subscriberCount: number;
  description: string;
  videos: VideoMeta[];
  playlists: PlaylistMeta[];
  websiteEmail: string | null;
  canRevealEmail: boolean;
}

// Email extraction (Phase 3 D-12).
// Regex pre-chosen in CONTEXT.md: covers business addresses like
// `business@studio.dev`, `team+inbox@label.co`. First match wins.
// Returns null when the description has no parseable email.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

// Social platforms to skip when walking primary_links (EML-02).
// Hostname is matched exactly (via new URL().hostname) — not substring — to prevent bypass.
const SOCIAL_SKIP = new Set([
  'youtube.com', 'www.youtube.com',
  'twitter.com', 'x.com',
  'instagram.com', 'www.instagram.com',
  'twitch.tv', 'www.twitch.tv',
  'tiktok.com', 'www.tiktok.com',
  'facebook.com', 'www.facebook.com',
]);

// YouTube wraps external links through /redirect?q=<url>. Unwrap before hostname check.
function unwrapYouTubeRedirect(raw: string): string {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://www.youtube.com${raw}`);
    if (
      (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
      u.pathname === '/redirect'
    ) {
      return decodeURIComponent(u.searchParams.get('q') ?? '') || raw;
    }
    return raw;
  } catch {
    return raw;
  }
}

// Fetch a single URL and extract an email address from the response HTML.
// Linktree pages: parse __NEXT_DATA__ JSON for mailto: links (client-rendered content
// is embedded server-side in the Next.js hydration blob).
// Generic fallback: EMAIL_RE on the full HTML body (matches plain text and mailto: hrefs).
// Returns null on timeout, network error, or no email found.
async function fetchEmailFromUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Linktree: structured mailto: links are in __NEXT_DATA__ JSON blob.
    // Use hostname check (not substring) to prevent spoofing.
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'linktr.ee' || parsedUrl.hostname.endsWith('.linktr.ee')) {
      const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nd) {
        try {
          const data = JSON.parse(nd[1]);
          const links: unknown[] = (data as any)?.props?.pageProps?.links ?? [];
          for (const link of links) {
            const linkUrl: string = (link as any)?.url ?? '';
            if (linkUrl.startsWith('mailto:')) {
              const email = linkUrl.slice('mailto:'.length).split('?')[0];
              if (EMAIL_RE.test(email)) return email;
            }
          }
        } catch {
          // JSON parse failed
        }
      }
      // Linktree: don't fall through to generic regex — structured path only
      return null;
    }

    // Generic: EMAIL_RE matches plain addresses and mailto: href attributes.
    const match = html.match(EMAIL_RE);
    return match ? match[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchChannelDataOnce(channelId: string): Promise<OutreachChannelData> {
  const client = await getClient();
  const channel = await client.getChannel(channelId);

  // Channel name: Channel.d.ts line 23 — metadata.title is always populated.
  const name: string = (channel.metadata as any)?.title ?? '';

  // About / description: getAbout() returns ChannelAboutFullMetadata | AboutChannel
  // (Channel.d.ts line 88-90; both shapes verified in d.ts files).
  // Defensive chain handles both shapes plus a final fallback to channel.metadata.description.
  // `about` is hoisted so the website-fetch block below can read primary_links.
  let description = '';
  let about: any = null;
  try {
    about = (await channel.getAbout()) as any;
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

  // Capture YouTube's hidden-email signal.
  // AboutChannelView shape: sign_in_for_business_email is nested under about.metadata.
  // Its presence means the channel has a hidden business email.
  // ChannelAboutFullMetadata fallback: youtubei.js inverts can_reveal_email, so invert back.
  const canRevealEmail: boolean =
    !!(about as any)?.metadata?.sign_in_for_business_email ||
    !((about as any)?.can_reveal_email ?? true);

  // Website email fallback — parallel fetch of all qualifying social links.
  // Collects every non-social-platform URL from primary_links, fires them all
  // simultaneously, takes the first that yields an email.
  // Linktree pages are handled via __NEXT_DATA__ JSON parsing inside fetchEmailFromUrl.
  // All failures are silent — this block never blocks enrichment.
  let websiteEmail: string | null = null;
  try {
    const primaryLinks: any[] = (about as any)?.primary_links ?? [];
    const qualifyingUrls: string[] = [];

    for (const link of primaryLinks) {
      const raw: string = (link as any)?.endpoint?.metadata?.url ?? '';
      if (!raw) continue;
      const target = unwrapYouTubeRedirect(raw);
      if (!target) continue;
      let parsed: URL;
      try { parsed = new URL(target); } catch { continue; }
      if (parsed.protocol !== 'https:') continue;
      if (SOCIAL_SKIP.has(parsed.hostname)) continue;
      qualifyingUrls.push(target);
    }

    if (qualifyingUrls.length > 0) {
      const results = await Promise.allSettled(
        qualifyingUrls.map(url => fetchEmailFromUrl(url)),
      );
      const found = results.find(
        (r): r is PromiseFulfilledResult<string> =>
          r.status === 'fulfilled' && !!r.value,
      );
      websiteEmail = found?.value ?? null;
    }
  } catch {
    // silent — website fetch failure never blocks enrichment
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

  // Playlists: primary signal for top_games extraction.
  // YouTube returns LockupView nodes (same new shape as videos tab).
  //   title:      item.metadata.title.text
  //   videoCount: overlay badge text, e.g. "68 videos" → 68
  // Wrapped in try/catch — failure is non-fatal; falls back to video-titles-only extraction.
  let playlists: PlaylistMeta[] = [];
  try {
    if (channel.has_playlists) {
      const playlistTab = await channel.getPlaylists();
      for (const item of (playlistTab as any).playlists ?? []) {
        const anyItem = item as any;
        // LockupView shape: metadata.title.text
        // GridPlaylist shape: title.toString()
        const title: string = anyItem.metadata?.title?.text
          ?? anyItem.title?.toString()
          ?? '';
        if (!title) continue;

        // LockupView shape: video count in thumbnail overlay badge ("68 videos")
        let videoCount = 0;
        const overlays: any[] = anyItem.content_image?.primary_thumbnail?.overlays ?? [];
        for (const o of overlays) {
          const badge: string = (o as any).badges?.[0]?.text ?? '';
          if (badge && /\d/.test(badge)) {
            videoCount = parseInt(badge.replace(/[^0-9]/g, ''), 10);
            break;
          }
        }
        // GridPlaylist shape fallback: video_count is a Text object
        if (videoCount === 0) {
          const countText: string = anyItem.video_count?.toString() ?? anyItem.video_count_short?.toString() ?? '';
          videoCount = parseInt(countText.replace(/[^0-9]/g, ''), 10) || 0;
        }
        if (videoCount > 0) playlists.push({ title, videoCount });
      }
      playlists.sort((a, b) => b.videoCount - a.videoCount);
      playlists = playlists.slice(0, 20);
    }
  } catch (err) {
    console.warn('[outreach/fetch] playlist fetch failed, skipping', err);
    playlists = [];
  }

  // Reuse existing helper (verified src/lib/scraper/shorts.ts line 64).
  const subscriberCount = await getChannelSubscriberCount(channelId);

  return { name, subscriberCount, description, videos, playlists, websiteEmail, canRevealEmail };
}

export function extractEmail(description: string): string | null {
  if (!description) return null;
  const match = description.match(EMAIL_RE);
  return match ? match[0] : null;
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
