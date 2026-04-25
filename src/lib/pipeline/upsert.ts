import { createClient } from '@supabase/supabase-js';
import type { ChannelMeta } from '../scraper/channels';
import type { VideoMeta } from '../scraper/videos';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function upsertChannel(channel: ChannelMeta & { nicheId?: string }): Promise<string> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from('channels')
    .upsert(
      {
        youtube_id:       channel.youtubeId,
        name:             channel.name,
        subscriber_count: channel.subscriberCount,
        niche_id:         channel.nicheId ?? null,
        last_scraped:     new Date().toISOString(),
      },
      { onConflict: 'youtube_id' }
    )
    .select('id')
    .single();

  if (error) throw new Error(`upsertChannel: ${error.message}`);
  return data.id as string;
}

export async function upsertVideo(
  video: VideoMeta & { channelId: string; outlierScore: number; nicheId?: string; isShort?: boolean }
): Promise<void> {
  const sb = getServiceClient();

  const { error } = await sb.from('videos').upsert(
    {
      youtube_id:    video.youtubeId,
      channel_id:    video.channelId,
      title:         video.title,
      view_count:    video.viewCount,
      published_at:  video.publishedAt.toISOString(),
      outlier_score: video.outlierScore,
      is_short:      video.isShort ?? false,
    },
    { onConflict: 'youtube_id' }
  );

  if (error) throw new Error(`upsertVideo: ${error.message}`);
}

export async function getNicheIdMap(): Promise<Record<string, string>> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('niches').select('id, name');
  if (error) throw new Error(`getNicheIdMap: ${error.message}`);
  return Object.fromEntries((data ?? []).map(n => [n.name as string, n.id as string]));
}

export async function getStaleChannels(limit = 50): Promise<{ id: string; youtubeId: string }[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('channels')
    .select('id, youtube_id')
    .order('last_scraped', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`getStaleChannels: ${error.message}`);
  return (data ?? []).map(r => ({ id: r.id as string, youtubeId: r.youtube_id as string }));
}
