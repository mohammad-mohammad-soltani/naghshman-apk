import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PNG } from 'pngjs';

const root = new URL('../', import.meta.url);

test('renders the complete splash artwork without cropping', () => {
  const source = readFileSync(new URL('src/components/launch-splash.tsx', root), 'utf8');

  assert.match(source, /resizeMode="contain"/);
  assert.doesNotMatch(source, /resizeMode="cover"/);
});

test('keeps the adaptive icon mark centered inside a 66 percent safe area', () => {
  const png = PNG.sync.read(
    readFileSync(new URL('assets/images/meydan-icon-foreground.png', root)),
  );
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(png.width * y + x) * 4 + 3];
      if (alpha <= 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  const contentWidth = right - left + 1;
  const contentHeight = bottom - top + 1;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  assert.ok(contentWidth <= png.width * 0.66, `foreground width is ${contentWidth}px`);
  assert.ok(contentHeight <= png.height * 0.66, `foreground height is ${contentHeight}px`);
  assert.ok(Math.abs(centerX - png.width / 2) <= png.width * 0.02);
  assert.ok(Math.abs(centerY - png.height / 2) <= png.height * 0.02);
});
