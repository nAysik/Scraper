import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type NicheStat = {
  name: string;
  count: number;
  avgViews: number;
  avgScore: number;
  topTitle: string;
  topViews: number;
};

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function saturation(count: number) {
  if (count > 30) return { label: 'Competitive', color: 'text-red-400' };
  if (count > 10) return { label: 'Growing', color: 'text-yellow-400' };
  return { label: 'Opportunity', color: 'text-emerald-400' };
}

export default async function NicheInsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: raw } = await supabase
    .from('videos')
    .select(`
      title, view_count, outlier_score,
      channels ( niches ( name ) )
    `)
    .order('view_count', { ascending: false })
    .limit(1000);

  // Aggregate per niche client-side
  const map = new Map<string, { views: number[]; scores: number[]; topTitle: string; topViews: number }>();

  for (const v of raw ?? []) {
    const niche: string = (v.channels as any)?.niches?.name ?? 'Other';
    if (!map.has(niche)) map.set(niche, { views: [], scores: [], topTitle: '', topViews: 0 });
    const entry = map.get(niche)!;
    entry.views.push(v.view_count as number);
    entry.scores.push(Number(v.outlier_score));
    if ((v.view_count as number) > entry.topViews) {
      entry.topViews = v.view_count as number;
      entry.topTitle = v.title as string;
    }
  }

  const stats: NicheStat[] = Array.from(map.entries())
    .map(([name, d]) => ({
      name,
      count: d.views.length,
      avgViews: d.views.reduce((a, b) => a + b, 0) / d.views.length,
      avgScore: d.scores.reduce((a, b) => a + b, 0) / d.scores.length,
      topTitle: d.topTitle,
      topViews: d.topViews,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  return (
    <div>
      <p className="text-gray-400 text-sm mb-6">
        Aggregated from the last 1,000 videos in the database. Opportunity = fewer than 10 viral videos tracked — less saturated.
      </p>

      <div className="rounded-md border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900">
              <th className="text-left text-gray-400 px-4 py-3">Niche</th>
              <th className="text-right text-gray-400 px-4 py-3">Videos</th>
              <th className="text-right text-gray-400 px-4 py-3">Avg Views</th>
              <th className="text-right text-gray-400 px-4 py-3">Avg Score</th>
              <th className="text-left text-gray-400 px-4 py-3">Top Video</th>
              <th className="text-right text-gray-400 px-4 py-3">Saturation</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const sat = saturation(s.count);
              return (
                <tr key={s.name} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900/40'}`}>
                  <td className="px-4 py-3 font-medium text-white">{s.name}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{s.count}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{fmt(s.avgViews)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{s.avgScore.toFixed(1)}x</td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate" title={s.topTitle}>
                    {s.topTitle.slice(0, 50)}{s.topTitle.length > 50 ? '…' : ''}
                    <span className="text-gray-600 ml-1 text-xs">({fmt(s.topViews)} views)</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${sat.color}`}>{sat.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
