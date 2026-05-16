// src/app/api/outreach/discover/route.ts
// POST /api/outreach/discover  (Phase 3, updated Phase 5)
// Auth-gated keyword-driven channel discovery.
//
// Request:  { keywords: string[] }  — or legacy { keyword: string }
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

  // Support both { keywords: string[] } (new) and { keyword: string } (legacy backwards-compat).
  let rawKeywords: string[];
  if (Array.isArray(body?.keywords)) {
    rawKeywords = body.keywords;
  } else if (typeof body?.keyword === 'string') {
    rawKeywords = [body.keyword];
  } else {
    rawKeywords = [];
  }

  const keywords = rawKeywords.map((k: unknown) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean);

  if (keywords.length === 0) {
    return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
  }
  if (keywords.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 keywords allowed' }, { status: 400 });
  }
  const tooLong = keywords.find(k => k.length > MAX_KEYWORD_LEN);
  if (tooLong) {
    return NextResponse.json({ error: `Keyword too long (max ${MAX_KEYWORD_LEN} chars): "${tooLong.slice(0, 30)}…"` }, { status: 400 });
  }

  try {
    // Fire all keyword × variant searches in parallel (2 per keyword).
    const allMaps = await Promise.all(
      keywords.flatMap(kw => [
        searchVideosByKeyword(kw, {}, 5),
        searchVideosByKeyword(kw, { upload_date: 'week' }, 5),
      ]),
    );

    // Merge: iterate each result Map; first-seen entry wins on channelId collision.
    const merged = new Map<string, DiscoveredChannel>();
    for (const map of allMaps) {
      for (const [id, channel] of map) {
        if (!merged.has(id)) merged.set(id, channel);
      }
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
