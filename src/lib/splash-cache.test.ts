import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  conditionalHeaders,
  isValidLottie,
  normalizeSplashTheme,
  parseLottie,
  parseSplashMeta,
  resolveSplashTheme,
  splashUrl,
} from './splash-cache.ts';

test('follows the theme picked on the site, else the system', () => {
  assert.equal(resolveSplashTheme('light', 'dark'), 'light');
  assert.equal(resolveSplashTheme('dark', 'light'), 'dark');
  assert.equal(resolveSplashTheme(undefined, 'dark'), 'dark');
  assert.equal(resolveSplashTheme(undefined, 'light'), 'light');
  assert.equal(resolveSplashTheme(null, null), 'light');
});

test('maps the site black theme to the dark animation', () => {
  assert.equal(normalizeSplashTheme('black'), 'dark');
  assert.equal(normalizeSplashTheme('sepia'), null);
});

test('requests the splash conditionally on its stored validators', () => {
  assert.equal(splashUrl('https://naghshman.ir', 'dark'), 'https://naghshman.ir/splash/splash-dark.json');
  assert.deepEqual(conditionalHeaders(undefined), { Accept: 'application/json' });
  assert.deepEqual(conditionalHeaders({ etag: 'W/"7a295"', lastModified: 'Thu, 08 Oct 2026 18:40:24 GMT' }), {
    Accept: 'application/json',
    'If-None-Match': 'W/"7a295"',
    'If-Modified-Since': 'Thu, 08 Oct 2026 18:40:24 GMT',
  });
});

test('reads stored meta defensively', () => {
  assert.deepEqual(parseSplashMeta(null), {});
  assert.deepEqual(parseSplashMeta('not json'), {});
  assert.deepEqual(
    parseSplashMeta(JSON.stringify({ theme: 'black', light: { etag: 'a' }, dark: { etag: 7 } })),
    { theme: 'dark', light: { etag: 'a' } },
  );
});

test('accepts the bundled site animations and rejects anything else', () => {
  for (const theme of ['light', 'dark']) {
    const text = readFileSync(new URL(`../../assets/splash/splash-${theme}.json`, import.meta.url), 'utf8');
    assert.ok(parseLottie(text));
  }
  assert.equal(parseLottie('<!doctype html><title>502</title>'), null);
  assert.equal(parseLottie('{"v":"5.7.0","w":360'), null);
  assert.equal(isValidLottie({ v: '5.7.0', w: 360, h: 640, op: 258, layers: [] }), false);
  assert.equal(isValidLottie([]), false);
});
