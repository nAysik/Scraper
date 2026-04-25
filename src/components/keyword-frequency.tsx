'use client';

import { useMemo, useState } from 'react';
import type { VideoRow } from './videos-table';

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','was','are','be','been','it','this','that','i','you','he','she',
  'we','they','my','your','his','her','our','their','what','how','when',
  'where','why','who','which','do','did','have','has','will','can','just',
  'get','got','make','made','use','new','now','one','two','up','so','if',
  'as','by','from','about','into','out','no','not','more','its','vs',
  'im','its','pm','am','ft','mr','st','dr','jr',
]);

export default function KeywordFrequency({ videos }: { videos: VideoRow[] }) {
  const [open, setOpen] = useState(true);

  const keywords = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const v of videos) {
      const words = v.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
      for (const w of words) {
        if (w.length > 2 && !STOP_WORDS.has(w)) {
          freq[w] = (freq[w] ?? 0) + 1;
        }
      }
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [videos]);

  const max = keywords[0]?.[1] ?? 1;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-sm font-medium text-gray-300 hover:text-white"
      >
        <span>Trending Title Keywords</span>
        <span className="text-gray-500 text-xs">{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {keywords.map(([word, count]) => (
            <span
              key={word}
              className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-full px-3 py-1"
            >
              <span className="text-white text-sm">{word}</span>
              <span
                className="text-xs font-bold text-purple-400"
                style={{ opacity: 0.35 + 0.65 * (count / max) }}
              >
                {count}
              </span>
            </span>
          ))}
          {keywords.length === 0 && (
            <p className="text-gray-500 text-sm">No data yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
