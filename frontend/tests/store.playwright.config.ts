import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: 'store.browser.spec.ts', workers: 1, timeout: 90000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4176', channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/store.vite.config.ts --host 127.0.0.1 --port 4176',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:4176', VITE_BACKEND_URL: 'http://127.0.0.1:4176' },
    url: 'http://127.0.0.1:4176/tests/store.html', timeout: 180000,
  },
});
