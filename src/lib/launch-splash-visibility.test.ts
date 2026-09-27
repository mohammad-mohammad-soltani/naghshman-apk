import test from 'node:test';
import assert from 'node:assert/strict';

import { isLaunchSplashVisible } from './launch-splash-visibility.ts';

test('keeps the launch splash visible until the first document is ready', () => {
  assert.equal(isLaunchSplashVisible(false), true);
  assert.equal(isLaunchSplashVisible(true), false);
});
