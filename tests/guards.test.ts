import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import {
  assertRequestGuard,
  BODY_LIMIT,
  groupServices,
  isAllowedHost,
  isBlockedOrigin,
  readJson,
  redactUrl,
  validateBlockedOrigins,
  validateTarget,
} from '../server/guards.mjs';

describe('target and origin boundaries', () => {
  it('accepts local HTTP and public HTTPS with routing query/fragment for navigation', () => {
    expect(validateTarget('http://localhost:3000/dashboard?preview=1#view').href).toBe(
      'http://localhost:3000/dashboard?preview=1#view',
    );
    expect(validateTarget('https://example.com').origin).toBe('https://example.com');
  });
  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:secret@example.com',
    'https://example.com/has space',
    'not a URL',
  ])('rejects unsafe target %s', (input) => {
    expect(() => validateTarget(input)).toThrow();
  });
  it('removes query, hash and userinfo from returned URLs', () => {
    expect(redactUrl('https://user:secret@example.com/account?token=private#secret')).toBe(
      'https://example.com/account',
    );
  });
  it('matches exact origins, never substrings, sibling subdomains or other ports', () => {
    const blocked = ['https://cdn.example.com', 'http://localhost:6000'];
    expect(isBlockedOrigin('https://cdn.example.com/font.woff?secret=1', blocked)).toBe(true);
    expect(isBlockedOrigin('https://cdn.example.com.evil.test/a', blocked)).toBe(false);
    expect(isBlockedOrigin('https://example.com/a', blocked)).toBe(false);
    expect(isBlockedOrigin('http://localhost:6001/a', blocked)).toBe(false);
  });
  it('deduplicates valid origins and refuses blocking the main app or a path', () => {
    expect(
      validateBlockedOrigins(['https://cdn.test', 'https://cdn.test/'], 'https://app.test'),
    ).toEqual(['https://cdn.test']);
    expect(() => validateBlockedOrigins(['https://app.test'], 'https://app.test')).toThrow(
      /main application/,
    );
    expect(() => validateBlockedOrigins(['https://cdn.test/file.js'], 'https://app.test')).toThrow(
      /origins/,
    );
    expect(() => validateBlockedOrigins([], 'https://app.test')).toThrow();
  });
});

describe('local request guards', () => {
  const headers = {
    host: '127.0.0.1:5173',
    origin: 'http://127.0.0.1:5173',
    'content-type': 'application/json',
    'x-blackout-lab': '1',
  };
  it('permits only exact loopback names and listening port', () => {
    expect(isAllowedHost('127.0.0.1:5173', 5173)).toBe(true);
    expect(isAllowedHost('localhost:5173', 5173)).toBe(true);
    for (const host of [
      'evil.test:5173',
      'localhost.evil.test:5173',
      '127.0.0.1:80',
      'user@localhost:5173',
      '[::1]:5173',
    ])
      expect(isAllowedHost(host, 5173)).toBe(false);
  });
  it('accepts same-origin browser calls and intentional header-bearing CLI calls', () => {
    expect(() => assertRequestGuard({ method: 'POST', headers }, 5173)).not.toThrow();
    expect(() =>
      assertRequestGuard({ method: 'POST', headers: { ...headers, origin: undefined } }, 5173),
    ).not.toThrow();
  });
  it('blocks cross-site requests, missing custom headers and form bodies', () => {
    for (const changed of [
      { origin: 'https://evil.test' },
      { 'sec-fetch-site': 'cross-site' },
      { 'x-blackout-lab': undefined },
      { 'content-type': 'text/plain' },
      { host: 'evil.test:5173' },
    ]) {
      expect(() =>
        assertRequestGuard({ method: 'POST', headers: { ...headers, ...changed } }, 5173),
      ).toThrow();
    }
  });
  it('permits cross-origin GET only for an explicitly designated public fixture asset', () => {
    const request = {
      method: 'GET',
      headers: {
        host: 'localhost:5173',
        origin: 'http://127.0.0.1:5173',
        'sec-fetch-site': 'cross-site',
      },
    };
    expect(() => assertRequestGuard(request, 5173)).toThrow();
    expect(() => assertRequestGuard(request, 5173, { publicFixtureAsset: true })).not.toThrow();
    expect(() =>
      assertRequestGuard({ ...request, method: 'POST' }, 5173, { publicFixtureAsset: true }),
    ).toThrow();
  });
});

describe('bounded body parsing', () => {
  function stream(body: string, contentLength?: string) {
    const request = Readable.from([Buffer.from(body)]) as Readable & {
      headers: Record<string, string>;
    };
    request.headers = contentLength ? { 'content-length': contentLength } : {};
    return request;
  }
  it('reads valid objects and rejects malformed JSON and arrays', async () => {
    await expect(readJson(stream('{"url":"https://example.com"}'))).resolves.toEqual({
      url: 'https://example.com',
    });
    await expect(readJson(stream('{oops'))).rejects.toThrow(/valid JSON/);
    await expect(readJson(stream('[]'))).rejects.toThrow(/object/);
  });
  it('enforces advertised and streamed 16 KiB limits', async () => {
    await expect(readJson(stream('{}', String(BODY_LIMIT + 1)))).rejects.toThrow(/16 KiB/);
    await expect(readJson(stream('x'.repeat(BODY_LIMIT + 1)))).rejects.toThrow(/16 KiB/);
  });
});

describe('service reports', () => {
  it('groups by exact origin, labels first party and never retains query values', () => {
    const requests = [
      { origin: 'https://app.test', path: '/', type: 'document', status: 200, failed: false },
      { origin: 'https://cdn.test', path: '/one.js', type: 'script', status: 200, failed: false },
      { origin: 'https://cdn.test', path: '/font.woff', type: 'font', status: 200, failed: false },
    ];
    expect(groupServices(requests, ['https://app.test'])).toEqual([
      {
        origin: 'https://app.test',
        hostname: 'app.test',
        requestCount: 1,
        resourceTypes: ['document'],
        firstParty: true,
      },
      {
        origin: 'https://cdn.test',
        hostname: 'cdn.test',
        requestCount: 2,
        resourceTypes: ['font', 'script'],
        firstParty: false,
      },
    ]);
  });
});
