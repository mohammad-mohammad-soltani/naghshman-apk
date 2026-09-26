import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RIGHT_TO_LEFT_DOT_ORDER,
  STATIC_REDUCED_MOTION_OPACITIES,
} from './launch-splash-timing.ts';

test('animates the visual dots from right to left', () => {
  assert.deepEqual(RIGHT_TO_LEFT_DOT_ORDER, [2, 1, 0]);
});

test('keeps all dots legible when reduced motion is enabled', () => {
  assert.deepEqual(STATIC_REDUCED_MOTION_OPACITIES, [0.4, 0.7, 1]);
});
