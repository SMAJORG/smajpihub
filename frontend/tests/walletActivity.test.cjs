const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function compile(file, resolve) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(resolve, result); return result;
}
const helpers = compile('lib/walletActivity.ts', name => require(name));
function render(data, selected = data.network, owner = 'alice', visible = true) {
  let index = 0;
  const values = [{ owner, data }, selected, 'all', '', 0, visible, false, ''];
  const component = compile('pages/private/WalletPage.tsx', name => {
    if (name === 'react') return { ...React, useState: () => [values[index++], () => {}], useEffect() {}, useCallback: fn => fn, useRef: value => ({ current: value }) };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-router-dom') return { Link: ({ to, children }) => React.createElement('a', { href: to }, children) };
    if (name.includes('AuthContext')) return { useAuthContext: () => ({ user: { uid: 'alice' } }) };
    if (name.includes('axiosClient')) return { axiosClient: { get() { throw Error('render must not request payment operations'); } } };
    if (name.includes('serviceCatalog')) return { serviceCatalog: [] };
    if (name.includes('lib/walletActivity')) return helpers;
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@mui/') || name.includes('components/')) return () => null;
    throw Error(name);
  }).default;
  return renderToStaticMarkup(React.createElement(component));
}
const stat = { count: 1, amountPi: 0.1234567 };
const snapshot = { network: 'testnet', filter: 'all', service: '', offset: 0, limit: 25, items: [{ id: 'one', service: 'food', title: 'Actual meal receipt', amountPi: 0.1234567, network: 'testnet', status: 'completed', verified: true, direction: 'outgoing', categories: ['payments'], date: '2026-10-17T10:00:00Z', paymentId: 'actual-payment', txid: 'a'.repeat(64), reference: 'receipt-one', href: '/app/services/food', note: '', recordedStatus: 'completed', orderStatus: '' }], total: 1, summary: { paid: stat, pending: stat, completed: stat, cancelled: stat }, networks: [], services: [{ id: 'food', name: 'SMAJ Food' }], supportedFilters: ['all', 'payments', 'orders'], balance: { available: false, amountPi: null }, serverTime: '2026-10-17T10:00:00Z' };
test('renders the real snapshot with compact actions, network warning and expandable details', () => {
  const html = render(snapshot);
  for (const text of ['My Wallet', '0.000 \u03c0', 'Not synced', 'Zero is a placeholder', 'Open Pi Wallet', 'Payment History', 'My Orders', 'Recent Activity', 'Actual meal receipt', 'SMAJ Food', 'actual-payment', 'not real funds or spendable Pi']) assert.ok(html.includes(text), text);
  assert.match(html, /<details/); assert.match(html, /pi-wallet-stat-grid/); assert.match(html, /0.1234567/);
});
test('network switching and account changes never flash a previous account or Testnet receipt', () => {
  const mainnet = render(snapshot, 'mainnet');
  assert.ok(!mainnet.includes('Actual meal receipt')); assert.ok(!mainnet.includes('0.1234567'));
  const switched = render(snapshot, 'testnet', 'bob');
  assert.ok(!switched.includes('Actual meal receipt')); assert.ok(!switched.includes('0.1234567'));
});
test('amount formatting preserves zero, unavailable records and hidden values', () => {
  assert.equal(helpers.walletAmount(0), '0');
  assert.equal(helpers.walletAmount(null), 'Amount unavailable');
  assert.equal(helpers.walletAmount(0.1234567, false), '****');
  assert.equal(helpers.walletStatusLabel('unverified'), 'Verification pending');
});

test('hide masks the balance and transaction amounts with four stars', () => {
  const html = render(snapshot, 'testnet', 'alice', false);
  assert.match(html, /pi-wallet-balance-value">\*\*\*\*</);
  assert.ok(!html.includes('0.000')); assert.ok(!html.includes('0.1234567'));
  assert.match(html, /Show wallet amounts/);
});
