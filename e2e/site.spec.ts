import { test, expect } from '@playwright/test';

test('public installation site explains local setup and links to source', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what breaks');
  await expect(page.getByRole('link', { name: /GitHub/i }).first()).toHaveAttribute(
    'href',
    'https://github.com/ufodia/blackout-lab',
  );
  await page.getByRole('link', { name: 'Run locally', exact: true }).first().click();
  await expect(page).toHaveURL(/#install$/);
  await expect(page.locator('#install')).toBeVisible();
});

test('illustration text has sufficient contrast against its gradient and SVG panels', async ({
  page,
}) => {
  await page.goto('/');
  const ratios = await page.evaluate(() => {
    const rgb = (value: string) =>
      value.startsWith('#')
        ? [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
        : value
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number);
    const lum = (value: string) =>
      rgb(value)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a: string, b: string) => {
      const [lo, hi] = [lum(a), lum(b)].sort((a, b) => a - b);
      return (hi + 0.05) / (lo + 0.05);
    };
    const art = document.querySelector('.experiment-art')!;
    const stops = getComputedStyle(art).backgroundImage.match(/rgb\([^)]+\)/g)!;
    const text = ['.art-label>span:last-child', '.experiment-art>p'].map(
      (selector) => getComputedStyle(document.querySelector(selector)!).color,
    );
    const values = text.flatMap((fg) => stops.map((bg) => ratio(fg, bg)));
    const panel = document.querySelector('.circuit-art rect[x="27"]')!.getAttribute('fill')!;
    document
      .querySelectorAll('.circuit-art text[y="94"]')
      .forEach((el) => values.push(ratio(el.getAttribute('fill')!, panel)));
    return values;
  });
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
