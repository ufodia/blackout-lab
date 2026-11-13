import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertRequestGuard,
  HttpError,
  readJson,
  validateBlockedOrigins,
  validateTarget,
} from './guards.mjs';
import { browserReady, runOperation } from './capture.mjs';
import { demoResponse } from './demo.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function setHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function json(response, status, value) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function serveStatic(request, response, pathname, directory) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'The request path is invalid.');
  }
  if (
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    decoded.split('/').some((segment) => segment.startsWith('.'))
  )
    throw new HttpError(404, 'File not found.');
  let filename = path.resolve(directory, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (filename !== directory && !filename.startsWith(`${directory}${path.sep}`))
    throw new HttpError(404, 'File not found.');
  let info;
  try {
    info = await stat(filename);
  } catch {
    /* Try a history-route fallback below. */
  }
  if (
    !info?.isFile() &&
    !path.extname(decoded) &&
    (request.headers.accept ?? '').includes('text/html')
  ) {
    filename = path.join(directory, 'index.html');
    try {
      info = await stat(filename);
    } catch {
      /* Return an actionable error. */
    }
  }
  if (!info?.isFile())
    throw new HttpError(404, 'File not found. Run npm run build before starting production mode.');
  const [actualDirectory, actualFile] = await Promise.all([
    realpath(directory),
    realpath(filename),
  ]);
  if (!actualFile.startsWith(`${actualDirectory}${path.sep}`))
    throw new HttpError(404, 'File not found.');
  if (info.size > 32 * 1024 * 1024)
    throw new HttpError(413, 'This asset exceeds the local server limit.');
  response.writeHead(200, {
    'Content-Type': TYPES[path.extname(filename)] ?? 'application/octet-stream',
    'Content-Length': info.size,
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(filename);
  stream.on('error', () => {
    response.destroy();
  });
  stream.pipe(response);
}

/** Start only on literal IPv4 loopback. Port 0 is reserved for automated tests. */
export async function startServer({
  port = 5173,
  dev = false,
  runner = runOperation,
  ready = browserReady,
  directory = PROJECT_ROOT,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Port must be an integer from 1 to 65535.');
  let vite;
  let listeningPort = port;
  let busy = false;
  const active = new Set();
  const server = http.createServer(async (request, response) => {
    setHeaders(response);
    try {
      const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${listeningPort}`).pathname;
      const publicFixtureAsset = [
        '/demo-assets/style.css',
        '/demo-assets/widget.js',
        '/demo-assets/map.svg',
      ].includes(pathname);
      assertRequestGuard(request, listeningPort, { publicFixtureAsset });
      if (pathname === '/api/health') {
        if (request.method !== 'GET') throw new HttpError(405, 'Use GET for the health endpoint.');
        json(response, 200, { ok: true, browserReady: await ready() });
        return;
      }
      if (pathname === '/api/inspect' || pathname === '/api/rehearse') {
        if (request.method !== 'POST')
          throw new HttpError(405, 'Use POST for inspection and rehearsal.');
        if (busy)
          throw new HttpError(429, 'An inspection is already running. Wait for it to finish.');
        const body = await readJson(request);
        const url = validateTarget(body.url);
        const fixtureOrigins = [
          `http://127.0.0.1:${listeningPort}`,
          `http://localhost:${listeningPort}`,
        ];
        const localFixture =
          fixtureOrigins.includes(url.origin) && ['/demo', '/demo/'].includes(url.pathname);
        if (fixtureOrigins.includes(url.origin) && !localFixture) {
          throw new HttpError(
            400,
            'Use /demo to inspect Blackout Lab itself; API and workspace pages are not test targets.',
          );
        }
        const kind = pathname.endsWith('/inspect') ? 'inspect' : 'rehearse';
        const blockedOrigins =
          kind === 'rehearse' ? validateBlockedOrigins(body.blockedOrigins, url.origin) : [];
        if (busy)
          throw new HttpError(429, 'An inspection is already running. Wait for it to finish.');
        busy = true;
        const controller = new AbortController();
        active.add(controller);
        const abort = () => {
          if (!response.writableEnded) controller.abort();
        };
        response.once('close', abort);
        try {
          json(
            response,
            200,
            await runner({
              kind,
              url,
              blockedOrigins,
              signal: controller.signal,
              allowedOrigins: localFixture ? fixtureOrigins : undefined,
            }),
          );
        } finally {
          response.removeListener('close', abort);
          active.delete(controller);
          busy = false;
        }
        return;
      }
      if (pathname.startsWith('/api/')) throw new HttpError(404, 'API endpoint not found.');
      if (!['GET', 'HEAD'].includes(request.method ?? ''))
        throw new HttpError(405, 'Use GET or HEAD for page resources.');
      const fixture = demoResponse(pathname, listeningPort, request.headers.host);
      if (fixture) {
        if (fixture.type.startsWith('text/html'))
          response.setHeader(
            'Content-Security-Policy',
            `default-src 'none'; base-uri 'none'; script-src http://localhost:${listeningPort} http://127.0.0.1:${listeningPort}; style-src 'unsafe-inline' http://localhost:${listeningPort} http://127.0.0.1:${listeningPort}; img-src http://localhost:${listeningPort} http://127.0.0.1:${listeningPort}; connect-src 'none'; frame-ancestors 'none'`,
          );
        response.writeHead(200, { 'Content-Type': fixture.type });
        response.end(request.method === 'HEAD' ? undefined : fixture.body);
        return;
      }
      if (vite) {
        vite.middlewares(request, response, () =>
          json(response, 404, { error: 'Page not found.' }),
        );
        return;
      }
      await serveStatic(request, response, pathname, path.resolve(directory, 'dist'));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : 'The local operation failed. Try again or restart Blackout Lab.';
      if (status === 429) response.setHeader('Retry-After', '3');
      json(response, status, { error: message });
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 3_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      listeningPort = typeof address === 'object' && address ? address.port : port;
      resolve();
    });
  }).catch(async (error) => {
    await vite?.close();
    throw error;
  });
  if (dev) {
    try {
      const { createServer } = await import('vite');
      // Share the actual loopback HTTP server. The Vite 8 client still uses its
      // socket when HMR is disabled, so disabling only the socket is insufficient.
      // A shared server also lets multiple workspaces use different ports safely.
      vite = await createServer({
        root: directory,
        server: {
          middlewareMode: true,
          host: '127.0.0.1',
          ws: { server, clientPort: listeningPort },
        },
        appType: 'spa',
      });
    } catch (error) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      throw error;
    }
  }
  return {
    server,
    port: listeningPort,
    url: `http://127.0.0.1:${listeningPort}`,
    async close() {
      for (const controller of active) controller.abort();
      await vite?.close();
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
    },
  };
}
