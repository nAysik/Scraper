import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VideosTable, { type VideoRow } from '@/components/videos-table';
import SearchForm from '@/components/search-form';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: videosRaw }, { data: nichesRaw }] = await Promise.all([
    supabase
      .from('videos')
      .select(`
        id, youtube_id, title, view_count, published_at, outlier_score,
        channels ( name, subscriber_count ),
        niches ( name )
      `)
      .order('outlier_score', { ascending: false })
      .limit(500),
    supabase.from('niches').select('id, name').order('name'),
  ]);

  const videos: VideoRow[] = (videosRaw ?? []).map((v: any) => ({
    id:              v.id,
    youtubeId:       v.youtube_id,
    title:           v.title,
    channelName:     v.channels?.name ?? '—',
    subscriberCount: v.channels?.subscriber_count ?? 0,
    viewCount:       v.view_count,
    outlierScore:    Number(v.outlier_score),
    niche:           v.niches?.name ?? null,
    publishedAt:     v.published_at,
  }));

  const niches = (nichesRaw ?? []).map((n: any) => ({ id: n.id, name: n.name }));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">YouTube Niche Finder</h1>
        <form action="/api/auth/signout" method="post">
          <button className="text-sm text-gray-400 hover:text-white">Sign out</button>
        </form>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
            Scrape a keyword
          </h2>
          <SearchForm />
        </section>

        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
            Outlier videos
          </h2>
          <VideosTable videos={videos} niches={niches} />
        </section>
      </main>
    </div>
  );
}
