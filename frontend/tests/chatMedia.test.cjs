const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(extra = {}) {
  const exports = {}, requests = [];
  const code = ts.transpileModule(fs.readFileSync('frontend/src/lib/chatMedia.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({ axiosClient: { get: async (url, config) => { requests.push({ url, config }); return { data: new Blob(['audio'], { type: 'audio/webm' }) }; } } }), navigator: { onLine: true }, Blob, DOMException, Date, fetch, ...extra });
  return { ...exports, requests };
}
test('media requests use authenticated blob transport without credentials in the URL', async () => {
  const api = load();
  await api.getMessageBlob('alice', { _id: 'message', conversationId: 'thread' });
  assert.equal(api.requests[0].url, '/messages/thread/messages/message/media');
  assert.equal(api.requests[0].config.headers['X-SMAJ-Chat-Owner'], 'alice');
  assert.equal(api.requests[0].config.responseType, 'blob');
});
test('legacy inline voice notes remain playable without a network request', async () => {
  const api = load();
  const blob = await api.getMessageBlob('alice', { _id: 'message', conversationId: 'thread', audioDataUrl: 'data:audio/webm;base64,AQID' });
  assert.equal(blob.size, 3);
  assert.equal(api.requests.length, 0);
});
test('offline uncached media and cancelled downloads fail explicitly', async () => {
  const api = load({ navigator: { onLine: false } });
  await assert.rejects(api.getMessageBlob('alice', { _id: 'message', conversationId: 'thread' }), /not saved on this device/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.getMessageBlob('alice', { _id: 'message', conversationId: 'thread' }, controller.signal), /Cancelled/);
  await assert.rejects(api.getMessageBlob('', { _id: 'message', conversationId: 'thread' }), /Sign in/);
});
test('media eviction removes oldest files and enforces the 25 MB budget', () => {
  const api = load(), unit = 1024 * 1024;
  const ids = api.mediaEvictions([{ id: 'recent', size: 15 * unit, accessed: 3 }, { id: 'old', size: 8 * unit, accessed: 1 }, { id: 'middle', size: 8 * unit, accessed: 2 }]);
  assert.deepEqual([...ids], ['old']);
  assert.equal(api.CHAT_MEDIA_LIMIT, 25 * unit);
});
test('voice duration formatting handles initial, paused and invalid values', () => {
  const api = load();
  assert.equal(api.formatAudioTime(22), '0:22'); assert.equal(api.formatAudioTime(3.8), '0:03');
  assert.equal(api.formatAudioTime(65), '1:05'); assert.equal(api.formatAudioTime(Infinity), '0:00');
});
test('waveform samples come from decoded audio and audio contexts close on failure', async () => {
  let closes = 0;
  const api = load({ AudioContext: class { async decodeAudioData() { return { getChannelData: () => new Float32Array(64).fill(.5) }; } async close() { closes++; } } });
  const wave = await api.audioWaveform(new Blob(['sample']));
  assert.equal(wave.length, 32); assert.ok(wave.every(value => value === 1)); assert.equal(closes, 1);
  const failed = load({ AudioContext: class { async decodeAudioData() { throw Error('Unsupported codec'); } async close() { closes++; } } });
  assert.equal(await failed.audioWaveform(new Blob(['sample'])), null); assert.equal(closes, 2);
});
