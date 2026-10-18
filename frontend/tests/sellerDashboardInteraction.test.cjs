const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  ts = require("typescript");
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
} catch {}
test(
  "seller dashboard mobile, desktop, live updates, filters and confirmed product actions",
  { skip: !playwright, timeout: 300000 },
  async () => {
    const root = path.resolve("frontend"),
      output = fs.mkdtempSync(path.join(os.tmpdir(), "smaj-seller-review-"));
    const service = {};
    new Function(
      "exports",
      ts.transpileModule(
        fs.readFileSync("backend/src/services/sellerDashboard.ts", "utf8"),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        },
      ).outputText,
    )(service);
    await require("esbuild").build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import SellerPage from './src/pages/private/SellerPage';import './src/index.css';createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter><SellerPage/></MemoryRouter></React.StrictMode>);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      outfile: path.join(output, "fixture.js"),
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      external: ["/assets/*", "/chat-doodles.svg"],
      define: {
        "import.meta.env": JSON.stringify({ MODE: "test" }),
        "process.env.NODE_ENV": '"test"',
      },
      plugins: [
        {
          name: "fixture",
          setup(build) {
            build.onResolve({ filter: /^@mui\/icons-material\// }, () => ({
              path: "icon",
              namespace: "fixture-icon",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({
              contents:
                "import React from 'react';export default ()=>React.createElement('svg',{'aria-hidden':true});",
              resolveDir: root,
            }));
            build.onResolve({ filter: /(?:^|\/)AuthContext$/ }, () => ({
              path: "auth",
              namespace: "fixture-auth",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture-auth" }, () => ({
              contents: `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('fixture-account',fn);return()=>window.removeEventListener('fixture-account',fn)};export function useAuthContext(){const user=useSyncExternalStore(subscribe,()=>window.fixture.user);return {user,updateProfile:async delta=>{Object.assign(user,delta);return user}}}`,
              resolveDir: root,
            }));
          },
        },
      ],
    });
    console.log("Seller fixture bundled");
    const now = new Date(),
      iso = now.toISOString(),
      hash = "a".repeat(64),
      hash2 = "b".repeat(64);
    let owner = "seller",
      fail = false;
    const products = [
      {
        _id: "p1",
        sellerId: "seller",
        title: "Compact test product with a long readable title",
        pricePi: 2,
        image: "/photo.svg",
        quantity: 2,
        active: true,
        approved: true,
        reviewStatus: "approved",
        createdAt: iso,
        sellerAgreementAccepted: true,
      },
      {
        _id: "p2",
        sellerId: "seller",
        title: "Pending listing",
        pricePi: 3,
        image: "/photo.svg",
        quantity: 5,
        active: true,
        approved: false,
        reviewStatus: "pending",
        createdAt: iso,
      },
    ];
    const orders = [
      {
        _id: "o1",
        sellerId: "seller",
        buyerName: "Authorized buyer",
        productTitle: "Compact test product",
        pricePi: 2,
        status: "paid",
        paymentStatus: "paid",
        paidAt: iso,
        createdAt: iso,
      },
      {
        _id: "o2",
        sellerId: "seller",
        buyerName: "Mainnet buyer",
        productTitle: "Mainnet order",
        pricePi: 5,
        status: "paid",
        paymentStatus: "paid",
        paidAt: iso,
        createdAt: iso,
      },
    ];
    const settlements = [
      {
        orderId: "o1",
        sellerUid: "seller",
        network: "Pi Testnet",
        amountPi: 2,
        receiptTxid: hash,
        status: "held",
        createdAt: iso,
      },
      {
        orderId: "o2",
        sellerUid: "seller",
        network: "Pi Mainnet",
        amountPi: 5,
        receiptTxid: hash2,
        status: "held",
        createdAt: iso,
      },
    ];
    const matches = (row, query) =>
      Object.entries(query).every(([key, value]) =>
        value && typeof value === "object"
          ? "$in" in value
            ? value.$in.includes(row[key])
            : "$gte" in value
              ? new Date(row[key]) >= value.$gte
              : true
          : row[key] === value,
      );
    const collection = (rows) => ({
      find(query) {
        let data = rows.filter((row) => matches(row, query));
        return {
          sort() {
            return this;
          },
          limit(n) {
            data = data.slice(0, n);
            return this;
          },
          toArray: async () => structuredClone(data),
        };
      },
    });
    const locals = {
      productCollection: collection(products),
      marketplaceOrderCollection: collection(orders),
      reviewCollection: collection([{ sellerId: "seller", rating: 5 }]),
      settlementCollection: collection(settlements),
      paymentCollection: collection([]),
      notificationCollection: collection([
        {
          _id: "n1",
          userId: "seller",
          relatedId: "o1",
          type: "new_order",
          title: "New order",
          message: "A buyer placed an order",
          createdAt: iso,
        },
      ]),
      conversationCollection: collection([]),
      messageCollection: collection([]),
    };
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const json = (data, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/fixture") {
        res.setHeader("Content-Type", "text/html");
        return res.end(
          `<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.__ENV={apiBaseURL:location.origin};window.fixture={user:{uid:'seller',displayName:'Test Store',role:'seller',sellerActive:true}};localStorage.setItem('smaj_pi_user',JSON.stringify({uid:'seller',accessToken:'fixture-token'}));</script><script src="/fixture.js"></script>`,
        );
      }
      if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css") {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".js") ? "application/javascript" : "text/css",
        );
        return res.end(
          fs.readFileSync(path.join(output, url.pathname.slice(1))),
        );
      }
      if (url.pathname === "/photo.svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="purple"/></svg>',
        );
      }
      if (url.pathname === "/marketplace/seller/dashboard") {
        if (fail) { console.log("Serving seller 503"); return json({ message: "Unavailable" }, 503); }
        return json({
          ...(await service.buildSellerDashboard(locals, {
            uid: owner,
            displayName: owner === "seller" ? "Test Store" : "Bob Store",
            role: "seller",
            sellerActive: true,
            verificationStatus: "approved",
            verificationLevel: "trusted_seller",
          })),
          defaultNetwork: "Pi Testnet",
        });
      }
      if (url.pathname.startsWith("/marketplace/seller/products/")) {
        console.log("Seller mutation",req.method,url.pathname);
        const id = url.pathname.split("/")[4],
          index = products.findIndex(
            (row) => row._id === id && row.sellerId === owner,
          );
        if (index < 0) return json({}, 404);
        if (req.method === "DELETE") products.splice(index, 1);
        else {
          let body = "";
          for await (const chunk of req) body += chunk;
          products[index].active = JSON.parse(body).active;
        }
        return json({ ok: true });
      }
      json({}, 404);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.CHAT_TEST_BROWSER
        ? { executablePath: process.env.CHAT_TEST_BROWSER }
        : {}),
    });
    try {
      console.log("Seller browser launched");
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        page = await context.newPage(),
        errors = [];
      page.setDefaultTimeout(60000);
      page.on("pageerror", (error) => errors.push(error.message));
      console.log("Opening seller fixture");
      await page.goto("http://127.0.0.1:" + server.address().port + "/fixture");
      await page
        .getByRole("heading", { name: "Seller Dashboard", exact: true })
        .waitFor();
      await page.getByText("Test Store", { exact: true }).waitFor();
      await page.getByText("Trusted Seller", { exact: true }).waitFor();
      await page.waitForFunction(
        () => document.querySelector(".sw-stats")?.children.length === 4,
      );
      assert.equal(
        await page
          .locator(".sw-stats")
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          ),
        2,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        "No horizontal mobile overflow",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Activate Seller Tools", exact: true })
          .count(),
        0,
      );
      await page.getByRole("button", { name: "30 Days", exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "30 Days", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.getByRole("slider", { name: "Explore sales dates" }).fill("0");
      assert.match(
        await page.locator(".sw-chart-readout").innerText(),
        /0 verified payments/,
      );
      await page
        .getByLabel("Sales network", { exact: true })
        .selectOption("Pi Mainnet");
      assert.match(await page.locator(".sw-sales-total").innerText(), /5/);
      await page
        .getByLabel("Sales network", { exact: true })
        .selectOption("Pi Testnet");
      assert.match(await page.locator(".sw-sales-total").innerText(), /2/);
      console.log("Mobile and analytics verified");
      await page.setViewportSize({ width: 1280, height: 900 });
      assert.equal(
        await page
          .locator(".sw-stats")
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          ),
        4,
      );
      await page.locator(".sw-product-menu summary").first().click();
      await page
        .getByRole("button", { name: "Mark Sold Out", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(products[0].active, true);
      await page.locator(".sw-product-menu summary").first().click();
      await page
        .getByRole("button", { name: "Mark Sold Out", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm change", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector(".sw-products")
          ?.textContent.includes("Sold out"),
      );
      assert.equal(products[0].active, false);
      await page.locator(".sw-product-menu summary").first().click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page
        .getByRole("button", { name: "Delete product", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".sw-products>li").length === 1,
      );
      assert.equal(products.length, 1);
      console.log("Product actions verified");
      orders.push({
        _id: "o3",
        sellerId: "seller",
        productTitle: "Live new order",
        buyerName: "Buyer",
        pricePi: 1,
        status: "pending",
        paymentStatus: "pending",
        createdAt: new Date().toISOString(),
      });
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByText("Live new order", { exact: true }).waitFor();
      orders[2].status = "processing";
      orders[2].paymentStatus = "paid";
      orders[2].paidAt = new Date().toISOString();
      settlements.push({
        orderId: "o3",
        sellerUid: "seller",
        network: "Pi Testnet",
        amountPi: 1,
        receiptTxid: "d".repeat(64),
        status: "held",
        createdAt: orders[2].paidAt,
      });
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByText("processing", { exact: true }).waitFor();
      await page.waitForFunction(() =>
        document.querySelector(".sw-sales-total").textContent.includes("3"),
      );

      console.log("Payment and order updates verified");
      await context.setOffline(true);
      await page.waitForFunction(() =>
        document.querySelector(".sw-sync").textContent.includes("Offline"),
      );
      assert.equal(
        await page.getByText("Live new order", { exact: true }).count(),
        1,
      );
      await context.setOffline(false);
      await page.waitForFunction(
        () =>
          !document.querySelector(".sw-sync").textContent.includes("Offline"),
      );
      fail = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByRole("alert").waitFor({timeout:10000}).catch(async error=>{ console.error("Seller error state",await page.locator(".seller-workspace").innerText()); throw error; });
      assert.equal(
        await page.getByText("Live new order", { exact: true }).count(),
        1,
      );
      fail = false;
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.getByRole("alert").waitFor({ state: "detached" });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.dataset.privateTheme = "dark";
      });
      assert.notEqual(
        await page
          .locator(".sw-card")
          .first()
          .evaluate((node) => getComputedStyle(node).backgroundColor),
        "rgb(255, 255, 255)",
      );
      await page.screenshot({
        path: path.join(output, "seller-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(output, "seller-mobile.png"),
        fullPage: true,
      });
      owner = "bob";
      await page.evaluate(() => {
        window.fixture.user = {
          uid: "bob",
          displayName: "Bob Store",
          role: "seller",
        };
        localStorage.setItem(
          "smaj_pi_user",
          JSON.stringify({ uid: "bob", accessToken: "bob-token" }),
        );
        window.dispatchEvent(new Event("fixture-account"));
      });
      await page.getByText("Bob Store", { exact: true }).waitFor();
      await page
        .getByText("No orders yet. New orders will appear here.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.getByText("Live new order", { exact: true }).count(),
        0,
      );
      assert.deepEqual(errors, []);
      console.log("Seller screenshots:", output);
      await context.close();
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
