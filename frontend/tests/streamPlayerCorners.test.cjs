const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), ts = require("typescript"), path = require("node:path");
test("fullscreen header puts Back first and exposes a working PiP action at the right", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/pages/stream/StreamFullscreenFrame.tsx"), "utf8");
  let state = 0, pipCalls = 0;
  const modules = {
    react: { useState: initial => [state++ === 0 ? true : initial, () => {}], useRef: initial => ({ current: initial }), useEffect: () => {}, useCallback: fn => fn },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@capacitor/core": { Capacitor: { isNativePlatform: () => true } },
    "@capacitor/screen-orientation": {}, "@capacitor/status-bar": {}, "../../native/smajMedia": {},
  };
  const exports = {};
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => name.startsWith("@mui/") ? { __esModule: true, default: () => null } : modules[name], exports);
  const tree = exports.default({ className: "test-player", title: "Video", children: null, onPictureInPicture: () => pipCalls++ });
  const nodes = root => !root || typeof root !== "object" ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)];
  const header = nodes(tree).find(n => n.props?.className === "sw-player-controls-top has-pip");
  const buttons = nodes(header).filter(n => n.type === "button");
  assert.equal(buttons[0].props["aria-label"], "Leave fullscreen");
  assert.equal(buttons.at(-1).props["aria-label"], "Picture in Picture");
  buttons.at(-1).props.onClick(); assert.equal(pipCalls, 1);
});
