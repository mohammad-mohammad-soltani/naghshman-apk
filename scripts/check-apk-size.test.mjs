import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_APK_BYTES,
  MIN_APK_BYTES,
  assertApkSize,
} from './check-apk-size.mjs';

test('accepts APKs from 35 through 45 MiB', () => {
  assert.doesNotThrow(() => assertApkSize(MIN_APK_BYTES));
  assert.doesNotThrow(() => assertApkSize(MAX_APK_BYTES));
});

test('rejects APKs outside the Myket size budget', () => {
  assert.throws(() => assertApkSize(MIN_APK_BYTES - 1), /at least 35 MiB/);
  assert.throws(() => assertApkSize(MAX_APK_BYTES + 1), /at most 45 MiB/);
});
