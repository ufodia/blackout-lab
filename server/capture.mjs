import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { groupServices, HttpError, isBlockedOrigin, redactUrl } from './guards.mjs';

const REQUEST_LIMIT = 500;
const OBSERVATION_MS = 1_200;
const NAVIGATION_MS = 10_000;
const OPERATION_MS = 45_000;

export async function browserReady() {
  try {
    await access(chromium.executablePath());
    return true;
  } catch {
    return false;
  }
}

function throwIfAborted(signal) {
  if (signal.aborted)
    throw new HttpError(
      504,
      'The operation ended before it could finish. Try a smaller or faster page.',
    );
}

async function capture(browser, url, blockedOrigins, signal, allowedOrigins) {
  throwIfAborted(signal);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    acceptDownloads: false,
    ignoreHTTPSErrors: false,
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const stop = () => {
    void context.close().catch(() => {});
  };
  signal.addEventListener('abort', stop, { once: true });
  const records = [];
  const byRequest = new WeakMap();
  const errors = [];
  let overflow = false;
  let outsideFixtureRequests = 0;
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(NAVIGATION_MS);
    page.on('popup', (popup) => {
      void popup.close().catch(() => {});
    });
    page.on('dialog', (dialog) => {
      void dialog.dismiss().catch(() => {});
    });
    page.on('pageerror', (error) => {
      const name = /^[A-Za-z]{1,30}$/.test(error.name) ? error.name : 'Error';
      if (errors.length < 20)
        errors.push(`Page JavaScript error (${name}); message omitted to protect page data.`);
    });
    context.on('request', (request) => {
      let parsed;
      try {
        parsed = new URL(request.url());
      } catch {
        return;
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || records.length >= REQUEST_LIMIT) return;
      if (allowedOrigins && !allowedOrigins.includes(parsed.origin)) {
        outsideFixtureRequests++;
        return;
      }
      const record = {
        origin: parsed.origin,
        path: parsed.pathname.slice(0, 1000),
        type: request.resourceType(),
        status: null,
        failed: false,
      };
      records.push(record);
      byRequest.set(request, record);
    });
    context.on('response', (response) => {
      const record = byRequest.get(response.request());
      if (record) record.status = response.status();
    });
    context.on('requestfailed', (request) => {
      const record = byRequest.get(request);
      if (record) record.failed = true;
    });
    let routeCount = 0;
    if (allowedOrigins)
      await context.routeWebSocket('**/*', (socket) => {
        outsideFixtureRequests++;
        void socket
          .close({ code: 1008, reason: 'Built-in fixture network boundary' })
          .catch(() => {});
      });
    await context.route('**/*', async (route) => {
      const request = route.request();
      routeCount++;
      let scheme;
      try {
        scheme = new URL(request.url()).protocol;
      } catch {
        scheme = '';
      }
      if (routeCount > REQUEST_LIMIT) {
        overflow = true;
        await route.abort('blockedbyclient');
        return;
      }
      if (
        !['http:', 'https:'].includes(scheme) ||
        isBlockedOrigin(request.url(), blockedOrigins) ||
        (allowedOrigins && !allowedOrigins.includes(new URL(request.url()).origin))
      ) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    let status = null;
    try {
      const response = await page.goto(url.href, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_MS,
      });
      status = response?.status() ?? null;
    } catch (error) {
      throwIfAborted(signal);
      errors.push(
        error?.name === 'TimeoutError'
          ? 'Navigation timed out after 10 seconds; this snapshot is partial.'
          : 'Navigation failed. Check the URL, application availability and TLS certificate; this snapshot may be partial.',
      );
    }
    // A documented fixed observation window includes common deferred widgets.
    // It deliberately does not promise to observe all future page activity.
    try {
      await page.waitForTimeout(OBSERVATION_MS);
    } catch {
      throwIfAborted(signal);
    }
    let title = '';
    let finalOrigin = url.origin;
    let screenshot;
    try {
      title = (await page.title()).slice(0, 200);
    } catch {
      errors.push('The document title could not be read.');
    }
    try {
      const current = new URL(page.url());
      if (['http:', 'https:'].includes(current.protocol)) finalOrigin = current.origin;
    } catch {
      /* Keep the initial origin for an unavailable page. */
    }
    try {
      screenshot = `data:image/png;base64,${(await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', timeout: 5_000 })).toString('base64')}`;
    } catch {
      throwIfAborted(signal);
      throw new HttpError(
        502,
        'Screenshot capture failed. Try the page again; no image was generated.',
      );
    }
    if (overflow)
      errors.push('The 500-request budget was reached; subsequent requests were aborted.');
    if (outsideFixtureRequests)
      errors.push(
        `${outsideFixtureRequests} browser requests outside this built-in fixture were blocked and omitted from its report.`,
      );
    return { snapshot: { title, status, screenshot, requests: records, errors }, finalOrigin };
  } finally {
    signal.removeEventListener('abort', stop);
    await context.close().catch(() => {});
  }
}

/** One browser per operation; independent, ephemeral contexts for each view. */
export async function runOperation({
  kind,
  url,
  blockedOrigins = [],
  signal: externalSignal,
  allowedOrigins,
}) {
  const started = performance.now();
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(OPERATION_MS)])
    : AbortSignal.timeout(OPERATION_MS);
  throwIfAborted(signal);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true, timeout: 10_000 });
  } catch {
    throw new HttpError(
      503,
      'Chromium could not start. Run npx playwright install --no-shell chromium, then restart Blackout Lab.',
    );
  }
  const close = () => {
    void browser.close().catch(() => {});
  };
  signal.addEventListener('abort', close, { once: true });
  try {
    const baseline = await capture(browser, url, [], signal, allowedOrigins);
    const firstPartyOrigins = [...new Set([url.origin, baseline.finalOrigin])];
    const services = groupServices(baseline.snapshot.requests, firstPartyOrigins);
    if (kind === 'inspect') {
      return {
        targetUrl: redactUrl(url.href),
        services,
        snapshot: baseline.snapshot,
        elapsedMs: Math.round(performance.now() - started),
      };
    }
    if (blockedOrigins.some((origin) => firstPartyOrigins.includes(origin))) {
      throw new HttpError(
        400,
        'The main application origin, including its redirect destination, cannot be blocked.',
      );
    }
    // Only origins actually seen during this fresh baseline can be selected.
    if (blockedOrigins.some((origin) => !services.some((service) => service.origin === origin))) {
      throw new HttpError(
        400,
        'A selected dependency was not observed in the current baseline. Inspect the page again.',
      );
    }
    const experiment = await capture(browser, url, blockedOrigins, signal, allowedOrigins);
    return {
      targetUrl: redactUrl(url.href),
      blockedOrigins,
      baseline: baseline.snapshot,
      experiment: experiment.snapshot,
      services,
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    signal.removeEventListener('abort', close);
    await browser.close().catch(() => {});
  }
}
