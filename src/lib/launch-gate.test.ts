import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_LAUNCH_GATE,
  isRetryingLaunch,
  reduceLaunchGate,
  showsOfflineCard,
} from './launch-gate.ts';

test('opens once the site answers the launch probe', () => {
  const online = reduceLaunchGate(INITIAL_LAUNCH_GATE, { type: 'probe-finished', reachable: true });
  assert.equal(online.status, 'online');
  assert.equal(showsOfflineCard(online), false);
});

test('an unreachable site counts as offline even with a network', () => {
  const offline = reduceLaunchGate(INITIAL_LAUNCH_GATE, { type: 'probe-finished', reachable: false });
  assert.equal(offline.status, 'offline');
  assert.equal(showsOfflineCard(offline), true);
});

test('a definite "no network" goes offline without waiting for the probe', () => {
  const offline = reduceLaunchGate(INITIAL_LAUNCH_GATE, { type: 'network-changed', connected: false });
  assert.equal(offline.status, 'offline');
  assert.equal(
    reduceLaunchGate(INITIAL_LAUNCH_GATE, { type: 'network-changed', connected: null }),
    INITIAL_LAUNCH_GATE,
  );
});

test('a retry keeps the offline card up with its spinner until the answer', () => {
  const offline = reduceLaunchGate(INITIAL_LAUNCH_GATE, { type: 'probe-finished', reachable: false });
  const retrying = reduceLaunchGate(offline, { type: 'probe-started' });
  assert.equal(showsOfflineCard(retrying), true);
  assert.equal(isRetryingLaunch(retrying), true);
  assert.equal(isRetryingLaunch(INITIAL_LAUNCH_GATE), false);

  const online = reduceLaunchGate(retrying, { type: 'probe-finished', reachable: true });
  assert.equal(online.status, 'online');
  assert.equal(showsOfflineCard(online), false);
});

test('once open, later outages are left to the WebView recovery', () => {
  const online = reduceLaunchGate(INITIAL_LAUNCH_GATE, { type: 'probe-finished', reachable: true });
  assert.equal(reduceLaunchGate(online, { type: 'network-changed', connected: false }), online);
  assert.equal(reduceLaunchGate(online, { type: 'probe-finished', reachable: false }), online);
});
