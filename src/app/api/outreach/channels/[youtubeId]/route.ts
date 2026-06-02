import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ youtubeId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { youtubeId } = await params;
  const body = await request.json().catch(() => ({}));
  const email: string | null = typeof body.email === 'string' ? body.email.trim() || null : null;
  const contacted: boolean | undefined = typeof body.contacted === 'boolean' ? body.contacted : undefined;

  const update: Record<string, unknown> = {};
  if (email !== null || typeof body.email === 'string') update.email = email;
  if (contacted !== undefined) update.contacted = contacted;

  const service = createServiceClient();
  const { error } = await service
    .from('outreach_channels')
    .update(update)
    .eq('youtube_id', youtubeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ email, contacted });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ youtubeId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { youtubeId } = await params;
  const service = createServiceClient();

  const { data, error } = await service
    .from('outreach_channels')
    .delete()
    .eq('youtube_id', youtubeId)
    .select('youtube_id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({});
}
