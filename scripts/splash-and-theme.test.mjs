import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
test('bundled splash preserves source vectors and embedded PNG without pattern tiling', () => {
  const source = readFileSync(new URL('assets/images/massage.svg', root), 'utf8');
  const bundled = JSON.parse(readFileSync(new URL('assets/images/massage.generated.json', root), 'utf8'));
  const image = source.match(/<image\b[^>]*xlink:href="(data:image\/png;base64,[^"]+)"[^>]*\/>/);
  assert.equal(bundled.image, image[1]);
  assert.equal(bundled.vectors, source.replace(image[0], '').replace(/<pattern\b[\s\S]*?<\/pattern>/, '').replace(/<rect x="56" y="287" width="318" height="318" fill="url\(#pattern0_1134_3288\)"\/>/, ''));
  assert.doesNotMatch(bundled.vectors, /<pattern|<use|<image/);
});

test('both injected theme reporters treat black and dark as night, and light as day', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  const expressions = [
    source.match(/var theme = (.*);/)[1],
    source.match(/theme: (root\.classList.*)/)[1],
  ];
  for (const expression of expressions) {
    for (const [classes, scheme, expected] of [
      [['black'], 'dark', 'dark'],
      [['dark'], 'normal', 'dark'],
      [[], 'dark', 'dark'],
      [[], 'light', 'light'],
    ]) {
      assert.equal(vm.runInNewContext(expression, {
        root: { classList: { contains: (name) => classes.includes(name) } },
        window: { getComputedStyle: () => ({ colorScheme: scheme }) },
      }), expected);
    }
  }
});
