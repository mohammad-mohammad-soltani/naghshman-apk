import assert from 'node:assert/strict';
import test from 'node:test';

import {
  downloadDetail,
  fileBadge,
  formatBytes,
  MAX_DOWNLOADS,
  reduceDownloads,
  summarizeDownloads,
  type DownloadItem,
} from './downloads.ts';

const start = (items: DownloadItem[], id: string, kind: 'file' | 'media' = 'file') =>
  reduceDownloads(items, { type: 'start', id, kind, url: `https://naghshman.ir/${id}`, name: `${id}.pdf` });

test('tracks several downloads at once, newest first', () => {
  let items = start([], 'a');
  items = start(items, 'b');
  items = reduceDownloads(items, { type: 'progress', id: 'a', bytes: 50, total: 100 });
  items = reduceDownloads(items, { type: 'progress', id: 'b', bytes: 150, total: 300 });
  assert.deepEqual(items.map((item) => item.id), ['b', 'a']);
  assert.deepEqual(summarizeDownloads(items), { active: 2, done: 0, failed: 0, fraction: 0.5 });
});

test('combined progress is unknown while any size is unknown', () => {
  let items = start(start([], 'a'), 'b');
  items = reduceDownloads(items, { type: 'progress', id: 'a', bytes: 50, total: 100 });
  items = reduceDownloads(items, { type: 'progress', id: 'b', bytes: 10, total: -1 });
  assert.equal(summarizeDownloads(items).fraction, null);
});

test('a finished row is full and later progress cannot move it', () => {
  let items = start([], 'a');
  items = reduceDownloads(items, { type: 'progress', id: 'a', bytes: 900, total: 1000 });
  items = reduceDownloads(items, { type: 'done', id: 'a' });
  items = reduceDownloads(items, { type: 'progress', id: 'a', bytes: 10, total: 1000 });
  assert.equal(items[0].status, 'done');
  assert.equal(items[0].bytes, 1000);
  assert.deepEqual(summarizeDownloads(items), { active: 0, done: 1, failed: 0, fraction: 1 });
});

test('clearing keeps only the running downloads', () => {
  let items = start(start(start([], 'a'), 'b'), 'c');
  items = reduceDownloads(items, { type: 'done', id: 'a' });
  items = reduceDownloads(items, { type: 'failed', id: 'b', error: 'x' });
  items = reduceDownloads(items, { type: 'clear-settled' });
  assert.deepEqual(items.map((item) => item.id), ['c']);
});

test('the oldest settled rows fall off, never a running one', () => {
  let items: DownloadItem[] = start([], 'running');
  for (let index = 0; index < MAX_DOWNLOADS; index += 1) {
    items = start(items, `f${index}`);
    items = reduceDownloads(items, { type: 'done', id: `f${index}` });
  }
  assert.equal(items.length, MAX_DOWNLOADS);
  assert.ok(items.some((item) => item.id === 'running'));
  assert.ok(!items.some((item) => item.id === 'f0'));
});

test('describes progress in Persian', () => {
  assert.equal(formatBytes(800 * 1024), '۸۰۰ کیلوبایت');
  assert.equal(formatBytes(2.4 * 1024 * 1024), '۲٫۴ مگابایت');
  let items = start([], 'a');
  assert.equal(downloadDetail(items[0]), 'در حال آماده‌سازی…');
  items = reduceDownloads(items, { type: 'progress', id: 'a', bytes: 1024 * 1024, total: 4 * 1024 * 1024 });
  assert.equal(downloadDetail(items[0]), '۱٫۰ مگابایت از ۴٫۰ مگابایت · ۲۵٪');
});

test('badges a row by its file type', () => {
  assert.equal(fileBadge('گزارش.pdf', 'file').label, 'PDF');
  assert.equal(fileBadge('a.DOCX', 'file').label, 'DOC');
  assert.equal(fileBadge('clip.mp4', 'media').label, 'ویدیو');
  assert.equal(fileBadge('data.xyz', 'file').label, 'XYZ');
  assert.equal(fileBadge('بی‌نام', 'media').label, 'رسانه');
});
