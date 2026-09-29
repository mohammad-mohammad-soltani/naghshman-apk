import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real shell callbacks. Native rendering and hooks are the boundary;
// effects (network, notifications, Android APIs) are intentionally not run here.
function mountShell() {
  const states = [];
  let cursor = 0;
  const react = {
    useRef: (current) => { const index = cursor++; return states[index] ??= { current }; },
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
    useEffect: () => {},
    useState(initial) {
      const index = cursor++;
      const slot = states[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
  };
  const jsx = (type, props, key) => ({ type, props, key: key == null ? undefined : String(key) });
  const external = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: (x) => x }, View: 'View', Text: 'Text', Pressable: 'Pressable', StatusBar: 'StatusBar' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-webview': { WebView: 'WebView' },
    'expo-network': { useNetworkState: () => ({ isConnected: true }) },
    'expo-constants': { default: { executionEnvironment: 'storeClient' } },
    '@/components/launch-splash': { LaunchSplash: 'LaunchSplash' },
  };
  const root = resolve(new URL('../', import.meta.url).pathname);
  const require = createRequire(import.meta.url);
  function load(path) {
    const output = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require, module, exports) {${output}\n})`, { filename: path })(
      (name) => {
        if (name in external) return external[name];
        if (name.startsWith('expo-')) return {};
        if (name.startsWith('@/')) { const p = resolve(root, 'src', name.slice(2)); return load(existsSync(p + '.ts') ? p + '.ts' : p + '.tsx'); }
        if (name.startsWith('.')) return load(resolve(dirname(path), name.endsWith('.ts') ? name : name + '.ts'));
        return require(name);
      }, module, module.exports,
    );
    return module.exports;
  }
  const Component = load(resolve(root, 'src/components/native-web-shell.tsx')).NativeWebShell;
  let tree = Component();
  function find(node, type) {
    if (!node) return;
    if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean);
    return node.type === type || node.type?.name === type ? node : find(node.props?.children, type);
  }
  return {
    web: find(tree, 'WebView').props,
    rerender() { cursor = 0; tree = Component(); },
    getWeb: () => find(tree, 'WebView'),
    getRecovery: () => find(tree, 'WebLoadError'),
    state: () => states.find(({ value }) => value && typeof value === 'object' && 'initialReady' in value).value,
  };
}
const event = (url = 'https://naghshman.ir/') => ({ nativeEvent: { url } });

test('opens naghshman.ir and reveals a successful document without a web message', () => {
  const { web, state } = mountShell();
  assert.equal(web.source.uri, 'https://naghshman.ir');
  web.onLoadStart(event());
  web.onLoad(event());
  web.onLoadEnd(event());
  assert.equal(state().initialReady, true);
});

test('accepts a completed same-site redirect even if its URL differs from load start', () => {
  const { web, state } = mountShell();
  web.onLoadStart(event('https://naghshman.ir'));
  web.onLoad(event('https://naghshman.ir/auth'));
  web.onLoadEnd(event('https://naghshman.ir/auth'));
  assert.equal(state().initialReady, true);
});

test('never exposes a failed initial HTTP response as a ready document', () => {
  const { web, state } = mountShell();
  web.onLoadStart(event());
  web.onHttpError({ nativeEvent: { url: 'https://naghshman.ir/', statusCode: 503 } });
  web.onLoad(event());
  web.onLoadEnd(event());
  assert.equal(state().initialReady, false);
  assert.equal(state().documentFailed, true);
});

test('ignores placeholder loads and remembers readiness across later navigation', () => {
  const { web, state } = mountShell();
  web.onLoad(event('about:blank'));
  assert.equal(state().initialReady, false);
  web.onLoadStart(event());
  web.onLoad(event());
  web.onLoadStart(event('https://naghshman.ir/profile'));
  assert.equal(state().initialReady, true);
});

test('does not reveal an HTTP error reached through a redirect', () => {
  const { web, state } = mountShell();
  web.onLoadStart(event('https://naghshman.ir'));
  web.onHttpError({ nativeEvent: { url: 'https://naghshman.ir/auth', statusCode: 503 } });
  web.onLoad(event('https://naghshman.ir/auth'));
  assert.equal(state().initialReady, false);
  assert.equal(state().documentFailed, true);
});

test('handles redirect errors from a final URL different from load start', () => {
  const { web, state } = mountShell();
  web.onLoadStart(event('https://naghshman.ir/auth'));
  let prevented = false;
  web.onError({
    nativeEvent: { url: 'https://naghshman.ir/auth?returnTo=%2Fauth', code: -9, description: 'net::ERR_TOO_MANY_REDIRECTS' },
    preventDefault() { prevented = true; },
  });
  assert.equal(state().documentFailed, true);
  assert.equal(prevented, false, 'WebView must be allowed to replace its native error document');
});

test('redirect recovery covers the raw page, retries a clean source and clears after success', () => {
  const shell = mountShell();
  shell.web.onLoadStart(event('https://naghshman.ir/auth'));
  shell.web.onError({ nativeEvent: { url: 'https://naghshman.ir/auth?returnTo=%2Fauth', code: -9 }, preventDefault() {} });
  shell.rerender();
  const recovery = shell.getRecovery();
  assert.equal(recovery.props.redirect, true);
  assert.equal(recovery.props.retrying, false);
  const rendered = recovery.type(recovery.props);
  assert.match(JSON.stringify(rendered), /صفحه باز نشد/);
  assert.doesNotMatch(JSON.stringify(rendered), /ERR_TOO|returnTo|Webpage not available/);
  recovery.props.onRetry();
  shell.rerender();
  assert.equal(shell.getWeb().key, '1');
  assert.equal(shell.getWeb().props.source.uri, 'https://naghshman.ir');
  assert.equal(shell.getRecovery().props.retrying, true);
  shell.getWeb().props.onLoadStart(event());
  shell.getWeb().props.onLoad(event());
  shell.rerender();
  assert.equal(shell.getRecovery(), undefined);
});

test('network errors with a redirected URL are handled, not silently prevented', () => {
  const shell = mountShell();
  shell.web.onLoadStart(event());
  shell.web.onError({ nativeEvent: { url: 'https://naghshman.ir/auth', code: -2 }, preventDefault() { assert.fail('must replace native error page'); } });
  shell.rerender();
  assert.equal(shell.state().documentFailed, true);
  assert.ok(shell.getRecovery());
});
