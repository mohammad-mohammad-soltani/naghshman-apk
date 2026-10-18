import test from 'node:test';
import assert from 'node:assert/strict';

import { keyboardOverlap } from './keyboard-inset.ts';

test('shrinks the frame by the part of it the keyboard covers', () => {
  assert.equal(keyboardOverlap(800, 500, 300), 300);
  // A frame that already stops above the system navigation area.
  assert.equal(keyboardOverlap(780, 500, 300), 280);
});

test('adds nothing when the window was already resized for the keyboard', () => {
  assert.equal(keyboardOverlap(500, 500, 300), 0);
  assert.equal(keyboardOverlap(480, 500, 300), 0);
});

test('releases the frame when the keyboard is hidden', () => {
  assert.equal(keyboardOverlap(800, 800, 0), 0);
});

test('falls back to the keyboard height when the frame cannot be measured', () => {
  assert.equal(keyboardOverlap(Number.NaN, 500, 300), 300);
  assert.equal(keyboardOverlap(800, 0, 300), 300);
});
