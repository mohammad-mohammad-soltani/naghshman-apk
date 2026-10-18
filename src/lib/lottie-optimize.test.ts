import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { optimizeLottie } from './lottie-optimize.ts';

type Layer = { nm: string; ip: number; op: number; ind: number; shapes?: { it?: { ty: string }[] }[] };
type Animation = { layers: Layer[] };

const splash = (theme: 'dark' | 'light') =>
  JSON.parse(readFileSync(new URL(`../../assets/splash/splash-${theme}.json`, import.meta.url), 'utf8')) as Animation;

const groupsAt = (animation: Animation, name: string, frame: number) =>
  animation.layers
    .filter((layer) => layer.nm === name && layer.ip <= frame && frame < layer.op)
    // A wrapper counts its groups; a merged group (paths and one fill) counts once.
    .reduce((count, layer) => count + (layer.shapes ?? []).reduce((sum, shape) => sum + (shape.it?.filter((item) => item.ty === 'gr').length || 1), 0), 0);

test('the splash map draws nothing while it is invisible and little once it settles', () => {
  for (const theme of ['dark', 'light'] as const) {
    const original = splash(theme);
    const optimized = optimizeLottie(original);
    assert.equal(groupsAt(original, 'map-diamonds', 50), 455);
    // Every diamond is still transparent before frame 97.
    assert.equal(groupsAt(optimized, 'map-diamonds', 50), 0);
    // Settled diamonds are merged: one draw per run of neighbours instead of hundreds.
    assert.ok(groupsAt(optimized, 'map-diamonds', 240) <= 455 / 5, `${groupsAt(optimized, 'map-diamonds', 240)} draws at the end`);
    // Over the whole animation, about a quarter of the per-diamond work is left.
    let before = 0;
    let after = 0;
    for (let frame = 0; frame < 258; frame += 1) {
      before += groupsAt(original, 'map-diamonds', frame);
      after += groupsAt(optimized, 'map-diamonds', frame);
    }
    assert.ok(after / before < 0.3, `${after} of ${before} group draws left`);
  }
});

test('layers it cannot improve, and the input itself, are left untouched', () => {
  const original = splash('dark');
  const before = JSON.stringify(original);
  const optimized = optimizeLottie(original);
  assert.equal(JSON.stringify(original), before);
  for (const name of ['bag', 'tagline', 'tagline-matte', 'bg']) {
    assert.deepEqual(
      optimized.layers.filter((layer) => layer.nm === name),
      original.layers.filter((layer) => layer.nm === name),
    );
  }
  // Layer indices stay unique, so parenting keeps working.
  const indices = optimized.layers.map((layer) => layer.ind);
  assert.equal(new Set(indices).size, indices.length);
  // Anything that is not an animation passes through.
  assert.equal(optimizeLottie(null), null);
  const plain = { layers: [] };
  assert.equal(optimizeLottie(plain), plain);
});
