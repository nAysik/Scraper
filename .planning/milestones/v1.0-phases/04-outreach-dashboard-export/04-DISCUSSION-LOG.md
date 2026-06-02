# Phase 4: Outreach Dashboard & Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 4-Outreach Dashboard & Export
**Areas discussed:** Saved channels view placement, Re-enrich & delete UX, CSV export scope & format, Filter configuration

---

## Saved Channels View Placement

| Option | Description | Selected |
|--------|-------------|----------|
| 3rd tab in OutreachTabs | Add 'My list' as a third tab alongside existing tabs. Minimal change. | ✓ |
| Default tab (top of page) | Make saved-channels list the first/default tab users land on. | |
| You decide | Planner picks the placement. | |

**User's choice:** 3rd tab in OutreachTabs

### Tab name
| Option | Description | Selected |
|--------|-------------|----------|
| My list | Simple, personal. | |
| Saved channels | Descriptive, matches 'save' action. | |
| Outreach list | More formal, emphasizes purpose. | ✓ |

**User's choice:** "Outreach list"

### Tab order
| Option | Description | Selected |
|--------|-------------|----------|
| Outreach list first | Prioritizes dashboard view as most frequent use. | |
| Keep Discover first, list last | No change to existing tab order — new tab appended at end. | ✓ |
| You decide | Planner picks the order. | |

**User's choice:** Keep Discover first, list last → final order: Discover channels | Bulk enrich | Outreach list

---

## Re-enrich & Delete UX

### Re-enrich feedback
| Option | Description | Selected |
|--------|-------------|----------|
| In-place spinner on the row | Row shows spinner while enriching, fields update in place. Phase 3 D-06 pattern. | ✓ |
| Button spinner only | Re-enrich button shows loading state; row refreshes on completion. | |
| You decide | Planner picks, likely in-place for consistency. | |

**User's choice:** In-place spinner on the row

### Delete confirmation
| Option | Description | Selected |
|--------|-------------|----------|
| Immediate removal, no confirm | Row disappears on click. Fast. No undo. | ✓ |
| Inline confirm on the row | 'Confirm' / 'Cancel' buttons appear on the row. No modal. | |
| You decide | Planner decides — likely inline confirm given no undo. | |

**User's choice:** Immediate removal, no confirm

### Action scope
| Option | Description | Selected |
|--------|-------------|----------|
| Per-row inline buttons only | Re-enrich and Delete on each row. Simple. | |
| Both: per-row + bulk delete | Per-row Re-enrich + bulk delete via checkboxes. | ✓ |
| You decide | Planner picks based on expected list size. | |

**User's choice:** Both — per-row Re-enrich button and per-row Delete button, plus bulk delete via checkboxes + "Delete selected" toolbar button.

---

## CSV Export Scope & Format

### Export scope
| Option | Description | Selected |
|--------|-------------|----------|
| Filtered rows only | Exports whatever is visible after applying filters. | ✓ |
| Always all saved channels | Ignores filters, exports every row. | |

**User's choice:** Filtered rows only

### CSV columns
| Option | Description | Selected |
|--------|-------------|----------|
| Match table exactly | CSV mirrors table 1:1. | |
| Table + email column | Table columns + email always included. | ✓ |
| You decide | Planner picks columns. | |

**User's choice:** Table + email — columns: Channel name, URL, Subscribers, Top games, Genre, Median views, Last enriched, Email.

### Export button placement
| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar above the table | In the filter row, visible at all times. | ✓ |
| Below the table | Footer position, out of the way. | |
| You decide | Planner places it — likely toolbar. | |

**User's choice:** Toolbar above the table

---

## Filter Configuration

### Client-side vs server-side
| Option | Description | Selected |
|--------|-------------|----------|
| All client-side | Load all rows once, filter in browser. Consistent with existing pattern. | ✓ |
| Server-side filtering | Each filter change hits DB. More scalable. | |

**User's choice:** All client-side

### Subscriber filter shape
| Option | Description | Selected |
|--------|-------------|----------|
| Max subscribers only | Single input, consistent with Discovery tab. | ✓ |
| Min + max pair | Two inputs for a full range. | |

**User's choice:** Max subscribers only

### Genre filter type
| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown from saved genres | Dropdown with distinct values from current rows. 'All genres' default. | ✓ |
| Text search input | Free-text substring filter. | |
| You decide | Planner picks. | |

**User's choice:** Dropdown from saved genres

---

## Claude's Discretion

- Data loading sort order (created_at desc vs last_enriched_at desc) — planner decides
- Delete API route shape (DELETE /api/outreach/channels/[youtubeId] vs POST /api/outreach/delete) — planner decides
- CSV generation implementation (client-side Blob + anchor download pattern) — planner implements
- Bulk delete request shape (single batch request vs sequential) — planner decides
- Filename for the new OutreachList component — planner decides

## Deferred Ideas

- View-count filter on Discovery tab — noted in Phase 3 deferred, not addressed in Phase 4
- Multi-keyword sweep — Phase 3 deferred, not in scope
- Outreach status tracking (contacted/replied/passed) — out of scope per PROJECT.md
- Re-enrich on already-saved rows in Discovery tab — Phase 4 re-enrich is on the Outreach list tab only
