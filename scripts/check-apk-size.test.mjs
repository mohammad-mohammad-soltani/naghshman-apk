import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_APK_BYTES, assertApkSize } from './check-apk-size.mjs';

test('accepts any APK up to the 30 MiB ceiling, with no minimum size', () => {
  assert.doesNotThrow(() => assertApkSize(1));
  assert.doesNotThrow(() => assertApkSize(MAX_APK_BYTES));
});

test('rejects an APK that grew past the ceiling', () => {
  assert.throws(() => assertApkSize(MAX_APK_BYTES + 1), /at most 30 MiB/);
});
