// src/lib/scraper/search-videos.ts
// Paginated InnerTube video search for outreach channel discovery (Phase 3 D-01/D-02/D-03).
//
// Design notes:
//   - We use `type: 'video'` (NOT 'channel') because video search surfaces micro-influencers
//     whose CHANNEL doesn't rank for the keyword but whose VIDEO does. This is the entire
//     point of D-01 (see RESEARCH §Alternatives Considered).
//   - The "upload-date variant" uses the `upload_date: 'week'` FILTER, not a `sort_by` field —
//     `sort_by` does not exist on SearchFilters (RESEARCH Pitfall 3, verified from
//     node_modules/youtubei.js/dist/src/types/Misc.d.ts).
//   - subscriber_count is NOT a field on Video search result nodes (RESEARCH Pitfall 1).
//     `subscriberCount` is always null on the returned DiscoveredChannel. Real counts arrive
//     later during save-time enrichment via getChannelSubscriberCount().

import { getClient } from './innertube';
import { canonicalizeUrl } from '@/lib/outreach/canonicalize-url';

export interface DiscoveredChannel {
  channelId: string;
  name: string;
  url: string;
  subscriberCount: number | null;   // always null from search; populated on save
  alreadySaved: boolean;            // set by the route handler, not here
}

type UploadDate = 'all' | 'today' | 'week' | 'month' | 'year';

export async function searchVideosByKeyword(
  keyword: string,
  filters: { upload_date?: UploadDate } = {},
  pages = 5,
): Promise<Map<string, DiscoveredChannel>> {
  const client = await getClient();
  const seen = new Map<string, DiscoveredChannel>();

  let results;
  try {
    results = await client.search(keyword, { type: 'video', ...filters });
  } catch (err) {
    console.error(`[search-videos] initial search failed for "${keyword}"`, err);
    return seen;
  }

  for (let page = 0; page < pages; page++) {
    for (const item of (results as any).results ?? []) {
      if ((item as any).type !== 'Video') continue;
      const v = item as any;

      const channelId: string = v.author?.id ?? '';
      if (!channelId || channelId === 'N/A') continue;          // Pitfall 2
      if (seen.has(channelId)) continue;

      const name: string = v.author?.name ?? '';
      const rawUrl: string = v.author?.url ?? '';
      const url = canonicalizeUrl(rawUrl) ?? rawUrl;            // Pitfall 5

      // Skip rows where we have neither a name nor a usable URL — these
      // would fail at the resolveChannel() step in the enrich pipeline.
      if (!name && !url) continue;

      seen.set(channelId, {
        channelId,
        name,
        url,
        subscriberCount: null,
        alreadySaved: false,
      });
    }

    // Guard: getContinuation() throws when no more pages exist (Pitfall 4).
    if (!(results as any).has_continuation || page === pages - 1) break;

    try {
      results = await (results as any).getContinuation();
    } catch (err) {
      console.warn(`[search-videos] continuation failed at page ${page + 1}`, err);
      break;
    }
  }

  return seen;
}
