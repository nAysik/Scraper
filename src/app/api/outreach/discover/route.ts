// src/app/api/outreach/discover/route.ts
// POST /api/outreach/discover  (Phase 3)
// Auth-gated keyword-driven channel discovery.
//
// Request:  { keyword: string }
// Response: { channels: DiscoveredChannel[] }
//
// CONTEXT.md decisions implemented:
//   D-01 dual search   D-02 5 pages × 2   D-03 dedup by author.id
//   D-10 already-saved badge   D-13 alreadySaved flag in response
// Claude's Discretion:
//   - Promise.all across the two sort variants; sequential continuation within each
//   - First-wins merge (relevance variant takes precedence)
//   - Single Supabase .in('youtube_id', ids) query for already-saved check

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { searchVideosByKeyword, type DiscoveredChannel } from '@/lib/scraper/search-videos';

export const maxDuration = 300;   // matches /api/outreach/enrich; dual search of 5+5 pages is well under this

const MAX_KEYWORD_LEN = 200;       // RESEARCH §Security Domain: oversize-keyword DoS guard

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawKeyword: string = typeof body?.keyword === 'string' ? body.keyword : '';
  const keyword = rawKeyword.trim();

  if (!keyword) {
    return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
  }
  if (keyword.length > MAX_KEYWORD_LEN) {
    return NextResponse.json({ error: `Keyword too long (max ${MAX_KEYWORD_LEN} chars)` }, { status: 400 });
  }

  try {
    // Dual search per D-01: relevance + upload_date:'week'. Each runs 5 pages internally.
    const [relevanceMap, recentMap] = await Promise.all([
      searchVideosByKeyword(keyword, {}, 5),
      searchVideosByKeyword(keyword, { upload_date: 'week' }, 5),
    ]);

    // Merge: relevance first, then add channels only found via upload_date:'week'.
    const merged = new Map<string, DiscoveredChannel>(relevanceMap);
    for (const [id, channel] of recentMap) {
      if (!merged.has(id)) merged.set(id, channel);
    }
    const channels = Array.from(merged.values());

    // Already-saved check (D-13): one Supabase query for all discovered IDs.
    if (channels.length > 0) {
      const sb = createServiceClient();
      const ids = channels.map(c => c.channelId);
      const { data: saved, error: savedErr } = await sb
        .from('outreach_channels')
        .select('youtube_id')
        .in('youtube_id', ids);

      if (savedErr) {
        console.warn('[outreach/discover] already-saved check failed; treating all as not-saved', savedErr);
      } else {
        const savedSet = new Set((saved ?? []).map((r: { youtube_id: string }) => r.youtube_id));
        for (const ch of channels) {
          if (savedSet.has(ch.channelId)) ch.alreadySaved = true;
        }
      }
    }

    return NextResponse.json({ channels });
  } catch (err: unknown) {
    console.error('[outreach/discover]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery failed' },
      { status: 500 },
    );
  }
}
