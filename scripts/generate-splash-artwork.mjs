import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const VECTOR_SHAPE_PATTERN = /<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/;

function attribute(markup, name) {
  const match = markup.match(new RegExp(`\\b${name}="([^"]+)"`));
  if (!match) throw new Error(`Splash SVG is missing ${name}`);
  return match[1];
}

export function buildSplashArtwork(svg) {
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!root) throw new Error('Splash artwork must contain an SVG root');

  const viewBox = attribute(root, 'viewBox');
  const image = svg.match(/<image\b[^>]*(?:href|xlink:href)="data:image\/[^>]+\/>/)?.[0];
  if (!image) throw new Error('Splash SVG must contain one embedded image');

  const uri = image.match(/(?:href|xlink:href)="(data:image\/[^"]+)"/)?.[1];
  const imageId = attribute(image, 'id');
  const pattern = svg.match(
    new RegExp(`<pattern\\b[^>]*>[\\s\\S]*?<use\\b[^>]*(?:href|xlink:href)="#${imageId}"[^>]*/>[\\s\\S]*?</pattern>`),
  )?.[0];
  if (!pattern) throw new Error('Splash SVG image pattern could not be resolved');

  const patternId = attribute(pattern, 'id');
  const frame = svg.match(
    new RegExp(`<rect\\b[^>]*fill="url\\(#${patternId}\\)"[^>]*/>`),
  )?.[0];
  if (!frame) throw new Error('Splash SVG image frame could not be resolved');

  const vectors = svg
    .replace(frame, '')
    .replace(pattern, '')
    .replace(image, '');

  if (!VECTOR_SHAPE_PATTERN.test(vectors)) {
    throw new Error('Splash artwork must retain at least one vector shape');
  }

  return {
    viewBox,
    vectors,
    image: {
      uri,
      frame: {
        x: Number(attribute(frame, 'x')),
        y: Number(attribute(frame, 'y')),
        width: Number(attribute(frame, 'width')),
        height: Number(attribute(frame, 'height')),
      },
    },
  };
}

async function main() {
  const sourceUrl = new URL('../assets/images/massage.svg', import.meta.url);
  const outputUrl = new URL('../assets/images/massage.generated.json', import.meta.url);
  const artwork = buildSplashArtwork(await readFile(sourceUrl, 'utf8'));
  await writeFile(outputUrl, `${JSON.stringify(artwork)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
