import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAllowedMediaUrl,
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

test('accepts object-storage media for gallery actions but never for navigation', () => {
  const arvan = 'https://naghshman-media.s3.ir-thr-at1.arvanstorage.ir/production/users/42/photo.jpg';
  assert.equal(isAllowedWebUrl(arvan), false);
  assert.equal(isAllowedMediaUrl(arvan), true);
  assert.equal(isAllowedMediaUrl('https://cdn.nabzjahan.ir/wp-content/uploads/a.jpg'), true);
  assert.equal(isAllowedMediaUrl('https://evil-arvanstorage.ir/production/a.jpg'), false);
  assert.equal(isAllowedMediaUrl('http://naghshman.ir/a.jpg'), false);
  assert.deepEqual(
    parseNativeBridgeMessage(JSON.stringify({ source: 'naghshman-web', version: 1, type: 'save-media', url: arvan })),
    { type: 'save-media', url: arvan, filename: undefined },
  );
});

test('a page may ask for microphone or camera access, nothing else', () => {
  const message = (fields: Record<string, unknown>) =>
    JSON.stringify({ source: 'naghshman-web', version: 1, type: 'ensure-media-permission', ...fields });

  assert.deepEqual(parseNativeBridgeMessage(message({ requestId: 'p1-1700000000000', kinds: ['microphone'] })), {
    type: 'ensure-media-permission',
    requestId: 'p1-1700000000000',
    kinds: ['microphone'],
  });
  assert.deepEqual(parseNativeBridgeMessage(message({ requestId: 'p2', kinds: ['camera', 'microphone'] })), {
    type: 'ensure-media-permission',
    requestId: 'p2',
    kinds: ['microphone', 'camera'],
  });
  assert.equal(parseNativeBridgeMessage(message({ requestId: 'p3', kinds: ['location'] })), null);
  assert.equal(parseNativeBridgeMessage(message({ requestId: 'p4', kinds: ['microphone', 'contacts'] })), null);
  assert.equal(parseNativeBridgeMessage(message({ requestId: 'p5', kinds: [] })), null);
  assert.equal(parseNativeBridgeMessage(message({ requestId: "x'); alert(1); ('", kinds: ['microphone'] })), null);
});

test('opens an attachment only from the site or its media hosts', () => {
  const message = (url: string) =>
    JSON.stringify({ source: 'naghshman-web', version: 1, type: 'open-file', url, filename: 'گزارش.pdf' });
  const pdf = 'https://naghshman-media.s3.ir-thr-at1.arvanstorage.ir/production/report.pdf';

  assert.deepEqual(parseNativeBridgeMessage(message(pdf)), { type: 'open-file', url: pdf, filename: 'گزارش.pdf' });
  assert.equal(parseNativeBridgeMessage(message('https://evil.example/report.pdf')), null);
  assert.equal(parseNativeBridgeMessage(message('file:///data/report.pdf')), null);
});

test('reports where the site\'s bottom bars sit, within sane bounds', () => {
  const layout = (fields: Record<string, unknown>) =>
    parseNativeBridgeMessage(JSON.stringify({ source: 'naghshman-web', version: 1, type: 'floating-layout', ...fields }));

  assert.deepEqual(layout({ navHeight: 64, audioTop: null }), { type: 'floating-layout', navHeight: 64, audioTop: null });
  assert.deepEqual(layout({ navHeight: 0, audioTop: 150 }), { type: 'floating-layout', navHeight: 0, audioTop: 150 });
  assert.equal(layout({ navHeight: 'tall', audioTop: null }), null);
  assert.equal(layout({ navHeight: 64, audioTop: 'top' }), null);
});

test('hands the app\'s player only an HTTPS track, with the avatar as its cover', () => {
  const load = (track: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    parseNativeBridgeMessage(JSON.stringify({ source: 'naghshman-web', version: 1, type: 'native-audio-load', track, ...extra }));

  assert.deepEqual(
    load(
      {
        id: 'ava:12',
        title: 'گفتگوی هفته',
        artist: 'میدان',
        url: 'https://cdn.example.com/a.mp3',
        artistAvatar: 'https://naghshman.ir/avatar.jpg',
        cover: 'https://naghshman.ir/cover.jpg',
      },
      { position: 42.5, autoplay: false },
    ),
    {
      type: 'native-audio-load',
      track: {
        id: 'ava:12',
        title: 'گفتگوی هفته',
        artist: 'میدان',
        url: 'https://cdn.example.com/a.mp3',
        artwork: 'https://naghshman.ir/avatar.jpg',
      },
      position: 42.5,
      autoplay: false,
    },
  );
  assert.equal(load({ id: 'a', title: 'x', url: 'http://cdn.example.com/a.mp3' }), null);
  assert.equal(load({ id: 'a b<script>', title: 'x', url: 'https://cdn.example.com/a.mp3' }), null);
  assert.deepEqual(
    parseNativeBridgeMessage(JSON.stringify({ source: 'naghshman-web', version: 1, type: 'native-audio-seek', seconds: 12 })),
    { type: 'native-audio-seek', seconds: 12 },
  );
});
