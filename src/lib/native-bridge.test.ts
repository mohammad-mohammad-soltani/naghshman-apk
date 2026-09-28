import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAllowedWebUrl,
  parseNativeBridgeMessage,
} from './native-bridge.ts';

test('accepts only HTTPS app URLs and the official API host', () => {
  assert.equal(isAllowedWebUrl('https://naghshman.ir/home'), true);
  assert.equal(isAllowedWebUrl('https://meydanbackend.naghshman.ir/wp-content/uploads/photo.jpg'), true);
  assert.equal(isAllowedWebUrl('https://naghshman.ir.evil.example/photo.jpg'), false);
  assert.equal(isAllowedWebUrl('javascript:alert(1)'), false);
});

test('parses a valid native gallery request', () => {
  assert.deepEqual(
    parseNativeBridgeMessage(JSON.stringify({
      source: 'naghshman-web',
      version: 1,
      type: 'save-media',
      url: 'https://meydanbackend.naghshman.ir/wp-content/uploads/photo.jpg',
      filename: 'photo.jpg',
    })),
    {
      type: 'save-media',
      url: 'https://meydanbackend.naghshman.ir/wp-content/uploads/photo.jpg',
      filename: 'photo.jpg',
    },
  );
});

test('accepts a device refresh credential only with the expected token shape', () => {
  const valid = JSON.stringify({
    source: 'naghshman-web',
    version: 1,
    type: 'persist-refresh',
    token: 'ref_1234567890abcdefghijklmnopqrstuv',
  });

  assert.deepEqual(parseNativeBridgeMessage(valid), {
    type: 'persist-refresh',
    token: 'ref_1234567890abcdefghijklmnopqrstuv',
  });
  assert.equal(
    parseNativeBridgeMessage(valid.replace('ref_1234567890abcdefghijklmnopqrstuv', 'access-token')),
    null,
  );
});

test('accepts only an opaque hex safe-area background', () => {
  const valid = JSON.stringify({
    source: 'naghshman-web',
    version: 1,
    type: 'set-safe-area-background',
    color: '#1f1f1f',
    theme: 'dark',
  });

  assert.deepEqual(parseNativeBridgeMessage(valid), {
    type: 'set-safe-area-background',
    color: '#1f1f1f',
    theme: 'dark',
  });
  assert.equal(parseNativeBridgeMessage(valid.replace('#1f1f1f', 'rgb(0, 0, 0)')), null);
  assert.equal(parseNativeBridgeMessage(valid.replace('dark', 'system')), null);
});

test('rejects forged, malformed, and unsafe bridge requests', () => {
  assert.equal(parseNativeBridgeMessage('not json'), null);
  assert.equal(
    parseNativeBridgeMessage(JSON.stringify({
      source: 'other-page',
      version: 1,
      type: 'save-media',
      url: 'https://naghshman.ir/a.jpg',
    })),
    null,
  );
  assert.equal(
    parseNativeBridgeMessage(JSON.stringify({
      source: 'naghshman-web',
      version: 1,
      type: 'save-media',
      url: 'https://evil.example/a.jpg',
    })),
    null,
  );
});
