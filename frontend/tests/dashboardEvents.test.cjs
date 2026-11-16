const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { chromium } = require('../node_modules/@playwright/test');
const { build } = require('../node_modules/esbuild');

test('real dashboard events show dates, expire, and register on organizer sites across supported browsers', { timeout: 180000 }, async () => {
  const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-events-'));
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ManagedHomeSection} from './src/components/ManagedHomeFeed';import events from './src/content/dashboardEvents.json';import './src/index.css';const section={id:'events',title:'Events happening now',subtitle:'Free upcoming online events.',to:'',visible:true,mode:'custom',order:10,cards:[...events,{...events[0],id:'expired',title:'Completed event',endsAt:'2026-11-01T00:00:00Z'},{...events[0],id:'unsafe',title:'Unsafe event',registrationUrl:'javascript:alert(1)'},{id:'demo',title:'Demo concert',to:'/services/events'}]};createRoot(document.getElementById('root')).render(<MemoryRouter><main className="private-home"><ManagedHomeSection section={section}/></main></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', platform: 'browser', external: ['/assets/*', '/chat-doodles.svg'],
    plugins: [{ name: 'event-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: 'icon', namespace: 'decoration' }));
      builder.onLoad({ filter: /.*/, namespace: 'decoration' }, () => ({ contents: 'export default function Icon(){return null;}' }));
      builder.onResolve({ filter: /\/axiosClient$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'native', namespace: 'fixture' }));
      builder.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: 'browser', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path: name}) => ({ contents: name === 'api' ? 'export const apiFetch=async()=>({});' : name === 'native' ? 'export const Capacitor={isNativePlatform:()=>window.platform==="android"};' : 'export const Browser={open:async({url})=>{window.registered=url}};' }));
    } }],
  });
  const server = http.createServer((req, res) => {
    const asset = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : null;
    res.setHeader('Content-Type', asset?.endsWith('.js') ? 'text/javascript' : asset ? 'text/css' : 'text/html');
    res.end(asset ? fs.readFileSync(path.join(output, asset)) : '<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
    const cases = [390, 820, 1440].flatMap(width => ['light', 'dark'].map(theme => ({width,theme,platform:'web'})));
    cases.push({width:390,theme:'dark',platform:'pi'}, {width:390,theme:'light',platform:'android'});
    for (const scenario of cases) {
      const context = await browser.newContext({ viewport: { width: scenario.width, height: 1000 } });
      await context.route('https://developer.microsoft.com/**', route => route.fulfill({ contentType: 'text/html', body: 'Official registration destination' }));
      const page = await context.newPage();
      await page.addInitScript(({ theme, platform }) => {
        Date.now = () => Date.parse('2026-11-16T12:00:00Z');
        window.platform = platform;
        if (platform === 'pi') { Object.defineProperty(navigator, 'userAgent', {value:'PiBrowser'}); window.Pi={openUrlInSystemBrowser:async url=>{window.registered=url}}; }
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = theme; });
      }, scenario);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const register = page.getByRole('link', { name: /^Register for / });
      await register.first().waitFor();
      assert.equal(await register.count(), 3);
      assert.equal(await page.getByText('Free', {exact:true}).count(), 3);
      assert.equal(await page.locator('time').count(), 6);
      assert.equal(await page.getByText(/Completed event|Unsafe event|Demo concert/).count(), 0);
      assert.match(await page.locator('time').first().innerText(), /24 Nov 2026/);
      const href = await register.first().getAttribute('href');
      assert.equal(href, 'https://developer.microsoft.com/en-us/reactor/events/27761/');
      if (scenario.platform === 'web') {
        const [popup] = await Promise.all([page.waitForEvent('popup'), register.first().click()]);
        await popup.waitForLoadState();
        assert.equal(popup.url(), href);
        await popup.close();
      } else {
        await register.first().click();
        await page.waitForFunction(url => window.registered === url, href);
      }
      await page.evaluate(() => { Date.now=()=>Date.parse('2026-11-24T19:00:00Z'); window.dispatchEvent(new Event('focus')); });
      await page.waitForFunction(() => document.querySelectorAll('.managed-event-register').length === 2);
      await page.evaluate(() => { Date.now=()=>Date.parse('2026-12-04T00:00:00Z'); window.dispatchEvent(new Event('focus')); });
      await page.getByText('No upcoming events are listed right now.').waitFor();
      assert.equal(await register.count(), 0);
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(output, { recursive: true, force: true });
  }
});
