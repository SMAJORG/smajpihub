import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const port = 4176;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "embeddedAi.browser.spec.mjs",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "desktop", use: {} },
    {
      name: "mobile-pi-browser-emulation",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36 PiBrowser/1.0",
      },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { VITE_API_BASE_URL: baseURL, VITE_BACKEND_URL: baseURL },
    url: baseURL,
    timeout: 180000,
    reuseExistingServer: false,
  },
});
