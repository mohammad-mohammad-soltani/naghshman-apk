import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldHandleWebViewBack } from './webview-back-navigation.ts';

test('handles Back in the app when the WebView has history', () => {
  assert.equal(shouldHandleWebViewBack(true), true);
});

test('lets Android exit when the WebView has no history', () => {
  assert.equal(shouldHandleWebViewBack(false), false);
});
