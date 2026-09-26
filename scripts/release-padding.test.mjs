import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { createReleasePadding } = require('../plugins/with-android-release-properties.cjs');

test('creates deterministic, incompressible release padding at the requested size', () => {
  const directory = mkdtempSync(join(tmpdir(), 'naghshman-padding-'));
  const output = join(directory, 'release-size-pad.bin');
  const bytes = 1024 * 1024;

  createReleasePadding(output, bytes);
  const first = readFileSync(output);
  createReleasePadding(output, bytes);
  const second = readFileSync(output);

  assert.equal(statSync(output).size, bytes);
  assert.deepEqual(first, second);
  assert.ok(deflateRawSync(first).length > bytes * 0.98);
});
