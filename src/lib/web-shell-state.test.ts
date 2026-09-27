import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_WEB_SHELL_STATE,
  reduceWebShellState,
  shouldRetryFailedLoad,
} from './web-shell-state.ts';

test('marks the first successful document ready and clears recovery state', () => {
  const failed = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-failed' });
  const ready = reduceWebShellState(failed, { type: 'load-succeeded' });
  assert.deepEqual(ready, {
    initialReady: true,
    initialFailed: false,
    documentFailed: false,
    online: true,
  });
});

test('keeps a later failed navigation hidden even after initial readiness', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const failure = reduceWebShellState(ready, { type: 'load-failed' });
  assert.equal(failure.initialReady, true);
  assert.equal(failure.initialFailed, false);
  assert.equal(failure.documentFailed, true);
  assert.equal(reduceWebShellState(failure, { type: 'retry-started' }).documentFailed, false);
  assert.equal(reduceWebShellState(failure, { type: 'load-succeeded' }).documentFailed, false);
});

test('retries initial and later failures when connectivity is restored', () => {
  const failedInitial = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-failed' });
  const offlineInitial = reduceWebShellState(failedInitial, {
    type: 'network-changed',
    online: false,
  });
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const offlineLater = reduceWebShellState(
    reduceWebShellState(ready, { type: 'load-failed' }),
    { type: 'network-changed', online: false },
  );

  assert.equal(shouldRetryFailedLoad(offlineInitial, true), true);
  assert.equal(shouldRetryFailedLoad(offlineLater, true), true);
  assert.equal(shouldRetryFailedLoad(offlineLater, false), false);
  assert.equal(shouldRetryFailedLoad(INITIAL_WEB_SHELL_STATE, true), false);
  assert.equal(shouldRetryFailedLoad(ready, true), false);
});

test('does not interrupt an existing successful document on connectivity loss', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const offline = reduceWebShellState(ready, { type: 'network-changed', online: false });

  assert.equal(offline.initialReady, true);
  assert.equal(offline.documentFailed, false);
  assert.equal(shouldRetryFailedLoad(offline, true), false);
});

test('keeps both client and server HTTP failures covered', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  assert.equal(
    reduceWebShellState(ready, { type: 'http-error', statusCode: 503 }).documentFailed,
    true,
  );
  assert.equal(
    reduceWebShellState(ready, { type: 'http-error', statusCode: 404 }).documentFailed,
    true,
  );
});

test('clears a failure on retry without discarding the first successful document', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const failed = reduceWebShellState(ready, { type: 'load-failed' });
  const retry = reduceWebShellState(failed, { type: 'retry-started' });

  assert.equal(retry.documentFailed, false);
  assert.equal(retry.initialReady, true);
});
