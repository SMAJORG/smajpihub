// Run with PLAYWRIGHT_CORE_PATH pointing to an installed playwright-core package.
// The fixture bundles the actual chat page and media components, with auth and decorative icon assets
// replaced. Every API request stays on a local test server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core'); } catch {}

test('chat navigation, cancellation, media playback and offline browser interactions', { skip: !playwright, timeout: 180000 }, async () => {
  const root = path.resolve('frontend');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-chat-interactions-'));
  const esbuild = require('esbuild');
  await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom'; import MessagesPage from './src/pages/private/MessagesPage'; import './src/index.css'; import * as media from './src/lib/chatMedia'; window.fixture.media=media; createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[window.fixture.route]}><MessagesPage /></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), platform: 'browser', format: 'iife', jsx: 'automatic', logLevel: 'silent',
    alias: { "@mui/styled-engine": path.join(root, "node_modules/@mui/styled-engine-sc") },
    external: ["/assets/*", "/chat-doodles.svg"],
    define: { 'import.meta.env': JSON.stringify({ MODE: 'test' }), 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'fixture-auth', setup(build) {
      build.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: 'icon', namespace: 'fixture-icon' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture-icon' }, () => ({ contents: `import React from 'react'; export default function Icon(){return React.createElement('svg',{'aria-hidden':true,viewBox:'0 0 24 24'},React.createElement('path',{d:'M8 5v14l11-7z'}));}`, resolveDir: root, loader: 'js' }));
      build.onResolve({ filter: /(?:^|\/)AuthContext$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import {useSyncExternalStore} from 'react'; const subscribe=fn=>{window.addEventListener('fixture-account',fn);return()=>window.removeEventListener('fixture-account',fn);}; export function useAuthContext(){const user=useSyncExternalStore(subscribe,()=>window.fixture.user);return {user};}`, resolveDir: root, loader: 'js' }));
    } }],
  });
  const conversations = Array.from({ length: 25 }, (_, i) => ({ _id: (i + 1).toString(16).padStart(24, '0'), buyerId: 'alice', sellerId: `person${i + 1}`, participantId: `person${i + 1}`, participantName: `Person ${i + 1}`, productId: '', productTitle: '', updatedAt: '2026-10-16T10:00:00Z', unreadBy: [] }));
  const messages = id => id === conversations[0]._id ? [
    { _id: '100000000000000000000001', conversationId: id, senderId: 'person1', messageType: 'voice', mediaAvailable: true, message: 'Voice message', audioDurationSeconds: 22, createdAt: '2026-10-16T10:00:00Z' },
    { _id: '100000000000000000000002', conversationId: id, senderId: 'alice', messageType: 'voice', mediaAvailable: true, message: 'Voice message', audioDurationSeconds: 11, createdAt: '2026-10-16T10:01:00Z' },
  ] : id === conversations[13]._id ? Array.from({length: 40}, (_, i) => ({_id: '300000000000' + String(i).padStart(12, '0'), conversationId:id, senderId:i % 2 ? 'alice' : 'person14', message:i === 39 ? 'Cached history 14' : 'Earlier message ' + i, ...(i === 38 ? {messageType:'image',mediaAvailable:true,attachmentName:'fixture-photo'} : {}), createdAt:'2026-10-16T10:00:00Z'})) : [{ _id: `200000000000${id.slice(-12)}`, conversationId: id, senderId: 'alice', message: `Cached history ${Number.parseInt(id, 16)}`, createdAt: '2026-10-16T10:00:00Z' }];
  const sent = new Map();
  let delay = 0, failHistory = false;
  const requests = [];
  const wave = Buffer.alloc(44 + 22 * 8000 * 2);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'); requests.push({ path: url.pathname, query: url.search, owner: req.headers['x-smaj-chat-owner'] });
    const json = (body, status = 200) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); } };
    if (url.pathname === '/fixture') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.__ENV={apiBaseURL:location.origin};window.fixture={route:'/messages'+location.search,user:{uid:'alice',displayName:'Alice'}};localStorage.setItem('smaj_pi_user',JSON.stringify({uid:'alice',accessToken:'test-token'}));window.fixture.feedback=[];window.addEventListener('smaj:feedback',e=>window.fixture.feedback.push(e.detail));</script><script src="/fixture.js"></script>`);
    }
    if (url.pathname === '/fixture.js' || url.pathname === '/fixture.css') { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(fs.readFileSync(path.join(output, url.pathname.slice(1)))); }
    if (url.pathname === '/chat-doodles.svg') { res.setHeader('Content-Type', 'image/svg+xml'); return res.end(fs.readFileSync(path.join(root, 'public/chat-doodles.svg'))); }
    if (req.method === 'POST' && url.pathname === '/uploads/image') return json({url:address+'/photo.png'});
    if (url.pathname === '/photo.png') { res.setHeader('Content-Type','image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9eQAAAAASUVORK5CYII=','base64')); }
    if (req.method === 'POST' && /^\/messages\/[a-f0-9]{24}$/.test(url.pathname)) {
      let body=''; for await (const chunk of req) body+=chunk;
      const payload=JSON.parse(body), id=url.pathname.split('/')[2];
      const history=sent.get(id)||[];
      const message=history.find(item=>item.clientMessageId===payload.clientMessageId)||{...payload,_id:'400000000000'+String(history.length).padStart(12,'0'),conversationId:id,senderId:'alice',createdAt:new Date().toISOString()};
      if(!history.includes(message))history.push(message);sent.set(id,history);
      return json({message,conversation:conversations.find(item=>item._id===id)});
    }
    if (url.pathname === '/messages/sync') return; // Held until cancelled, like an unchanged long poll.
    if (url.pathname === '/messages') {
      if (req.headers['x-smaj-chat-owner'] === 'bob') return json({ conversations: [] });
      const previews = Object.fromEntries(conversations.slice(0, 20).map(item => [item._id, { messages: messages(item._id), nextCursor: null }]));
      return json({ conversations, ...(url.searchParams.get('includePreviews') === '1' ? { previews } : {}) });
    }
    if (/\/messages\/[^/]+\/messages\/[^/]+\/media$/.test(url.pathname)) { if (url.pathname.includes('/300000')) { res.writeHead(200, {'Content-Type':'image/svg+xml'}); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="purple"/></svg>'); } res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(wave); }
    if (/^\/messages\/[a-f0-9]{24}$/.test(url.pathname)) {
      if (failHistory) return json({ message: 'Temporary failure' }, 503);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const id = url.pathname.split('/')[2]; return json({ conversation: conversations.find(item => item._id === id), messages: [...messages(id),...(sent.get(id)||[])], nextCursor: null });
    }
    json({ message: 'Not found' }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Chat fixture error:', error.message); });
    await page.goto(address + '/fixture');
    await page.locator(`[data-conversation-id="${conversations[12]._id}"]`).waitFor().catch(async error => { console.error(JSON.stringify({ errors, requests, html: (await page.locator('#root').innerHTML()).slice(0,2000) })); throw error; });
    delay = 3000;
    await page.locator(`[data-conversation-id="${conversations[12]._id}"]`).click();
    await page.getByRole('dialog', { name: 'Chat', exact: true }).waitFor();
    await page.getByText('Cached history 13', { exact: true }).waitFor({ state: "visible", timeout: 1000 });
    assert.equal(await page.getByText('Loading messages...', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await page.locator(`[data-conversation-id="${conversations[13]._id}"]`).click();
    await page.getByText('Cached history 14', { exact: true }).waitFor({ state: 'visible', timeout: 1000 });
    await page.locator('.chat-photo-frame img').waitFor();
    await page.waitForFunction(() => document.querySelector('.chat-photo-frame img')?.naturalWidth > 0);
    const photoUrl = await page.locator('.chat-photo-frame img').getAttribute('src');
    await page.locator('.chat-messages').evaluate(node => { node.scrollTop = 700; node.dispatchEvent(new Event('scroll')); });
    const anchorBefore = await page.locator('.chat-messages').evaluate(node => {
      const item = [...node.querySelectorAll('[data-message-id]')].find(item => item.getBoundingClientRect().bottom > 150);
      return { id: item.dataset.messageId, top: item.getBoundingClientRect().top };
    });
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await page.locator('[data-conversation-id="' + conversations[13]._id + '"]').click();
    await page.getByRole('dialog', { name: 'Chat', exact: true }).waitFor();
    assert.equal(await page.locator('.chat-photo-frame img').getAttribute('src'), photoUrl, 'Reopening reuses the downloaded photo immediately');
    const anchorAfter = await page.locator('[data-message-id="' + anchorBefore.id + '"]').evaluate(node => node.getBoundingClientRect().top);
    assert.ok(Math.abs(anchorAfter - anchorBefore.top) < 3, 'Reopening restores the visible message before history refresh: ' + JSON.stringify({anchorBefore,anchorAfter}));
    assert.equal(await page.locator('.chat-panel-inline:visible').count(), 0);
    await page.waitForTimeout(3200);
    assert.equal(await page.getByText('Cached history 13', { exact: true }).count(), 0);
    assert.equal(await page.locator('.voice-recorder-error').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.fixture.feedback), []);
    await page.getByRole('button', { name: 'Back to messages' }).click();
    delay = 0;
    await page.locator(`[data-conversation-id="${conversations[24]._id}"]`).scrollIntoViewIfNeeded();
    await page.waitForFunction(id => !!localStorage.getItem('smaj-chat-v2:alice:' + id), conversations[24]._id);
    await page.locator(`[data-conversation-id="${conversations[24]._id}"]`).click();
    await page.getByText('Cached history 25', { exact: true }).waitFor({ state: "visible", timeout: 1000 });
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await page.locator(`[data-conversation-id="${conversations[0]._id}"]`).click();
    await page.getByText('0:22', { exact: true }).waitFor({ state: "visible", timeout: 1000 });
    assert.equal(await page.locator('audio[controls]').count(), 0);
    assert.equal(requests.filter(item => item.path.endsWith('/media') && item.path.includes('/100000')).length, 0);
    await page.getByRole('button', { name: 'Play voice note', exact: true }).first().click();
    await page.getByRole('button', { name: 'Pause voice note', exact: true }).waitFor();
    const audio = page.locator('.voice-player audio').first();
    await audio.evaluate(element => { element.pause(); element.currentTime = 3; element.dispatchEvent(new Event('timeupdate')); });
    await page.getByText('0:03', { exact: true }).waitFor({ state: "visible", timeout: 1000 });
    await page.getByRole('button', { name: 'Play voice note', exact: true }).first().click();
    await page.getByRole('button', { name: 'Play voice note', exact: true }).last().click();
    await page.locator('.voice-player').last().getByRole('button', { name: 'Pause voice note', exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.voice-player audio')].filter(audio => !audio.paused).length === 1);
    await page.locator('.voice-player audio').last().evaluate(element => { element.pause(); element.dispatchEvent(new Event('ended')); });
    await page.waitForFunction(() => document.querySelectorAll('.voice-player time')[1].textContent !== '0:00');
    const seek = page.getByRole('slider', { name: 'Seek voice note' }).first();
    await seek.focus(); await page.keyboard.press('ArrowRight');
    assert.ok(Number(await seek.inputValue()) > 0);
    await page.setViewportSize({ width: 390, height: 480 });
    await page.locator('.chat-messages').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const composer = await page.locator('.chat-panel-fullscreen > form').boundingBox();
    assert.ok(composer.y + composer.height <= 480);
    await page.setViewportSize({ width: 390, height: 844 });
    failHistory = true;
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await page.locator(`[data-conversation-id="${conversations[12]._id}"]`).click();
    await page.waitForTimeout(200);
    await page.getByText('Cached history 13', { exact: true }).waitFor({ state: "visible", timeout: 1000 });
    assert.equal(await page.getByText('Could not refresh messages. Please try again.').count(), 0);
    await page.evaluate(id => localStorage.removeItem('smaj-chat-v2:alice:' + id), conversations[24]._id);
    await page.goto(address + '/fixture?conversation=' + conversations[24]._id);
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    failHistory = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Cached history 25', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await page.locator(`[data-conversation-id="${conversations[0]._id}"]`).click();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Play voice note', exact: true }).first().click();
    await page.getByRole('button', { name: 'Pause voice note', exact: true }).waitFor();
    await page.getByPlaceholder('Message...', {exact:true}).fill('Waiting offline');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    const waitingText=page.locator('[data-message-id]').filter({hasText:'Waiting offline'});
    await waitingText.getByLabel('Waiting to send',{exact:true}).waitFor();
    assert.equal(await waitingText.getByLabel('Sent',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Attach file',exact:true}).click();
    await page.locator('input[accept="image/*,video/*"]').setInputFiles({name:'offline.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9eQAAAAASUVORK5CYII=','base64')});
    await page.getByRole('button',{name:'offline.png',exact:true}).click();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByRole('button',{name:'Send attachment',exact:true}).click();
    await page.getByRole('button',{name:'Cancel uploading attachment',exact:true}).waitFor();
    const pendingPhoto=page.locator('.chat-upload-frame').filter({has:page.getByRole('button',{name:'Cancel uploading attachment',exact:true})});
    assert.equal(await pendingPhoto.locator('img').count(),1);
    await page.getByRole('button',{name:'Cancel uploading attachment',exact:true}).click();
    await page.getByRole('button',{name:'Retry uploading attachment',exact:true}).waitFor();
    await page.waitForTimeout(5200);
    assert.equal(await page.getByRole('button',{name:'Retry uploading attachment',exact:true}).count(),1,'Cancelled uploads stay paused');
    await page.getByRole('button',{name:'Retry uploading attachment',exact:true}).click();
    await page.getByRole('button',{name:'Cancel uploading attachment',exact:true}).waitFor();
    await context.setOffline(false);
    await waitingText.getByLabel('Sent',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Cancel uploading attachment',exact:true}).waitFor({state:'detached'});
    assert.equal([...sent.values()].flat().length,2,'Reconnect sends each queued message once');
    await context.setOffline(true);
    await page.evaluate(() => { window.fixture.user = { uid: 'bob', displayName: 'Bob' }; localStorage.setItem('smaj_pi_user', JSON.stringify({ uid: 'bob', accessToken: 'bob-token' })); window.dispatchEvent(new Event('fixture-account')); });
    await page.waitForTimeout(200);
    assert.equal(await page.getByText('Cached history 13', { exact: true }).count(), 0);
    assert.equal(await page.locator('.voice-player').count(), 0);
    assert.match(await page.evaluate(async message => { try { await window.fixture.media.getMessageBlob('bob', message); return 'leaked'; } catch(error) { return error.message; } }, messages(conversations[0]._id)[0]), /not saved on this device/);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, "chat-verified.png") });
    await context.close();
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
