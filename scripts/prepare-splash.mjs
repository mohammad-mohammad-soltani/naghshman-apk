import { readFileSync, writeFileSync } from 'node:fs';

// Preserve massage.svg as the editable source. Bundle XML directly so release
// startup never needs to fetch an Android resource URI through JavaScript.
const source = readFileSync(new URL('../assets/images/massage.svg', import.meta.url), 'utf8');
const image = source.match(/<image\b[^>]*xlink:href="(data:image\/png;base64,[^"]+)"[^>]*\/>/);
if (!image) throw new Error('Splash embedded image missing');
const vectors = source
  .replace(image[0], '')
  .replace(/<pattern\b[\s\S]*?<\/pattern>/, '')
  .replace(/<rect x="56" y="287" width="318" height="318" fill="url\(#pattern0_1134_3288\)"\/>/, '');
if (/pattern0_1134_3288/.test(vectors)) throw new Error('Unexpected splash pattern layout');
writeFileSync(new URL('../assets/images/massage.generated.json', import.meta.url), JSON.stringify({ vectors, image: image[1] }));
