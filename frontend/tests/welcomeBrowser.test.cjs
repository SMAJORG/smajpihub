const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');

test('welcome links remain readable and operable in both themes at phone, tablet and desktop sizes', { timeout: 60000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-welcome-'));
  const welcome = {};
  const source = fs.readFileSync(path.join(root, '../backend/src/services/welcomeMessages.ts'), 'utf8');
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => ({}), welcome);
  await require('esbuild').build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Text from './src/components/ChatMessageText'; import './src/index.css'; createRoot(document.getElementById('root')).render(<main style={{background:'var(--surface)',color:'var(--text)',padding:16,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}><Text text={window.welcome.text} links={window.welcome.links}/></main>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', logLevel: 'silent', external: ['/assets/*', '/chat-doodles.svg'],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' },
  });
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js' || req.url === '/fixture.css') {
      res.setHeader('Content-Type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css');
      return res.end(fs.readFileSync(path.join(output, req.url.slice(1))));
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.welcome=${JSON.stringify({ text: welcome.welcomeMessage, links: welcome.welcomeLinks })};</script><script src="/fixture.js"></script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await require('playwright-core').chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      assert.equal(await page.locator('a.chat-message-link').count(), 6);
      assert.equal(await page.getByRole('link', { name: 'Terms & Conditions', exact: true }).getAttribute('href'), 'https://smajpihub.com/terms');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const colors = await page.locator('main').evaluate(el => ({ text: getComputedStyle(el).color, surface: getComputedStyle(el).backgroundColor }));
      assert.notEqual(colors.text, colors.surface);
      await page.getByRole('link', { name: 'Privacy Policy', exact: true }).focus();
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Privacy Policy');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    }
    await page.evaluate(() => { window.opened = []; window.Pi = { openUrlInSystemBrowser: url => window.opened.push(url) }; Object.defineProperty(navigator, 'userAgent', { value: 'PiBrowser' }); });
    await page.getByRole('link', { name: 'https://x.com/Devsmaj', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.opened), ['https://x.com/Devsmaj']);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(output, { recursive: true, force: true });
  }
});
