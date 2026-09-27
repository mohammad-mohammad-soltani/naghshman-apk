import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../components/native-web-shell.tsx', import.meta.url), 'utf8');

test('login does not remount WebView while the native credential is being saved', () => {
  assert.match(shell, /const \[initialWebUrl, setInitialWebUrl\] = useState<string \| null>/);
  assert.match(shell, /setInitialWebUrl\(\s*\(current\) => current \?\? initialNativeWebUrl\(APP_URL, token\),?\s*\)/);
  assert.match(shell, /setInitialWebUrl\(\s*\(current\) => current \?\? initialNativeWebUrl\(APP_URL, null\),?\s*\)/);
  assert.match(shell, /source=\{\{ uri: initialWebUrl \}\}/);
});

test('native navigation becomes available immediately after SecureStore succeeds', () => {
  assert.match(shell, /await SecureStore\.setItemAsync\(REFRESH_TOKEN_KEY, action\.token\)/);
  assert.match(shell, /nativeAuthenticatedRef\.current = true;\s*setStoredRefreshToken\(action\.token\);/);
  assert.match(shell, /setNativeAuthentication\(true\)/);
  assert.match(shell, /!nativeAuthenticatedRef\.current\s*&&\s*!shouldAllowNativeGuestNavigation/);
  assert.match(shell, /naghshman:native-auth-error/);
});

test('transient restore failures preserve refresh credentials for retry', () => {
  assert.match(shell, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(shell, /post\(\{ type: 'clear-refresh' \}\)/);
  assert.match(shell, /Keep the credential for a future online retry/);
});
