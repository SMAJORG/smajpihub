import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const codes = ['en', 'fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr'];
const save = (code: string) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${code}.json`, import.meta.url), 'utf8')).Save;
async function select(page: Page, code: string) {
  await page.locator('.language-soon-button').click();
  await expect(page.locator('.language-choice-dialog option')).toHaveCount(10);
  await page.locator('.language-choice-dialog select').selectOption(code);
  await page.keyboard.press('Escape');
}
test('all languages switch immediately, preserve input, and persist after refresh', async ({ page }) => {
  await page.goto('/tests/localization.html');
  await page.locator('#preserved-input').fill('My unchanged form value');
  const marker = await page.evaluate(() => { (window as unknown as Record<string, unknown>).navigationMarker = 'retained'; return 'retained'; });
  for (const code of codes) {
    await select(page, code);
    await expect(page.locator('#sample-button')).toHaveText(save(code));
    await expect(page.locator('#sample-button')).toHaveAttribute('title', save(code));
    await expect(page.locator('#preserved-input')).toHaveValue('My unchanged form value');
    await expect(page.locator('#original')).toHaveText('Save');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).navigationMarker)).toBe(marker);
    await expect(page.locator('html')).toHaveAttribute('dir', code === 'ar' ? 'rtl' : 'ltr');
  }
  await page.reload();
  await expect(page.locator('#sample-button')).toHaveText(save('tr'));
});
test('Arabic detects on first paint and fits mobile and desktop', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ar-AE', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/tests/localization.html');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#sample-button')).toHaveText(save('ar'));
  await page.locator('.language-soon-button').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await select(page, 'en');
  await expect(page.locator('#sample-button')).toHaveText('Save');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
test('dynamic failure stays original with a visible failure label', async ({ page }) => {
  await page.route('**/translations/batch', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'unavailable', code: 'translation_not_configured' }) }));
  await page.goto('/tests/localization.html');
  await select(page, 'fr');
  await page.locator('#dynamic button').click();
  await expect(page.locator('#dynamic [role=status]')).toBeVisible();
  await expect(page.locator('#dynamic [translate=no]')).toHaveText('A private product description.');
});
test('dynamic success is opt-in and show-original restores the exact source', async ({ page }) => {
  let count = 0;
  await page.route('**/translations/batch', route => { count++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'translated', translations: ['Une description privée du produit.'] }) }); });
  await page.goto('/tests/localization.html');
  await select(page, 'fr'); expect(count).toBe(0);
  await page.locator('#dynamic button').click();
  await expect(page.locator('#dynamic [translate=no]')).toHaveText('Une description privée du produit.');
  await page.locator('#dynamic button').click();
  await expect(page.locator('#dynamic [translate=no]')).toHaveText('A private product description.');
});
