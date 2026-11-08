const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('the Android app declares the special access needed for user-approved APK updates', () => {
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const declaration = manifest.match(/<uses-permission\b[^>]*android:name="android.permission.REQUEST_INSTALL_PACKAGES"[^>]*\/>/);
  assert.ok(declaration, 'Android cannot grant install access without its manifest declaration');
  assert.doesNotMatch(declaration[0], /tools:node="remove"/);
});

test('release verification rejects missing install access and permits declared access to reach package validation', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smaj-install-access-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tools = path.join(dir, 'build-tools', '36.0.0');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(tools, { recursive: true });
  fs.mkdirSync(bin);
  const command = (file, body) => fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  // Stub only the external APK tools. Exercise the real release gate without
  // pretending this fixture is a signed Android build.
  command(path.join(tools, 'apksigner'), 'exit 0');
  command(path.join(tools, 'zipalign'), 'exit 0');
  command(path.join(bin, 'unzip'), 'exit 0');
  command(path.join(tools, 'aapt'), `if [ "$2" = permissions ]; then\n  printf '%s\\n' "$TEST_APK_PERMISSIONS"\nelse\n  echo "package: name='fixture.invalid' versionCode='30000' versionName='1.0.30000'"\nfi`);
  const verify = permission => spawnSync('bash', [path.join(root, 'scripts/verify-android-apk.sh'), path.join(dir, 'fixture.apk')], {
    encoding: 'utf8', env: { ...process.env, ANDROID_HOME: dir, RUNNER_TEMP: dir, SMAJ_ANDROID_VERSION_CODE: '30000', VITE_APP_VERSION: '1.0.30000', TEST_APK_PERMISSIONS: permission, PATH: `${bin}:${process.env.PATH}` },
  });
  const missing = verify('uses-permission: android.permission.INTERNET');
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /Missing REQUEST_INSTALL_PACKAGES/);
  const declared = verify('uses-permission: android.permission.REQUEST_INSTALL_PACKAGES');
  assert.equal(declared.status, 1);
  assert.match(declared.stdout, /Unexpected package name/);
  assert.doesNotMatch(declared.stdout, /Missing REQUEST_INSTALL_PACKAGES/);
});
