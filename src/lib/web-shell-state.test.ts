import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_WEB_SHELL_STATE,
  reduceWebShellState,
  shouldRetryInitialLoad,
} from './web-shell-state.ts';

test('marks the first successful document ready and never shows launch state again', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  assert.deepEqual(ready, { initialReady: true, initialFailed: false, online: true });

  const laterFailure = reduceWebShellState(ready, { type: 'load-failed' });
  assert.deepEqual(laterFailure, ready);
});

test('records an initial failure without discarding the shell', () => {
  const failed = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-failed' });
  assert.deepEqual(failed, { initialReady: false, initialFailed: true, online: true });
});

test('retries a failed initial load only when connectivity returns', () => {
  const failedOffline = {
    initialReady: false,
    initialFailed: true,
    online: false,
  };

  assert.equal(shouldRetryInitialLoad(failedOffline, true), true);
  assert.equal(shouldRetryInitialLoad(failedOffline, false), false);
  assert.equal(shouldRetryInitialLoad(INITIAL_WEB_SHELL_STATE, true), false);

  assert.deepEqual(
    reduceWebShellState(failedOffline, { type: 'retry-started' }),
    { initialReady: false, initialFailed: false, online: false },
  );
});

test('keeps a loaded document ready while offline', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const offline = reduceWebShellState(ready, { type: 'network-changed', online: false });

  assert.deepEqual(offline, { initialReady: true, initialFailed: false, online: false });
  assert.equal(shouldRetryInitialLoad(offline, true), false);
});

test('ignores later server errors after initial readiness', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const afterServerError = reduceWebShellState(ready, { type: 'http-error', statusCode: 503 });

  assert.deepEqual(afterServerError, ready);
});

test('treats an initial top-level server error as a failed load', () => {
  const failed = reduceWebShellState(INITIAL_WEB_SHELL_STATE, {
    type: 'http-error',
    statusCode: 500,
  });
  const ignoredClientError = reduceWebShellState(INITIAL_WEB_SHELL_STATE, {
    type: 'http-error',
    statusCode: 404,
  });

  assert.equal(failed.initialFailed, true);
  assert.deepEqual(ignoredClientError, INITIAL_WEB_SHELL_STATE);
});
