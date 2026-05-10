// src/lib/outreach/genre-taxonomy.ts
// Source of truth for the closed genre enum (CONTEXT.md D-07, locked).
// Order matters only for stable schema hashing; do not reorder once committed.

export const GENRES = [
  'Cozy',
  'Survival',
  'Roguelike',
  'RPG',
  'Strategy',
  'Simulation',
  'Horror',
  'Platformer',
  'Action/Adventure',
  'Variety',
  'Other',
] as const;

export type Genre = (typeof GENRES)[number];
