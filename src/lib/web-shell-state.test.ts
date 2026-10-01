import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_WEB_SHELL_STATE,
  MAX_SOFT_RETRY_DELAY_MS,
  reduceWebShellState,
  shouldAnnounceSoftFailure,
  shouldRetryFailedLoad,
  SOFT_RETRY_DELAY_MS,
  softRetryDelay,
} from './web-shell-state.ts';

test('marks the first successful document ready and clears recovery state', () => {
  const failed = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-failed' });
  const ready = reduceWebShellState(failed, { type: 'load-succeeded' });
  assert.deepEqual(ready, {
    initialReady: true,
    initialFailed: false,
    documentFailed: false,
    online: true,
    softFailures: 0,
  });
});

test('never replaces a working document with the recovery screen', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const failure = reduceWebShellState(ready, { type: 'load-failed' });

  assert.equal(failure.initialReady, true);
  assert.equal(failure.initialFailed, false);
  assert.equal(failure.documentFailed, false);
  assert.equal(failure.softFailures, 1);
  assert.equal(reduceWebShellState(failure, { type: 'load-succeeded' }).softFailures, 0);
});

test('blocks only when a later failure leaves nothing on screen', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const crashed = reduceWebShellState(ready, { type: 'load-failed', blocking: true });

  assert.equal(crashed.documentFailed, true);
  assert.equal(crashed.initialFailed, false);
  assert.equal(reduceWebShellState(crashed, { type: 'retry-started' }).documentFailed, false);
});

test('counts consecutive silent failures and resets them on recovery', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const first = reduceWebShellState(ready, { type: 'load-failed' });
  const second = reduceWebShellState(first, { type: 'load-failed' });

  assert.equal(second.softFailures, 2);
  assert.equal(second.documentFailed, false);
  assert.equal(reduceWebShellState(second, { type: 'retry-started' }).softFailures, 0);
  assert.equal(reduceWebShellState(second, { type: 'load-succeeded' }).softFailures, 0);
});

test('announces a transient notice once per failure streak', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const first = reduceWebShellState(ready, { type: 'load-failed' });
  const second = reduceWebShellState(first, { type: 'load-failed' });
  const third = reduceWebShellState(second, { type: 'load-failed' });

  assert.equal(shouldAnnounceSoftFailure(ready, first), false);
  assert.equal(shouldAnnounceSoftFailure(first, second), true);
  assert.equal(shouldAnnounceSoftFailure(second, third), false);
  const recovered = reduceWebShellState(third, { type: 'load-succeeded' });
  assert.equal(
    shouldAnnounceSoftFailure(recovered, reduceWebShellState(recovered, { type: 'load-failed' })),
    false,
  );
});

test('keeps the first launch failure blocking', () => {
  const failed = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-failed' });

  assert.equal(failed.documentFailed, true);
  assert.equal(failed.initialFailed, true);
  assert.equal(failed.softFailures, 0);
});

test('backs off between silent retries without hammering the server', () => {
  assert.equal(softRetryDelay(1), SOFT_RETRY_DELAY_MS);
  assert.equal(softRetryDelay(2), SOFT_RETRY_DELAY_MS * 2);
  assert.equal(softRetryDelay(3), SOFT_RETRY_DELAY_MS * 4);
  assert.equal(softRetryDelay(40), MAX_SOFT_RETRY_DELAY_MS);
  assert.equal(softRetryDelay(0), SOFT_RETRY_DELAY_MS);
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
  assert.equal(
    reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'http-error', statusCode: 503 })
      .documentFailed,
    true,
  );
  assert.equal(
    reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'http-error', statusCode: 404 })
      .documentFailed,
    true,
  );
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const later = reduceWebShellState(ready, { type: 'http-error', statusCode: 503 });
  assert.equal(later.documentFailed, false);
  assert.equal(later.softFailures, 1);
  assert.equal(
    reduceWebShellState(ready, { type: 'http-error', statusCode: 302 }),
    ready,
  );
});

test('clears a failure on retry without discarding the first successful document', () => {
  const ready = reduceWebShellState(INITIAL_WEB_SHELL_STATE, { type: 'load-succeeded' });
  const failed = reduceWebShellState(ready, { type: 'load-failed', blocking: true });
  const retry = reduceWebShellState(failed, { type: 'retry-started' });

  assert.equal(retry.documentFailed, false);
  assert.equal(retry.initialReady, true);
});
