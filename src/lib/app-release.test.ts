import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_UPDATE_URL,
  parseAppReleaseStatus,
  parseVersionCode,
  releaseStatusUrl,
  requiresUpdate,
} from './app-release.ts';

const envelope = (data: Record<string, unknown>) => ({ data, meta: {} });

test('blocks only installs older than the minimum the admin set', () => {
  const status = parseAppReleaseStatus(envelope({ min_version_code: 12, update_url: 'https://myket.ir/app/ir.naghshman.app', message: 'به‌روز کن' }));
  assert.equal(requiresUpdate(11, status), true);
  assert.equal(requiresUpdate(12, status), false);
  assert.equal(requiresUpdate(13, status), false);
  assert.equal(requiresUpdate(11, parseAppReleaseStatus(envelope({ min_version_code: 0 }))), false);
});

test('never locks out a dev build or an unreadable answer', () => {
  const status = parseAppReleaseStatus(envelope({ min_version_code: 12 }));
  assert.equal(requiresUpdate(null, status), false);
  assert.equal(requiresUpdate(5, null), false);
  assert.equal(parseAppReleaseStatus('<html>'), null);
  assert.equal(parseAppReleaseStatus(envelope({ min_version_code: 'x' })), null);
});

test('refuses an unsafe update link and falls back to the store page', () => {
  assert.equal(parseAppReleaseStatus(envelope({ min_version_code: 3, update_url: 'javascript:alert(1)' }))?.updateUrl, DEFAULT_UPDATE_URL);
  assert.equal(parseAppReleaseStatus(envelope({ min_version_code: 3, update_url: 'myket://details?id=ir.naghshman.app' }))?.updateUrl, 'myket://details?id=ir.naghshman.app');
});

test('reads its own stored copy back', () => {
  const stored = { minVersionCode: 9, updateUrl: 'https://myket.ir/app/ir.naghshman.app', message: 'm' };
  assert.deepEqual(parseAppReleaseStatus(stored), stored);
});

test('reports the real Android versionCode to the site', () => {
  assert.equal(parseVersionCode('14'), 14);
  assert.equal(parseVersionCode(null), null);
  assert.equal(parseVersionCode('1.0.1'), null);
  assert.equal(releaseStatusUrl('https://naghshman.ir', 14), 'https://naghshman.ir/api/meydan/app/android/release?version_code=14');
});
