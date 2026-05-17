import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;

  const { data, error } = await supabase
    .from('campaign_sends')
    .select('id, youtube_id, email, channel_name, status, sent_at, clicked_at')
    .eq('campaign_id', campaignId)
    .order('channel_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sends = (data ?? []).map((s: Record<string, unknown>) => ({
    id:          s.id,
    youtubeId:   s.youtube_id,
    email:       s.email,
    channelName: s.channel_name,
    status:      s.status,
    sentAt:      s.sent_at,
    clickedAt:   s.clicked_at,
  }));

  return NextResponse.json({ sends });
}
