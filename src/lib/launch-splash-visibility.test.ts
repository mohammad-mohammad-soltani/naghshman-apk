import test from 'node:test';
import assert from 'node:assert/strict';

import { isLaunchSplashVisible, isNativeSplashReady } from './launch-splash-visibility.ts';

test('keeps the launch splash visible until the first document is ready', () => {
  assert.equal(isLaunchSplashVisible(false), true);
  assert.equal(isLaunchSplashVisible(true), false);
});

test('hands off the OS splash only after the branded artwork is laid out and loaded', () => {
  assert.equal(isNativeSplashReady(false, false), false);
  assert.equal(isNativeSplashReady(true, false), false);
  assert.equal(isNativeSplashReady(false, true), false);
  assert.equal(isNativeSplashReady(true, true), true);
});
