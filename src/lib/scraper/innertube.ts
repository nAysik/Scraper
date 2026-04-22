import { Innertube } from 'youtubei.js';
import { buildProxiedFetch } from './proxy';

let client: Innertube | null = null;

export async function getClient(): Promise<Innertube> {
  if (!client) {
    const fetchImpl = buildProxiedFetch();
    client = await Innertube.create(fetchImpl ? { fetch: fetchImpl } : undefined);
  }
  return client;
}
