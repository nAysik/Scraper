// src/lib/outreach/extract-games.ts
// Single OpenAI gpt-4o-mini call per channel (CONTEXT.md D-08, D-10).
// Strict JSON Schema: returns { games: string[], genre: Genre }.
//
// Failure semantics (CONTEXT.md D-11):
//   - This module THROWS on any failure (timeout, parse error, missing parsed result, network).
//   - The route handler (Plan 03) catches the throw and routes the channel into the `partial[]`
//     array, saving the row with InnerTube data only and `top_games`/`genre` set to null.
//
// Strict-mode constraints (RESEARCH §5 + Pitfall 2):
//   - additionalProperties: false (REQUIRED at every object level)
//   - All properties listed in `required` (REQUIRED)
//   - minItems / maxItems NOT supported — enforce ≤3 in prompt + post-process .slice(0, 3)
//   - genre is a string enum — strict mode enforces exact match

import OpenAI from 'openai';
import { GENRES, type Genre } from './genre-taxonomy';
import type { VideoMeta } from '@/lib/scraper/videos';

export interface GameGenreResult {
  games: string[];   // 0..3 entries (≤3 enforced via prompt + .slice(0, 3))
  genre: Genre;
}

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return openai;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    games: { type: 'array', items: { type: 'string' } },
    genre: { type: 'string', enum: [...GENRES] },
  },
  required: ['games', 'genre'],
} as const;

const OPENAI_TIMEOUT_MS = 20_000;   // RESEARCH Pitfall 5

export async function extractGamesGenre(
  videos: VideoMeta[],
  description: string,
): Promise<GameGenreResult> {
  const client = getOpenAI();
  const titles = videos.map(v => v.title);

  const completionPromise = client.chat.completions.parse({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          `You analyse a YouTube gaming channel's recent videos and About page.\n` +
          `Return the up-to-3 games most prominently covered (strings; pick at most 3, ` +
          `prefer fewer if uncertain) and the channel's primary genre — ` +
          `exactly one of: ${GENRES.join(', ')}. ` +
          `Use "Other" only when none of the listed genres fit. ` +
          `Use "Variety" for general gaming channels not focused on one genre.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          recent_video_titles: titles,
          channel_about: description,
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'channel_extraction', strict: true, schema: SCHEMA },
    },
  });

  const completion = await Promise.race([
    completionPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('openai_timeout')), OPENAI_TIMEOUT_MS),
    ),
  ]);

  const parsed = completion.choices[0]?.message?.parsed as GameGenreResult | null;
  if (!parsed) throw new Error('No parsed result from gpt-4o-mini');

  return { games: parsed.games.slice(0, 3), genre: parsed.genre };
}
