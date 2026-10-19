import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { instance, plugin, resources, catalogs, jsx, jsxs, originalContent, renderToStaticMarkup: render, localizeText, normalizeLanguage, createElement } = require('./localization-loader.cjs');
await instance.use(plugin).init({ resources, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false }, initAsync: false });
const codes = ['en', 'fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr'];
test('all ten catalogs contain every source message and valid interpolation', () => {
  assert.deepEqual(Object.keys(catalogs), codes);
  const keys = Object.keys(catalogs.en).sort();
  for (const code of codes) {
    assert.deepEqual(Object.keys(catalogs[code]).sort(), keys, code);
    for (const key of keys) {
      const value = catalogs[code][key];
      assert.equal(typeof value, 'string', `${code}: ${key}`); assert.ok(value.trim(), `${code}: ${key}`);
      assert.deepEqual((value.match(/\{\{v\d+\}\}/g) || []).sort(), (key.match(/\{\{v\d+\}\}/g) || []).sort(), `${code}: ${key}`);
    }
  }
});
test('rendered UI and accessibility attributes translate in every language', async () => {
  for (const code of codes) {
    await instance.changeLanguage(code);
    const markup = render(jsx('button', { 'aria-label': 'Save', title: 'Close', children: 'Save' }));
    assert.ok(markup.includes(String(localizeText('Save', instance))), code);
    assert.ok(markup.includes('aria-label='), code);
    if (code !== 'en') assert.notEqual(localizeText('Save', instance), 'Save', code);
    assert.ok(instance.exists('nav.home'), code);
    assert.ok(instance.t('home.steps', { returnObjects: true }).length, code);
  }
});
test('switching back restores English, and locale variants normalize', async () => {
  await instance.changeLanguage('ar'); assert.notEqual(localizeText('Save', instance), 'Save');
  await instance.changeLanguage('en'); assert.equal(render(jsx('button', { children: 'Save' })), '<button>Save</button>');
  for (const [variant, code] of [['zh-CN', 'zh'], ['zh-Hans-CN', 'zh'], ['pt_BR', 'pt'], ['ar-AE', 'ar'], ['de-DE', 'en']]) assert.equal(normalizeLanguage(variant), code);
});
test('form values, keys and user content remain original', async () => {
  await instance.changeLanguage('fr');
  assert.equal(render(jsx('input', { value: 'Save', readOnly: true })), '<input readOnly="" value="Save"/>');
  assert.equal(render(jsx('input', { type: 'submit', name: 'action', value: 'Save' })), '<input type="submit" name="action" value="Save"/>');
  const textarea = render(jsx('textarea', { placeholder: 'Save', defaultValue: 'Save' }));
  assert.match(textarea, /^<textarea placeholder="(Enregistrer|Sauvegarder)">Save<\/textarea>$/);
  assert.equal(render(jsx('span', { translate: 'no', children: jsx('strong', { children: 'Save' }) })), '<span translate="no"><strong>Save</strong></span>');
  assert.equal(render(jsx('div', { children: originalContent('Save') })), '<div>Save</div>');
  assert.equal(localizeText('An arbitrary user sentence that is not a catalog entry.', instance), 'An arbitrary user sentence that is not a catalog entry.');
  const select = render(jsx('select', { defaultValue: 'Save', children: jsx('option', { children: 'Save' }) }));
  assert.ok(select.includes('value="Save"')); assert.ok(/Enregistrer|Sauvegarder/.test(select));
});
test('templates retain inserted user values and surrounding whitespace', async () => {
  await instance.changeLanguage('fr');
  const template = Object.keys(catalogs.en).find(key => key === 'View {{v0}}');
  assert.ok(template);
  const translated = localizeText('  View My private product  ', instance);
  assert.ok(translated.startsWith('  ')); assert.ok(translated.endsWith('  ')); assert.ok(translated.includes('My private product'));
});
test('custom component data props survive while dependency display props localize', async () => {
  await instance.changeLanguage('fr');
  function Editor({ title }) { return jsx('input', { value: title, readOnly: true }); }
  assert.equal(render(jsx(Editor, { title: 'Save' })), '<input readOnly="" value="Save"/>');
  function DependencyButton({ children }) { return createElement('button', null, children); }
  assert.match(render(jsx(DependencyButton, { __smajDisplay: true, children: 'Save' })), /^<button>(Enregistrer|Sauvegarder)<\/button>$/);
  const transformed = require('@babel/core').transformSync('import { Button } from "@mui/material"; const UI = () => <Button>Save</Button>;', { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] }, plugins: [require('../scripts/localization/protect-content.cjs')] }).code;
  assert.match(transformed, /__smajDisplay=\{true\}/);
});
test('React preserves nested elements without adding DOM wrappers', async () => {
  await instance.changeLanguage('fr');
  const markup = render(jsxs('div', { children: [jsx('strong', { children: 'Save' }), jsx('button', { children: 'Cancel' })] }));
  assert.match(markup, /^<div><strong>(Enregistrer|Sauvegarder)<\/strong><button>Annuler<\/button><\/div>$/);
});

test('display numbers localize without changing currency precision or machine values', async () => {
  for (const code of codes) {
    await instance.changeLanguage(code);
    assert.equal(render(jsx('strong', { children: 1234 })), `<strong>${new Intl.NumberFormat(code === 'ar' ? 'ar-u-nu-arab' : code, { maximumFractionDigits: 20 }).format(1234)}</strong>`);
  }
  await instance.changeLanguage('ar');
  assert.equal(render(jsx('strong', { children: '$1,299.00' })), '<strong>$١٬٢٩٩٫٠٠</strong>');
  assert.equal(render(jsx('strong', { children: 'π 0.0002' })), '<strong>π ٠٫٠٠٠٢</strong>');
  assert.equal(render(jsx('input', { type: 'number', value: 1299, readOnly: true })), '<input type="number" readOnly="" value="1299"/>');
  assert.equal(render(jsx('span', { translate: 'no', children: 1234 })), '<span translate="no">1234</span>');
  assert.equal(render(jsx('span', { children: '1.0.2' })), '<span>1.0.2</span>');
  assert.equal(render(jsx('span', { children: originalContent('$1,299.00') })), '<span>$1,299.00</span>');
});

test('screenshot banner and backend error messages have actual translations', async () => {
  for (const code of codes.filter(code => code !== 'en')) {
    await instance.changeLanguage(code);
    for (const text of ['Start Your Business', 'BUILD YOUR FUTURE!', 'Sci-Fi & Fantasy', 'A downloadable video source is not available for this title.']) {
      assert.notEqual(localizeText(text, instance), text, `${code}: ${text}`);
    }
  }
});
