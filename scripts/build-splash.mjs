// Turns the site's splash animations (assets/splash/splash-<theme>.json) into
// the optimized dotLottie files the app ships (splash-<theme>.lottie).
//
// Optimizing at build time instead of on every launch keeps ~1 MB of JSON
// out of the JS bundle, off Hermes at startup and off the bridge: Lottie
// reads the .lottie file natively, on a background thread.
//
//   node scripts/build-splash.mjs          rewrite the .lottie files
//   node scripts/build-splash.mjs --check  fail if they are out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

import { optimizeLottie } from '../src/lib/lottie-optimize.ts';

export const SPLASH_THEMES = ['light', 'dark'];

const splashDirectory = new URL('../assets/splash/', import.meta.url);

export const sourceUrl = (theme) => new URL(`splash-${theme}.json`, splashDirectory);
export const dotLottieUrl = (theme) => new URL(`splash-${theme}.lottie`, splashDirectory);

/** A dotLottie archive (a zip with a manifest and one animation). */
export function buildDotLottie(animation, id) {
  return zip([
    ['manifest.json', JSON.stringify({ version: '1', generator: 'naghshman', animations: [{ id }] })],
    [`animations/${id}.json`, JSON.stringify(optimizeLottie(animation))],
  ]);
}

/** A minimal, deterministic zip writer: deflated entries, fixed timestamps. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, fileName, compressed);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + compressed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function expectedDotLottie(theme) {
  return buildDotLottie(JSON.parse(readFileSync(sourceUrl(theme), 'utf8')), `splash-${theme}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const theme of SPLASH_THEMES) {
    const expected = expectedDotLottie(theme);
    if (check) {
      let current = null;
      try {
        current = readFileSync(dotLottieUrl(theme));
      } catch {}
      if (!current?.equals(expected)) {
        console.error(`assets/splash/splash-${theme}.lottie is out of date`);
        stale = true;
      }
    } else {
      writeFileSync(dotLottieUrl(theme), expected);
      console.log(`assets/splash/splash-${theme}.lottie: ${expected.length} bytes`);
    }
  }
  if (stale) {
    console.error('Run: npm run build:splash');
    process.exit(1);
  }
}
