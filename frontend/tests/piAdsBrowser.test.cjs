const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium } = require('../node_modules/@playwright/test');
test('dashboard Pi ad placement: themes, layout, privacy, SDK handoff and navigation cancellation', { timeout: 180000 }, async () => {
  const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-pi-ads-'));
  await require('esbuild').build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';import Ad from './src/components/PiDashboardAd';import Cookies from './src/components/CookieConsent';import './src/index.css';import './src/design-tokens.css';function Fixture(){window.go=useNavigate();return <><a href='/store'>Store navigation</a><Routes><Route path='/dashboard' element={<Ad/>}/><Route path='/store' element={<h1>Store</h1>}/></Routes><Cookies/></>};createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/dashboard']}><Fixture/></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    outfile: path.join(output, 'fixture.js'), bundle: true, jsx: 'automatic', external: ['/assets/*', '/chat-doodles.svg'],
    define: { 'import.meta.env': JSON.stringify({ MODE: 'public', VITE_PI_ADS_ENABLED: 'true' }), 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'boundaries', setup(build) {
      build.onResolve({ filter: /\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      build.onResolve({ filter: /\/capacitorPiAuth$/ }, () => ({ path: 'native', namespace: 'fixture' }));
      build.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: 'icon', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'auth' ? `export const useAuthContext=()=>({user:{uid:'fixture-user'},isLoading:false,showSignIn:false});` : name === 'native' ? 'export const isCapacitorNative=()=>false;' : 'export default function Icon(){return null;}' }));
    } }], logLevel: 'silent',
  });
  const server = http.createServer((req, res) => {
    const asset = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : null;
    res.setHeader('Content-Type', asset?.endsWith('.js') ? 'text/javascript' : asset ? 'text/css' : 'text/html');
    res.end(asset ? fs.readFileSync(path.join(output, asset)) : '<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript(({ theme }) => {
        Object.defineProperty(navigator, 'userAgent', { value: 'PiBrowser/1.0' });
        localStorage.setItem('smaj_public_theme', theme);
        localStorage.setItem('smaj_cookie_consent_v1', JSON.stringify({ necessary: true, marketing: true, analytics: false, preferences: false, expiresAt: Date.now() + 86400000 }));
        window.calls = []; window.nextReady = true;
        window.Pi = {
          init: options => { window.calls.push(['init', options]); },
          nativeFeaturesList: async () => ['ad_network'],
          Ads: {
            isAdReady: async type => { window.calls.push(['ready', type]); return { type, ready: window.nextReady }; },
            requestAd: type => { window.calls.push(['request', type]); return new Promise(resolve => { window.finishLoad = () => resolve({ type, result: 'AD_LOADED' }); }); },
            showAd: type => { window.calls.push(['show', type]); return new Promise(resolve => { window.finishAd = () => resolve({ type, result: 'AD_CLOSED' }); }); },
          },
        };
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = theme; });
      }, { theme });
      await page.goto(`http://127.0.0.1:${server.address().port}/dashboard`, { waitUntil: 'domcontentloaded' });
      const ad = page.getByRole('region', { name: 'Pi advertisement' });
      await ad.waitFor();
      assert.equal(await page.locator('.pi-dashboard-ad').count(), 1);
      assert.equal(await page.locator('script[src*="adsbygoogle"]').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.calls), [['init', { version: '2.0', sandbox: false }]]);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const colors = await ad.evaluate(el => ({ text: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
      assert.notEqual(colors.text, colors.bg);
      const button = page.getByRole('button', { name: 'View advertisement', exact: true });
      await button.hover();
      const contrast = await button.evaluate(el => {
        const luminance = color => {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
          return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        };
        const style = getComputedStyle(el), text = luminance(style.color), bg = luminance(style.backgroundColor);
        return (Math.max(text, bg) + .05) / (Math.min(text, bg) + .05);
      });
      assert(contrast >= 4.5, `Readable button contrast in ${theme}: ${contrast}`);
      await button.focus(); assert.equal(await button.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      // An existing modal blocks the request and does not acquire a cooldown.
      await page.evaluate(() => { const modal = document.createElement('div'); modal.id = 'fixture-modal'; modal.setAttribute('aria-modal', 'true'); document.body.appendChild(modal); });
      await button.click(); await page.getByRole('status').filter({ hasText: 'Advertisement cancelled.' }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.some(c => c[0] === 'show')), false);
      await page.evaluate(() => document.getElementById('fixture-modal').remove());
      await button.click(); await page.waitForFunction(() => !!window.finishAd);
      assert.equal(await page.getByRole('button', { name: 'Opening ad…' }).isDisabled(), true);
      await page.evaluate(() => window.finishAd());
      await page.getByRole('status').filter({ hasText: 'Advertisement closed.' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Try again shortly' }).isDisabled(), true);
      assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === 'show').length), 1);
      assert.equal(await page.getByRole('link', { name: 'Store navigation' }).getAttribute('href'), '/store');
      assert.equal(await page.evaluate(() => localStorage.getItem('smaj_public_theme')), theme);
      await context.close();
    }
    // A user can leave while a real native load is pending; it must not display later.
    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Pi Browser' });
      localStorage.setItem('smaj_cookie_consent_v1', JSON.stringify({ marketing: true, expiresAt: Date.now() + 86400000 }));
      window.shown = 0;
      window.Pi = { init: () => {}, nativeFeaturesList: async () => ['ad_network'], Ads: {
        isAdReady: async () => ({ ready: false }), requestAd: () => new Promise(resolve => { window.finishLoad = () => resolve({ result: 'AD_LOADED' }); }),
        showAd: async () => { window.shown++; return { result: 'AD_CLOSED' }; },
      } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'View advertisement' }).click();
    await page.waitForFunction(() => !!window.finishLoad);
    await page.evaluate(() => window.go('/store')); await page.getByRole('heading', { name: 'Store' }).waitFor();
    await page.evaluate(() => window.finishLoad());
    assert.equal(await page.evaluate(() => window.shown), 0);
    assert.equal(await page.locator('.pi-dashboard-ad').count(), 0);
    await page.close();
    for (const mode of ['ordinary', 'old-pi', 'opt-out']) {
      const context = await browser.newContext(); const page = await context.newPage();
      await page.addInitScript(mode => {
        Object.defineProperty(navigator, 'userAgent', { value: mode === 'ordinary' ? 'Chrome' : 'PiBrowser' });
        localStorage.setItem('smaj_cookie_consent_v1', JSON.stringify({ marketing: mode !== 'opt-out', analytics: false, expiresAt: Date.now() + 86400000 }));
        window.adsCalled = 0;
        window.Pi = { init: () => {}, nativeFeaturesList: async () => mode === 'old-pi' ? [] : ['ad_network'], Ads: {
          isAdReady: async () => { window.adsCalled++; return { ready: true }; },
          requestAd: async () => { window.adsCalled++; return { result: 'AD_LOADED' }; },
          showAd: async () => { window.adsCalled++; return { result: 'AD_CLOSED' }; },
        } };
      }, mode);
      // Block any pre-existing ordinary-browser ad service; never produce live traffic.
      await context.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ body: '' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Store navigation' }).waitFor();
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.pi-dashboard-ad').count(), 0);
      assert.equal(await page.evaluate(() => window.adsCalled), 0);
      await context.close();
    }
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(output, { recursive: true, force: true }); }
});
