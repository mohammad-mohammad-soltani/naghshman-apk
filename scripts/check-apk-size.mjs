#!/usr/bin/env node

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MEBIBYTE = 1024 * 1024;

/** A regression ceiling only: the APK should stay as small as it can be. */
export const MAX_APK_BYTES = 30 * MEBIBYTE;

export function assertApkSize(bytes) {
  if (bytes > MAX_APK_BYTES) {
    throw new Error(`APK must be at most 30 MiB; received ${(bytes / MEBIBYTE).toFixed(2)} MiB.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const apkPath = process.argv[2];
  if (!apkPath) {
    console.error('Usage: node scripts/check-apk-size.mjs <path-to-apk>');
    process.exitCode = 2;
  } else {
    try {
      const bytes = statSync(apkPath).size;
      assertApkSize(bytes);
      console.log(`APK size ${(bytes / MEBIBYTE).toFixed(2)} MiB is within the 30 MiB ceiling.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
