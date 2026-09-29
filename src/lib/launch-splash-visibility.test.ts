import test from 'node:test';
import assert from 'node:assert/strict';

import { isLaunchSplashVisible } from './launch-splash-visibility.ts';
import { INITIAL_WEB_SHELL_STATE, reduceWebShellState } from './web-shell-state.ts';

test('keeps the launch splash visible until the first document is ready', () => {
  assert.equal(isLaunchSplashVisible(false, true, true), true);
  assert.equal(isLaunchSplashVisible(true, true, true), false);
});

test('keeps the custom SVG splash visible for its minimum display window', () => {
  assert.equal(isLaunchSplashVisible(true, true, false), true);
  assert.equal(isLaunchSplashVisible(true, true, true), false);
});

test('does not fade away until the native-to-custom splash handoff resolves', () => {
  assert.equal(isLaunchSplashVisible(true, false, true), true);
  assert.equal(isLaunchSplashVisible(true, true, true), false);
});

test('never reopens the launch splash on later navigation or load failure once all launch gates passed', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const laterFailure = reduceWebShellState(ready, { type: 'load-failed' });
  assert.equal(isLaunchSplashVisible(ready.initialReady, true, true), false);
  assert.equal(isLaunchSplashVisible(laterFailure.initialReady, true, true), false);
});
