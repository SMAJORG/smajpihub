const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function fixture({ native = false, pi, browser = async () => {} } = {}) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/chatLinks.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', 'window', 'navigator', code)(name => name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => native } } : { Browser: { open: browser } }, output, { Pi: pi }, { userAgent: pi ? 'PiBrowser/1.0' : 'Mozilla/5.0' });
  return output;
}
const api = fixture();
test('X, YouTube, Unicode hosts, queries, long paths and multiple links preserve visible text and actual targets', () => {
  const urls = ['https://x.com/Devsmaj/status/2117556322388349196', 'https://youtu.be/video?t=12', 'https://www.youtube.com/watch?v=abc&list=xyz#time', 'https://example.org/' + 'a'.repeat(1000) + '?a=1&b=2', 'https://例え.テスト/path', 'http://example.com/test'];
  const text = urls.join('\n');
  const parts = api.chatLinkParts(text);
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), urls.map(url => new URL(url).href));
});
test('sentence punctuation is preserved outside links, while balanced URL parentheses stay inside', () => {
  const text = 'Read (https://en.wikipedia.org/wiki/URL_(disambiguation)). Then https://example.com?q=yes!';
  const parts = api.chatLinkParts(text);
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.deepEqual(parts.filter(part => part.href).map(part => part.text), ['https://en.wikipedia.org/wiki/URL_(disambiguation)', 'https://example.com?q=yes']);
});
test('unsafe schemes, malformed URLs, hidden controls and misleading credentials never produce executable links', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'blob:https://example.com/abc', '//example.com', 'https://', 'https://example.com:99999', 'https://trusted.example@evil.example/', 'https://example.com/\u202eevil']) {
    assert.equal(api.safeChatUrl(value), null, value);
    assert.equal(api.chatLinkParts(value).filter(part => part.href).length, 0, value);
  }
  assert.equal(api.chatLinkParts('javascript:https://example.com').filter(part => part.href).length, 0);
});
test('native devices and supported Pi Browser use their real external browser APIs; ordinary browsers keep native anchor behavior', async () => {
  const url = 'https://x.com/Devsmaj/status/2117556322388349196';
  const native = [], pi = [];
  await fixture({ native: true, browser: async value => native.push(value) }).openChatUrl(url);
  await fixture({ pi: { openUrlInSystemBrowser: async value => pi.push(value) } }).openChatUrl(url);
  assert.deepEqual(native, [{ url }]); assert.deepEqual(pi, [url]);
  assert.equal(api.openChatUrl(url), undefined);
  assert.equal(api.openChatUrl('javascript:alert(1)'), undefined);
});
test('React escapes malicious markup and produces protected anchors instead of interpreting message HTML', () => {
  const { createRequire } = require('node:module');
  const file = path.join(__dirname, '../src/components/ChatMessageText.tsx');
  const appRequire = createRequire(file), React = appRequire('react'), { renderToStaticMarkup } = appRequire('react-dom/server');
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => name.endsWith('/chatLinks') ? api : name.endsWith('.css') ? {} : appRequire(name), output);
  const markup = renderToStaticMarkup(React.createElement(output.default, { text: '<img src=x onerror=alert(1)> https://example.com/?a=1&b=2 javascript:alert(1)' }));
  assert.match(markup, /&lt;img/); assert.doesNotMatch(markup, /<img|<script|href="javascript:/);
  assert.match(markup, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(markup, /rel="noopener noreferrer"/); assert.match(markup, /target="_blank"/);
});
