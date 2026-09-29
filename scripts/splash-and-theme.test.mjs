import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
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
