import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return NextResponse.json(
      { error: 'ids must be a non-empty array of strings' },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('outreach_channels')
    .delete()
    .in('youtube_id', ids)
    .select('youtube_id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: data?.length ?? 0 });
}
