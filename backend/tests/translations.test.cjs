const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/handlers/translations.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
  exports: exportsObject, require: name => name === '../environments' ? {} : require(name), console, Date, Map, Set,
});
const mount = exportsObject.default;
const languages = [{ code: 'en', targets: ['en', 'fr', 'ar'] }, { code: 'fr', targets: ['fr', 'en'] }];
function fixture({ url = 'https://provider.invalid', post, get, now, overrides } = {}) {
  const routes = {}, calls = [];
  const router = { post: (url, handler) => { routes[url] = handler; }, get: (url, handler) => { routes[url] = handler; } };
  mount(router, { url, key: 'server-only-secret', now, overrides }, {
    get: async (...args) => get ? get(...args) : ({ data: languages }),
    post: async (...args) => { calls.push(args); return post ? post(...args) : { data: { translatedText: ['Bonjour'] } }; },
  });
  const invoke = async (body, route = '/batch', ip = 'test') => {
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(data) { this.body = data; return this; } };
    await routes[route]({ body, ip, socket: {} }, res);
    return res;
  };
  return { invoke, calls };
}
const request = { texts: ['Hello'], source: 'en', target: 'fr' };
test('disabled provider returns explicit unavailable status', async () => {
  const { invoke, calls } = fixture({ url: '' });
  const res = await invoke(request);
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'translation_not_configured'); assert.equal(calls.length, 0);
});
test('LibreTranslate array response, server-only key, timeout and cache', async () => {
  const { invoke, calls } = fixture();
  const first = await invoke(request), second = await invoke(request);
  assert.equal(first.body.status, 'translated'); assert.deepEqual(Array.from(first.body.translations), ['Bonjour']);
  assert.equal(second.body.translations[0], 'Bonjour'); assert.equal(calls.length, 1);
  assert.equal(calls[0][1].api_key, 'server-only-secret'); assert.equal(calls[0][2].timeout, 8000);
  assert.ok(!JSON.stringify(first.body).includes('secret'));
});
test('legacy compatible array response is supported', async () => {
  const { invoke } = fixture({ post: async () => ({ data: [{ translatedText: 'Bonjour' }] }) });
  assert.equal((await invoke(request)).body.translations[0], 'Bonjour');
});
test('missing, truncated, blank and unchanged output never report success or cache', async () => {
  for (const data of [{}, { translatedText: [] }, { translatedText: [''] }, { translatedText: ['Hello'] }]) {
    const { invoke, calls } = fixture({ post: async () => ({ data }) });
    const res = await invoke(request); await invoke(request);
    assert.equal(res.body.status, 'unavailable'); assert.ok(res.statusCode >= 400); assert.equal(calls.length, 2); assert.equal(res.body.translations, undefined);
  }
});
test('unsupported source/target pairs are rejected before provider translation', async () => {
  const { invoke, calls } = fixture();
  assert.equal((await invoke({ ...request, target: 'ha' })).body.code, 'translation_unsupported_pair');
  assert.equal((await invoke({ ...request, source: 'ar' })).body.code, 'translation_unsupported_pair');
  assert.equal(calls.length, 0);
});
test('input validation preserves strings and rejects invalid types and oversized batches', async () => {
  for (const body of [{ ...request, texts: [1] }, { ...request, texts: [' '] }, { ...request, texts: ['a'.repeat(1001)] }, { ...request, texts: Array(21).fill('Hi') }, { ...request, target: 'de' }, { ...request, source: 'fr' }]) {
    const { invoke, calls } = fixture(); assert.equal((await invoke(body)).statusCode, 400); assert.equal(calls.length, 0);
  }
});
test('cache expires and differentiates source languages', async () => {
  let time = 0;
  const { invoke, calls } = fixture({ now: () => time });
  await invoke(request); await invoke({ ...request, source: 'auto' }); assert.equal(calls.length, 2);
  time = 300001; await invoke(request); assert.equal(calls.length, 3);
});
test('provider failures are sanitized and retryable, not successful originals', async () => {
  const { invoke } = fixture({ post: async () => { throw new Error('server-only-secret'); } });
  const res = await invoke(request); assert.equal(res.statusCode, 502); assert.equal(res.body.code, 'translation_provider_unavailable'); assert.ok(!JSON.stringify(res.body).includes('secret'));
});
test('rate limiting bounds translation requests', async () => {
  const { invoke } = fixture(); for (let i = 0; i < 30; i++) await invoke(request);
  const res = await invoke(request); assert.equal(res.statusCode, 429); assert.equal(res.headers['Retry-After'], '60');
});
test('rate window resets after one minute', async () => {
  let time = 0;
  const { invoke } = fixture({ now: () => time });
  for (let i = 0; i < 31; i++) await invoke(request);
  time = 60001;
  assert.equal((await invoke(request)).body.status, 'translated');
});
test('capabilities explicitly report missing languages', async () => {
  const { invoke } = fixture(); const res = await invoke({}, '/languages');
  assert.equal(res.body.status, 'available'); assert.deepEqual(Array.from(res.body.sourcesByTarget.fr), ['en']); assert.equal(res.body.sourcesByTarget.ha.length, 0);
});
test('legacy capability discovery deduplicates URLs and respects its one-slot budget', async () => {
  let active = 0, maximum = 0, count = 0;
  const { invoke } = fixture({ overrides: { ar: 'https://ar.invalid', sw: 'https://sw.invalid', zh: 'https://zh.invalid' }, get: async () => {
    active++; count++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--; return { data: languages };
  } });
  await invoke({}, '/languages');
  assert.equal(count, 4); assert.equal(maximum, 1);
});
test('global concurrency limit rejects excess work and releases failed slots', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { invoke } = fixture({ post: async () => { await waiting; return { data: { translatedText: ['Bonjour'] } }; } });
  const first = invoke(request), second = invoke(request);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await invoke(request)).body.code, 'translation_busy'); release(); await Promise.all([first, second]);
  assert.equal((await invoke(request)).body.status, 'translated');
});
