type CorsResponse = {
  setHeader(name: string, value: string): unknown;
  append?(name: string, value: string): unknown;
};

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function isTrustedCorsOrigin(
  requestOrigin: string | undefined,
  trustedOrigins: string[],
): boolean {
  if (!requestOrigin) return true;

  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedRequestOrigin) return false;

  if (isLoopbackOrigin(normalizedRequestOrigin)) {
    return true;
  }

  return trustedOrigins.some(origin => normalizeOrigin(origin) === normalizedRequestOrigin);
}

export function applyCorsOrigin(response: CorsResponse, origin: string | undefined): void {
  if (!origin) return;
  response.setHeader('Access-Control-Allow-Origin', origin);
  if (response.append) {
    response.append('Vary', 'Origin');
  } else {
    response.setHeader('Vary', 'Origin');
  }
}
