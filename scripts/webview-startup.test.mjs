import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real shell callbacks. Native rendering and hooks are the boundary;
// effects (network, notifications, Android APIs) are intentionally not run here.
function mountShell() {
  const states = [];
  const react = {
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
    useEffect: () => {},
    useState(initial) {
      const slot = { value: typeof initial === 'function' ? initial() : initial };
      states.push(slot);
      return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
  };
  const jsx = (type, props) => ({ type, props });
  const external = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: (x) => x }, View: 'View', StatusBar: 'StatusBar' },
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
        if (name.startsWith('@/')) return load(resolve(root, 'src', name.slice(2) + '.ts'));
        if (name.startsWith('.')) return load(resolve(dirname(path), name.endsWith('.ts') ? name : name + '.ts'));
        return require(name);
      }, module, module.exports,
    );
    return module.exports;
  }
  const tree = load(resolve(root, 'src/components/native-web-shell.tsx')).NativeWebShell();
  function find(node, type) {
    if (!node) return;
    if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean);
    return node.type === type ? node : find(node.props?.children, type);
  }
  return {
    web: find(tree, 'WebView').props,
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
