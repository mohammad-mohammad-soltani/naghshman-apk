import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

import { dotLottieUrl, expectedDotLottie, SPLASH_THEMES, sourceUrl } from './build-splash.mjs';
import plugin from '../plugins/with-launch-splash.cjs';
import { optimizeLottie } from '../src/lib/lottie-optimize.ts';

/** The entries of a zip written by build-splash (no data descriptors). */
function unzip(buffer) {
  const entries = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    entries[name] = inflateRawSync(buffer.subarray(start, start + size)).toString('utf8');
    offset = start + size;
  }
  return entries;
}

test('the shipped .lottie files are the optimized site splash (run npm run build:splash)', () => {
  for (const theme of SPLASH_THEMES) {
    const shipped = readFileSync(dotLottieUrl(theme));
    assert.ok(shipped.equals(expectedDotLottie(theme)), `splash-${theme}.lottie is out of date`);

    const entries = unzip(shipped);
    assert.deepEqual(JSON.parse(entries['manifest.json']).animations, [{ id: `splash-${theme}` }]);
    const source = JSON.parse(readFileSync(sourceUrl(theme), 'utf8'));
    assert.deepEqual(JSON.parse(entries[`animations/splash-${theme}.json`]), JSON.parse(JSON.stringify(optimizeLottie(source))));
  }
});

test('keeps the splash raw resources through release resource shrinking', () => {
  assert.match(plugin.SPLASH_RAW_KEEP, /tools:keep="@raw\/assets_splash_splash\*"/);
});

test('Metro bundles .lottie files as assets', async () => {
  const { createRequire } = await import('node:module');
  const config = createRequire(import.meta.url)('../metro.config.cjs');
  assert.ok(config.resolver.assetExts.includes('lottie'));
});
