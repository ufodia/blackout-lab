import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

async function listen(handler: RequestListener): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** Actual local HTTP target with a deliberately hostile, inert document title. */
export async function hostileTitleTarget(): Promise<{
  origin: string;
  dependencyOrigin: string;
  title: string;
  close(): Promise<void>;
}> {
  const dependency = await listen((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/css' });
    response.end(
      'body{background:#164c3a;color:white}.signal{background:#d4ef7b;color:#163d2d;padding:48px;font:700 48px system-ui}',
    );
  });
  const title = '<svg onload=alert("report")>';
  const target = await listen((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; base-uri 'none'; style-src 'unsafe-inline' ${dependency.origin}; script-src 'none'; connect-src 'none'`,
    });
    response.end(
      `<!doctype html><html><head><title>&lt;svg onload=alert(&quot;report&quot;)&gt;</title><style>body{margin:0;background:#fff;color:#111}.signal{padding:48px;background:#eee;font:700 48px system-ui}</style><link rel="stylesheet" href="${dependency.origin}/signal.css"></head><body><main class="signal">Synthetic dependency signal</main><p>This target is owned by the test.</p></body></html>`,
    );
  });
  return {
    origin: target.origin,
    dependencyOrigin: dependency.origin,
    title,
    async close() {
      await Promise.all(
        [target.server, dependency.server].map(
          (server) =>
            new Promise<void>((resolve) => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
      );
    },
  };
}
