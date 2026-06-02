# Phase 2: Enrichment Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 2-enrichment-pipeline
**Areas discussed:** Bulk Input UX, Progress Feedback, Genre Taxonomy, LLM Provider, Small-Channel Behavior

---

## Bulk Input UX

### Q1: Input mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Single textarea, one URL per line | Paste from any source. Matches existing SearchForm pattern. Lowest friction. | ✓ |
| File upload (.txt or .csv) | User picks a file. Heavier UI. Useful only if lists live as files. | |
| Multiple input rows with add/remove | Each row is a separate input. Tedious for bulk. | |

### Q2: Accepted URL formats

| Option | Description | Selected |
|--------|-------------|----------|
| Liberal — anything InnerTube can resolve | Full URLs, @handles, channel IDs, with or without protocol/tracking params. | ✓ |
| Full URLs only | Must be `https://youtube.com/...`. @handles rejected. | |
| Strict canonical only | Only `/channel/UC...` or `/@handle`. Tightest data quality, highest friction. | |

### Q3: Pre-submit preview

| Option | Description | Selected |
|--------|-------------|----------|
| Submit directly, no preview | Spinner + summary at the end (ENR-08). Lowest friction. | ✓ |
| Show line count + Confirm button | One extra click as a guardrail. | |
| Show parsed list with per-line edit | Removable list before submit. Heaviest UI. | |

### Q4: Bulk size cap

| Option | Description | Selected |
|--------|-------------|----------|
| Cap at ~15 per submission | Matches existing scrape pattern; fits Vercel Pro 60s timeout. | ✓ |
| Cap at 50 per submission | Risks Vercel timeout; needs longer timeout config or job queue. | |
| No cap, partial results on timeout | Simplest server logic; user-hostile when truncated. | |

---

## Progress Feedback

### Q1: Progress mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Submit-and-wait | Disabled button + spinner + single JSON response at end. Simplest. | ✓ |
| Per-channel streaming via SSE | Streams '3/15: MKBHD ✓' as each finishes. Best UX, more code. | |
| Polling /status endpoint every 2s | Middle ground. Needs job table or in-memory store. | |

### Q2: Results summary shape

| Option | Description | Selected |
|--------|-------------|----------|
| Inline summary panel below the form | 'Enriched 12 / Failed 3' + expandable failure list with reasons. | ✓ |
| Toast notification + redirect to Outreach tab | Brief, but failure context is lost. | |
| Modal dialog with full details | Heaviest UI, most informative. | |

---

## Genre Taxonomy

### Q1: Genre field shape

| Option | Description | Selected |
|--------|-------------|----------|
| Closed enum, ~10 fixed values | LLM forced to pick exactly one. Phase 4 dropdown stable. | ✓ |
| Free-form (LLM picks any string) | Most expressive; Phase 4 filter becomes unstable. | |
| Open with suggestions | LLM gets list as suggestions but may invent new. | |

### Q2: Specific genre list

| Option | Description | Selected |
|--------|-------------|----------|
| Indie-focused list | Cozy, Survival, Roguelike, RPG, Strategy, Simulation, Horror, Platformer, Action/Adventure, Variety, Other (11). | ✓ |
| Broader gaming list | Adds FPS, Racing, Sports, Puzzle (13). | |
| User-supplied list | Free-form via 'Other'. | |

---

## LLM Provider

### Q1: Which LLM provider

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Perplexity `sonar` | Existing config, no new env var. Revives dead code. | |
| Switch to OpenAI gpt-4o-mini | New env var. Best-in-class strict JSON schema mode. Matches PROJECT.md original decision. | ✓ |
| Add both, pick at runtime | Most flexible, most code. Overengineering. | |

### Q2: What to do with existing Perplexity config

| Option | Description | Selected |
|--------|-------------|----------|
| Delete categorize.ts + drop PERPLEXITY_API_KEY | One provider, one env, simpler. Removes architecture-map anti-pattern. | ✓ |
| Leave Perplexity config in place | Stay strictly within Phase 2 scope; two env vars to maintain. | |
| Delete categorize.ts but keep PERPLEXITY_API_KEY | Compromise — code clean but env keeps optionality. | |

### Q3: LLM failure behavior per channel

| Option | Description | Selected |
|--------|-------------|----------|
| Save row with InnerTube data only (null game/genre) | Counted as 'partial'. Leverages D-02 nullability. | ✓ |
| Skip the channel entirely | No row written. Cleaner data; user re-pastes to retry. | |
| Retry once, then save partial | Hybrid; auto-retry adds latency on failure cases. | |

---

## Small-Channel Behavior

### Q1: <10 video handling

| Option | Description | Selected |
|--------|-------------|----------|
| Always enrich with whatever videos exist | Skip only on 0 videos. Best coverage for indie channels. | ✓ |
| Require >= 5 videos to enrich | Better data quality, narrower funnel. | |
| Require >= 10 videos (strict ENR-02) | Highest data quality, lowest coverage. Excludes small/new channels. | |

---

## Claude's Discretion

The following areas were not selected for discussion. Defaults are locked in CONTEXT.md as Claude discretion items; the planner may act on them without re-asking:

- **URL canonicalization rule** (strip query strings, lowercase host, resolve handles to canonical form)
- **Concurrency within a batch** (sequential `for ... await` to start; planner may relax if profiling demands)
- **InnerTube transient failure retry** (1 retry, 500ms backoff)
- **Failure reason taxonomy** (`not_found`, `no_videos`, `llm_failed`, `timeout`, `unknown_error`)
- **File layout** (`src/app/api/outreach/enrich/route.ts`, `src/lib/outreach/*`, `src/components/outreach/*`)
- **LLM prompt template** (system + user prompts; temperature 0; strict JSON schema)
- **Loading-state styling** (matches existing SearchForm)
- **LLM response_format mode** (strict JSON schema via gpt-4o-mini)

## Deferred Ideas

- **Re-enrich button** — Phase 4 (DASH-04) already covers this.
- **Job queue / background processing** for >15 channels — v2-style enhancement.
- **SSE/streaming progress feedback** — revisit if the 15-channel cap is raised significantly.
- **Cleanup of duplicated service-role client construction** in `src/lib/pipeline/upsert.ts` and `src/app/api/cron/scrape/route.ts` — separate phase or backlog.
- **CLAUDE.md Phase 2 documentation update** — flag for final commit of Phase 2 execution or a follow-up docs commit.
