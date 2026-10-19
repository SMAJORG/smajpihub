import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { instance, plugin, resources, catalogs, jsx, jsxs, originalContent, renderToStaticMarkup: render, localizeText, normalizeLanguage } = require('./localization-loader.cjs');
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
test('React preserves nested elements without adding DOM wrappers', async () => {
  await instance.changeLanguage('fr');
  const markup = render(jsxs('div', { children: [jsx('strong', { children: 'Save' }), jsx('button', { children: 'Cancel' })] }));
  assert.match(markup, /^<div><strong>(Enregistrer|Sauvegarder)<\/strong><button>Annuler<\/button><\/div>$/);
});
