const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http");
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
} catch {}
test(
  "compact settings retain controls, save semantics, privacy, confirmations and platform actions",
  { skip: !playwright, timeout: 600000 },
  async () => {
    const root = path.resolve("frontend"),
      output = fs.mkdtempSync(path.join(os.tmpdir(), "smaj-settings-review-")),
      apiPath = path.join(root, "src/lib/axiosClient").replace(/\\/g, "/");
    const modules = {
      auth: `import {axiosClient} from '${apiPath}';export function useAuthContext(){return {user:window.fixture.user,updateSettings:async value=>{window.fixture.settingsCalls.push(value);return (await axiosClient.post('/fixture/settings',value)).data;},updateProfile:async value=>{window.fixture.profileCalls.push(value);const {data}=await axiosClient.post('/fixture/profile',value);window.fixture.user={...window.fixture.user,...data.user};return window.fixture.user;},signOut:async()=>{window.fixture.signouts++;}}}`,
      updates: `export const APP_VERSION='1.0.test';export const checkAppUpdate=async native=>{window.fixture.checks.push(native);return {available:window.fixture.native,native,version:'1.0.test',details:'Verified test update'};};export const installAppUpdate=async(info,progress)=>{window.fixture.installs++;progress({stage:'installing'});};`,
      push: `export const getPushState=async()=>({supported:true,subscribed:window.fixture.webPush});export const enablePushNotifications=async()=>{window.fixture.webPush=true;window.fixture.pushCalls.push('web-enable');};export const disablePushNotifications=async()=>{window.fixture.webPush=false;window.fixture.pushCalls.push('web-disable');};`,
      nativePush: `export const supportsNativePushNotifications=()=>window.fixture.native;export const getNativePushState=async()=>({supported:true,subscribed:window.fixture.nativePush});export const enableNativePushNotifications=async()=>{window.fixture.nativePush=true;window.fixture.pushCalls.push('native-enable');};export const disableNativePushNotifications=async()=>{window.fixture.nativePush=false;window.fixture.pushCalls.push('native-disable');};`,
      ads: `import {useSyncExternalStore} from 'react';export const supportsAds=()=>true;export const useAdConsent=()=>useSyncExternalStore(fn=>{window.addEventListener('fixture-consent',fn);return()=>window.removeEventListener('fixture-consent',fn)},()=>window.fixture.consent);export const updateAdConsent=value=>{window.fixture.consent=value;window.dispatchEvent(new Event('fixture-consent'));};export const nativeAds={consent:async({allowed})=>({...window.fixture.consent,allowed,canRequestAds:allowed}),privacy:async()=>{window.fixture.adPrivacy++;return window.fixture.consent;}};`,
      core: `export * from '${root.replace(/\\/g, "/")}/node_modules/@capacitor/core/dist/index.js';import {Capacitor as original} from '${root.replace(/\\/g, "/")}/node_modules/@capacitor/core/dist/index.js';export const Capacitor={...original,isNativePlatform:()=>window.fixture.native};`,
    };
    await require("esbuild").build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {createBrowserRouter,RouterProvider} from 'react-router-dom';import Settings from './src/pages/private/SettingsPage';import './src/index.css';const Shell=()=> <div className="private-shell full-screen-page"><div className="full-screen-tab-page"><Settings/></div><nav id="fixture-nav" style={{position:'fixed',bottom:0,height:62,width:'100%',background:'var(--smaj-card)',zIndex:45}}>Navigation</nav></div>;const router=createBrowserRouter([{path:'/settings/preferences',element:<Shell/>},{path:'*',element:<h1>Destination</h1>}]);createRoot(document.getElementById('root')).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      absWorkingDir: root,
      alias: { "@mui/styled-engine": "@mui/styled-engine-sc" },
      outfile: path.join(output, "fixture.js"),
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      external: ["/assets/*", "/chat-doodles.svg"],
      define: { "import.meta.env": JSON.stringify({ MODE: "test" }), "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "fixtures",
          setup(build) {
            const patterns = [
              [/AuthContext$/, "auth"],
              [/\/appUpdates$/, "updates"],
              [/\/pushNotifications$/, "push"],
              [/\/nativePushNotifications$/, "nativePush"],
              [/\/nativeAds$/, "ads"],
              [/^@capacitor\/core$/, "core"],
            ];
            for (const [filter, key] of patterns)
              build.onResolve({ filter }, () => ({ path: key, namespace: "fixture" }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: key }) => ({
              contents: modules[key],
              resolveDir: root,
            }));

          },
        },
      ],
    });
    const requests = [];
    let failSave = false,
      failDelete = false,
      delay = 0;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost"),
        json = (data, status = 200) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        };
      if (url.pathname === "/settings/preferences") {
        res.setHeader("Content-Type", "text/html");
        return res.end(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(min-width:1024px){#fixture-nav{display:none}}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.__ENV={apiBaseURL:location.origin};window.fixture={native:${url.searchParams.has("native")},user:{uid:'alice',username:'AlicePi',piUsername:'AlicePi',displayName:'Alice Example',role:'buyer',country:'Nigeria',contactPhone:'test-contact',avatar:'/avatar.svg',bio:'Real profile',language:'English',verificationLevel:'basic',verificationStatus:'none',settings:{notifications:true}},settingsCalls:[],profileCalls:[],pushCalls:[],checks:[],installs:0,signouts:0,adPrivacy:0,webPush:false,nativePush:false,consent:{allowed:false,canRequestAds:false,privacyRequired:true}};localStorage.setItem('smaj_pi_user',JSON.stringify({accessToken:'fixture-token'}));localStorage.setItem('smaj_language_explicit','true');window.fixture.welcomes=0;window.addEventListener('smaj:welcome-tour-open',()=>window.fixture.welcomes++);</script><script src="/fixture.js"></script>`
        );
      }
      if (["/fixture.js", "/fixture.css"].includes(url.pathname)) {
        res.setHeader("Content-Type", url.pathname.endsWith(".js") ? "application/javascript" : "text/css");
        return res.end(fs.readFileSync(path.join(output, url.pathname.slice(1))));
      }
      if (url.pathname === "/avatar.svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="purple"/></svg>'
        );
      }
      if (url.pathname === "/user/stats")
        return json({ stats: { totalProducts: 12, approvedListings: 10, successfulOrders: 5, completedSales: 2 } });
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : {};
      requests.push({ path: url.pathname, body });
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (url.pathname === "/fixture/settings" || url.pathname === "/fixture/profile")
        return json(url.pathname.endsWith("profile") ? { user: body } : { ok: true }, failSave ? 500 : 200);
      if (url.pathname === "/support") return json({ ok: !failDelete }, failDelete ? 500 : 200);
      if (url.pathname === "/user/verification-request") return json({ ok: true });
      return json({}, 404);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}),
    });
    try {
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          userAgent: "Mozilla/5.0 Chrome/130.0 PiBrowser/1.0",
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const base = `http://127.0.0.1:${server.address().port}`,
        group = title => page.getByRole("button", { name: new RegExp("^" + title.replace(/[&]/g, "&")) }),
        save = () => page.getByRole("button", { name: "Save Changes", exact: true });
      await page.goto(base + "/settings/preferences");
      await group("Account & Identity").waitFor();
      assert.equal(await page.locator(".settings-group").count(), 5);
    assert.equal(await page.locator(".settings-menu-card > .settings-group").count(), 5);
      assert.equal(await page.locator(".settings-group-body:visible").count(), 0);
      assert.equal(await save().count(), 0);
      assert.match(
        await page.getByRole("region", { name: "Account profile" }).innerText(),
        /Alice Example.*@AlicePi.*Not verified/s
      );
      await page.screenshot({ path: path.join(output, "settings-mobile-light.png"), fullPage: true });
      await group("Account & Identity").click();
    await page.getByRole("button",{name:"Request Real Pi User Verification",exact:true}).click();
    await page.getByRole("status").filter({hasText:"Verification request submitted"}).waitFor();
    assert.deepEqual(requests.find(item=>item.path==='/user/verification-request').body,{level:'pi_verified'});
    assert.equal(await save().count(),0);
    await group("Notifications").click();
      await page.getByRole("switch", { name: /^Phone push notifications/ }).click();
      assert.equal(await save().count(), 0);
      assert.deepEqual(await page.evaluate(() => window.fixture.pushCalls), ["web-enable"]);
      const email = page.getByRole("switch", { name: /^Email notifications/ });
      await email.uncheck();
      await save().waitFor();
      await email.check();
      assert.equal(await save().count(), 0);
      await email.uncheck();
      await page.getByRole("switch", { name: /^Product\/order notifications/ }).uncheck();
      await page.getByRole("switch", { name: /^Message notifications/ }).uncheck();
      await group("Privacy & Security").click();
      assert.equal(await page.locator(".settings-group-body:visible").count(), 1);
      assert.equal(
        await page.getByRole("link", { name: /^App Lock/ }).getAttribute("href"),
        "/settings/security/app-lock"
      );
      assert.equal(
        await page.getByRole("link", { name: /^Devices & Sessions/ }).getAttribute("href"),
        "/settings/devices"
      );
      await page.getByRole("switch", { name: /^Show profile publicly/ }).uncheck();
      await page.getByRole("switch", { name: /^Allow sellers\/buyers/ }).uncheck();
      await group("Account & Identity").click();
      await page.getByLabel(/^Account type/).selectOption("Both");
      await save().click();
      await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
      assert.equal(await save().count(), 0);
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("smaj_account_settings")));
      assert.equal(persisted.accountType, "Both");
      for (const key of [
        "emailNotifications",
        "productNotifications",
        "messageNotifications",
        "publicProfile",
        "allowContact",
      ])
        assert.equal(persisted[key], false, key);
      const profile = requests.find(item => item.path === "/fixture/profile").body;
      assert.equal(profile.role, "buyer");
      assert.equal(profile.sellerActive, true);
      assert.equal(profile.country, "Nigeria");
      assert.equal(profile.displayName, "Alice Example");
      assert.equal(profile.avatar, "/avatar.svg");
      assert.deepEqual(requests.find(item => item.path === "/fixture/settings").body, {
        theme: "light",
        language: "English",
        notifications: false,
      });
      await page.reload();
      await group("Notifications").click();
      assert.equal(await email.isChecked(), false);
      assert.equal(await save().count(), 0);
      failSave = true;
      await email.check();
      await save().click();
      await page.getByRole("status").filter({ hasText: "could not be saved" }).waitFor();
      assert.ok(await save().isVisible());
      failSave = false;
      await save().click();
      await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
      delay = 800;
      await email.uncheck();
      await save().click();
      await page.getByRole("button", { name: "Saving...", exact: true }).waitFor();
      await page.getByRole("switch", { name: /^Message notifications/ }).check();
      await save().waitFor();
      assert.ok(await save().isVisible());
      delay = 0;
      await save().click();
      await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
      assert.equal(await save().count(), 0);
      await group("Appearance & Language").click();
      await page.getByRole("switch", { name: /^Dark mode/ }).check();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
      await save().click();
      await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
      await page.getByRole("button", { name: "Choose language", exact: true }).click();
      const language = page.locator(".language-choice-dialog");
      await language.getByLabel(/^Language/).selectOption("fr");
      await language.getByRole("button", { name: "Save", exact: true }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem("smaj_language")), "fr");
      assert.equal(await save().count(), 0);
      await page.reload();
      await group("Appearance & Language").click();
      assert.equal(await page.getByRole("switch", { name: /^Dark mode/ }).isChecked(), true);
      await page.getByRole("button", { name: "Choose language" }).click();
      assert.equal(
        await page
          .locator(".language-choice-dialog")
          .getByLabel(/^Language/)
          .inputValue(),
        "fr"
      );
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await group("Privacy & Security").click();
      await page.getByText("Advertising privacy", { exact: true }).click();
      await page.getByRole("button", { name: "Review consent and allow test ads" }).click();
      await page.getByRole("button", { name: "Disable ads on this device" }).waitFor();
      await page.getByRole("button", { name: "Manage privacy choices" }).click();
      assert.equal(await page.evaluate(() => window.fixture.adPrivacy), 1);
      assert.equal(await save().count(), 0);
      await page.getByRole("button", { name: "Delete account", exact: true }).click();
      let dialog = page.getByRole("dialog", { name: "Delete account?", exact: true });
      await dialog.waitFor();
      const confirmation = dialog.getByLabel("Confirmation");
      await confirmation.fill("delete");
      assert.equal(await dialog.getByRole("button", { name: "Submit Request" }).isDisabled(), true);
      await confirmation.fill("DELETE");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Delete account", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Delete account?", exact: true });
      assert.equal(await dialog.getByLabel("Confirmation").inputValue(), "");
      await dialog.getByLabel("Confirmation").fill("DELETE");
      failDelete = true;
      await dialog.getByRole("button", { name: "Submit Request" }).click();
      await dialog.getByRole("alert").waitFor();
      assert.ok(await dialog.isVisible());
      failDelete = false;
      await dialog.getByRole("button", { name: "Submit Request" }).click();
      await page.getByRole("status").filter({ hasText: "support review" }).waitFor();
      assert.equal(await page.getByRole("dialog", { name: "Delete account?", exact: true }).count(), 0);
      assert.equal(requests.filter(item => item.path === "/support").length, 2);
      assert.equal(await page.evaluate(() => window.fixture.signouts), 0);
      await group("App & Support").click();
      assert.equal(await page.getByRole("link", { name: /^Help Center/ }).getAttribute("href"), "/app/help-center");
      await page.getByRole("button", { name: /^Check version/ }).click();
      await page.getByRole("dialog", { name: "Up to date", exact: true }).waitFor();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Replay welcome tour" }).click();
    assert.equal(await page.evaluate(()=>window.fixture.welcomes),1);
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, "settings-mobile-dark.png"), fullPage: true });
      await page.getByRole("button", { name: "Log Out", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Sign out?", exact: true })
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      assert.equal(await page.evaluate(() => window.fixture.signouts), 0);
      await page.getByRole("button", { name: "Log Out", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Sign out?", exact: true })
        .getByRole("button", { name: "Logout", exact: true })
        .click();
      await page.waitForURL("**/home");
      const nativeContext = await browser.newContext({ viewport: { width: 390, height: 844 } }),
        native = await nativeContext.newPage();
      await native.goto(base + "/settings/preferences?native");
      await native.getByRole("button", { name: /^Notifications/ }).click();
      await native.getByRole("switch", { name: /^Phone push notifications/ }).click();
      assert.deepEqual(await native.evaluate(() => window.fixture.pushCalls), ["native-enable"]);
      assert.equal(await native.getByRole("button", { name: "Save Changes", exact: true }).count(), 0);
      await native.getByRole("button", { name: /^App & Support/ }).click();
      await native.getByRole("button", { name: /^Check version/ }).click();
      await native
        .getByRole("dialog", { name: "New Version", exact: true })
        .getByRole("button", { name: "Update", exact: true })
        .click();
      await native.waitForFunction(() => window.fixture.installs === 1);
      await nativeContext.close();
      assert.deepEqual(errors, []);
      console.log("Settings browser flows passed; screenshots:", output);
      await context.close();
    } finally {
      await browser.close();
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  }
);
