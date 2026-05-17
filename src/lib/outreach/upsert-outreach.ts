// src/lib/outreach/upsert-outreach.ts
// Service-role upsert for outreach_channels (CONTEXT.md D-09 / Phase 1 SUMMARY line 90).
//
// Why createServiceClient() and not a fresh @supabase/supabase-js client:
//   - Phase 1 SUMMARY explicitly mandates this for new outreach code (line 90).
//   - The legacy duplication in src/lib/pipeline/upsert.ts is grandfathered (.planning/codebase/
//     ARCHITECTURE.md §Anti-Patterns line 217); new code uses the canonical helper.
//
// Conflict key:
//   - migration 004 has BOTH youtube_id and url as unique. Originally onConflict: 'youtube_id'.
//   - migration 006 (Phase 7) replaces the single-column youtube_id unique constraint with a
//     composite (youtube_id, platform) unique constraint to support multi-platform rows.
//     onConflict is now 'youtube_id,platform'. Existing YouTube callers that omit platform
//     default to 'youtube' and continue to work without change.

import { createServiceClient } from '@/lib/supabase/server';

export interface OutreachUpsertRow {
  youtubeId: string;
  name: string;
  url: string;
  subscriberCount: number | null;
  topGames: string[] | null;
  genre: string | null;
  email: string | null;
  medianViews: number | null;
  lastEnrichedAt: string;   // ISO 8601 timestamp
  platform?: string;        // 'youtube' (default) | 'twitch'
  lastVideoAt?: Date | null;
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
        email:            row.email,
        median_views:     row.medianViews,
        last_enriched_at: row.lastEnrichedAt,
        platform:         row.platform ?? 'youtube',
        last_video_at:    row.lastVideoAt ?? null,
      },
      { onConflict: 'youtube_id,platform' },
    );
  if (error) throw new Error(`upsertOutreachChannel: ${error.message}`);
}
