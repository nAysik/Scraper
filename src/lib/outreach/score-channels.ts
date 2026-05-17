// src/lib/outreach/score-channels.ts
// Batch relevance scorer using gpt-4o-mini.
// Follows the same lazy-singleton + strict JSON schema pattern as extract-games.ts.

import OpenAI from 'openai';

export interface ChannelToScore {
  youtubeId: string;
  name:      string;
  genre:     string | null;
  topGames:  string[] | null;
}

export interface ScoreResult {
  youtubeId: string;
  score:     number;   // 1-10, clamped
  reason:    string;   // one sentence
}

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai;
}

const BATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          youtubeId: { type: 'string' },
          score:     { type: 'number' },
          reason:    { type: 'string' },
        },
        required: ['youtubeId', 'score', 'reason'],
      },
    },
  },
  required: ['scores'],
} as const;

const TIMEOUT_MS = 30_000;

export async function scoreBatch(
  channels: ChannelToScore[],
  gameName: string,
  comparables: string,
): Promise<ScoreResult[]> {
  const client = getOpenAI();

  const systemPrompt =
    `You score YouTube gaming channels 1–10 for outreach fit for "${gameName}", ` +
    `a game similar to ${comparables}. ` +
    `10 = perfect audience fit (covers the same or very similar games). ` +
    `1 = completely unrelated genre/audience. ` +
    `For each channel return its youtubeId, an integer score 1–10, and a concise one-sentence reason.`;

  const userContent = JSON.stringify(
    channels.map(c => ({
      youtubeId: c.youtubeId,
      name:      c.name,
      genre:     c.genre ?? 'unknown',
      topGames:  c.topGames ?? [],
    }))
  );

  const completionPromise = client.chat.completions.parse({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name:   'channel_scores',
        strict: true,
        schema: BATCH_SCHEMA,
      },
    },
  });

  const completion = await Promise.race([
    completionPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('openai_timeout')), TIMEOUT_MS),
    ),
  ]);

  const parsed = (completion.choices[0]?.message?.parsed as { scores: ScoreResult[] } | null);
  if (!parsed) throw new Error('No parsed result from gpt-4o-mini');

  // Defensive clamp — GPT should return 1-10 but ensure it regardless
  return parsed.scores.map(s => ({
    youtubeId: s.youtubeId,
    score:     Math.min(10, Math.max(1, Math.round(s.score))),
    reason:    s.reason,
  }));
}
