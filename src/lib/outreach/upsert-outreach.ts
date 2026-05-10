// src/lib/outreach/upsert-outreach.ts
// Service-role upsert for outreach_channels (CONTEXT.md D-09 / Phase 1 SUMMARY line 90).
//
// Why createServiceClient() and not a fresh @supabase/supabase-js client:
//   - Phase 1 SUMMARY explicitly mandates this for new outreach code (line 90).
//   - The legacy duplication in src/lib/pipeline/upsert.ts is grandfathered (.planning/codebase/
//     ARCHITECTURE.md §Anti-Patterns line 217); new code uses the canonical helper.
//
// Conflict key:
//   - migration 004 has BOTH youtube_id and url as unique. Upsert specifies onConflict: 'youtube_id'.
//   - When the same channel is re-pasted with a different URL form (canonicalisation differences,
//     casing, etc.), youtube_id resolves the conflict and the row's `url` is overwritten with
//     the new canonical form. RESEARCH Pitfall 3 confirms this is the desired behaviour.

import { createServiceClient } from '@/lib/supabase/server';

export interface OutreachUpsertRow {
  youtubeId: string;
  name: string;
  url: string;
  subscriberCount: number | null;
  topGames: string[] | null;
  genre: string | null;
  medianViews: number | null;
  lastEnrichedAt: string;   // ISO 8601 timestamp
}

export async function upsertOutreachChannel(row: OutreachUpsertRow): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from('outreach_channels')
    .upsert(
      {
        youtube_id:       row.youtubeId,
        name:             row.name,
        url:              row.url,
        subscriber_count: row.subscriberCount,
        top_games:        row.topGames,
        genre:            row.genre,
        median_views:     row.medianViews,
        last_enriched_at: row.lastEnrichedAt,
      },
      { onConflict: 'youtube_id' },
    );
  if (error) throw new Error(`upsertOutreachChannel: ${error.message}`);
}
