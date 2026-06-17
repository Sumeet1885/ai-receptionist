type HeaderBag = Record<string, string | string[] | undefined>;

interface HeaderSource {
  headers: HeaderBag;
  protocol?: string;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  get?: (name: string) => string | undefined;
}

interface OriginCheckOptions {
  allowedDomains?: string[];
  extraAllowedOrigins?: string[];
  allowRuntimeOrigin?: boolean;
  requireSource?: boolean;
}

interface OriginCheckResult {
  allowed: boolean;
  sourceOrigin?: string;
  reason?: string;
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getHeader(req: HeaderSource, name: string) {
  return req.get?.(name) || firstHeaderValue(req.headers[name.toLowerCase()]);
}

function normalizeUrlLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getHostname(value: string) {
  return new URL(normalizeUrlLike(value)).hostname.toLowerCase();
}

function getOrigin(value: string) {
  return new URL(normalizeUrlLike(value)).origin;
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function hostnamesMatch(sourceHostname: string, allowedHostname: string) {
  if (sourceHostname === allowedHostname) return true;
  return isLoopbackHostname(sourceHostname) && isLoopbackHostname(allowedHostname);
}

function getRequestHost(req: HeaderSource) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return (forwardedHost || getHeader(req, 'host') || '').toLowerCase();
}

function getRequestProtocol(req: HeaderSource) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwardedProto || req.protocol || 'http';
}

export function getRuntimeOrigin(req: HeaderSource) {
  const host = getRequestHost(req);
  if (!host) return '';
  return `${getRequestProtocol(req)}://${host}`;
}

export function getClientIp(req: HeaderSource) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
}

function getSourceOrigin(req: HeaderSource) {
  const origin = getHeader(req, 'origin');
  if (origin) return getOrigin(origin);

  const referer = getHeader(req, 'referer');
  if (referer) return getOrigin(referer);

  return '';
}

function matchesAllowedHostname(sourceHostname: string, allowedDomain: string) {
  const normalized = allowedDomain.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === '*') return true;

  const wildcardMatch = normalized.match(/^\*\.(.+)$/);
  if (wildcardMatch) {
    const baseHost = getHostname(wildcardMatch[1]);
    return sourceHostname.endsWith(`.${baseHost}`);
  }

  return hostnamesMatch(sourceHostname, getHostname(normalized));
}

export function checkAllowedOrigin(req: HeaderSource, options: OriginCheckOptions = {}): OriginCheckResult {
  if (process.env.ALLOW_ALL_WIDGET_DOMAINS === 'true') {
    return { allowed: true, reason: 'ALLOW_ALL_WIDGET_DOMAINS' };
  }

  const sourceOrigin = getSourceOrigin(req);
  if (!sourceOrigin) {
    return {
      allowed: !options.requireSource,
      reason: options.requireSource ? 'Missing Origin/Referer' : 'No source header',
    };
  }

  const sourceHostname = getHostname(sourceOrigin);

  if (options.allowRuntimeOrigin !== false) {
    const runtimeOrigin = getRuntimeOrigin(req);
    if (runtimeOrigin && hostnamesMatch(sourceHostname, getHostname(runtimeOrigin))) {
      return { allowed: true, sourceOrigin, reason: 'Runtime origin' };
    }
  }

  const extraAllowedOrigins = options.extraAllowedOrigins || [];
  const isExtraAllowed = extraAllowedOrigins.some(origin => {
    try {
      return hostnamesMatch(sourceHostname, getHostname(origin));
    } catch {
      return false;
    }
  });

  if (isExtraAllowed) {
    return { allowed: true, sourceOrigin, reason: 'Trusted app origin' };
  }

  const isBotDomainAllowed = (options.allowedDomains || []).some(domain => {
    try {
      return matchesAllowedHostname(sourceHostname, domain);
    } catch {
      return false;
    }
  });

  return {
    allowed: isBotDomainAllowed,
    sourceOrigin,
    reason: isBotDomainAllowed ? 'Allowed bot domain' : `Origin ${sourceOrigin} is not authorized`,
  };
}

export function buildFrameAncestors(allowedDomains: string[], extraAllowedOrigins: string[] = []) {
  const toFrameAncestorSources = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      if (/^https?:\/\//i.test(trimmed)) {
        return [new URL(trimmed).origin];
      }

      const host = getHostname(trimmed);
      const wildcard = trimmed.startsWith('*.') ? '*.' : '';
      const hostSource = wildcard ? `*.${host.replace(/^\*\./, '')}` : host;
      const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      const cspHostSource = host === '::1' ? '[::1]' : hostSource;

      if (localHost) {
        return [`http://${cspHostSource}:*`, `https://${cspHostSource}:*`];
      }

      return [`https://${cspHostSource}`, `http://${cspHostSource}`];
    } catch {
      return [];
    }
  };

  const origins = [
    ...allowedDomains.flatMap(toFrameAncestorSources),
    ...extraAllowedOrigins.flatMap(toFrameAncestorSources),
  ].filter(Boolean);

  return Array.from(new Set(origins)).join(' ');
}
