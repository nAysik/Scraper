import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VideosTable, { type VideoRow } from '@/components/videos-table';
import SearchForm from '@/components/search-form';

export const dynamic = 'force-dynamic';

function mapRows(raw: any[]): VideoRow[] {
  return raw.map((v: any) => ({
    id:              v.id,
    youtubeId:       v.youtube_id,
    title:           v.title,
    channelName:     v.channels?.name ?? '—',
    subscriberCount: v.channels?.subscriber_count ?? 0,
    viewCount:       v.view_count,
    outlierScore:    Number(v.outlier_score),
    niche:           (v.channels as any)?.niches?.name ?? null,
    publishedAt:     v.published_at,
    isShort:         v.is_short as boolean,
  }));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const select = `
    id, youtube_id, title, view_count, published_at, outlier_score, is_short,
    channels ( name, subscriber_count, niches ( name ) )
  `;

  const [
    { data: nicheVideosRaw },
    { data: shortsRaw },
    { data: nichesRaw },
  ] = await Promise.all([
    supabase
      .from('videos')
      .select(select)
      .eq('is_short', false)
      .order('outlier_score', { ascending: false })
      .limit(500),
    supabase
      .from('videos')
      .select(select)
      .eq('is_short', true)
      .order('view_count', { ascending: false })
      .limit(500),
    supabase.from('niches').select('id, name').order('name'),
  ]);

  const nicheVideos = mapRows(nicheVideosRaw ?? []);
  const shorts      = mapRows(shortsRaw ?? []);
  const niches      = (nichesRaw ?? []).map((n: any) => ({ id: n.id, name: n.name }));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">YouTube Niche Finder</h1>
        <form action="/api/auth/signout" method="post">
          <button className="text-sm text-gray-400 hover:text-white">Sign out</button>
        </form>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
            Keywords Scraper
          </h2>
          <SearchForm />
          <div className="mt-6">
            <VideosTable videos={nicheVideos} niches={niches} defaultSort="outlierScore" />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
            Top Viral Video Charts
          </h2>
          <VideosTable videos={shorts} niches={niches} defaultSort="viewCount" />
        </section>
      </main>
    </div>
  );
}
