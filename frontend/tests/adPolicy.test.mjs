import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const output = {};
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync(new URL("../src/lib/adPolicy.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
)(output);
test("sensitive and unknown routes never select an ad", () => {
  for (const path of [
    "/signin",
    "/signin/callback",
    "/checkout",
    "/cart",
    "/payment-method",
    "/wallet",
    "/app/wallet",
    "/admin",
    "/orders",
    "/settings",
    "/store/product/1",
    "/app/services/stream/watch/1",
  ]) {
    assert.equal(output.placementForPath(path), undefined, path);
  }
});
test("registered pages select their intended format without matching descendants", () => {
  assert.equal(output.placementForPath("/dashboard"), "homeBanner");
  assert.equal(output.placementForPath("/store"), "storeNative");
  assert.equal(output.placementForPath("/app/services/stream"), "streamNative");
  assert.equal(output.placementForPath("/app/services"), "discoveryReward");
  assert.equal(output.placementForPath("/app/services/stream/watch"), undefined);
});
test("reserved slots never intersect navigation, fixed controls, or viewport edges", () => {
  const rect = { top: 500, bottom: 550, left: 12, right: 348 };
  assert.equal(output.canDisplayAdSlot(rect, 360, 600), true);
  assert.equal(output.canDisplayAdSlot(rect, 360, 540), false, "bottom navigation overlaps");
  assert.equal(output.canDisplayAdSlot({ ...rect, top: -1 }, 360, 600), false, "partially scrolled offscreen");
  assert.equal(output.canDisplayAdSlot({ ...rect, right: 361 }, 360, 600), false, "too wide after rotation");
  assert.equal(
    output.canDisplayAdSlot(rect, 360, 600, [{ left: 300, right: 350, top: 510, bottom: 560 }]),
    false,
    "floating control overlaps"
  );
  assert.equal(
    output.canDisplayAdSlot(rect, 360, 600, [{ left: 0, right: 360, top: 0, bottom: 70 }]),
    true,
    "header clear of ad"
  );
});
