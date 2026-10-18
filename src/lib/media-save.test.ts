import assert from 'node:assert/strict';
import test from 'node:test';

import { fileExtension, galleryFilename, isGalleryMedia, openedFilename } from './media-save.ts';

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

test('keeps the attachment title when it already names the file', () => {
  assert.equal(openedFilename('گزارش سالانه.pdf', 'download'), 'گزارش سالانه.pdf');
});

test('adds the downloaded extension to a title without one', () => {
  assert.equal(openedFilename('گزارش سالانه', 'file.pdf'), 'گزارش سالانه.pdf');
  assert.equal(openedFilename('notes', 'download'), 'notes');
});

test('never lets a title escape the download folder', () => {
  assert.equal(openedFilename('../../secret.pdf', 'x.pdf'), 'secret.pdf');
  assert.equal(openedFilename('a/b\\c.docx', 'x.docx'), 'a b c.docx');
});

test('falls back to the downloaded name without a usable title', () => {
  assert.equal(openedFilename(undefined, 'file.pdf'), 'file.pdf');
  assert.equal(openedFilename('  ', 'file.pdf'), 'file.pdf');
});

test('names the file by what the server sent, not a dot in its title', () => {
  assert.equal(openedFilename('نسخه v1.25', 'file.pdf'), 'نسخه v1.25.pdf');
  assert.equal(openedFilename('report.PDF', 'file.pdf'), 'report.PDF');
  assert.equal(openedFilename('report.pdf', 'download'), 'report.pdf');
});
