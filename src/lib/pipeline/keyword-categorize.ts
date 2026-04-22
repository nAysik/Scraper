const NICHE_KEYWORDS: Record<string, string[]> = {
  'Faceless Finance': [
    'finance', 'investing', 'investment', 'stock', 'crypto', 'bitcoin', 'money',
    'wealth', 'income', 'budget', 'debt', 'dividend', 'trading', 'forex', 'passive income',
  ],
  'Tech Reviews': [
    'review', 'unboxing', 'iphone', 'android', 'laptop', 'gpu', 'cpu', 'pc build',
    'phone', 'gadget', 'tech', 'apple', 'samsung', 'gaming setup', 'monitor',
  ],
  'AI Tools': [
    'ai', 'chatgpt', 'gpt', 'claude', 'gemini', 'midjourney', 'stable diffusion',
    'artificial intelligence', 'machine learning', 'llm', 'automation', 'prompt',
  ],
  'Productivity': [
    'productivity', 'notion', 'obsidian', 'workflow', 'time management', 'habit',
    'focus', 'deep work', 'morning routine', 'organization', 'todo', 'second brain',
  ],
  'Health & Fitness': [
    'workout', 'gym', 'fitness', 'diet', 'nutrition', 'weight loss', 'muscle',
    'running', 'yoga', 'meditation', 'health', 'calories', 'protein', 'training',
  ],
  'Gaming Clips': [
    'gaming', 'gameplay', 'montage', 'highlights', 'fortnite', 'minecraft', 'valorant',
    'cod', 'warzone', 'gta', 'roblox', 'clips', 'funny moments', 'speedrun',
  ],
  'Education': [
    'tutorial', 'how to', 'explained', 'learn', 'course', 'lesson', 'guide',
    'beginner', 'history', 'science', 'mathematics', 'coding', 'programming',
  ],
};

export function categorizeByKeywords(title: string): string {
  const lower = title.toLowerCase();
  for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return niche;
  }
  return 'Other';
}
