const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { chromium } = require('../node_modules/@playwright/test');
const { build } = require('../node_modules/esbuild');

test('tutorial completes or skips before language selection, without overlapping dialogs', { timeout: 180000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-onboarding-'));
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Tour from './src/components/WelcomeTour';import Language from './src/components/LanguageSoonButton';import './src/index.css';createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter initialEntries={['/dashboard']}><main className="private-home">Dashboard<nav>{["home","services","search","messages","you"].map(name=><button key={name} data-tour={name}>{name}</button>)}</nav><Language dashboardPrompt/></main><Tour/></MemoryRouter></React.StrictMode>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', platform: 'browser', external: ['/assets/*', '/chat-doodles.svg'],
    plugins: [{ name: 'onboarding-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: 'icon', namespace: 'decoration' }));
      builder.onLoad({ filter: /.*/, namespace: 'decoration' }, () => ({ contents: 'export default function Icon(){return null;}' }));
      builder.onResolve({ filter: /\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      builder.onResolve({ filter: /^react-i18next$/ }, () => ({ path: 'i18n', namespace: 'fixture' }));
      builder.onResolve({ filter: /^@capacitor\/app$/ }, () => ({ path: 'native', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ resolveDir: root, contents: name === 'auth'
        ? `import {useState} from 'react';export function useAuthContext(){const [user,setUser]=useState({uid:'onboarding-user',languagePreferenceSaved:localStorage.getItem('saved')==='true'});return {user,isAuthenticated:true,isLoading:false,updateLanguage:async language=>{localStorage.setItem('saved','true');localStorage.setItem('savedLanguage',language);setUser({...user,language,languagePreferenceSaved:true});}}}`
        : name === 'i18n' ? `const i18n={resolvedLanguage:'en',changeLanguage:async()=>{}};export const useTranslation=()=>({i18n});`
        : `export const App={addListener:async(name,listener)=>{window.nativeBack=listener;return {remove(){}}}};` }));
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
    for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) for (const finish of ['complete', 'skip']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(theme => {
        localStorage.setItem('smaj_public_theme', theme);
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.dataset.theme = theme;
          window.overlap = false;
          new MutationObserver(() => { if (document.querySelector('.guided-tour-root') && document.querySelector('.language-choice-dialog')) window.overlap = true; }).observe(document.body, { childList: true, subtree: true });
        });
      }, theme);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const tour = page.getByRole('dialog', { name: 'Home', exact: true });
      await tour.waitFor();
      assert.equal(await page.locator('.language-choice-dialog').count(), 0);
      if (finish === 'skip') await page.getByRole('button', { name: 'Skip', exact: true }).click();
      else {
        for (let step = 1; step <= 6; step++) {
          await page.locator('.guided-tour-heading small').filter({ hasText: `${step} of 6` }).waitFor();
          await page.getByRole('button', { name: step === 6 ? 'Done' : 'Next', exact: true }).click();
        }
      }
      await page.getByRole('dialog', { name: 'Pick language', exact: true }).waitFor();
      assert.equal(await page.locator('.guided-tour-root').count(), 0);
      await page.locator('.language-choice-dialog select').selectOption('fr');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.locator('.language-choice-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => localStorage.getItem('savedLanguage')), 'fr');
      assert.equal(await page.evaluate(() => window.overlap), false);
      await page.reload();
      await page.waitForTimeout(850);
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('smaj_public_theme')), theme);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(output, { recursive: true, force: true });
  }
});
