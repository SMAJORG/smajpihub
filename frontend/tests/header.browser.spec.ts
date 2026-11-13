import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { platformDefinitions } from '../src/content/platforms';

const codes = ['en', 'fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr'];
const routes = [
  ['/about', '/how-it-works', '/white-paper'],
  ['/services/store', '/services/jobs', '/services/education', '/services/health', '/services'],
  ['/docs', '/download', '/faq'],
  ['/contact', '/onboarding', '/partners'],
];
const routerSource = fs.readFileSync(new URL('../src/Router.tsx', import.meta.url), 'utf8');
const existingRoutes = new Set([
  ...Array.from(routerSource.matchAll(/path:\s*"([^"]+)"/g), match => match[1]),
  ...platformDefinitions.map(platform => `/services/${platform.routeSegment}`),
]);

async function openFixture(page: Page) {
  await page.route('https://**/*', route => route.abort());
  await page.goto('/tests/header.html');
  await expect(page.locator('.smaj-header')).toBeVisible();
}

for (const width of [1024, 1280, 1440, 1920]) {
  test(`one desktop row, all controls and floating panels fit at ${width}px in all languages`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openFixture(page);
    for (const code of codes) {
      await page.locator('.smaj-language-picker select').selectOption(code);
      await expect(page.locator('html')).toHaveAttribute('dir', code === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('.smaj-menu-toggle')).toBeHidden();
      const metrics = await page.locator('.smaj-header').evaluate(header => {
        const selectors = ['.smaj-logo-link', '.smaj-desktop-navigation', '.smaj-auth-search-btn', '.smaj-auth-section > .smaj-login-btn', '.smaj-language-picker', '.smaj-utility-icon-btn'];
        const boxes = selectors.map(selector => header.querySelector(selector)!.getBoundingClientRect());
        const sorted = [...boxes].sort((a, b) => a.left - b.left);
        const labels = Array.from(header.querySelectorAll('.smaj-desktop-trigger > span, .smaj-auth-section .smaj-login-text'));
        const singleLine = labels.every(label => {
          const range = document.createRange(); range.selectNodeContents(label);
          return new Set(Array.from(range.getClientRects()).map(rect => Math.round(rect.top))).size <= 1;
        });
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          inViewport: boxes.every(box => box.width > 0 && box.left >= 0 && box.right <= innerWidth),
          overlap: sorted.some((box, i) => i > 0 && sorted[i - 1].right > box.left + 1),
          sameRow: boxes.every(box => Math.abs((box.top + box.bottom) / 2 - (boxes[0].top + boxes[0].bottom) / 2) < 2),
          singleLine,
        };
      });
      expect(metrics, `${width}px ${code}`).toEqual({ overflow: false, inViewport: true, overlap: false, sameRow: true, singleLine: true });
      const contentTop = await page.locator('#header-test-content').evaluate(el => el.getBoundingClientRect().top);
      for (const group of ['platform', 'services', 'resources', 'company']) {
        await page.locator(`[data-trigger="${group}"]`).click();
        const panel = page.locator(`[data-panel="${group}"]`);
        await expect(panel).toBeVisible();
        await panel.evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
        const panelMetrics = await panel.evaluate(el => {
          const box = el.getBoundingClientRect();
          const trigger = el.parentElement!.querySelector('button')!.getBoundingClientRect();
          const links = Array.from(el.querySelectorAll('a')).map(link => link.getBoundingClientRect());
          return {
            fits: box.left >= 0 && box.right <= innerWidth,
            width: box.width,
            height: box.height,
            aligned: Math.abs(document.dir === 'rtl' ? box.right - trigger.right : box.left - trigger.left) < 1,
            gap: box.top - trigger.bottom,
            vertical: links.every((link, i) => i === 0 || link.top >= links[i - 1].bottom),
            background: getComputedStyle(el).backgroundColor,
          };
        });
        expect(panelMetrics.fits).toBe(true);
        expect(panelMetrics.width).toBeGreaterThanOrEqual(220);
        expect(panelMetrics.width).toBeLessThanOrEqual(260);
        expect(panelMetrics.height).toBeLessThanOrEqual(260);
        expect(panelMetrics.aligned).toBe(true);
        expect(panelMetrics.gap).toBeGreaterThanOrEqual(6);
        expect(panelMetrics.gap).toBeLessThanOrEqual(10);
        expect(panelMetrics.vertical).toBe(true);
        expect(panelMetrics.background).toBe('rgb(255, 255, 255)');
        expect(await page.locator('#header-test-content').evaluate(el => el.getBoundingClientRect().top)).toBe(contentTop);
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
      }
    }
    if (width === 1440) {
      await page.locator('.smaj-language-picker select').selectOption('fr');
      await page.locator('[data-trigger="services"]').click();
      await page.screenshot({ path: testInfo.outputPath('desktop-fr.png') });
    }
  });
}

test('click, outside click, focus, keyboard, navigation, search and theme', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFixture(page);
  const trigger = page.locator('[data-trigger="platform"]');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-panel="platform"] a').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-panel="platform"] a').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('[data-panel="platform"] a').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-panel="platform"] a').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-trigger="services"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-panel="services"]')).toBeVisible();
  await page.locator('#outside').click();
  await expect(page.locator('[data-panel="services"]')).toBeHidden();
  await trigger.click();
  await page.locator('.smaj-language-picker select').focus();
  await expect(page.locator('[data-panel="platform"]')).toBeHidden();
  for (const [index, group] of ['platform', 'services', 'resources', 'company'].entries()) {
    for (const route of routes[index]) {
      expect(existingRoutes.has(route), `Existing route ${route}`).toBe(true);
      await page.locator(`[data-trigger="${group}"]`).click();
      await page.locator(`[data-panel="${group}"] a[href="${route}"]`).click();
      await expect(page.getByTestId('route')).toHaveText(route);
      await expect(page.locator('.smaj-mega-menu:visible')).toHaveCount(0);
    }
  }
  await page.locator('.smaj-auth-search-btn').click();
  await expect(page.locator('.smaj-public-search-mobile-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.smaj-utility-icon-btn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await trigger.click();
  await expect(page.locator('[data-panel="platform"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.smaj-language-picker select').selectOption('ar');
  await trigger.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-trigger="services"]')).toBeFocused();
});

test('mobile and tablet retain the original drawer and preferences', async ({ page }) => {
  await openFixture(page);
  for (const width of [390, 768, 1023]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.smaj-desktop-navigation')).toBeHidden();
    await page.locator('.smaj-menu-toggle').click();
    await expect(page.locator('.smaj-nav')).toBeVisible();
    await expect(page.locator('.smaj-nav a[href="/home"]')).toBeVisible();
    await expect(page.locator('.smaj-mobile-language-select')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.smaj-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  }
});
