const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
} catch {}

test(
  "profile country and language dropdowns stay anchored and usable on desktop and mobile",
  { skip: !playwright, timeout: 600000 },
  async () => {
    const root = path.resolve("frontend");
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "smaj-profile-dropdowns-"));
    const authStub = `
      export function useAuthContext() {
        return {
          user: window.fixture.user,
          updateProfile: async value => {
            window.fixture.user = { ...window.fixture.user, ...value };
            return window.fixture.user;
          },
        };
      }
    `;
    const trustBadgeStub = `export default function TrustBadge() { return null; }`;

    await require("esbuild").build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { createBrowserRouter, RouterProvider } from 'react-router-dom';
          import ProfilePage from './src/pages/private/ProfilePage';
          import './src/design-tokens.css';
          import './src/index.css';
          const router = createBrowserRouter([{
            path: '/profile',
            element: <div className="private-shell"><div className="private-body"><div className="private-content"><ProfilePage /></div></div></div>,
          }]);
          createRoot(document.getElementById('root')).render(<RouterProvider router={router} />);
        `,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      absWorkingDir: root,
      alias: { "@mui/styled-engine": "@mui/styled-engine-sc" },
      outfile: path.join(output, "fixture.js"),
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      external: ["/assets/*", "/chat-doodles.svg"],
      define: { "import.meta.env": JSON.stringify({ MODE: "test" }), "process.env.NODE_ENV": '"test"' },
      plugins: [{
        name: "profile-dropdown-fixtures",
        setup(build) {
          build.onResolve({ filter: /AuthContext$/ }, () => ({ path: "auth", namespace: "fixture" }));
          build.onResolve({ filter: /TrustBadge$/ }, () => ({ path: "trust-badge", namespace: "fixture" }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: key }) => ({
            contents: key === "auth" ? authStub : trustBadgeStub,
            resolveDir: root,
            loader: "tsx",
          }));
        },
      }],
    });

    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/profile") {
        response.setHeader("Content-Type", "text/html");
        return response.end(`
          <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <link rel="stylesheet" href="/fixture.css"><div id="root"></div>
          <script>
            window.__ENV = { apiBaseURL: location.origin };
            window.fixture = { user: {
              uid: "profile-test-user", username: "ProfileTest", piUsername: "ProfileTest",
              displayName: "Profile Test", country: "", language: "English", role: "buyer",
              settings: { language: "English" }, createdAt: new Date().toISOString()
            } };
          </script><script src="/fixture.js"></script>
        `);
      }
      if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css") {
        response.setHeader("Content-Type", url.pathname.endsWith(".js") ? "application/javascript" : "text/css");
        return response.end(fs.readFileSync(path.join(output, url.pathname.slice(1))));
      }
      if (url.pathname === "/user/stats") {
        response.setHeader("Content-Type", "application/json");
        return response.end(JSON.stringify({ stats: { totalProducts: 0, successfulOrders: 0 } }));
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await playwright.firefox.launch({ headless: true });

    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const device of [
        { name: "desktop", viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
        { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      ]) {
        const context = await browser.newContext({ viewport: device.viewport });
        const page = await context.newPage();
        await page.goto(`${base}/profile`);
        await page.getByRole("button", { name: "Edit Profile", exact: true }).click();

        const countryTrigger = page.locator(".country-picker-trigger");
        const languageTrigger = page.locator(".language-picker-trigger");
        const a = await countryTrigger.boundingBox();
        const b = await languageTrigger.boundingBox();
        const triggersDoNotOverlap = Boolean(a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y));
        assert.equal(triggersDoNotOverlap, true, `${device.name}: picker fields overlap`);

        await countryTrigger.click();
        const countryPanel = page.locator(".country-picker-panel");
        await countryPanel.waitFor({ state: "visible" });
        const checkPanelBounds = async panel => panel.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const viewport = window.visualViewport;
          const right = (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth);
          const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            viewportRight: right,
            viewportBottom: bottom,
            zIndex: Number(getComputedStyle(element).zIndex),
            maxHeight: parseFloat(getComputedStyle(element).maxHeight),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });
        let panelBounds = await checkPanelBounds(countryPanel);
        assert.ok(panelBounds.left >= 0 && panelBounds.right <= panelBounds.viewportRight, `${device.name}: country panel horizontal overflow`);
        assert.ok(panelBounds.top >= 0 && panelBounds.bottom <= panelBounds.viewportBottom, `${device.name}: country panel is outside the visible viewport`);
        assert.ok(panelBounds.zIndex > 45, `${device.name}: picker is behind the app navigation`);
        assert.ok(panelBounds.scrollWidth <= panelBounds.clientWidth, `${device.name}: page has horizontal overflow`);

        const countrySearch = countryPanel.getByPlaceholder("Search country or scroll...");
        await countrySearch.fill("Nigeria");
        await countryPanel.getByRole("button", { name: /Nigeria/ }).click();
        await expectText(countryTrigger, "Nigeria");
        await languageTrigger.click();
        const languagePanel = page.locator(".language-picker-panel");
        await languagePanel.waitFor({ state: "visible" });
        if (device.isMobile) {
          await page.setViewportSize({ width: 390, height: 440 });
          await page.waitForTimeout(100);
          const languageBounds = await checkPanelBounds(languagePanel);
          assert.ok(languageBounds.top >= 0 && languageBounds.bottom <= languageBounds.viewportBottom, "mobile keyboard-open viewport clips language panel");
          assert.ok(languageBounds.scrollWidth <= languageBounds.clientWidth, "mobile language panel introduces horizontal overflow");
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(100);
        }
        const languageSearch = languagePanel.getByPlaceholder("Search language...");
        await languageSearch.fill("French");
        await languagePanel.getByRole("button", { name: /French/ }).click();
        await expectText(languageTrigger, "French");

        await countryTrigger.click();
        await countryPanel.waitFor({ state: "visible" });
        await countryPanel.getByPlaceholder("Search country or scroll...").fill("");
        const countryList = countryPanel.locator(":scope > div");
        const countryScroll = await countryList.evaluate(element => {
          element.scrollTop = element.scrollHeight;
          return { top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight };
        });
        assert.ok(countryScroll.height > countryScroll.client && countryScroll.top > 0, `${device.name}: country list did not scroll`);

        if (device.isMobile) {
          await page.setViewportSize({ width: 390, height: 440 });
          await page.waitForTimeout(100);
          panelBounds = await checkPanelBounds(countryPanel);
          assert.ok(panelBounds.top >= 0 && panelBounds.bottom <= panelBounds.viewportBottom, "mobile keyboard-open viewport clips country panel");
          assert.ok(panelBounds.maxHeight <= 420, "mobile country panel exceeds its viewport cap");
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(100);
          panelBounds = await checkPanelBounds(countryPanel);
          assert.ok(panelBounds.top >= 0 && panelBounds.bottom <= panelBounds.viewportBottom, "mobile keyboard-close viewport clips country panel");
          assert.ok(panelBounds.scrollWidth <= panelBounds.clientWidth, "mobile keyboard resize introduces horizontal overflow");
        }

        await context.close();
      }
      await browser.close();
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(output, { recursive: true, force: true });
    } catch (error) {
      await browser.close().catch(() => undefined);
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(output, { recursive: true, force: true });
      throw error;
    }
  },
);

async function expectText(locator, text) {
  const actual = (await locator.innerText()).replace(/\s+/g, " ").trim();
  assert.ok(actual.includes(text), `Expected "${actual}" to contain "${text}"`);
}
