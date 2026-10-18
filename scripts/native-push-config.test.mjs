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
