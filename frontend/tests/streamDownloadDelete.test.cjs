const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  ts = require("typescript");
const React = require("react");
function setup(onRemoveDownload) {
  const states = [];
  let cursor = 0,
    creatorDeletes = 0;
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "../src/pages/stream/StreamVideoActions.tsx"),
    "utf8"
  );
  const exports = {};
  const modules = {
    react: {
      useState: initial => {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          value => {
            states[i] = value;
          },
        ];
      },
      useRef: value => ({ current: value }),
      useEffect: () => {},
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-dom": { createPortal: element => element },
    "react-router-dom": { useNavigate: () => () => {} },
    "@capacitor/core": { Capacitor: { isNativePlatform: () => false } },
    "../../native/smajMedia": { SmajMedia: {} },
    "../../lib/streamCreator": {
      deleteCreatorVideo: () => {
        creatorDeletes++;
      },
    },
    "../../lib/streamPlayback": {},
    "../../lib/streamPlaybackTracking": {},
    "./StreamVideoActions.css": {},
  };
  new Function(
    "require",
    "exports",
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } })
      .outputText
  )(name => (name.startsWith("@mui/") ? { default: () => null, __esModule: true } : modules[name]), exports);
  global.document = { body: {} };
  const render = () => {
    cursor = 0;
    return exports.default({ video: { title: "Saved movie", cloudflareUid: "id" }, onRemoveDownload });
  };
  const all = root => {
    if (!root || typeof root !== "object") return [];
    if (Array.isArray(root)) return root.flatMap(all);
    return [root, ...all(root.props?.children)];
  };
  const button = (tree, text) =>
    all(tree).find(
      node => node.type === "button" && all(node.props.children).some(child => child.props?.children === text)
    );
  return { render, all, button, creatorDeletes: () => creatorDeletes };
}
test("download menu confirms and deletes only the viewer's download", async () => {
  let removed = 0;
  const app = setup(async () => {
    removed++;
  });
  app
    .all(app.render())
    .find(n => n.type === "button")
    .props.onClick();
  app.button(app.render(), "Delete download").props.onClick();
  const confirm = app.render();
  const confirmButton = app.all(confirm).find(n => n.type === "button" && n.props.children === "Delete download");
  confirmButton.props.onClick();
  await new Promise(r => setImmediate(r));
  assert.equal(removed, 1);
  assert.equal(app.creatorDeletes(), 0);
  assert(!app.all(app.render()).some(n => n.props?.role === "dialog"));
});
test("normal video menus do not expose download removal", () => {
  const app = setup();
  app
    .all(app.render())
    .find(n => n.type === "button")
    .props.onClick();
  assert.equal(app.button(app.render(), "Delete download"), undefined);
});
test("delete failure keeps confirmation visible and reports the error", async () => {
  const app = setup(async () => {
    throw { response: { data: { message: "Could not remove download" } } };
  });
  app
    .all(app.render())
    .find(n => n.type === "button")
    .props.onClick();
  app.button(app.render(), "Delete download").props.onClick();
  app
    .all(app.render())
    .find(n => n.type === "button" && n.props.children === "Delete download")
    .props.onClick();
  await new Promise(r => setImmediate(r));
  assert(app.all(app.render()).some(n => n.props?.children === "Could not remove download"));
  assert.equal(app.creatorDeletes(), 0);
});

function removalSetup({ native = false, serverFails = false } = {}) {
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "../src/pages/stream/StreamWorkspacePage.tsx"),
    "utf8"
  );
  const start = source.indexOf("  const deleteDownloadedTitle = async");
  const end = source.indexOf("  const saveCompletedMovie = async", start);
  const code = ts.transpileModule(source.slice(start, end) + "exports.run = deleteDownloadedTitle;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [],
    removedDownloadKeys = { current: new Set() },
    exports = {};
  let rows = [
    { id: "1", mediaType: "movie" },
    { id: "2", mediaType: "movie" },
  ];
  new Function(
    "exports",
    "readNativeDownload",
    "removeStreamDownload",
    "Capacitor",
    "SmajMedia",
    "window",
    "nativeDownloadKey",
    "removedDownloadKeys",
    "setRemoteTitles",
    "STREAM_DOWNLOADS_CHANGED_EVENT",
    "Event",
    code
  )(
    exports,
    () => ({ downloadId: 99 }),
    async (type, id) => {
      calls.push(["account", type, id]);
      if (serverFails) throw Error("offline");
    },
    { isNativePlatform: () => native },
    { deleteDownload: async options => calls.push(["device", options.downloadId]) },
    { localStorage: { removeItem: key => calls.push(["local", key]) }, dispatchEvent: () => calls.push(["event"]) },
    (type, id) => type + ":" + id,
    removedDownloadKeys,
    update => {
      rows = update(rows);
    },
    "downloads-changed",
    Event
  );
  return { remove: () => exports.run({ id: "1", mediaType: "movie" }), calls, rows: () => rows, removedDownloadKeys };
}
test("web download deletion updates account and list without calling native files", async () => {
  const app = removalSetup();
  await app.remove();
  assert.equal(app.rows().length, 1);
  assert.equal(app.rows()[0].id, "2");
  assert(!app.calls.some(call => call[0] === "device"));
  assert(app.removedDownloadKeys.current.has("movie:1"));
});
test("Android deletion removes the managed offline copy and local tracking", async () => {
  const app = removalSetup({ native: true });
  await app.remove();
  assert.deepEqual(app.calls.slice(0, 3), [
    ["account", "movie", "1"],
    ["device", 99],
    ["local", "movie:1"],
  ]);
  assert.equal(app.rows().length, 1);
});
test("account deletion failure retains list and offline file", async () => {
  const app = removalSetup({ native: true, serverFails: true });
  await assert.rejects(app.remove(), /offline/);
  assert.equal(app.rows().length, 2);
  assert.equal(app.calls.length, 1);
});
