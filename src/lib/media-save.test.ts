import assert from 'node:assert/strict';
import test from 'node:test';

import { fileExtension, galleryFilename, isGalleryMedia } from './media-save.ts';

test('reads the extension that the download named from its Content-Type', () => {
  assert.equal(fileExtension('photo.JPG'), 'jpg');
  assert.equal(fileExtension('1234.mp4'), 'mp4');
  assert.equal(fileExtension('1234'), null);
});

test('only real images and videos are sent to the gallery', () => {
  assert.equal(isGalleryMedia('photo.webp'), true);
  assert.equal(isGalleryMedia('clip.mp4'), true);
  assert.equal(isGalleryMedia('downloadfile.bin'), false);
  assert.equal(isGalleryMedia('page.html'), false);
  assert.equal(isGalleryMedia('voice.mp3'), false);
});

test('names gallery files uniquely and keeps the media type', () => {
  assert.equal(galleryFilename('1234.mp4', 42), 'naghshman-42.mp4');
  assert.equal(galleryFilename('photo.jpeg', 42), 'naghshman-42.jpg');
});
