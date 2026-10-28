/** Trusted configuration only: never derive emailed links from the incoming Host header. */
export function clientUrl(value: string | undefined, environment: string): string {
  const configured = value?.trim();
  if (!configured && environment !== 'development') throw new Error('CLIENT_URL is required outside development.');
  const url = new URL(configured || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('CLIENT_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  return url.origin;
}

export function emailAssetBase(value: string | undefined, fallback: string): string {
  const url = new URL(value?.trim() || fallback);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('EMAIL_ASSET_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.');
  return url.href.replace(/\/+$/, '');
}
