import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDuration,
  MAX_MEDIA_SELECTION,
  mediaKindsForAccept,
  parseMediaRequest,
  toggleSelection,
} from './media-chooser-request.ts';

test('photo and video inputs open the media sheet', () => {
  assert.deepEqual(mediaKindsForAccept(['image/*']), { images: true, videos: false });
  assert.deepEqual(mediaKindsForAccept(['video/mp4']), { images: false, videos: true });
  assert.deepEqual(mediaKindsForAccept(['image/*,video/*']), { images: true, videos: true });
  assert.deepEqual(mediaKindsForAccept(['.JPG', ' .mp4 ']), { images: true, videos: true });
});

test('inputs that take documents or any file keep the system chooser', () => {
  assert.equal(mediaKindsForAccept([]), null);
  assert.equal(mediaKindsForAccept(['']), null);
  assert.equal(mediaKindsForAccept(['*/*']), null);
  assert.equal(mediaKindsForAccept(['image/*', 'application/pdf']), null);
  assert.equal(mediaKindsForAccept(['.pdf']), null);
  assert.equal(mediaKindsForAccept(['audio/*']), null);
});

test('native requests are validated before the sheet opens', () => {
  assert.deepEqual(parseMediaRequest({ images: true, videos: false, multiple: true, capture: false }), {
    images: true,
    videos: false,
    multiple: true,
    capture: false,
  });
  assert.equal(parseMediaRequest({ images: false, videos: false, multiple: false, capture: false }), null);
  assert.equal(parseMediaRequest({ images: 'yes', videos: false, multiple: false, capture: false }), null);
  assert.equal(parseMediaRequest(null), null);
});

test('selection keeps tap order and stops at the limit', () => {
  assert.deepEqual(toggleSelection(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
  const full = Array.from({ length: MAX_MEDIA_SELECTION }, (_, index) => String(index));
  assert.deepEqual(toggleSelection(full, 'extra'), full);
  assert.deepEqual(toggleSelection(['x'], 'y', 1), ['x']);
});

test('video durations read in Persian digits', () => {
  assert.equal(formatDuration(7), '۰:۰۷');
  assert.equal(formatDuration(62.4), '۱:۰۲');
  assert.equal(formatDuration(3725), '۱:۰۲:۰۵');
  assert.equal(formatDuration(Number.NaN), '۰:۰۰');
});
