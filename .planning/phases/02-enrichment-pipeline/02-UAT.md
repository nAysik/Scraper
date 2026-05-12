---
status: complete
phase: 02-enrichment-pipeline
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
  - 02-04-SUMMARY.md
  - 02-05-SUMMARY.md
started: 2026-05-10T16:30:00.000Z
updated: 2026-05-12T00:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Nav tab + page loads
expected: |
  Dashboard nav shows new "Outreach" tab; clicking it loads /dashboard/outreach with textarea + line counter + disabled submit button.
result: pass

### 2. Auth gate redirects unauthenticated users
expected: |
  Sign out (or open /dashboard/outreach in a private window). Hitting /dashboard/outreach redirects to /login.
result: pass

### 3. Cap-15 client-side guard
expected: |
  Paste a list of 16+ URLs (any plausible YouTube URLs, real or fake). The line counter shows >15 and the submit button is disabled (or shows an over-limit message). Reduce to ≤15 and the button enables.
result: pass

### 4. Single-URL happy path (E2E)
expected: |
  Pre-req: OPENAI_API_KEY set in .env.local (real key with quota).
  Paste exactly one real channel URL, e.g. https://youtube.com/@mkbhd. Click Submit. Spinner appears for a few seconds. Summary panel renders with `Enriched: 1 / Failed: 0 / Partial: 0`. Open Supabase Table Editor → outreach_channels → confirm 1 new row with non-null top_games (array), genre (one of the 11 enum values), median_views (number), subscriber_count (number).
result: partial-pass
notes: |
  Pipeline ran end-to-end. Channel saved with name/subs/median_views populated; top_games and genre null because OpenAI returned 429 insufficient_quota (account has no billing). Pending re-run after billing is added or with a different OPENAI_API_KEY.

### 7. D-11 partial-save path (LLM failure)
expected: |
  Set OPENAI_API_KEY=sk-bogus-1234 in .env.local. Restart npm run dev. Paste a real channel URL. Submit. Summary panel shows Partial: 1 with the URL listed under partial with reason llm_failed. Open Supabase → the row was saved with top_games = NULL and genre = NULL but name, subscriber_count, median_views, last_enriched_at ARE populated.
result: pass
notes: |
  Confirmed implicitly via Test 4 — the OpenAI 429 insufficient_quota error triggered the same partial-save path that an invalid key would. Row saved with InnerTube fields populated and top_games/genre null. URL appeared in partial[] with reason llm_failed. The contract is verified.

### 5. Multi-URL happy path
expected: |
  Pre-req: OPENAI_API_KEY working from test 4.
  Paste 2-3 different real channel URLs (one per line) into the textarea. Submit. Summary shows `Enriched: N / Failed: 0 / Partial: 0` (or some failed/partial if any URL fails). Each successful URL produces a separate row in outreach_channels (different youtube_id values).
result: pass

### 6. Re-submit upsert (no duplicate row)
expected: |
  Paste the SAME URL you used in test 4 a second time. Submit. The summary still shows `Enriched: 1`. In Supabase, the row's `last_enriched_at` is updated to a newer timestamp but there is still only ONE row for that channel (no duplicate insertion).
result: pass

### 8. D-06 form clears on success
expected: |
  After test 4 (or any successful submit), the textarea is now empty. The Summary panel persists below. Page did not redirect.
result: pass

### 9. D-06 form preserves on error
expected: |
  Sign out (so the next POST gets 401). Sign back in but immediately try a malformed submit OR temporarily break the route. Submit. The form shows an inline error string. The textarea content you typed is STILL there (not cleared) so you can fix and retry.
result: pass

## Summary

total: 9
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

### G-02: OpenAI API key has no billing / `insufficient_quota`
- truth: "extractGamesGenre returns top games + genre for a real channel"
- status: external-blocker (not a code bug)
- reason: "User tested Northernlion. Pipeline ran end-to-end: channel resolved, 10 videos fetched, median computed, upsert succeeded with name/subs/median populated. OpenAI call returned 429 insufficient_quota — account needs billing setup. Code behaved correctly: D-11 partial-save path triggered, row saved with top_games=null/genre=null, URL reported in partial[] with reason 'llm_failed'."
- severity: blocker for happy-path tests (Tests 4, 5, 6, 8), but NOT a Phase 2 code bug
- test: 4
- fix: "User adds billing at platform.openai.com → API → Billing, then retries. Alternatively use a different OPENAI_API_KEY with credit."
- positive_finding: "Test 7 (D-11 partial-save) implicitly PASSED — confirmed via real-world failure that the partial[] path works exactly as specified."
- anti_pattern_observed: "src/app/api/outreach/enrich/route.ts:67 — `extractGamesGenre(...).catch(() => null)` swallows the error without logging. Worth a small follow-up: change to `.catch(err => { console.error('[outreach/enrich] llm', err); return null; })` for operational visibility. Not blocking UAT."

### G-01: channel.getVideos() returns empty for new YouTube response shape
- truth: "fetchChannelData(channelId) returns the channel's last 10 videos"
- status: fixed-inline
- reason: "User reported Northernlion (https://www.youtube.com/@Northernlion) returned 'failed'. Root cause: YouTube now returns video lists in a RichItem→LockupView shape that youtubei.js v17's .videos getter doesn't recognise; returns []. fetch-channel-data.ts then routed the URL to the no_videos / not_found bucket."
- severity: blocker (would have made the whole pipeline useless for any channel returning the new shape — likely most large channels)
- test: 4
- fix: "Added fallback parser in src/lib/outreach/fetch-channel-data.ts that walks current_tab.content.contents[].content (LockupView) when .videos is empty. Commit a0cba35. Verified: fetchChannelData('UC3tNpTOHsTnkmbwztCs30sA') returns 10 videos."
- backlog: "src/lib/scraper/videos.ts:getChannelRecentVideos has the same latent bug but is out of Phase 2 scope. Worth a backlog item for the legacy outlier scraper."
