// src/lib/twitch/client.ts
// Twitch client credentials OAuth flow (no user login required).
// Token is cached in a module-level variable and refreshed 60 seconds before expiry.
// TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in .env.local.

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Date.now() ms
}

let cache: TokenCache | null = null;

export async function getTwitchToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt - 60_000) {
    return cache.accessToken;
  }
  const clientId     = process.env.TWITCH_CLIENT_ID ?? '';
  const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set');
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`Twitch token fetch failed: ${res.status}`);
  const json = await res.json() as { access_token: string; expires_in: number };
  cache = {
    accessToken: json.access_token,
    expiresAt:   Date.now() + json.expires_in * 1000,
  };
  return cache.accessToken;
}

export function getTwitchHeaders(token: string): Record<string, string> {
  return {
    'Client-Id':     process.env.TWITCH_CLIENT_ID ?? '',
    'Authorization': `Bearer ${token}`,
  };
}
