import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import VideosTable, { type VideoRow } from '@/components/videos-table';

export const dynamic = 'force-dynamic';

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function uploadFrequency(publishedDates: string[]): string {
  if (publishedDates.length < 2) return 'Not enough data';
  const sorted = [...publishedDates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(
      (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86_400_000,
    );
  }
  const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median < 1) return 'Multiple times/day';
  if (median < 2) return 'Daily';
  if (median < 8) return `Every ~${Math.round(median)} days`;
  if (median < 16) return 'Weekly';
  return `Every ~${Math.round(median / 7)} weeks`;
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ youtubeId: string }>;
}) {
  const { youtubeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: channel } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, last_scraped, youtube_id, niches ( name )')
    .eq('youtube_id', youtubeId)
    .maybeSingle();

  if (!channel) notFound();

  const { data: videosRaw } = await supabase
    .from('videos')
    .select('id, youtube_id, title, view_count, published_at, outlier_score, is_short')
    .eq('channel_id', channel.id)
    .order('outlier_score', { ascending: false })
    .limit(200);

  const videos = videosRaw ?? [];

  const totalViews = videos.reduce((s, v) => s + (v.view_count as number), 0);
  const avgScore = videos.length
    ? videos.reduce((s, v) => s + Number(v.outlier_score), 0) / videos.length
    : 0;
  const peakScore = videos.length
    ? Math.max(...videos.map(v => Number(v.outlier_score)))
    : 0;
  const freq = uploadFrequency(videos.map(v => v.published_at as string));

  const nicheName = (channel as any).niches?.name ?? '—';

  const tableRows: VideoRow[] = videos.map((v: any) => ({
    id:                v.id,
    youtubeId:         v.youtube_id,
    channelYoutubeId:  youtubeId,
    title:             v.title,
    channelName:       channel.name,
    subscriberCount:   channel.subscriber_count,
    viewCount:         v.view_count,
    outlierScore:      Number(v.outlier_score),
    niche:             nicheName,
    publishedAt:       v.published_at,
    isShort:           v.is_short,
  }));

  return (
    <div className="space-y-6">
      {/* Channel header */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{channel.name}</h2>
            <p className="text-gray-400 text-sm mt-1">{nicheName} · {fmt(channel.subscriber_count)} subscribers</p>
          </div>
          <a
            href={`https://youtube.com/@${channel.name.replace(/\s+/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline shrink-0"
          >
            Open on YouTube ↗
          </a>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          {[
            { label: 'Videos in DB', value: videos.length.toString() },
            { label: 'Total views', value: fmt(totalViews) },
            { label: 'Avg score', value: `${avgScore.toFixed(1)}x` },
            { label: 'Peak score', value: `${peakScore.toFixed(1)}x` },
            { label: 'Upload frequency', value: freq },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-md px-3 py-2">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-sm font-semibold text-white mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Videos table */}
      <VideosTable videos={tableRows} niches={[]} defaultSort="outlierScore" />
    </div>
  );
}
