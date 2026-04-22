export function buildProxiedFetch(): typeof fetch | null {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) return null;

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const proxied = new URL(proxyUrl);
    proxied.searchParams.set('url', url);
    return fetch(proxied.toString(), init);
  };
}
