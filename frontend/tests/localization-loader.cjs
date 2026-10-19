// Test-only TS loader: avoids writing a second copy of all locale catalogs or
// spawning a bundler on constrained machines. Production uses Vite normally.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, allowJs: true } }).outputText;
  const requireFromFile = createRequire(filename);
  const localRequire = name => {
    if (!name.startsWith('.')) return requireFromFile(name);
    const resolved = path.resolve(path.dirname(filename), name);
    if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return load(fs.existsSync(resolved) ? resolved : `${resolved}.ts`);
  };
  vm.runInThisContext(`(function(exports, require, module, __filename, __dirname) { ${source}\n})`, { filename })(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}
module.exports = {
  ...load(path.join(__dirname, '../src/localization/catalog.ts')),
  ...load(path.join(__dirname, '../src/localization/jsx-runtime.ts')),
  ...load(path.join(__dirname, '../src/localization/languages.ts')),
  instance: require('i18next').createInstance(),
  plugin: require('react-i18next').initReactI18next,
  renderToStaticMarkup: require('react-dom/server').renderToStaticMarkup,
  createElement: require('react').createElement,
};
