import OpenAI from 'openai';

const NICHE_NAMES = [
  'Faceless Finance',
  'Tech Reviews',
  'AI Tools',
  'Productivity',
  'Health & Fitness',
  'Gaming Clips',
  'Education',
  'Other',
] as const;

export type NicheName = (typeof NICHE_NAMES)[number];

export interface VideoTitle {
  videoId: string;
  title: string;
}

export interface CategorizedVideo {
  videoId: string;
  niche: NicheName;
}

let openai: OpenAI | null = null;

function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export async function categorizeVideos(videos: VideoTitle[]): Promise<CategorizedVideo[]> {
  if (videos.length === 0) return [];

  const client = getOpenAI();
  const titlesJson = JSON.stringify(videos.map(v => ({ id: v.videoId, title: v.title })));

  const prompt = `Classify each YouTube video title into exactly one of these niches:
${NICHE_NAMES.join(', ')}

Use "Other" only when nothing else fits.

Videos (JSON array with id and title):
${titlesJson}

Return ONLY a JSON object like: {"results": [{"id": "...", "niche": "..."}]}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  });

  const raw = response.choices[0].message.content ?? '{"results":[]}';
  const parsed = JSON.parse(raw) as { results: { id: string; niche: string }[] };

  return parsed.results.map(r => ({
    videoId: r.id,
    niche: (NICHE_NAMES as readonly string[]).includes(r.niche)
      ? (r.niche as NicheName)
      : 'Other',
  }));
}

export async function categorizeInBatches(videos: VideoTitle[], batchSize = 20): Promise<CategorizedVideo[]> {
  const results: CategorizedVideo[] = [];
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    const batchResults = await categorizeVideos(batch);
    results.push(...batchResults);
  }
  return results;
}
