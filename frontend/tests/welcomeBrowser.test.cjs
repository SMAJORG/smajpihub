const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');

test('welcome translations, links and fallback work in all languages in mobile Pi Browser and desktop', { timeout: 60000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-welcome-'));
  const welcome = {};
  const requests = [];
  let translationUnavailable = false;
  let partialTranslation = false;
  const source = fs.readFileSync(path.join(root, '../backend/src/services/welcomeMessages.ts'), 'utf8');
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => ({}), welcome);
  await require('esbuild').build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {createInstance} from 'i18next'; import {I18nextProvider,initReactI18next} from 'react-i18next'; import Welcome from './src/components/FounderWelcomeMessage'; import './src/index.css'; const i18n=createInstance(); const resources=Object.fromEntries(['en','fr','ar','ha','es','pt','zh','sw','hi','tr'].map(code=>[code,{ui:{}}])); void i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources,initImmediate:false}).then(()=>{window.changeWelcomeLanguage=code=>i18n.changeLanguage(code);createRoot(document.getElementById('root')).render(<I18nextProvider i18n={i18n}><main style={{background:'var(--surface)',color:'var(--text)',padding:16}}><Welcome text={window.welcome.text} links={window.welcome.links}/></main></I18nextProvider>)});`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', logLevel: 'silent', external: ['/assets/*', '/chat-doodles.svg'],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' },
  });
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js' || req.url === '/fixture.css') {
      res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css');
      return res.end(fs.readFileSync(path.join(output, req.url.slice(1))));
    }
    if (req.url === '/translations/batch' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        requests.push({ method: req.method, path: req.url });
        if (translationUnavailable) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'unavailable', code: 'translation_not_configured' }));
        }
        const request = JSON.parse(body);
        const translations = request.texts.map(text => partialTranslation && text.includes('honest feedback')
          ? text : `[${request.target}] Texte traduit`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'translated', translations }));
      });
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.__ENV={apiBaseURL:location.origin};window.welcome=${JSON.stringify({ text: welcome.welcomeMessage, links: welcome.welcomeLinks })};</script><script src="/fixture.js"></script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await require('playwright-core').chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 PiBrowser' });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      assert.equal(await page.locator('a.chat-message-link').count(), 6);
      assert.equal(await page.locator('a[href="https://smajpihub.com/terms"]').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const colors = await page.locator('main').evaluate(el => ({ text: getComputedStyle(el).color, surface: getComputedStyle(el).backgroundColor }));
      assert.notEqual(colors.text, colors.surface);
      await page.locator('a[href="https://smajpihub.com/privacy"]').focus();
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'https://smajpihub.com/privacy');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    }
    for (const language of ['fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr']) {
      await page.evaluate(code => window.changeWelcomeLanguage(code), language);
      assert.match(await page.locator('.founder-welcome-message').innerText(), /Welcome to SMAJ PI HUB/u);
      await page.waitForFunction(code => document.querySelector('.founder-welcome-message')?.innerText.includes(`[${code}] Texte traduit`), language);
      assert.equal(await page.locator('.founder-welcome-message').count(), 1);
      assert.equal(await page.locator('a[href="https://smajpihub.com/terms"]').count(), 1);
      assert.equal(await page.locator('a[href="https://smajpihub.com/privacy"]').count(), 1);
      assert.equal(await page.locator('a[href="https://smajpihub.com/seller-agreement"]').count(), 1);
      assert.equal(await page.locator('a[href="https://t.me/smajpihub"]').count(), 1);
      assert.equal(await page.locator('a[href="https://x.com/smajpihub"]').count(), 1);
      assert.equal(await page.locator('a[href="https://x.com/Devsmaj"]').count(), 1);
    }
    await page.evaluate(() => { window.opened = []; window.Pi = { openUrlInSystemBrowser: url => window.opened.push(url) }; });
    await page.locator('a[href="https://x.com/Devsmaj"]').click();
    assert.deepEqual(await page.evaluate(() => window.opened), ['https://x.com/Devsmaj']);
    translationUnavailable = true;
    await page.evaluate(code => window.changeWelcomeLanguage(code), 'zh');
    await page.waitForFunction(() => document.querySelector('.founder-welcome-message')?.getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('.founder-welcome-message').innerText(), /🎉 Welcome to SMAJ PI HUB!/u);
    assert.match(await page.locator('.founder-welcome-message').innerText(), /Our Live Services/u);
    assert.doesNotMatch(await page.locator('.founder-welcome-message').innerText(), /translation error|cannot be displayed/u);
    assert.equal(await page.locator('a[href="https://smajpihub.com/terms"]').count(), 1);
    translationUnavailable = false;
    partialTranslation = true;
    await page.evaluate(code => window.changeWelcomeLanguage(code), 'zh');
    await page.waitForFunction(() => document.querySelector('.founder-welcome-message')?.getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('.founder-welcome-message').innerText(), /🎉 Welcome to SMAJ PI HUB!/u);
    assert.doesNotMatch(await page.locator('.founder-welcome-message').innerText(), /\[zh\]/u);
    assert.equal(requests.some(request => request.method === 'POST' && request.path === '/translations/batch'), true);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(output, { recursive: true, force: true });
  }
});
