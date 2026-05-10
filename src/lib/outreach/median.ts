// src/lib/outreach/median.ts
// Pure median calculation. Returns 0 for empty array (caller decides whether
// to coerce to null for the DB column — see route handler in Plan 03).
//
// Number-vs-BigInt: YouTube view counts (max ~10B) fit comfortably in JS
// Number's safe-int range (2^53). Postgres bigint accepts JS Number directly
// via supabase-js. No coercion needed.

export function medianViews(views: number[]): number {
  if (views.length === 0) return 0;
  const sorted = [...views].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  if (Number.isInteger(mid)) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[Math.floor(mid)];
}
