const assert = require('node:assert/strict'), path = require('node:path'), Module = require('node:module'), esbuild = require('esbuild');
async function main() {
  global.__voicePermissionFixture = { platform: 'web', state: 'granted', calls: 0 };
  const result = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../src/lib/voiceRecording.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'native-permission-fixture', setup(build) {
    build.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const Capacitor={getPlatform:()=>global.__voicePermissionFixture.platform};export const registerPlugin=()=>({requestMicrophone:async()=>{global.__voicePermissionFixture.calls++;return{state:global.__voicePermissionFixture.state}}});', loader: 'js' }));
  } }] });
  const fixtureModule = new Module(__filename); fixtureModule._compile(result.outputFiles[0].text, __filename);
  const { ensureVoicePermission, voiceRecordingError } = fixtureModule.exports;
  await ensureVoicePermission(); assert.equal(global.__voicePermissionFixture.calls, 0, 'Web browser must not call the Android bridge');
  global.__voicePermissionFixture.platform = 'android'; await ensureVoicePermission(); assert.equal(global.__voicePermissionFixture.calls, 1);
  global.__voicePermissionFixture.state = 'denied'; await assert.rejects(ensureVoicePermission(), error => error.name === 'NotAllowedError');
  assert.match(voiceRecordingError(new DOMException('', 'NotAllowedError')), /access was denied/);
  assert.match(voiceRecordingError(new DOMException('', 'NotReadableError')), /Close other apps/);
  assert.match(voiceRecordingError(new DOMException('', 'NotFoundError')), /No microphone/);
  assert.doesNotMatch(voiceRecordingError(new Error('recorder failed')), /permission.*needed/i);
  console.log('Android permission gating and accurate recording error handling passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
