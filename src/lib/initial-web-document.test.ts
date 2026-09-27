import assert from 'node:assert/strict';
import test from 'node:test';

import { isInitialWebDocument } from './initial-web-document.ts';

test('accepts the Naghshman document and its routes as the initial load', () => {
  assert.equal(isInitialWebDocument('https://naghshman.ir/'), true);
  assert.equal(isInitialWebDocument('https://naghshman.ir/home'), true);
});

test('rejects WebView placeholders and non-app hosts as an initial load', () => {
  assert.equal(isInitialWebDocument('about:blank'), false);
  assert.equal(isInitialWebDocument('https://meydanbackend.naghshman.ir/'), false);
});
