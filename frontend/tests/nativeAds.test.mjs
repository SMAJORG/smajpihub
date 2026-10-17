import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(fs.readFileSync(new URL("../src/lib/nativeAds.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function supported(native, platform, userAgent) {
  const result = {};
  new Function("require", "exports", "navigator", source)(
    name =>
      name === "@capacitor/core"
        ? {
            Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
            registerPlugin: () => ({}),
          }
        : {},
    result,
    { userAgent }
  );
  return result.supportsAds();
}
test("only the native Android app supports ads", () => {
  assert.equal(supported(true, "android", "Android WebView"), true);
  assert.equal(supported(false, "web", "Android Chrome"), false);
  assert.equal(supported(false, "web", "PiBrowser"), false);
  assert.equal(supported(true, "ios", "iPhone"), false);
});
test("Pi Browser remains excluded even with an Android platform signal", () => {
  assert.equal(supported(true, "android", "Android PiBrowser/1.0"), false);
  assert.equal(supported(true, "android", "Android Pi Browser"), false);
});
