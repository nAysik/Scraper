import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (campaigns ?? []).map((c: { id: string }) => c.id);
  const { data: sends } = await supabase
    .from('campaign_sends')
    .select('campaign_id, status')
    .in('campaign_id', ids.length > 0 ? ids : ['__none__']);

  const countMap: Record<string, { sent: number; clicked: number; total: number }> = {};
  for (const s of sends ?? []) {
    const row = s as { campaign_id: string; status: string };
    if (!countMap[row.campaign_id]) countMap[row.campaign_id] = { sent: 0, clicked: 0, total: 0 };
    countMap[row.campaign_id].total++;
    if (row.status === 'sent' || row.status === 'clicked') countMap[row.campaign_id].sent++;
    if (row.status === 'clicked') countMap[row.campaign_id].clicked++;
  }

  const result = (campaigns ?? []).map((c: Record<string, unknown>) => ({
    id:           c.id,
    name:         c.name,
    status:       c.status,
    createdAt:    c.created_at,
    sentCount:    countMap[c.id as string]?.sent    ?? 0,
    clickedCount: countMap[c.id as string]?.clicked ?? 0,
    totalCount:   countMap[c.id as string]?.total   ?? 0,
  }));

  return NextResponse.json({ campaigns: result });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, subjectTemplate, bodyTextTemplate, bodyHtmlTemplate, channelIds, manualRecipients } = body as {
    name: string;
    subjectTemplate: string;
    bodyTextTemplate: string;
    bodyHtmlTemplate: string;
    channelIds: string[];
    manualRecipients?: { email: string; name: string }[];
  };

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!subjectTemplate?.trim()) return NextResponse.json({ error: 'subjectTemplate is required' }, { status: 400 });
  const hasChannels = Array.isArray(channelIds) && channelIds.length > 0;
  const hasManual   = Array.isArray(manualRecipients) && manualRecipients.length > 0;
  if (!hasChannels && !hasManual)
    return NextResponse.json({ error: 'Provide at least one channel or manual recipient' }, { status: 400 });

  const sb = createServiceClient();

  const { data: campaign, error: campErr } = await sb
    .from('campaigns')
    .insert({
      name,
      subject_template:   subjectTemplate,
      body_text_template: bodyTextTemplate ?? '',
      body_html_template: bodyHtmlTemplate ?? '',
      status: 'draft',
    })
    .select('id')
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: campErr?.message ?? 'Insert failed' }, { status: 500 });

  const allSends: object[] = [];

  // Channel-based recipients
  if (hasChannels) {
    const { data: channels } = await sb
      .from('outreach_channels')
      .select('youtube_id, name, email')
      .in('youtube_id', channelIds);

    (channels ?? [])
      .filter((c: { email: string | null }) => c.email)
      .forEach((c: { youtube_id: string; name: string; email: string }) =>
        allSends.push({
          campaign_id:  campaign.id,
          youtube_id:   c.youtube_id,
          email:        c.email,
          channel_name: c.name,
          status:       'pending',
        })
      );
  }

  // Manual recipients — use email as youtube_id (no matching channel row)
  if (hasManual) {
    (manualRecipients ?? [])
      .filter(r => r.email?.includes('@'))
      .forEach(r =>
        allSends.push({
          campaign_id:  campaign.id,
          youtube_id:   `manual:${r.email}`,
          email:        r.email.trim(),
          channel_name: r.name?.trim() || r.email.trim(),
          status:       'pending',
        })
      );
  }

  if (allSends.length > 0) await sb.from('campaign_sends').insert(allSends);

  return NextResponse.json({ campaignId: campaign.id, sendsCreated: allSends.length });
}
