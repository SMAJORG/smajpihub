import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: 'localization.browser.spec.ts', workers: 1,
  timeout: 60000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173', cwd: fileURLToPath(new URL('..', import.meta.url)), env: { VITE_API_BASE_URL: 'http://127.0.0.1:4173', VITE_BACKEND_URL: 'http://127.0.0.1:4173' }, url: 'http://127.0.0.1:4173/tests/localization.html', timeout: 180000, reuseExistingServer: false },
});
