import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildSplashArtwork } from './generate-splash-artwork.mjs';

const SVG_FIXTURE = `<svg width="10" height="20" viewBox="0 0 10 20">
<path d="M0 0H10V20H0Z" fill="#BF3636"/>
<rect x="2" y="3" width="4" height="5" fill="url(#photo)"/>
<defs>
<pattern id="photo"><use href="#image" transform="scale(0.5)"/></pattern>
<image id="image" width="8" height="10" href="data:image/png;base64,PHOTO"/>
</defs>
</svg>`;

test('keeps vector shapes and extracts only the embedded bitmap layer', () => {
  const artwork = buildSplashArtwork(SVG_FIXTURE);

  assert.match(artwork.vectors, /<path d="M0 0H10V20H0Z"/);
  assert.doesNotMatch(artwork.vectors, /<image|<pattern|fill="url\(#photo\)"/);
  assert.equal(artwork.image.uri, 'data:image/png;base64,PHOTO');
  assert.deepEqual(artwork.image.frame, { x: 2, y: 3, width: 4, height: 5 });
  assert.equal(artwork.viewBox, '0 0 10 20');
});

test('rejects artwork without a vector layer', () => {
  assert.throws(
    () => buildSplashArtwork(SVG_FIXTURE.replace(/<path[^>]+\/>/, '')),
    /vector shape/,
  );
});

test('runtime splash artwork stays in sync with massage.svg', async () => {
  const source = await readFile(
    new URL('../assets/images/massage.svg', import.meta.url),
    'utf8',
  );
  const generated = JSON.parse(
    await readFile(
      new URL('../assets/images/massage.generated.json', import.meta.url),
      'utf8',
    ),
  );

  assert.deepEqual(generated, buildSplashArtwork(source));
});
