import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { hostileTitleTarget } from './fixtures';

type CaptureRequest = { origin: string; path: string; status: number | null; failed: boolean };

test('local demo discovers a real dependency and captures an actual blocked-origin rehearsal', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use demo', exact: true }).click();
  const inspection = page.waitForResponse(
    (response) => response.url().endsWith('/api/inspect') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Inspect target', exact: true }).click();
  const inspected = await inspection;
  expect(inspected.status()).toBe(200);
  const inspectedData = await inspected.json();
  expect(
    inspectedData.snapshot.requests.some(
      (request: CaptureRequest) =>
        request.origin === 'http://localhost:4173' &&
        request.path === '/demo-assets/map.svg' &&
        request.status === 200 &&
        !request.failed,
    ),
  ).toBeTruthy();
  const services = page.getByTestId('service-list');
  await expect(services).toContainText('localhost', { timeout: 40_000 });
  const selectable = services.getByRole('checkbox', { name: /localhost:4173/ });
  await selectable.check();
  await page.getByRole('button', { name: 'Run rehearsal', exact: true }).click();
  await expect(page.getByTestId('experiment-image')).toBeVisible({ timeout: 60_000 });
  const baseline = await page.getByTestId('baseline-image').getAttribute('src');
  const experiment = await page.getByTestId('experiment-image').getAttribute('src');
  expect(baseline).toMatch(/^data:image\/png;base64,/);
  expect(experiment).toMatch(/^data:image\/png;base64,/);
  expect(experiment).not.toBe(baseline);
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const jsonFile = await jsonDownload;
  const report = JSON.parse(await readFile((await jsonFile.path())!, 'utf8'));
  expect(report.blockedOrigins).toContain('http://localhost:4173');
  expect(
    report.baseline.requests.some(
      (request: CaptureRequest) =>
        request.origin === 'http://localhost:4173' &&
        request.path === '/demo-assets/map.svg' &&
        request.status === 200 &&
        !request.failed,
    ),
  ).toBeTruthy();
  expect(
    report.experiment.requests.some(
      (request: CaptureRequest) => request.origin === 'http://localhost:4173' && request.failed,
    ),
  ).toBeTruthy();
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save HTML report', exact: true }).click();
  const htmlFile = await htmlDownload;
  const html = await readFile((await htmlFile.path())!, 'utf8');
  expect(html).toContain('data:image/png;base64,');
  expect(html).not.toMatch(/<script\b/i);
  await page.screenshot({ path: 'docs/assets/workspace.png', fullPage: true });
  await selectable.uncheck();
  await expect(page.getByRole('button', { name: 'Save JSON', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save HTML report', exact: true })).toBeDisabled();
  await page.getByLabel('Target URL', { exact: true }).fill('http://127.0.0.1:4173/demo?changed=1');
  await expect(page.getByRole('button', { name: 'Run rehearsal', exact: true })).toBeDisabled();
  await expect(services.getByRole('checkbox')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('target-controlled titles stay inert in exported reports and query data is omitted', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fixture = await hostileTitleTarget();
  try {
    await page.goto('/');
    await expect(page.getByText('Test browser ready', { exact: true })).toBeVisible();
    const targetUrl = `${fixture.origin}/?token=fixture-only#fragment`;
    await page.getByLabel('Target URL', { exact: true }).fill(targetUrl);
    await page.getByRole('button', { name: 'Inspect target', exact: true }).click();
    const dependency = page
      .getByTestId('service-list')
      .getByRole('checkbox', { name: `Block ${fixture.dependencyOrigin}`, exact: true });
    await expect(dependency).toBeVisible({ timeout: 40_000 });
    await dependency.check();
    const rehearsalResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/rehearse') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Run rehearsal', exact: true }).click();
    const rehearsed = await rehearsalResponse;
    expect(rehearsed.status()).toBe(200);
    expect(rehearsed.request().postDataJSON().url).toBe(targetUrl);
    await expect(page.getByTestId('experiment-image')).toBeVisible({ timeout: 60_000 });
    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
    const jsonFile = await jsonDownload;
    const json = await readFile((await jsonFile.path())!, 'utf8');
    const report = JSON.parse(json);
    expect(report.baseline.title).toBe(fixture.title);
    expect(report.targetUrl).toBe(`${fixture.origin}/`);
    expect(json).not.toContain('fixture-only');
    const htmlDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save HTML report', exact: true }).click();
    const htmlFile = await htmlDownload;
    const html = await readFile((await htmlFile.path())!, 'utf8');
    expect(html).toContain('&lt;svg onload=alert(');
    expect(html).not.toMatch(/<script\b|<svg\s+onload/i);
    const exported = await page.context().newPage();
    const dialogs: string[] = [];
    exported.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await exported.setContent(html);
    await expect(exported.getByText(fixture.title, { exact: true }).first()).toBeVisible();
    await expect(exported.locator('[onload], [onerror], script')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await exported.close();
  } finally {
    await fixture.close();
  }
});

test('API rejects cross-site calls and unsafe URLs before launching a target', async ({
  request,
}) => {
  const cross = await request.post('/api/inspect', {
    data: { url: 'http://127.0.0.1:4173/demo' },
    headers: { Origin: 'https://unrelated.invalid', 'X-Blackout-Lab': '1' },
  });
  expect(cross.status()).toBe(403);
  const missing = await request.post('/api/inspect', {
    data: { url: 'http://127.0.0.1:4173/demo' },
  });
  expect(missing.status()).toBe(403);
  const unsafe = await request.post('/api/inspect', {
    data: { url: 'file:///private' },
    headers: { 'X-Blackout-Lab': '1' },
  });
  expect(unsafe.status()).toBe(400);
});

test('initial workspace fits a narrow viewport and reports a rejected URL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Inspect target', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-workspace.png', fullPage: true });
  await page.getByLabel('Target URL', { exact: true }).fill('file:///private');
  await page.getByRole('button', { name: 'Inspect target', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/HTTP|HTTPS/i);
});
