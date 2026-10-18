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
  "product wizard preserves creation, drafts, uploads, pricing, advanced options and edit publication",
  { skip: !playwright, timeout: 240000 },
  async () => {
    const root = path.resolve("frontend"),
      output = fs.mkdtempSync(path.join(os.tmpdir(), "smaj-product-wizard-"));
    await require("esbuild").build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {createBrowserRouter,RouterProvider,Link} from 'react-router-dom';import Add from './src/pages/private/AddProductPage';import Edit from './src/pages/private/EditProductPage';import './src/index.css';const Shell=({children})=><div className="private-shell full-screen-page"><div className="full-screen-tab-page">{children}</div><nav id="fixture-nav" style={{position:'fixed',bottom:0,height:62,width:'100%',background:'white',zIndex:45}}><Link to="/seller">Seller dashboard</Link></nav></div>;const router=createBrowserRouter([{path:'/fixture',element:<Shell><Add/></Shell>},{path:'/edit/:id',element:<Shell><Edit/></Shell>},{path:'/seller',element:<h1>Seller destination</h1>}]);createRoot(document.getElementById('root')).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      outfile: path.join(output, "fixture.js"),
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      external: ["/assets/*", "/chat-doodles.svg"],
      define: { "import.meta.env": JSON.stringify({ MODE: "test" }), "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "fixture-auth",
          setup(build) {
            build.onResolve({ filter: /(?:^|\/)AuthContext$/ }, () => ({ path: "auth", namespace: "fixture" }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export function useAuthContext(){return {user:window.fixture.user,updateProfile:async value=>({...window.fixture.user,...value}),refreshPiSession:async()=>{window.fixture.refreshes++;return true}}}`,
              resolveDir: root,
            }));
          },
        },
      ],
    });
    const posts = [],
      puts = [],
      uploads = [];
    let published,
      authRetry = true,
      uploadFailure = false;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const json = (data, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (["/fixture", "/edit/p1", "/seller"].includes(url.pathname)) {
        res.setHeader("Content-Type", "text/html");
        return res.end(
          `<meta name="viewport" content="width=device-width, initial-scale=1"><style>@media(min-width:1024px){#fixture-nav{display:none}}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.__ENV={apiBaseURL:location.origin};window.fixture={refreshes:0,user:{uid:'seller',role:'seller',sellerActive:true,country:'Nigeria',contactPhone:'seller-contact'}};localStorage.setItem('smaj_pi_user',JSON.stringify({uid:'seller',accessToken:'fixture-token'}));</script><script src="/fixture.js"></script>`
        );
      }
      if (["/fixture.js", "/fixture.css"].includes(url.pathname)) {
        res.setHeader("Content-Type", url.pathname.endsWith(".js") ? "application/javascript" : "text/css");
        return res.end(fs.readFileSync(path.join(output, url.pathname.slice(1))));
      }
      if (url.pathname === "/photo.svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="purple"/></svg>'
        );
      }
      if (req.method === "GET" && url.pathname === "/marketplace/seller/products/p1")
        return json({
          product: {
            ...published,
            _id: "p1",
            attributes: { preserved: "yes" },
            seo: { slug: "existing-slug", metaTitle: "Existing SEO", metaDescription: "Preserved metadata" },
          },
        });
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : {};
      if (url.pathname.startsWith("/uploads/")) {
        uploads.push({ url: url.pathname, body, auth: req.headers.authorization });
        if (uploadFailure) return json({ message: "Upload temporarily unavailable" }, 500);
        return json(
          url.pathname.endsWith("/images")
            ? { urls: body.images.map((_, i) => `http://127.0.0.1:${server.address().port}/photo.svg?image=${i}`) }
            : { url: `http://127.0.0.1:${server.address().port}/photo.svg?variant=1` }
        );
      }
      if (req.method === "POST" && url.pathname === "/marketplace/products") {
        posts.push(body);
        if (authRetry) {
          authRetry = false;
          return json({ message: "Refresh session" }, 401);
        }
        published = body;
        return json({ product: { ...body, _id: "p1", reviewStatus: "pending" } });
      }
      if (req.method === "PUT" && url.pathname === "/marketplace/seller/products/p1") {
        puts.push(body);
        return json({ product: body });
      }
      json({}, 404);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.CHAT_TEST_BROWSER ? { executablePath: process.env.CHAT_TEST_BROWSER } : {}),
    });
    try {
      const base = `http://127.0.0.1:${server.address().port}`,
        context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
        page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(base + "/fixture");
      await page.getByRole("heading", { name: "Product Information", exact: true }).waitFor();
      assert.equal(await page.locator("[data-product-step]:visible").count(), 2);
      assert.equal(await page.getByRole("button", { name: "Publish for Review", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.locator("#product-error-title").waitFor();
      await page.locator("[name=title]").fill("Samsung laptop");
      await page.locator("[name=quantity]").fill("3");
      await page
        .locator("[name=description]")
        .fill("A genuine laptop with its original charger and accurate condition details.");
      assert.equal(await page.getByLabel(/^Category/).inputValue(), "Electronics");
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.getByRole("heading", { name: "Photos & Pricing", exact: true }).waitFor();
      await page
        .locator("[name=images]")
        .setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("invalid") });
      await page.getByRole("alert").filter({ hasText: "each 10 MB" }).waitFor();
      const photo = color => ({
        name: color + ".svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="${color}"/></svg>`
        ),
      });
      await page
        .locator("[name=images]")
        .setInputFiles(Array.from({ length: 13 }, (_, i) => photo(i === 0 ? "red" : "blue")));
      await page.waitForFunction(() => document.querySelectorAll(".product-gallery-preview figure").length === 12);
      const before = await page.locator(".product-gallery-preview img").first().getAttribute("src");
      await page.locator(".product-gallery-preview button").first().click();
      assert.notEqual(await page.locator(".product-gallery-preview img").first().getAttribute("src"), before);
      assert.equal(await page.locator(".product-gallery-preview figure").count(), 11);
      await page.locator("[name=priceUsdt]").fill("314159");
      assert.equal(await page.locator("[name=pricePi]").inputValue(), "1");
      await page.locator("[name=pricePi]").fill("2");
      assert.equal(await page.locator("[name=priceUsdt]").inputValue(), "628318");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "Photos & Pricing", exact: true }).waitFor();
      assert.equal(await page.locator("[name=pricePi]").inputValue(), "2");
      assert.equal(await page.locator(".product-gallery-preview figure").count(), 11);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      assert.equal(await page.locator("[name=title]").inputValue(), "Samsung laptop");
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.getByRole("heading", { name: "Product Options", exact: true }).waitFor();
      await page.getByLabel("Processor", { exact: true }).fill("Original processor");
      await page.getByText("Variants", { exact: true }).click();
      await page.getByRole("button", { name: "Add Variant", exact: true }).click();
      await page.getByLabel("Variant stock", { exact: true }).fill("2");
      await page.getByLabel("Variant $ price (USDT)", { exact: true }).fill("314159");
      await page.getByLabel("Variant image", { exact: true }).setInputFiles(photo("green"));
      await page.getByLabel("Delivery time", { exact: true }).fill("2-4 days");
      await page.getByText("Warranty / Returns", { exact: true }).click();
      await page.getByLabel(/^Warranty/).selectOption("1 Year");
      await page.getByLabel(/^Return Policy/).selectOption("14 Days");
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.getByRole("heading", { name: "Review & Publish", exact: true }).waitFor();
      await page.getByLabel(/^State\/Region/).selectOption({ label: "Lagos" });
      await page.locator("[name=city]").selectOption({ index: 1 });
      await page.locator("[name=areaAddress]").fill("A real address summary");
      assert.equal(await page.getByRole("button", { name: "Publish for Review", exact: true }).isDisabled(), true);
      await page.locator("[name=sellerAgreementAccepted]").check();
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.reload();
      await page.getByRole("heading", { name: "Review & Publish", exact: true }).waitFor();
      assert.equal(await page.locator("[name=sellerAgreementAccepted]").isChecked(), false);
      await page.locator("[name=sellerAgreementAccepted]").check();
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
      const theme = await page.getByRole("button", { name: "Publish for Review", exact: true }).evaluate(button => {
        const probe = document.createElement("span");
        probe.style.background = "var(--smaj-primary)";
        document.body.append(probe);
        const result = [getComputedStyle(button).backgroundColor, getComputedStyle(probe).backgroundColor];
        probe.remove();
        return result;
      });
      assert.equal(theme[0], theme[1]);
      await page.screenshot({ path: path.join(output, "review-mobile-dark.png"), fullPage: true });
      uploadFailure = true;
      await page.getByRole("button", { name: "Publish for Review", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Upload temporarily unavailable" }).waitFor();
      assert.equal(posts.length, 0);
      assert.equal(await page.locator("[name=title]").inputValue(), "Samsung laptop");
      uploadFailure = false;
      await page.getByRole("heading", { name: "Photos & Pricing", exact: true }).waitFor();
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.getByRole("button", { name: "Next", exact: false }).click();
      await page.getByRole("button", { name: "Publish for Review", exact: true }).click();
      await page.getByRole("heading", { name: "Seller destination" }).waitFor();
      assert.equal(posts.length, 2);
      assert.deepEqual(posts[0], posts[1]);
      assert.equal(published.pricePi, 2);
      assert.equal(published.priceUsdt, 628318);
      assert.equal(published.images.length, 11);
      assert.equal(published.image, published.images[0]);
      assert.equal(published.specifications.Processor, "Original processor");
      assert.equal(published.variants[0].pricePi, 1);
      assert.equal(published.variants[0].stock, 2);
      assert.equal(published.warranty, "1 Year");
      assert.equal(published.returnPolicy, "14 Days");
      assert.equal(published.sellerAgreementAccepted, true);
      assert.ok(uploads.every(row => row.auth === "Bearer fixture-token"));
      assert.equal(await page.evaluate(() => localStorage.getItem("smaj_add_product_draft")), null);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(base + "/edit/p1");
      await page.getByLabel("Product title", { exact: true }).fill("Updated existing laptop");
      await page.getByRole("button", { name: "Save Product", exact: true }).click();
      await page.getByRole("heading", { name: "Seller destination" }).waitFor();
      assert.equal(puts.length, 1);
      assert.equal(puts[0].title, "Updated existing laptop");
      assert.equal(puts[0].seo.slug, "existing-slug");
      assert.equal(puts[0].attributes.preserved, "yes");
      assert.equal(puts[0].images.length, 11);
      assert.equal(puts[0].variants[0].stock, 2);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base + "/fixture");
      await page.locator("[name=title]").fill("Unsaved product");
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("smaj_add_product_draft")) throw new DOMException("Full", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await page.locator("[name=description]").fill("This draft must remain here when local device storage is full.");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "could not save" }).waitFor();
      await page.getByRole("link", { name: "Seller dashboard", exact: true }).click();
      await page.getByRole("alertdialog").waitFor();
      await page.getByRole("button", { name: "Stay and save draft" }).click();
      assert.equal(await page.locator("[name=title]").inputValue(), "Unsaved product");
      assert.deepEqual(errors, []);
      const extraContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const extra = await extraContext.newPage();
      await extra.goto(base + "/fixture");
      await extra.locator("[name=title]").fill("General real item");
      await extra.locator("[name=description]").fill("A real product with a clear and accurate description.");
      await extra.getByRole("button", { name: "Next", exact: false }).click();
      await extra.locator("[name=images]").setInputFiles(photo("green"));
      await extra.waitForFunction(() => document.querySelectorAll(".product-gallery-preview figure").length === 1);
      await extra.locator("[name=priceUsdt]").fill("314159");
      await extra.getByRole("button", { name: "Next", exact: false }).click();
      const categories = [
        ["Fashion & Clothing", "Gender"],
        ["Electronics", "Processor"],
        ["Cars & Vehicles", "Mileage"],
        ["Home & Living", "Dimensions"],
        ["Beauty & Health", "Expiry Date"],
        ["Sports & Outdoors", "Material"],
        ["Books & Education", "ISBN"],
        ["Digital Products", "License Type"],
        ["Services", "Availability"],
      ];
      for (const [category, field] of categories) {
        await extra.getByRole("button", { name: "Back", exact: true }).click();
        await extra.getByRole("button", { name: "Back", exact: true }).click();
        await extra.getByLabel(/^Category/).selectOption(category);
        await extra.getByRole("button", { name: "Next", exact: false }).click();
        await extra.getByRole("button", { name: "Next", exact: false }).click();
        assert.ok(
          await extra
            .getByLabel(new RegExp("^" + field))
            .first()
            .isVisible(),
          category
        );
        if (category === "Digital Products") assert.ok(await extra.getByLabel("File URL", { exact: true }).isVisible());
        if (category === "Services") assert.ok(await extra.getByLabel("Duration", { exact: true }).first().isVisible());
      }
      await extraContext.close();
      console.log("Product wizard browser flows passed; screenshots:", output);
      await context.close();
    } finally {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  }
);
