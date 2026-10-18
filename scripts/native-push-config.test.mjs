import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const app = JSON.parse(readFileSync(new URL('app.json', root), 'utf8')).expo;

test('Android builds pick up Firebase credentials, without which no push token exists', () => {
  const config = readFileSync(new URL('app.config.ts', root), 'utf8');
  assert.match(config, /process\.env\.GOOGLE_SERVICES_JSON/);
  assert.match(config, /googleServicesFile/);
});

test('notifications use a monochrome status-bar icon on the default channel', () => {
  const [, options] = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications');
  assert.equal(options.defaultChannel, 'default');
  assert.ok(existsSync(new URL(options.icon, root)), `${options.icon} must exist`);
});

test('push registration is retried on foreground and failures are logged, not swallowed', () => {
  const shell = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(shell, /AppState\.addEventListener\("change"[\s\S]*void register\(\)/);
  assert.match(shell, /console\.warn\("\[push\] Could not register for notifications:"/);
  assert.match(shell, /setNotificationChannelAsync\("default"/);
});

test('voice messages and the camera can ask Android for access', () => {
  for (const permission of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA']) {
    assert.ok(app.android.permissions.includes(`android.permission.${permission}`), `${permission} must be declared`);
  }
  const [, picker] = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');
  assert.ok(picker.microphonePermission && picker.cameraPermission && picker.photosPermission);
});

test('photo and video inputs are answered by the in-app media sheet', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.scripts.postinstall, 'patch-package');
  const patch = readFileSync(new URL('patches/react-native-webview+13.16.1.patch', root), 'utf8');
  assert.match(patch, /fileChooserInterceptor/);
  const module = readFileSync(
    new URL('modules/naghshman-media-chooser/android/src/main/java/expo/modules/naghshmanmediachooser/NaghshmanMediaChooserModule.kt', root),
    'utf8',
  );
  assert.match(module, /RNCWebChromeClient\.fileChooserInterceptor = interceptor/);
});
