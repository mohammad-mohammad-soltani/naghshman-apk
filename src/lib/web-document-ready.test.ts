import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { isCurrentDocumentReady, webDocumentReadyScript } from './web-document-ready.ts';

test('rejects readiness from failed, previous, or different documents', () => {
  const message = { source: 'naghshman-render', attempt: 2, url: 'https://naghshman.ir/auth' };
  assert.equal(isCurrentDocumentReady(message, 2, message.url, false), true);
  assert.equal(isCurrentDocumentReady(message, 3, message.url, false), false);
  assert.equal(isCurrentDocumentReady(message, 2, 'https://naghshman.ir/', false), false);
  assert.equal(isCurrentDocumentReady(message, 2, message.url, true), false);
  assert.equal(isCurrentDocumentReady(message, 2, null, false), false);
  assert.equal(isCurrentDocumentReady(null, 2, message.url, false), false);
});

test('waits for document load, fonts and two paint frames before acknowledging readiness', async () => {
  const messages: string[] = [];
  const frames: (() => void)[] = [];
  let load: (() => void) | undefined;
  let fontsReady!: () => void;
  const fonts = new Promise<void>((resolve) => { fontsReady = resolve; });
  vm.runInNewContext(webDocumentReadyScript(7), {
    document: { readyState: 'loading', fonts: { ready: fonts } },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    window: {
      location: { href: 'https://naghshman.ir/auth' },
      addEventListener: (_name: string, callback: () => void) => { load = callback; },
      ReactNativeWebView: { postMessage: (message: string) => messages.push(message) },
    },
  });
  assert.equal(messages.length, 0);
  assert.equal(frames.length, 0);
  load!();
  assert.equal(frames.length, 0);
  fontsReady();
  await new Promise((resolve) => setImmediate(resolve));
  frames.shift()!();
  assert.equal(messages.length, 0);
  frames.shift()!();
  assert.deepEqual(JSON.parse(messages[0]), {
    source: 'naghshman-render', attempt: 7, url: 'https://naghshman.ir/auth',
  });
});
