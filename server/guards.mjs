export const BODY_LIMIT = 16 * 1024;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** The inspector intentionally visits the user's chosen HTTP(S) application. */
export function validateTarget(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new HttpError(400, 'Enter an HTTP or HTTPS URL no longer than 2,048 characters.');
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new HttpError(400, 'Enter a complete HTTP or HTTPS URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new HttpError(400, 'Only HTTP(S) targets without embedded credentials are supported.');
  }
  if (/\s|[\u0000-\u001f]/.test(value))
    throw new HttpError(400, 'The URL must not contain whitespace or control characters.');
  // Request fragments do not affect the network. Preserve them during navigation
  // for hash-routed applications; they are removed from every returned report.
  return url;
}

export function redactUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '[non-HTTP resource]';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '[invalid URL]';
  }
}

export function validateBlockedOrigins(value, targetOrigin) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new HttpError(400, 'Select between 1 and 30 dependency origins to block.');
  }
  const origins = value.map((entry) => {
    const url = validateTarget(entry);
    if (url.pathname !== '/' || url.search || url.hash)
      throw new HttpError(
        400,
        'Blocked dependencies must be origins, without a path, query or fragment.',
      );
    if (url.origin === targetOrigin)
      throw new HttpError(400, 'The main application origin cannot be blocked.');
    return url.origin;
  });
  return [...new Set(origins)];
}

export function isBlockedOrigin(url, blockedOrigins) {
  try {
    return blockedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/** Accept only the two literal loopback names, at this exact listening port. */
export function isAllowedHost(host, port) {
  if (typeof host !== 'string') return false;
  const suffix = port === 80 ? '' : `:${port}`;
  return [
    `127.0.0.1${suffix}`,
    `localhost${suffix}`,
    ...(port === 80 ? ['127.0.0.1:80', 'localhost:80'] : []),
  ].includes(host.toLowerCase());
}

export function assertRequestGuard(request, port, { publicFixtureAsset = false } = {}) {
  const host = request.headers.host;
  if (!isAllowedHost(host, port))
    throw new HttpError(403, 'Use the local address printed by Blackout Lab.');
  // Fixed, non-sensitive demo assets intentionally model an external supplier.
  // This exception never applies to API endpoints or arbitrary static paths.
  if (publicFixtureAsset && ['GET', 'HEAD'].includes(request.method)) return;
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) {
    throw new HttpError(403, 'Cross-origin requests are not accepted.');
  }
  if (request.headers['sec-fetch-site'] === 'cross-site')
    throw new HttpError(403, 'Cross-site requests are not accepted.');
  if (request.method === 'POST') {
    if (request.headers['x-blackout-lab'] !== '1')
      throw new HttpError(403, 'The X-Blackout-Lab: 1 request header is required.');
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')
    ) {
      throw new HttpError(415, 'Send application/json.');
    }
  }
}

/** Limit both advertised and streamed payloads; do not retain partial bodies. */
export async function readJson(request) {
  const advertised = request.headers['content-length'];
  if (advertised !== undefined && (!/^\d+$/.test(advertised) || Number(advertised) > BODY_LIMIT)) {
    request.resume();
    throw new HttpError(413, 'Request body exceeds the 16 KiB limit.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      request.resume();
      throw new HttpError(413, 'Request body exceeds the 16 KiB limit.');
    }
    chunks.push(chunk);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'The request body must contain valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new HttpError(400, 'The JSON body must be an object.');
  return data;
}

export function groupServices(requests, firstPartyOrigins) {
  const services = new Map();
  for (const request of requests) {
    let service = services.get(request.origin);
    if (!service) {
      let hostname;
      try {
        hostname = new URL(request.origin).hostname;
      } catch {
        continue;
      }
      service = {
        origin: request.origin,
        hostname,
        requestCount: 0,
        resourceTypes: [],
        firstParty: firstPartyOrigins.includes(request.origin),
      };
      services.set(request.origin, service);
    }
    service.requestCount++;
    if (!service.resourceTypes.includes(request.type)) service.resourceTypes.push(request.type);
  }
  return [...services.values()]
    .map((service) => ({ ...service, resourceTypes: service.resourceTypes.sort() }))
    .sort(
      (a, b) =>
        Number(b.firstParty) - Number(a.firstParty) ||
        b.requestCount - a.requestCount ||
        a.origin.localeCompare(b.origin),
    );
}
