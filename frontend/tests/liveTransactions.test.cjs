const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const hash = "a".repeat(64);
const row = {
  transactionId: hash,
  amount: 2.5,
  time: "2026-01-01T10:00:00Z",
  timeKind: "completion",
  network: "Pi Testnet",
  verified: true,
  explorerUrl: `https://blockexplorer.minepi.com/testnet/transactions/${hash}`,
};
const tick = () => new Promise(r => setImmediate(r));
function setup(response) {
  let states = [],
    cursor = 0,
    effect,
    cleanup,
    interval,
    cleared = false,
    called = [];
  global.window = {
    setInterval: (fn, ms) => {
      assert.equal(ms, 10000);
      interval = fn;
      return 42;
    },
    clearInterval: id => {
      assert.equal(id, 42);
      cleared = true;
    },
  };
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "../src/components/LiveTransactions.tsx"),
    "utf8"
  );
  const exports = {};
  const mockReact = {
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
    useEffect: fn => {
      effect = fn;
    },
  };
  new Function(
    "require",
    "exports",
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } })
      .outputText
  )(name => {
    if (name === "react") return mockReact;
    if (name === "react/jsx-runtime") return require("react/jsx-runtime");
    if (name === "./LiveTransactions.css") return {};
    if (name === "../lib/axiosClient")
      return {
        axiosClient: {
          get: async (url, options) => {
            called.push({ url, options });
            if (response instanceof Error) throw response;
            return { data: response };
          },
        },
      };
    throw Error(name);
  }, exports);
  const render = () => {
    cursor = 0;
    return renderToStaticMarkup(React.createElement(exports.default));
  };
  return {
    render,
    mount: () => {
      cleanup = effect();
    },
    refresh: () => interval(),
    cleanup: () => cleanup(),
    called,
    cleared: () => cleared,
  };
}
test("honest empty state, Testnet badge, ten-second polling and cleanup", async () => {
  const app = setup({ network: "Pi Testnet", transactions: [], availability: "ready" });
  assert(app.render().includes("Loading verified"));
  app.mount();
  await tick();
  assert(app.render().includes("No verified Testnet transactions yet."));
  assert(app.render().includes("Testnet"));
  app.refresh();
  await tick();
  assert.equal(app.called.length, 2);
  assert.equal(app.called[0].url, "/transactions/live");
  app.cleanup();
  assert(app.cleared());
  assert(app.called[0].options.signal.aborted);
});
test("transaction details, proper table semantics and safe explorer links", async () => {
  const app = setup({
    network: "Pi Testnet",
    transactions: [row, { ...row, transactionId: "b".repeat(64), network: "Pi Network" }],
    availability: "ready",
  });
  app.render();
  app.mount();
  await tick();
  const html = app.render();
  assert(html.includes(hash));
  assert(html.includes("2.5"));
  assert(html.includes("Verified"));
  assert(html.includes("View on Blockchain"));
  assert(html.includes('scope="col"'));
  assert(html.includes("Transaction</th>"));
  assert(!html.includes("Completed app payments"));
  assert(!html.includes("Refreshes every"));
  assert(!html.includes("Up to 10"));
  assert(html.includes("dateTime=") || html.includes("datetime="));
  assert(!html.includes("b".repeat(64)));
  app.cleanup();
});
test("malicious URLs and missing links are never rendered as clickable links", async () => {
  const app = setup({ network: "Pi Testnet", transactions: [{ ...row, explorerUrl: "javascript:alert(1)" }] });
  app.render();
  app.mount();
  await tick();
  const html = app.render();
  assert(!html.includes("javascript:"));
  assert(html.includes("Link unavailable"));
  app.cleanup();
});
test("request errors report unavailable rather than fabricate transactions", async () => {
  const app = setup(Error("private-api-error"));
  app.render();
  app.mount();
  await tick();
  const html = app.render();
  assert(html.includes("temporarily unavailable"));
  assert(html.includes("No verified Testnet transactions yet."));
  assert(!html.includes("private-api-error"));
  app.cleanup();
});
test("mobile layout keeps a compact table and inline badge", () => {
  const css = fs.readFileSync(require("node:path").join(__dirname, "../src/components/LiveTransactions.css"), "utf8");
  assert(css.includes("max-width: 600px"));
  assert(css.includes("overflow-wrap: anywhere"));
  assert(css.includes("table-layout: fixed"));
  assert(css.includes("flex-shrink: 0"));
  assert(!css.includes("attr(data-label)"));
});
