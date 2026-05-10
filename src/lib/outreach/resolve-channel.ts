// src/lib/outreach/resolve-channel.ts
// Bridge from canonical URL / handle / UC ID → UC channel ID via youtubei.js.
//
// Why two steps (RESEARCH §3 + Pitfall 1):
//   - youtubei.js getChannel(id) accepts only UC-prefixed IDs (verified Innertube.d.ts line 38).
//     Passing a handle throws "Failed to fetch channel".
//   - resolveURL(fullUrl) hits YouTube's official /navigation/resolve_url endpoint, which
//     handles legacy /c/, /user/, vanity URLs, redirects, and renames.
//
// Returns null on any resolution failure — caller (route handler in Plan 03) categorises
// these as `failed[]` with reason 'not_found'.

import { getClient } from '@/lib/scraper/innertube';

const UC_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

export interface ResolvedChannel {
  youtubeId: string;
  canonicalUrl: string;
}

export async function resolveChannel(canonicalUrlOrId: string): Promise<ResolvedChannel | null> {
  const client = await getClient();

  // Fast path: bare UC channel ID
  if (UC_ID_RE.test(canonicalUrlOrId)) {
    return {
      youtubeId: canonicalUrlOrId,
      canonicalUrl: `https://youtube.com/channel/${canonicalUrlOrId}`,
    };
  }

  let endpoint;
  try {
    endpoint = await client.resolveURL(canonicalUrlOrId);
  } catch {
    return null;
  }

  // RESEARCH §3 line 485-486: payload.browseId is the UC channel ID on success.
  // The d.ts declares payload: any (NavigationEndpoint.d.ts) — defensive optional chain.
  const browseId: string | undefined = (endpoint as any)?.payload?.browseId;
  if (!browseId || !UC_ID_RE.test(browseId)) return null;

  // RESEARCH §3 line 488-491 + [ASSUMED] line 500: payload.canonicalBaseUrl carries
  // the /@handle form when present. Falls back to /channel/UC... if absent or wrong shape.
  const handle: string | undefined = (endpoint as any)?.payload?.canonicalBaseUrl;
  const canonicalUrl = handle && handle.startsWith('/@')
    ? `https://youtube.com${handle}`
    : `https://youtube.com/channel/${browseId}`;

  return { youtubeId: browseId, canonicalUrl };
}
