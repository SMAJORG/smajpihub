const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http");
const { chromium } = require("../node_modules/@playwright/test");
const { build } = require("../node_modules/esbuild");

test(
  "Events app uses real records, shows details and registers externally without issuing demo tickets",
  { timeout: 240000 },
  async () => {
    const root = path.resolve(__dirname, ".."),
      output = fs.mkdtempSync(path.join(os.tmpdir(), "smaj-events-app-"));
    await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';import Events from './src/pages/events/EventsPage';import events from './src/content/dashboardEvents.json';import {publishSiteContent} from './src/lib/siteContent';import './src/index.css';window.site={services:[],sections:[{id:'events',title:'Events happening now',subtitle:'Real events',to:'',visible:true,mode:'custom',order:10,cards:[...events,{...events[0],id:'expired',title:'Completed demo event',endsAt:'2026-11-01T00:00:00Z'},{...events[0],id:'unsafe',title:'Unsafe event',registrationUrl:'javascript:alert(1)'}]}]};publishSiteContent(window.site);function App(){window.go=useNavigate();return <Routes><Route path='/services/events' element={<Events/>}/>{['search','saved','tickets','create'].map(kind=><Route key={kind} path={'/services/events/'+kind} element={<Events kind={kind}/>}/>)}<Route path='/services/events/event/:id' element={<Events kind='detail'/>}/><Route path='/services/events/checkout/:id' element={<Events kind='checkout'/>}/><Route path='/services/events/ticket/:id' element={<Events kind='ticket'/>}/></Routes>}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/services/events']}><App/></MemoryRouter>);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      outfile: path.join(output, "fixture.js"),
      jsx: "automatic",
      platform: "browser",
      external: ["/assets/*", "/chat-doodles.svg"],
      plugins: [
        {
          name: "events-boundaries",
          setup(builder) {
            builder.onResolve({ filter: /^@mui\/icons-material\// }, () => ({ path: "icon", namespace: "decoration" }));
            builder.onLoad({ filter: /.*/, namespace: "decoration" }, () => ({
              contents: "export default function Icon(){return null;}",
            }));
            builder.onResolve({ filter: /\/layouts\/AppLayout$/ }, () => ({ path: "layout", namespace: "fixture" }));
            builder.onResolve({ filter: /\/axiosClient$/ }, () => ({ path: "api", namespace: "fixture" }));
            builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "native", namespace: "fixture" }));
            builder.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: "browser", namespace: "fixture" }));
            builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
              contents:
                name === "layout"
                  ? "export default function Layout({children}){return children}"
                  : name === "api"
                    ? "export const apiFetch=async()=>({ok:true,json:async()=>({content:window.site})});"
                    : name === "native"
                      ? 'export const Capacitor={isNativePlatform:()=>window.platform==="android"};'
                      : "export const Browser={open:async({url})=>{window.registered=url}};",
            }));
          },
        },
      ],
    });
    const server = http.createServer((req, res) => {
      const asset = req.url === "/fixture.js" ? "fixture.js" : req.url === "/fixture.css" ? "fixture.css" : null;
      res.setHeader("Content-Type", asset?.endsWith(".js") ? "text/javascript" : asset ? "text/css" : "text/html");
      res.end(
        asset
          ? fs.readFileSync(path.join(output, asset))
          : '<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'
      );
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
      const cases = [390, 820, 1440].flatMap(width =>
        ["light", "dark"].map(theme => ({ width, theme, platform: "web" }))
      );
      cases.push({ width: 390, theme: "dark", platform: "pi" }, { width: 390, theme: "light", platform: "android" });
      for (const scenario of cases) {
        const context = await browser.newContext({ viewport: { width: scenario.width, height: 1100 } });
        await context.route("https://developer.microsoft.com/**", route =>
          route.fulfill({ contentType: "text/html", body: "Official registration" })
        );
        const page = await context.newPage();
        await page.addInitScript(({ theme, platform }) => {
          Date.now = () => Date.parse("2026-11-16T12:00:00Z");
          localStorage.setItem("smaj_public_theme", theme);
          localStorage.setItem("smaj_event_tickets", '[{"id":"fake","title":"Fake ticket","status":"Confirmed"}]');
          sessionStorage.setItem(
            "smaj_latest_event_ticket",
            '{"id":"fake","title":"Fake ticket","status":"Confirmed"}'
          );
          window.platform = platform;
          if (platform === "pi") {
            Object.defineProperty(navigator, "userAgent", { value: "PiBrowser" });
            window.Pi = {
              openUrlInSystemBrowser: async url => {
                window.registered = url;
              },
            };
          }
          document.addEventListener("DOMContentLoaded", () => {
            document.documentElement.dataset.theme = theme;
          });
        }, scenario);
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.locator(".event-card").first().waitFor();
        assert.equal(await page.locator(".event-card").count(), 3);
        assert.equal(
          await page
            .locator(".event-price")
            .filter({ hasText: /^Free$/ })
            .count(),
          3
        );
        assert.equal(
          await page.getByText(/Completed demo event|Unsafe event|Pi Builders Summit|Afrobeats City Night/).count(),
          0
        );
        assert.equal(await page.locator("time").count(), 6);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (scenario.width < 1024) {
          await page.getByLabel("Open SMAJ Events menu").click();
          await page.getByRole("navigation", { name: "SMAJ Events navigation" }).waitFor();
          const palette = await page
            .locator(".events-menu nav")
            .evaluate(e => ({
              bg: getComputedStyle(e).backgroundColor,
              surface: getComputedStyle(document.querySelector(".events-header")).backgroundColor,
            }));
          assert.equal(palette.bg, palette.surface);
          await page.locator(".events-menu summary").press("Escape");
          assert.equal(await page.locator(".events-menu").getAttribute("open"), null);
        }
        await page.getByRole("button", { name: "Free", exact: true }).click();
        assert.equal(await page.locator(".event-card").count(), 3);
        await page.getByRole("textbox", { name: "Search events" }).fill("Fabric");
        assert.equal(await page.locator(".event-card").count(), 1);
        await page.getByRole("textbox", { name: "Search events" }).fill("");
        await page.getByRole("button", { name: /^Save New Year/ }).click();
        await page.evaluate(() => window.go("/services/events/saved"));
        await page.getByRole("heading", { name: "Saved events", exact: true }).waitFor();
        assert.equal(await page.locator(".event-card").count(), 1);
        await page.locator(".event-card > a").click();
        await page
          .getByRole("heading", { name: "New Year, New Bot - Bring Your AI Desk Robot to Life", exact: true })
          .waitFor();
        assert.match(await page.locator(".event-dates").innerText(), /24 Nov 2026/);
        assert.match(await page.locator(".event-description").innerText(), /Bruno Capuano/);
        const register = page.getByRole("link", { name: /^Register for / });
        const href = await register.getAttribute("href");
        assert.equal(href, "https://developer.microsoft.com/en-us/reactor/events/27761/");
        if (scenario.platform === "web") {
          const [popup] = await Promise.all([page.waitForEvent("popup"), register.click()]);
          await popup.waitForLoadState();
          assert.equal(popup.url(), href);
          await popup.close();
        } else {
          await register.click();
          await page.waitForFunction(url => window.registered === url, href);
        }
        await page.evaluate(() => window.go("/services/events/checkout/reactor-27761"));
        await page.getByRole("heading", { name: "Register with the organizer" }).waitFor();
        assert.equal(await page.locator("form").count(), 0);
        await page.evaluate(() => window.go("/services/events/ticket/fake"));
        await page.getByRole("heading", { name: "Registration and tickets" }).waitFor();
        assert.equal(await page.getByText("Fake ticket", { exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("smaj_event_tickets")).length), 1);
        await page.evaluate(() => {
          Date.now = () => Date.parse("2026-12-04T00:00:00Z");
          window.go("/services/events");
          window.dispatchEvent(new Event("focus"));
        });
        await page.getByText("No upcoming events match your selection.").waitFor();
        assert.equal(await page.locator(".event-card").count(), 0);
        assert.equal(await page.evaluate(() => localStorage.getItem("smaj_public_theme")), scenario.theme);
        await context.close();
      }
    } finally {
      await browser?.close();
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(output, { recursive: true, force: true });
    }
  }
);
