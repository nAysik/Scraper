import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendEmail, substituteVariables, SEND_DELAY_MS, type SendVariables } from '@/lib/email/send-campaign';

export const maxDuration = 300;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;
  const sb = createServiceClient();

  const { data: campaign, error: campErr } = await sb
    .from('campaigns')
    .select('id, subject_template, body_text_template, body_html_template, status')
    .eq('id', campaignId)
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status === 'sent') return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 });

  const { data: sends, error: sendsErr } = await sb
    .from('campaign_sends')
    .select('id, youtube_id, email, channel_name, status')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (sendsErr) return NextResponse.json({ error: sendsErr.message }, { status: 500 });
  if (!sends || sends.length === 0) return NextResponse.json({ sent: 0, failed: 0 });

  const youtubeIds = sends.map((s: { youtube_id: string }) => s.youtube_id);
  const { data: channels } = await sb
    .from('outreach_channels')
    .select('youtube_id, top_games, genre, platform')
    .in('youtube_id', youtubeIds);

  const channelMap = new Map(
    (channels ?? []).map((c: { youtube_id: string; top_games: string[] | null; genre: string | null; platform: string }) =>
      [c.youtube_id, c]
    )
  );

  await sb.from('campaigns').update({ status: 'sending' }).eq('id', campaignId);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < sends.length; i++) {
    const s = sends[i] as { id: string; youtube_id: string; email: string; channel_name: string };
    const ch = channelMap.get(s.youtube_id) as { top_games: string[] | null; genre: string | null; platform: string } | undefined;

    const vars: SendVariables = {
      ChannelName: s.channel_name,
      TopGames:    (() => {
        const games = (ch?.top_games ?? []).slice(0, 2);
        if (games.length === 2) return `${games[0]} and ${games[1]}`;
        if (games.length === 1) return games[0];
        return '—';
      })(),
      Genre:       ch?.genre ?? '—',
      Platform:    ch?.platform ?? 'YouTube',
    };

    const subject  = substituteVariables(campaign.subject_template, vars);
    const textBody = substituteVariables(campaign.body_text_template, vars);
    const htmlBody = substituteVariables(campaign.body_html_template, vars);

    try {
      await sendEmail({ to: s.email, subject, textBody, htmlBody, sendId: s.id });
      await sb.from('campaign_sends').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', s.id);
      sent++;
    } catch (err) {
      console.error('[send] failed for', s.email, err);
      await sb.from('campaign_sends').update({ status: 'failed' }).eq('id', s.id);
      failed++;
    }

    if (i < sends.length - 1) await sleep(SEND_DELAY_MS);
  }

  await sb.from('campaigns').update({ status: 'sent' }).eq('id', campaignId);
  return NextResponse.json({ sent, failed });
}
