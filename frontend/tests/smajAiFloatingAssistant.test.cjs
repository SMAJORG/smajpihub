const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../src/components/SmajAiFloatingAssistant.tsx');
const appRequire = createRequire(filename);
const ts = appRequire('typescript');
const React = appRequire('react');
const { renderToStaticMarkup } = appRequire('react-dom/server');
const { MemoryRouter } = appRequire('react-router-dom');

test('the restored AI assistant uses the original logo and opens the existing AI route, independently of Messages', () => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const output = {};
  new Function('exports', 'require', compiled)(output, appRequire);
  const markup = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/dashboard'] }, React.createElement(output.default)));
  assert.match(markup, /aria-label="SMAJ AI"/);
  assert.match(markup, /href="\/ai"/);
  assert.match(markup, /aria-label="Open SMAJ AI"/);
  assert.match(markup, /src="\/smaj-ai-logo.png"/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../public/smaj-ai-logo.png')));
  assert.doesNotMatch(markup, /live-activity|Open Messages|Open live activity|\/messages/);
});

test('AI invitations last six seconds, appear at most twice per session, and skip dialogs or typing', () => {
  const effects = [], timers = new Map(), values = new Map();
  let invitation = false, nextTimer = 0, blocked = false, typing = false;
  const schedule = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  const output = {};
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', 'window', 'document', compiled)(output,
    name => name === 'react' ? { useEffect: effect => effects.push(effect), useState: () => [invitation, value => { invitation = value; }] } : appRequire(name),
    { sessionStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, matchMedia: () => ({ matches: true }), setTimeout: schedule, setInterval: schedule, clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id) },
    { hidden: false, querySelector: () => blocked ? {} : null, activeElement: { matches: () => typing } },
  );
  output.default({ userId: 'alice' });
  const cleanup = effects[0]();
  const initial = [...timers.values()].find(timer => timer.delay === 20000);
  const repeat = [...timers.values()].find(timer => timer.delay === 180000);
  blocked = true; initial.callback(); assert.equal(invitation, false); assert.equal(values.size, 0);
  blocked = false; typing = true; initial.callback(); assert.equal(invitation, false);
  typing = false; initial.callback(); assert.equal(invitation, true);
  [...timers.values()].find(timer => timer.delay === 6000).callback(); assert.equal(invitation, false);
  repeat.callback(); assert.equal(invitation, true);
  [...timers.values()].filter(timer => timer.delay === 6000).at(-1).callback();
  repeat.callback(); assert.equal(invitation, false);
  assert.equal(values.get('smaj-ai-invitations:alice'), '2');
  cleanup();
  timers.clear();
  output.default({ userId: 'alice' });
  const cleanupAfterRemount = effects[1]();
  [...timers.values()].find(timer => timer.delay === 20000).callback();
  assert.equal(invitation, false, 'remounting must preserve the session invitation limit');
  cleanupAfterRemount();
});
