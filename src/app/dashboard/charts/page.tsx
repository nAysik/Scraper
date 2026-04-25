import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VideosTable, { type VideoRow } from '@/components/videos-table';

export const dynamic = 'force-dynamic';

export default async function ViralChartsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: shortsRaw }, { data: nichesRaw }] = await Promise.all([
    supabase
      .from('videos')
      .select(`
        id, youtube_id, title, view_count, published_at, outlier_score, is_short,
        channels ( name, subscriber_count, niches ( name ) )
      `)
      .eq('is_short', true)
      .order('view_count', { ascending: false })
      .limit(500),
    supabase.from('niches').select('id, name').order('name'),
  ]);

  const shorts: VideoRow[] = (shortsRaw ?? []).map((v: any) => ({
    id:              v.id,
    youtubeId:       v.youtube_id,
    title:           v.title,
    channelName:     v.channels?.name ?? '—',
    subscriberCount: v.channels?.subscriber_count ?? 0,
    viewCount:       v.view_count,
    outlierScore:    Number(v.outlier_score),
    niche:           (v.channels as any)?.niches?.name ?? null,
    publishedAt:     v.published_at,
    isShort:         true,
  }));

  const niches = (nichesRaw ?? []).map((n: any) => ({ id: n.id, name: n.name }));

  return (
    <VideosTable videos={shorts} niches={niches} defaultSort="viewCount" />
  );
}
