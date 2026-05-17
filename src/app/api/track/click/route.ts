import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sendId     = searchParams.get('id')  ?? '';
  const encodedUrl = searchParams.get('url') ?? '';

  let destination = '/';
  try {
    destination = decodeURIComponent(encodedUrl) || '/';
  } catch {
    destination = '/';
  }

  if (sendId) {
    try {
      const sb = createServiceClient();
      await sb
        .from('campaign_sends')
        .update({ status: 'clicked', clicked_at: new Date().toISOString() })
        .eq('id', sendId)
        .is('clicked_at', null);
    } catch { /* silent */ }
  }

  return NextResponse.redirect(destination);
}
