const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('esbuild');
const vm = require('node:vm');
const code = transformSync(readFileSync(require.resolve('../src/lib/piSdk.ts'), 'utf8'), {
  loader: 'ts', format: 'cjs',
  define: { 'import.meta.env.MODE': 'undefined', 'import.meta.env.VITE_SANDBOX_SDK': 'undefined' },
}).code;

function fixture(authenticate) {
  const timers = new Map(); let next = 0;
  const loaded = { exports: {} };
  vm.runInNewContext(code, {
    module: loaded, exports: loaded.exports,
    window: { Pi: { authenticate }, setTimeout(fn) { timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); } },
  });
  return { authenticate: loaded.exports.authenticatePiWithTimeout, timers };
}

test('Retry after a timeout reuses the outstanding Pi approval and clears its new timer', async () => {
  let complete, calls = 0;
  const sdk = new Promise(resolve => { complete = resolve; });
  const f = fixture(() => { calls++; return sdk; });
  const first = f.authenticate(['username', 'wallet_address'], 120000);
  const rejected = assert.rejects(first, /PI_AUTH_TIMEOUT/);
  await Promise.resolve();
  f.timers.values().next().value();
  await rejected;
  const retry = f.authenticate(['wallet_address', 'username'], 120000);
  await Promise.resolve();
  assert.equal(calls, 1, 'Retry must not open a second Pi approval');
  const identity = { accessToken: 'fixture-token', user: { uid: 'verified' } };
  complete(identity);
  assert.equal(await retry, identity);
  assert.equal(f.timers.size, 0, 'Both approval timers are cleared after Pi responds');
});

test('a completed or rejected SDK request does not poison subsequent authentication', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; if (calls === 1) throw Error('User denied'); return { user: { uid: 'verified' } }; });
  await assert.rejects(f.authenticate(['username'], 20000), /User denied/);
  assert.equal(f.timers.size, 0);
  assert.equal((await f.authenticate(['username'], 20000)).user.uid, 'verified');
  assert.equal(calls, 2);
  assert.equal(f.timers.size, 0);
});
