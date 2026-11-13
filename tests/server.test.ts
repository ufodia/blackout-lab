import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { startServer } from '../server/app.mjs';

const apps: Awaited<ReturnType<typeof startServer>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const callHeaders = { 'Content-Type': 'application/json', 'X-Blackout-Lab': '1' };
async function fixture(runner = async () => ({ result: 'ok' })) {
  const app = await startServer({ port: 0, runner, ready: async () => true });
  apps.push(app);
  return app;
}

describe('local HTTP API', () => {
  it('reports health and serves the offline target with an alternate local dependency origin', async () => {
    const app = await fixture();
    expect(await (await fetch(`${app.url}/api/health`)).json()).toEqual({
      ok: true,
      browserReady: true,
    });
    const html = await (await fetch(`${app.url}/demo`)).text();
    expect(html).toContain(`http://localhost:${app.port}/demo-assets/widget.js`);
    expect(html).toContain('Atlas');
    expect((await fetch(`${app.url}/demo-assets/map.svg`)).headers.get('content-type')).toContain(
      'image/svg+xml',
    );
    expect((await fetch(`${app.url}/demo`)).headers.get('content-security-policy')).toContain(
      "connect-src 'none'",
    );
    expect(
      (
        await fetch(`${app.url}/demo-assets/style.css`, {
          headers: { Origin: 'http://different.test' },
        })
      ).status,
    ).toBe(200);
  });
  it('validates input before invoking the browser runner', async () => {
    let called = false;
    const app = await fixture(async () => {
      called = true;
      return {};
    });
    const response = await fetch(`${app.url}/api/inspect`, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify({ url: 'file:///private' }),
    });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects foreign Origin and hostile Host headers over actual HTTP', async () => {
    const app = await fixture();
    expect(
      (
        await fetch(`${app.url}/api/inspect`, {
          method: 'POST',
          headers: { ...callHeaders, Origin: 'https://evil.test' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.get(
        `${app.url}/api/health`,
        { headers: { Host: 'attacker.test' } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on('error', reject);
    });
    expect(status).toBe(403);
  });
  it('returns 429 while one operation is active and releases the lock afterwards', async () => {
    let release!: () => void;
    let entered!: () => void;
    const active = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = await fixture(async () => {
      entered();
      await pause;
      return { ok: true };
    });
    const options = {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify({ url: 'https://example.com' }),
    };
    const first = fetch(`${app.url}/api/inspect`, options);
    await active;
    const second = await fetch(`${app.url}/api/inspect`, options);
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('3');
    release();
    expect((await first).status).toBe(200);
    expect((await fetch(`${app.url}/api/inspect`, options)).status).toBe(200);
  });
  it('does not expose internal error messages or paths', async () => {
    const app = await fixture(async () => {
      throw new Error('secret-token in C:\\private');
    });
    const response = await fetch(`${app.url}/api/inspect`, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret-token');
  });
  it('protects the workspace and APIs from recursive inspections', async () => {
    const app = await fixture();
    for (const target of [`${app.url}/`, `${app.url}/api/health`]) {
      const response = await fetch(`${app.url}/api/inspect`, {
        method: 'POST',
        headers: callHeaders,
        body: JSON.stringify({ url: target }),
      });
      expect(response.status).toBe(400);
    }
  });
  it('returns a readable 413 for oversized chunked JSON without resetting the connection', async () => {
    const app = await fixture();
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        `${app.url}/api/inspect`,
        { method: 'POST', headers: callHeaders },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode!, body }));
        },
      );
      req.on('error', reject);
      req.write(JSON.stringify({ url: `https://example.com/${'a'.repeat(20_000)}` }));
      req.end();
    });
    expect(response.status).toBe(413);
    expect(response.body).toContain('16 KiB');
  });
  it('applies the narrow network allowlist only to its own exact built-in fixture', async () => {
    const operations: { allowedOrigins?: string[] }[] = [];
    const app = await fixture(async (operation) => {
      operations.push(operation);
      return { ok: true };
    });
    for (const target of [`${app.url}/demo`, 'https://example.com/demo'])
      await fetch(`${app.url}/api/inspect`, {
        method: 'POST',
        headers: callHeaders,
        body: JSON.stringify({ url: target }),
      });
    expect(operations[0]?.allowedOrigins).toEqual([app.url, `http://localhost:${app.port}`]);
    expect(operations[1]?.allowedOrigins).toBeUndefined();
    expect(
      (
        await fetch(`${app.url}/api/inspect`, {
          method: 'POST',
          headers: callHeaders,
          body: JSON.stringify({ url: `${app.url}/demo/unknown` }),
        })
      ).status,
    ).toBe(400);
  });
});
