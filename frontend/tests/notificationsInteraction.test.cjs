const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium } = require('../node_modules/@playwright/test');
const { build } = require('../node_modules/esbuild');

test('notification inbox refreshes on incoming events and preserves alerts after failed actions in both themes', { timeout: 120000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-notifications-'));
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Notifications from './src/pages/private/NotificationsPage';import './src/index.css';createRoot(document.getElementById('root')).render(<MemoryRouter><Notifications/></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', platform: 'browser',
    alias: { '@mui/styled-engine': path.join(root, 'node_modules/@mui/styled-engine-sc') },
    external: ['/assets/*', '/chat-doodles.svg'],
    plugins: [{ name: 'fixture-api', setup(builder) {
      builder.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: 'icon', namespace: 'fixture-icon' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-icon' }, () => ({ contents: `import React from 'react';export default function Icon(){return React.createElement('svg',{'aria-hidden':true});}`, resolveDir: root }));
      builder.onResolve({ filter: /\/axiosClient$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const axiosClient={get:async()=>{if(window.fixture.failRead)throw Error('offline');return {data:{notifications:window.fixture.items}}},patch:async()=>{if(window.fixture.failWrite)throw Error('offline');return{}},delete:async()=>{if(window.fixture.failWrite)throw Error('offline');return{}}};` }));
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
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on('pageerror', error => console.error('Notification fixture:', error.message));
      await page.addInitScript(theme => {
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = theme; });
        window.fixture = { items: [], failRead: false, failWrite: false, feedback: [] };
        window.addEventListener('smaj:feedback', event => window.fixture.feedback.push(event.detail));
      }, theme);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByText('No notifications yet').waitFor();
      await page.evaluate(() => {
        window.fixture.items = [{ _id: '123456789012345678901234', type: 'security_login', title: 'New login alert', message: 'Review your devices', createdAt: new Date().toISOString(), read: false }];
        window.dispatchEvent(new Event('smaj:native-push'));
      });
      await page.getByText('New login alert').waitFor();
      await page.evaluate(() => { window.fixture.failRead = true; window.dispatchEvent(new Event('smaj:notifications-refresh')); });
      await page.waitForTimeout(100);
      assert.equal(await page.getByText('New login alert').count(), 1);
      await page.evaluate(() => { window.fixture.failWrite = true; });
      await page.getByRole('button', { name: 'Mark all as read' }).click();
      await page.waitForFunction(() => window.fixture.feedback.length > 0);
      assert.equal(await page.locator('article.unread').count(), 1);
      await page.getByRole('button', { name: 'Delete notification', exact: true }).click();
      const dialog = page.locator('.confirm-modal');
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      assert.equal(await page.getByText('New login alert').count(), 1);
      assert.equal(await dialog.count(), 1);
      const colors = await dialog.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }));
      assert.notEqual(colors.background, colors.text);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.evaluate(() => { window.fixture.failWrite = false; });
      await page.getByRole('button', { name: 'Mark all as read' }).click();
      await page.waitForFunction(() => !document.querySelector('article.unread'));
      await page.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
