# Phase 1: Database Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 1-Database Foundation
**Areas discussed:** top_games column type

---

## top_games column type

| Option | Description | Selected |
|--------|-------------|----------|
| text[] | Postgres native text array — stores ["Minecraft", "Stardew Valley", "Terraria"]. Simple to write and read. | ✓ |
| jsonb | JSON blob — more flexible, could hold game + confidence score. More complex syntax for reads/writes. | |
| You decide | Let the planner pick based on codebase patterns | |

**User's choice:** text[]
**Notes:** No additional notes — straightforward preference for the simpler approach.

---

## NULL handling for enriched fields

| Option | Description | Selected |
|--------|-------------|----------|
| Nullable (Recommended) | NULL until enrichment fills them in. Safer for partial failures. | ✓ |
| NOT NULL with defaults | top_games defaults to '{}', genre and median_views have non-null defaults. | |

**User's choice:** Nullable
**Notes:** Application code enforces completeness; DB allows rows to exist before enrichment completes.

---

## Claude's Discretion

- url field semantics and unique constraint — not discussed, planner decides
- Index strategy for Phase 4 filters — not discussed, planner decides
- subscriber_count nullability — not discussed, planner decides

## Deferred Ideas

None raised during discussion.
