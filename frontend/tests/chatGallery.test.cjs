const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
const code = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "../src/lib/chatGallery.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const fixture = { platform: "web", available: false };
const out = {};
vm.runInNewContext(code, {
  exports: out,
  require: () => ({
    Capacitor: {
      getPlatform: () => fixture.platform,
      isPluginAvailable: () => fixture.available,
    },
    registerPlugin: () => ({}),
  }),
  File,
  Uint8Array,
  atob,
  Error,
});
const { hasNativeChatGallery, pickedMediaFile } = out;
test("web and old Android builds use the system picker fallback", () => {
  assert.equal(hasNativeChatGallery(), false);
  fixture.platform = "android";
  assert.equal(hasNativeChatGallery(), false);
  fixture.available = true;
  assert.equal(hasNativeChatGallery(), true);
});
test("cancelled native chooser does not create an attachment", () => {
  assert.equal(pickedMediaFile({ cancelled: true }), null);
});
test("a selected photo retains its actual filename and MIME type", async () => {
  const file = pickedMediaFile({
    name: "Camera photo.png",
    dataUrl: "data:image/png;base64,AQID",
  });
  assert.equal(file.name, "Camera photo.png");
  assert.equal(file.type, "image/png");
  assert.equal(file.size, 3);
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
});
test("selected video becomes a real video file for preview", () => {
  const file = pickedMediaFile({
    name: "clip.mp4",
    dataUrl: "data:video/mp4;base64,AQID",
  });
  assert.equal(file.type, "video/mp4");
  assert.equal(file.name, "clip.mp4");
});
test("non-media content and oversized media cannot enter the chat picker", () => {
  assert.throws(
    () => pickedMediaFile({ dataUrl: "data:text/html;base64,AQID" }),
    /photo or video/,
  );
  assert.throws(
    () =>
      pickedMediaFile({
        dataUrl: "data:image/png;base64," + "A".repeat(3000000),
      }),
    /too large/,
  );
  assert.throws(
    () =>
      pickedMediaFile({
        dataUrl: "data:video/mp4;base64," + "A".repeat(3400000),
      }),
    /too large/,
  );
});
