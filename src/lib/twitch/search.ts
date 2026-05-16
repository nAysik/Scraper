// src/lib/twitch/search.ts
// Discover Twitch streamers for a given game name.
// Two modes: live streams (currently broadcasting) and recent VODs (archived recordings).

import { getTwitchToken, getTwitchHeaders } from './client';

export interface TwitchChannel {
  twitchId: string;      // Twitch user_id
  login: string;         // lowercase channel name, e.g. "shroud"
  displayName: string;   // display_name from Twitch
  url: string;           // https://twitch.tv/{login}
  viewerCount: number;   // live viewer count (live mode) or VOD view count (vods mode)
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

// Search recent VOD recordings for a game — surfaces offline streamers who played recently.
// Pipeline: game name → game_id → recent archive VODs (≤100) → dedup by user → batch user profiles → email extract.
export async function searchTwitchVods(game: string): Promise<TwitchChannel[]> {
  const token   = await getTwitchToken();
  const headers = getTwitchHeaders(token);

  // Step 1: Resolve game name → game_id
  const gamesRes = await fetch(`${BASE}/games?name=${encodeURIComponent(game)}`, { headers });
  if (!gamesRes.ok) throw new Error(`Twitch games lookup failed: ${gamesRes.status}`);
  const gamesJson = await gamesRes.json() as { data: { id: string; name: string }[] };
  const gameId = gamesJson.data[0]?.id;
  if (!gameId) return [];

  // Step 2: Get recent archived VODs for this game (up to 100)
  const videosRes = await fetch(`${BASE}/videos?game_id=${encodeURIComponent(gameId)}&type=archive&first=100`, { headers });
  if (!videosRes.ok) throw new Error(`Twitch videos fetch failed: ${videosRes.status}`);
  const videosJson = await videosRes.json() as {
    data: { user_id: string; user_login: string; user_name: string; view_count: number }[];
  };
  const videos = videosJson.data;
  if (videos.length === 0) return [];

  // Step 3: Dedup by user_id — keep first occurrence (= most recent VOD per streamer)
  const seen = new Map<string, { user_id: string; user_login: string; user_name: string; view_count: number }>();
  for (const v of videos) {
    if (!seen.has(v.user_id)) seen.set(v.user_id, v);
  }
  const uniqueUsers = Array.from(seen.values());

  // Step 4: Batch-fetch user profiles for bios
  const idParams = uniqueUsers.map(u => `id=${encodeURIComponent(u.user_id)}`).join('&');
  const usersRes = await fetch(`${BASE}/users?${idParams}`, { headers });
  if (!usersRes.ok) throw new Error(`Twitch users fetch failed: ${usersRes.status}`);
  const usersJson = await usersRes.json() as {
    data: { id: string; login: string; display_name: string; description: string }[];
  };
  const userMap = new Map(usersJson.data.map(u => [u.id, u]));

  return uniqueUsers.map(u => {
    const user        = userMap.get(u.user_id);
    const description = user?.description ?? '';
    const emailMatch  = description.match(EMAIL_RE);
    return {
      twitchId:    u.user_id,
      login:       u.user_login,
      displayName: user?.display_name ?? u.user_name,
      url:         `https://twitch.tv/${u.user_login}`,
      viewerCount: u.view_count,
      email:       emailMatch ? emailMatch[0] : null,
      alreadySaved: false,
    };
  });
}
