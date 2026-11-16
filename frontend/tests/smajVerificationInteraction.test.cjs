const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { chromium } = require('../node_modules/@playwright/test');
const { build } = require('../node_modules/esbuild');

test('shared identity badges and Stream channels follow admin-selected colors on mobile and tablet in both themes', { timeout: 300000 }, async () => {
  const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-verified-'));
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import Badge from './src/components/SmajVerifiedBadge';import Admin from './src/pages/admin/AdminUsersPage';import Channel from './src/pages/stream/StreamPublicChannel';import './src/index.css';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/channel/pioneer']}><main className="private-page">{['Profile','Store','Jobs','Orders'].map(name=><section key={name}><h2>{name}: Pioneer<Badge userId="owner"/></h2></section>)}<Routes><Route path="/channel/:handle" element={<Channel/>}/></Routes></main><div className={"admin-shell "+(localStorage.getItem("smaj_public_theme")==="dark"?"admin-theme-dark":"")}><Admin/></div></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', platform: 'browser', external: ['/assets/*', '/chat-doodles.svg'],
    plugins: [{ name: 'fixture-api', setup(builder) {
      builder.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: 'icon', namespace: 'decoration' }));
      builder.onResolve({ filter: /\/StreamVideoActions$/ }, () => ({ path: 'actions', namespace: 'decoration' }));
      builder.onLoad({ filter: /.*/, namespace: 'decoration' }, () => ({ contents: 'export default function Decoration(){return null;}' }));
      builder.onResolve({ filter: /\/axiosClient$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const f=()=>window.fixture;export const axiosClient={get:async url=>url.startsWith('/stream/channels/')?{data:{creatorId:f().user._id,channel:{name:'Pioneer Stream',handle:'pioneer'},posts:[{_id:'post',body:'Channel update'}],videos:[],live:[],stats:{followers:0,videos:0,live:0}}}:url.endsWith('/status')?{data:{subscribed:false}}:{data:{users:[{...f().user,smajVerification:f().verification}],currentUserUid:'admin'}},post:async(url,body)=>{if(f().offline)throw Error('offline');f().batches.push(body.userIds);return {data:{statuses:Object.fromEntries(body.userIds.map(id=>[id,f().verification]))}}},patch:async(url,body)=>{f().reviews.push(body);f().user.verificationLevel=body.verificationLevel;f().verification={...f().verification,level:body.verificationLevel==='basic'?'pi_verified':body.verificationLevel,status:body.smajVerificationStatus,verified:body.smajVerificationStatus==='approved',expiresAt:body.verificationExpiresAt,revision:f().verification.revision+1};return {data:{user:{...f().user,smajVerification:f().verification}}}}};` }));
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
    for (const width of [390, 820]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.addInitScript(theme => {
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = theme; });
        localStorage.setItem('smaj_public_theme', theme);
        window.fixture = { user: { _id: '111111111111111111111111', uid: 'owner', displayName: 'Pioneer', role: 'buyer' }, verification: { userId: '111111111111111111111111', status: 'approved', verified: true, expiresAt: null, revision: 1 }, batches: [], reviews: [], offline: false };
      }, theme);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 7);
      const colors = await page.locator('.smaj-verified-badge path').evaluateAll(elements => elements.map(element => getComputedStyle(element).fill));
      assert.equal(new Set(colors).size, 1, JSON.stringify(colors));
      assert(await page.getByRole('img', { name: /^SMAJ Verified/ }).count() === 7);
      const actions = page.getByRole('button', { name: 'Actions for Pioneer' });
      await actions.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await actions.click();
      await page.getByRole('menuitem', { name: 'Manage verification' }).click();
      const dialog = page.getByRole('dialog');
      for (const [level, color] of [['pi_verified', 'rgb(29, 155, 240)'], ['seller_verified', 'rgb(124, 58, 237)'], ['trusted_seller', 'rgb(245, 158, 11)']]) {
        await dialog.getByLabel('Verification level').selectOption(level);
        await dialog.getByRole('button', { name: 'Save changes' }).click();
        await page.waitForFunction(color => [...document.querySelectorAll('.smaj-verified-badge path')].length === 7 && [...document.querySelectorAll('.smaj-verified-badge path')].every(element => getComputedStyle(element).fill === color), color);
      }
      await dialog.getByLabel('SMAJ identity verification').selectOption('suspended');
      await dialog.getByLabel('Review reason').fill('Identity review required');
      await dialog.getByRole('button', { name: 'Save changes' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 0);
      await dialog.getByLabel('SMAJ identity verification').selectOption('approved');
      await dialog.getByRole('button', { name: 'Save changes' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 7);
      const panelColors = await dialog.evaluate(element => ({ bg: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color, width: element.getBoundingClientRect().width }));
      assert.notEqual(panelColors.bg, panelColors.text); assert(panelColors.width <= width);
      await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
      await page.evaluate(() => { window.fixture.verification = { ...window.fixture.verification, expiresAt: new Date(Date.now() + 200).toISOString() }; window.dispatchEvent(new Event('smaj:verification-changed')); });
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 7);
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 0);
      await page.evaluate(() => { window.fixture.verification = { ...window.fixture.verification, expiresAt: null }; window.dispatchEvent(new Event('smaj:verification-changed')); });
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 7);
      await page.evaluate(() => { window.fixture.offline = true; window.dispatchEvent(new Event('smaj:verification-changed')); });
      await page.waitForFunction(() => document.querySelectorAll('.smaj-verified-badge').length === 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('smaj_public_theme')), theme);
      assert(await page.evaluate(() => window.fixture.batches.every(batch => batch.length <= 100)));
      await page.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
