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
