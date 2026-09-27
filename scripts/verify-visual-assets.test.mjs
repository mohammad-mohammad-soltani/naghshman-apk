import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PNG } from 'pngjs';

const root = new URL('../', import.meta.url);

test('covers the screen with the portrait artwork without stretching its motif', () => {
  const source = readFileSync(new URL('src/components/launch-splash.tsx', root), 'utf8');

  assert.match(source, /resizeMode="cover"/);
  assert.doesNotMatch(source, /resizeMode="stretch"/);
  assert.doesNotMatch(source, /useWindowDimensions/);
  assert.doesNotMatch(source, /artworkSize/);
  assert.match(source, /artwork:\s*\{[\s\S]*width:\s*'100%'[\s\S]*height:\s*'100%'/);
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

// Android 12 constrains the system splash to a centered static image. The
// full portrait poster and animated dots are displayed by LaunchSplash.
test('uses a square transparent floral mark rather than the portrait poster in the OS splash', () => {
  const config = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
  const plugin = config.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen');
  assert.equal(plugin[1].image, './assets/images/native-floral-mark.png');
  assert.equal(plugin[1].backgroundColor, '#c03636');

  const png = PNG.sync.read(readFileSync(new URL('assets/images/native-floral-mark.png', root)));
  assert.equal(png.width, png.height);
  const width = png.width;
  let left = width;
  let top = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (png.data[(width * y + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  assert.ok(left >= width * 0.15 && top >= width * 0.15, 'mark clears top and left OS icon safe area');
  assert.ok(right <= width * 0.85 && bottom <= width * 0.85, 'mark clears bottom and right OS icon safe area');
  assert.ok(right > left && bottom > top, 'floral mark is visible');
});


test('replaces the WebView diagnostic page with a retryable branded overlay', () => {
  const shell = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  const splash = readFileSync(new URL('src/components/launch-splash.tsx', root), 'utf8');

  assert.match(shell, /renderError=\{\(\) => <View style=\{styles\.webViewErrorFallback\} \/>\}/);
  assert.match(shell, /onError=\{handleWebViewError\}/);
  assert.match(shell, /completedDocumentUrl\.current !== event\.nativeEvent\.url/);
  assert.match(shell, /onRenderProcessGone/);
  assert.doesNotMatch(splash, /errorPanel|Pressable|ActivityIndicator/);
});
