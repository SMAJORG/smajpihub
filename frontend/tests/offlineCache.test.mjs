import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import vm from "node:vm";

const source = readFileSync(new URL("../src/lib/offlineCache.ts", import.meta.url), "utf8");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;

const createCache = () => {
  const storage = new Map();
  const window = { localStorage: { getItem: key => storage.get(key) || null } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    window,
    Date,
    Error,
    JSON,
    Map,
    Promise,
    Set,
  });
  return { cache: module.exports, storage };
};

test("cached reads use separate keys for different accounts", async () => {
  const { cache, storage } = createCache();
  storage.set("smaj_pi_user", JSON.stringify({ uid: "account-a" }));
  const keyA = cache.buildResponseCacheKey("/profile");
  await cache.storeCachedResponse(keyA, {
    data: { name: "A" },
    status: 200,
    statusText: "OK",
    headers: {},
    cachedAt: Date.now(),
  });

  storage.set("smaj_pi_user", JSON.stringify({ uid: "account-b" }));
  const keyB = cache.buildResponseCacheKey("/profile");
  assert.notEqual(keyA, keyB);
  assert.equal(await cache.readCachedResponse(keyB), null);
  assert.equal(JSON.parse(JSON.stringify(await cache.readCachedResponse(keyA))).data.name, "A");
});

test("clearing an account removes its cache and blocks writes from an older generation", async () => {
  const { cache } = createCache();
  const namespace = "account-a";
  const key = cache.buildResponseCacheKey("/profile", undefined, namespace);
  const generation = cache.getResponseCacheGeneration(namespace);
  const response = { data: { name: "A" }, status: 200, statusText: "OK", headers: {}, cachedAt: Date.now() };
  await cache.storeCachedResponse(key, response, namespace, generation);

  await cache.clearCachedResponsesForNamespace(namespace);
  await cache.storeCachedResponse(key, response, namespace, generation);

  assert.equal(await cache.readCachedResponse(key), null);
  assert.equal(cache.isResponseCacheGenerationCurrent(namespace, generation), false);
});

test("volatile, payment, and administrative endpoints are not cached", () => {
  const { cache } = createCache();
  for (const path of [
    "/food-delivery/orders",
    "/education/admin/teacher-applications",
    "/jobs/billing/intents/123",
    "/marketplace/seller/settlements",
  ]) {
    assert.equal(cache.isCacheableApiRead(path), false, path);
  }
});
