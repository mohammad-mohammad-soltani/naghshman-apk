import assert from 'node:assert/strict';
import test from 'node:test';

import { isExternalAppUrl, webFallbackFor } from './external-links.ts';

test('recognises the links another app should open', () => {
  assert.equal(isExternalAppUrl('geo:35.7,51.4?q=35.7,51.4(Square)'), true);
  assert.equal(isExternalAppUrl('TEL:+98912'), true);
  assert.equal(isExternalAppUrl('mailto:a@b.ir'), true);
  assert.equal(isExternalAppUrl('https://naghshman.ir'), false);
  assert.equal(isExternalAppUrl('intent://scan#Intent;end'), false);
  assert.equal(isExternalAppUrl('javascript:alert(1)'), false);
});

test('sends directions to Google Maps when no map app answers', () => {
  assert.equal(
    webFallbackFor('geo:35.70000,51.40000?q=35.70000,51.40000(%D9%85%DB%8C%D8%AF%D8%A7%D9%86)'),
    'https://www.google.com/maps/dir/?api=1&destination=35.70000%2C51.40000',
  );
  assert.equal(
    webFallbackFor('geo:0,0?q=%D8%AA%D9%87%D8%B1%D8%A7%D9%86%D8%8C%20%D9%85%DB%8C%D8%AF%D8%A7%D9%86%20%D8%A7%D9%86%D9%82%D9%84%D8%A7%D8%A8'),
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('تهران، میدان انقلاب')}`,
  );
  assert.equal(webFallbackFor('geo:35.7,51.4'), 'https://www.google.com/maps/dir/?api=1&destination=35.7%2C51.4');
  assert.equal(webFallbackFor('tel:+98912'), null);
});
