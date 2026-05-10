// scripts/verify-outreach-channels.ts
// One-shot smoke test for the outreach_channels table.
// Run with: npx tsx scripts/verify-outreach-channels.ts
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing required env vars in .env.local');
  process.exit(1);
}

const service = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

const TEST_YOUTUBE_ID = `__verify_${Date.now()}`;
const TEST_URL = `https://youtube.com/__verify_${Date.now()}`;

let exitCode = 0;
function fail(msg: string, err?: unknown) {
  console.error(`FAIL: ${msg}`, err ?? '');
  exitCode = 1;
}
function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

// Wrapped in async IIFE: project transpiles to CJS, where top-level await is unsupported.
async function main() {
// 1. Service role INSERT
const { data: inserted, error: insErr } = await service
  .from('outreach_channels')
  .insert({
    youtube_id: TEST_YOUTUBE_ID,
    name: 'Verify Channel',
    url: TEST_URL,
    subscriber_count: 1234,
    top_games: ['Minecraft', 'Stardew Valley'],
    genre: 'Cozy',
    median_views: 5000,
    last_enriched_at: new Date().toISOString(),
  })
  .select()
  .single();

if (insErr || !inserted) {
  fail('service role insert', insErr);
} else {
  ok(`service role insert (id=${inserted.id})`);
}

// 2. Anon SELECT must be rejected (or return empty due to RLS)
const { data: anonRows, error: anonErr } = await anon
  .from('outreach_channels')
  .select('*')
  .eq('youtube_id', TEST_YOUTUBE_ID);

// RLS for SELECT typically returns an empty result set for anon (not an error).
// The policy `using (auth.role() = 'authenticated')` filters anon rows out.
if (anonErr) {
  ok(`anon select rejected with error (acceptable): ${anonErr.message}`);
} else if (!anonRows || anonRows.length === 0) {
  ok('anon select returned 0 rows (RLS filtered as expected)');
} else {
  fail(`anon select returned ${anonRows.length} rows — RLS is NOT blocking anon`);
}

// 3. Schema shape via information_schema (service role)
const { data: cols, error: colErr } = await service.rpc('exec_sql', {
  sql: `select column_name, data_type, is_nullable from information_schema.columns where table_name = 'outreach_channels' order by ordinal_position;`,
}).select?.() ?? { data: null, error: null };

// Fallback: query directly via service client when exec_sql RPC is not present.
const { data: serviceRows, error: serviceReadErr } = await service
  .from('outreach_channels')
  .select('*')
  .eq('youtube_id', TEST_YOUTUBE_ID)
  .single();

if (serviceReadErr || !serviceRows) {
  fail('service role read-back', serviceReadErr);
} else {
  const expectedKeys = [
    'id', 'youtube_id', 'name', 'url', 'subscriber_count',
    'top_games', 'genre', 'median_views', 'last_enriched_at', 'created_at',
  ];
  const missing = expectedKeys.filter((k) => !(k in serviceRows));
  if (missing.length) fail(`schema missing columns: ${missing.join(', ')}`);
  else ok('schema has all 10 expected columns');

  if (!Array.isArray(serviceRows.top_games)) fail('top_games is not an array');
  else ok('top_games is an array');
}

// Cleanup
const { error: delErr } = await service
  .from('outreach_channels')
  .delete()
  .eq('youtube_id', TEST_YOUTUBE_ID);
if (delErr) fail('cleanup delete', delErr);
else ok('cleanup delete');

process.exit(exitCode);
}

main().catch((err) => {
  console.error('FAIL: uncaught', err);
  process.exit(1);
});
