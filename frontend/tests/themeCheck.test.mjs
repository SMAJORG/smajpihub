import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkThemeDiff } from '../scripts/check-theme.mjs';

const diff = (lines, file = 'frontend/src/components/Panel.css') =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +10,${lines.length} @@\n${lines.map(line => `+${line}`).join('\n')}`;

test('flags CSS colors and React inline colors with file and line numbers', () => {
  assert.equal(checkThemeDiff(diff(['.panel { background: #fff; color: black; border: 1px solid rgb(0,0,0); }'])).length, 3);
  assert.match(checkThemeDiff(diff(['<div style={{ backgroundColor: "white" }} />'], 'frontend/src/Panel.tsx'))[0], /Panel.tsx:10:/);
});

test('permits semantic tokens, token declarations, and documented exceptions', () => {
  assert.deepEqual(checkThemeDiff(diff([
    '.panel { background: var(--surface); color: var(--text); border: 1px solid var(--border); }',
    ':root { --surface: #fff; --text: #000; }',
    '.logo { fill: #fff; } /* theme-color-exception: fixed brand artwork */',
    '.panel { background: transparent; color: inherit; }',
  ])), []);
});

test('rejects empty exceptions and literal fallbacks', () => {
  assert.equal(checkThemeDiff(diff(['.panel { color: white; } /* theme-color-exception: */'])).length, 1);
  assert.equal(checkThemeDiff(diff(['.panel { color: var(--text, #000); }'])).length, 1);
});

test('ignores removed colors, comment-only lines, and files outside frontend source', () => {
  assert.deepEqual(checkThemeDiff(diff(['/* background: white; */'])), []);
  assert.deepEqual(checkThemeDiff(diff(['color: white;'], 'backend/example.ts')), []);
  assert.deepEqual(checkThemeDiff('+++ b/frontend/src/Panel.css\n@@ -1 +1 @@\n-color: white;\n+color: var(--text);'), []);
});
