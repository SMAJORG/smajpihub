import { test, expect, type Page, type Locator } from '@playwright/test';

const banners = ['Electronics', 'Fashion', 'Home'].map((title, order) => ({
  _id: String(order), placement: 'store', title, subtitle: 'Shop now', label: 'SMAJ Store',
  image: `/missing-store-banner-${order}.png`, search: title, textColor: '#ffffff', active: true, order,
}));
async function openStore(page: Page, language: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(language => localStorage.setItem('smaj_language', language), language);
  await page.route('**/user', route => route.fulfill({ json: { user: null } }));
  await page.route('**/marketplace/**', route => route.fulfill({ json: { products: [], latest: [], recommended: [], savedIds: [] } }));
  await page.route('**/hero-banners*', route => route.fulfill({ json: { managed: true, banners } }));
  await page.route('**/missing-store-banner-*', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/tests/store.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('.storefront-hero-slide')).toHaveCount(3);
}
async function withinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}
for (const language of ['en', 'ar']) {
  for (const width of [320, 390, 768, 1440]) {
    test(`${language} store header, filters and banner fit at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await openStore(page, language);
      const search = page.locator(width < 1024 ? '.storefront-mobile-search input' : '.storefront-header-main input');
      await withinViewport(page, search);
      await expect(search).not.toHaveAttribute('placeholder', '');
      await expect(page.locator('.storefront-search-suggestion')).toHaveCount(0);
      if (width < 1024) {
        const positions = await page.locator('.storefront-mobile-top').evaluate(header => [
          '.storefront-mobile-menu-button', '.storefront-mobile-logo', '.storefront-mobile-environment-badge',
          '.storefront-mobile-actions .storefront-cart-link', '.storefront-avatar-link',
        ].map(selector => header.querySelector(selector)!.getBoundingClientRect().x));
        for (let index = 1; index < positions.length; index++) expect(positions[index]).toBeGreaterThan(positions[index - 1]);
      }
      await page.locator('.storefront-header').screenshot({ path: testInfo.outputPath('store-header.png'), animations: 'disabled' });
      await search.fill('Samsung Galaxy S21 Ultra 5G');
      await expect(search).toHaveValue('Samsung Galaxy S21 Ultra 5G');
      await search.clear();
      for (const menu of await page.locator('.storefront-tool-menu').all()) {
        await menu.locator('.storefront-tool-trigger').click();
        await withinViewport(page, menu.locator('.storefront-tool-panel'));
        await page.keyboard.press('Escape');
        await expect(menu.locator('.storefront-tool-panel')).toHaveCount(0);
      }
      for (let index = 0; index < banners.length; index++) {
        await page.locator('.storefront-hero-dots button').nth(index).click();
        const heading = page.locator('.storefront-hero-slide h1').nth(index);
        await expect.poll(async () => {
          const headingBox = await heading.boundingBox(), heroBox = await page.locator('.storefront-hero').boundingBox();
          return !!headingBox && !!heroBox && headingBox.x >= heroBox.x - 1 && headingBox.x + headingBox.width <= heroBox.x + heroBox.width + 1;
        }).toBe(true);
        await expect(heading).not.toBeEmpty();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
  test(`${language} category drawer stays visible and supports keyboard dismissal`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStore(page, language);
    const button = page.locator('.storefront-mobile-menu-button');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.getByRole('dialog');
    await withinViewport(page, dialog);
    await dialog.locator('section:not([inert]) nav button').first().click();
    await expect(dialog.locator('section:not([inert]) nav button')).toHaveCount(7);
    await expect.poll(async () => {
      const box = await dialog.locator('section:not([inert])').boundingBox();
      return !!box && box.x >= -1 && box.x + box.width <= 391;
    }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
}
