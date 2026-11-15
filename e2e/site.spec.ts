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
