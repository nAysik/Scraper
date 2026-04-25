'use client';

import type { VideoRow } from './videos-table';

function daysSince(dateStr: string) {
  return Math.max(1, Math.round((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function NicheStatsCards({ videos }: { videos: VideoRow[] }) {
  if (!videos.length) return null;

  const topByScore = videos.reduce((a, b) => a.outlierScore > b.outlierScore ? a : b);
  const topByVelocity = videos.reduce((a, b) =>
    a.viewCount / daysSince(a.publishedAt) > b.viewCount / daysSince(b.publishedAt) ? a : b,
  );

  const nicheMap: Record<string, number[]> = {};
  for (const v of videos) {
    const n = v.niche ?? 'Other';
    (nicheMap[n] ??= []).push(v.viewCount);
  }
  const hottestNiche = Object.entries(nicheMap)
    .map(([n, views]) => ({ n, avg: views.reduce((a, b) => a + b, 0) / views.length }))
    .reduce((a, b) => a.avg > b.avg ? a : b);

  const velocityPerDay = Math.round(topByVelocity.viewCount / daysSince(topByVelocity.publishedAt));

  const cards = [
    {
      label: 'Videos tracked',
      value: videos.length.toLocaleString(),
    },
    {
      label: 'Top outlier score',
      value: `${topByScore.outlierScore.toFixed(1)}x`,
      sub: topByScore.title.slice(0, 42) + (topByScore.title.length > 42 ? '…' : ''),
    },
    {
      label: 'Hottest niche',
      value: hottestNiche.n,
      sub: `avg ${(hottestNiche.avg / 1_000_000).toFixed(1)}M views`,
    },
    {
      label: 'Fastest growing',
      value: `${fmt(velocityPerDay)}/day`,
      sub: topByVelocity.title.slice(0, 42) + (topByVelocity.title.length > 42 ? '…' : ''),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">{c.label}</p>
          <p className="text-lg font-semibold text-white">{c.value}</p>
          {c.sub && <p className="text-xs text-gray-500 mt-0.5 truncate" title={c.sub}>{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}
