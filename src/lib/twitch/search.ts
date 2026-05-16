// src/lib/twitch/search.ts
// Discover live Twitch streamers for a given game name.
// Pipeline: game name → game_id → live streams (≤100) → batch user profiles → merge + email extract.

import { getTwitchToken, getTwitchHeaders } from './client';

export interface TwitchChannel {
  twitchId: string;      // Twitch user_id
  login: string;         // lowercase channel name, e.g. "shroud"
  displayName: string;   // display_name from Twitch
  url: string;           // https://twitch.tv/{login}
  viewerCount: number;   // live viewer count at time of search
  email: string | null;  // extracted from bio via regex, null if absent
  alreadySaved: boolean; // set by the route handler after a DB check
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const BASE = 'https://api.twitch.tv/helix';

export async function searchTwitchStreamers(game: string): Promise<TwitchChannel[]> {
  const token   = await getTwitchToken();
  const headers = getTwitchHeaders(token);

  // Step 1: Resolve game name → game_id
  const gamesRes = await fetch(`${BASE}/games?name=${encodeURIComponent(game)}`, { headers });
  if (!gamesRes.ok) throw new Error(`Twitch games lookup failed: ${gamesRes.status}`);
  const gamesJson = await gamesRes.json() as { data: { id: string; name: string }[] };
  const gameId = gamesJson.data[0]?.id;
  if (!gameId) return []; // unknown game — return empty instead of error

  // Step 2: Get live streams for this game (up to 100)
  const streamsRes = await fetch(`${BASE}/streams?game_id=${encodeURIComponent(gameId)}&first=100`, { headers });
  if (!streamsRes.ok) throw new Error(`Twitch streams fetch failed: ${streamsRes.status}`);
  const streamsJson = await streamsRes.json() as {
    data: { user_id: string; user_login: string; user_name: string; viewer_count: number }[];
  };
  const streams = streamsJson.data;
  if (streams.length === 0) return [];

  // Step 3: Batch-fetch user profiles (bios) — all user_ids in a single request (≤100)
  const idParams = streams.map(s => `id=${encodeURIComponent(s.user_id)}`).join('&');
  const usersRes = await fetch(`${BASE}/users?${idParams}`, { headers });
  if (!usersRes.ok) throw new Error(`Twitch users fetch failed: ${usersRes.status}`);
  const usersJson = await usersRes.json() as {
    data: { id: string; login: string; display_name: string; description: string }[];
  };
  const userMap = new Map(usersJson.data.map(u => [u.id, u]));

  // Step 4: Merge streams with user bios, extract emails
  return streams.map(s => {
    const user        = userMap.get(s.user_id);
    const description = user?.description ?? '';
    const emailMatch  = description.match(EMAIL_RE);
    return {
      twitchId:    s.user_id,
      login:       s.user_login,
      displayName: user?.display_name ?? s.user_name,
      url:         `https://twitch.tv/${s.user_login}`,
      viewerCount: s.viewer_count,
      email:       emailMatch ? emailMatch[0] : null,
      alreadySaved: false,
    };
  });
}

// Search recent clips for a game — surfaces channels that played recently even if currently offline.
// Clips are always stored (no opt-in required), so this is far more populated than archive VODs.
// Pipeline: game name → game_id → clips last 30 days (≤100, sorted by views) → dedup by broadcaster → batch user profiles → email extract.
export async function searchTwitchClips(game: string): Promise<TwitchChannel[]> {
  const token   = await getTwitchToken();
  const headers = getTwitchHeaders(token);

  // Step 1: Resolve game name → game_id
  const gamesRes = await fetch(`${BASE}/games?name=${encodeURIComponent(game)}`, { headers });
  if (!gamesRes.ok) throw new Error(`Twitch games lookup failed: ${gamesRes.status}`);
  const gamesJson = await gamesRes.json() as { data: { id: string; name: string }[] };
  const gameId = gamesJson.data[0]?.id;
  if (!gameId) return [];

  // Step 2: Get clips from the last 30 days (sorted by view_count desc by default)
  const startedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const clipsRes = await fetch(
    `${BASE}/clips?game_id=${encodeURIComponent(gameId)}&first=100&started_at=${encodeURIComponent(startedAt)}`,
    { headers },
  );
  if (!clipsRes.ok) throw new Error(`Twitch clips fetch failed: ${clipsRes.status}`);
  const clipsJson = await clipsRes.json() as {
    data: { broadcaster_id: string; broadcaster_name: string; view_count: number }[];
  };
  const clips = clipsJson.data;
  if (clips.length === 0) return [];

  // Step 3: Dedup by broadcaster_id — first occurrence = highest-view clip per channel
  const seen = new Map<string, { broadcaster_id: string; broadcaster_name: string; view_count: number }>();
  for (const clip of clips) {
    if (!seen.has(clip.broadcaster_id)) seen.set(clip.broadcaster_id, clip);
  }
  const uniqueChannels = Array.from(seen.values());

  // Step 4: Batch-fetch user profiles for login + bio
  const idParams = uniqueChannels.map(c => `id=${encodeURIComponent(c.broadcaster_id)}`).join('&');
  const usersRes = await fetch(`${BASE}/users?${idParams}`, { headers });
  if (!usersRes.ok) throw new Error(`Twitch users fetch failed: ${usersRes.status}`);
  const usersJson = await usersRes.json() as {
    data: { id: string; login: string; display_name: string; description: string }[];
  };
  const userMap = new Map(usersJson.data.map(u => [u.id, u]));

  return uniqueChannels.map(c => {
    const user        = userMap.get(c.broadcaster_id);
    const login       = user?.login ?? c.broadcaster_name.toLowerCase();
    const description = user?.description ?? '';
    const emailMatch  = description.match(EMAIL_RE);
    return {
      twitchId:    c.broadcaster_id,
      login,
      displayName: user?.display_name ?? c.broadcaster_name,
      url:         `https://twitch.tv/${login}`,
      viewerCount: c.view_count,
      email:       emailMatch ? emailMatch[0] : null,
      alreadySaved: false,
    };
  });
}
