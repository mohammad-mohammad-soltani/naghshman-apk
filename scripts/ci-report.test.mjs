import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { Api, LogShipper, findAapt2, makeRedactor, parseBadging, runCommand, sign, uploadApk } from './ci/report-lib.mjs';

const SECRET = 's'.repeat(40);
const BASE = 'https://backend.test/wp-json/meydan/v1';

/** A fetch that records calls and answers from a table of `METHOD route` → [status, data]. */
function fakeBackend(routes = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const route = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    calls.push({ url, route, method: init.method, headers: init.headers, body: init.body });
    const answer = routes[`${init.method} ${route}`] ?? routes[`${init.method} *`] ?? [200, {}];
    const [status, data] = typeof answer === 'function' ? answer(calls.length) : answer;
    return new Response(JSON.stringify(status < 400 ? { data } : { error: { message: String(data) } }), { status });
  };
  return { calls, fetchImpl };
}
const noWait = async () => {};
const sink = () => new Writable({ write(chunk, _enc, done) { done(); } });

test('signs exactly like the backend (PHP vector)', () => {
  // meydan-backend: CiAuth::sign(str_repeat('s', 40), 'POST', '/ci/app-builds/start', '1700000000', '00112233445566778899aabbccddeeff', '{"run_id":1}')
  assert.equal(
    sign(SECRET, 'POST', '/ci/app-builds/start', '1700000000', '00112233445566778899aabbccddeeff', '{"run_id":1}'),
    '480dba97cfefed8935b9556e4b2a9be5b282782dbedfc20cbb136d09342bd044',
  );
});

test('every call is signed afresh and carries a new nonce', async () => {
  const { calls, fetchImpl } = fakeBackend({ 'POST /ci/app-builds/1/step': [200, { ok: true }] });
  const api = new Api({ base: BASE, secret: SECRET, fetchImpl, wait: noWait });
  await api.call('POST', '/ci/app-builds/1/step', { step: 'build', state: 'running' });
  await api.call('POST', '/ci/app-builds/1/step', { step: 'build', state: 'done' });
  const [first, second] = calls;
  assert.notEqual(first.headers['x-ci-nonce'], second.headers['x-ci-nonce']);
  assert.match(first.headers['x-ci-nonce'], /^[0-9a-f]{32}$/);
  assert.equal(
    first.headers['x-ci-signature'],
    sign(SECRET, 'POST', '/ci/app-builds/1/step', first.headers['x-ci-timestamp'], first.headers['x-ci-nonce'], first.body),
  );
});

test('retries network errors, 5xx and 429, never a plain 4xx; reporting off does nothing', async () => {
  let n = 0;
  const flaky = async () => { n += 1; if (n < 3) throw new Error('socket hang up'); return new Response('{"data":{"ok":1}}', { status: 200 }); };
  const api = new Api({ base: BASE, secret: SECRET, fetchImpl: flaky, wait: noWait });
  const ok = await api.call('POST', '/ci/app-builds/1/log', {}, { retries: 3 });
  assert.equal(ok.ok, true);
  assert.equal(n, 3);

  const { calls, fetchImpl } = fakeBackend({ 'POST *': [422, 'bad input'] });
  const refused = await new Api({ base: BASE, secret: SECRET, fetchImpl, wait: noWait }).call('POST', '/x', {}, { retries: 3 });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 422);
  assert.equal(calls.length, 1, 'a 4xx is final');

  const off = new Api({ base: '', secret: '', fetchImpl });
  assert.equal(off.enabled, false);
  assert.equal((await off.call('POST', '/x')).ok, false);
  assert.equal(calls.length, 1, 'a disabled client never touches the network');
  await assert.rejects(() => new Api({ base: BASE, secret: SECRET, fetchImpl, wait: noWait }).must('POST', '/x', {}), /failed \(422\)/);
});

test('only https backends are accepted, a short secret disables reporting', () => {
  assert.throws(() => new Api({ base: 'http://backend.test/api', secret: SECRET }), /https/);
  assert.doesNotThrow(() => new Api({ base: 'http://localhost:8082/api', secret: SECRET, allowInsecure: true }));
  assert.equal(new Api({ base: BASE, secret: 'short' }).enabled, false);
});

test('redacts secret-looking environment values and token shapes', () => {
  const redact = makeRedactor({
    EXPO_TOKEN: 'expo-token-value-12345', MEYDAN_CI_SECRET: SECRET, PATH: '/usr/bin:/bin', CI: 'true', SHORT_TOKEN: 'abc',
    ANDROID_KEYSTORE_PASSWORD: 'p@ssw0rd-long-enough',
  });
  assert.equal(redact('using expo-token-value-12345 now'), 'using *** now');
  assert.equal(redact(`secret=${SECRET}`), 'secret=***');
  assert.equal(redact('pw p@ssw0rd-long-enough!'), 'pw ***!');
  assert.equal(redact('PATH is /usr/bin:/bin and abc stays'), 'PATH is /usr/bin:/bin and abc stays');
  assert.equal(redact('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 end'), 'token *** end');
  assert.equal(redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123456'), 'Authorization: ***');
  assert.equal(redact('GET https://s3/x.apk?X-Amz-Signature=deadbeefdeadbeef&x=1'), 'GET https://s3/x.apk?***&x=1');
  assert.equal(redact('AKIAABCDEFGHIJKLMNOP'), '***');
  assert.equal(redact('-----BEGIN RSA PRIVATE KEY-----'), '***');
});

test('the log shipper splits lines, keeps partial lines, redacts and keeps order', async () => {
  const sent = [];
  const shipper = new LogShipper({ step: 'build', send: async (lines) => { sent.push(lines); }, redact: makeRedactor({ A_TOKEN: 'hunter2hunter2' }), now: () => 1000 });
  shipper.feed('out', 'first\nsecond hunter2hunter2\r\nthi');
  shipper.feed('out', 'rd\rprogress 10%\rprogress 10%\n');
  shipper.feed('err', 'warn\n\n   \n');
  shipper.feed('out', 'tail without newline');
  await shipper.stop();
  const lines = sent.flat();
  assert.deepEqual(lines.map((l) => l.text), ['first', 'second ***', 'third', 'progress 10%', 'warn', 'tail without newline']);
  assert.deepEqual(lines.map((l) => l.stream), ['out', 'out', 'out', 'out', 'err', 'out']);
  assert.ok(lines.every((l) => l.step === 'build' && l.ts === 1000));
});

test('the log shipper batches, survives a failing backend and reports what it dropped', async () => {
  const batches = [];
  const shipper = new LogShipper({ step: 'verify', maxBatch: 3, send: async (lines) => { batches.push(lines.length); } });
  for (let i = 0; i < 7; i += 1) shipper.push('out', `line ${i}`);
  await shipper.stop();
  assert.deepEqual(batches, [3, 3, 1]);

  const broken = new LogShipper({ step: 'verify', maxBatch: 2, maxQueue: 3, send: async () => { throw new Error('backend down'); } });
  for (let i = 0; i < 20; i += 1) broken.push('out', `line ${i}`);
  await assert.doesNotReject(broken.stop());

  const seen = [];
  const lossy = new LogShipper({ step: 'build', maxBatch: 1000, maxQueue: 4, send: async (lines) => { seen.push(...lines); } });
  for (let i = 0; i < 10; i += 1) lossy.push('out', `line ${i}`);
  await lossy.stop();
  assert.match(seen[0].text, /6 خط لاگ/);
  assert.deepEqual(seen.slice(1).map((l) => l.text), ['line 6', 'line 7', 'line 8', 'line 9']);
});

test('runCommand shows output, ships it, marks the step and returns the exit code', async () => {
  const { calls, fetchImpl } = fakeBackend();
  const api = new Api({ base: BASE, secret: SECRET, fetchImpl, wait: noWait });
  const out = [];
  const stdout = new Writable({ write(chunk, _e, done) { out.push(chunk.toString()); done(); } });
  const code = await runCommand({ api, buildId: '7', step: 'build', command: process.execPath, args: ['-e', 'console.log("hello"); console.error("oops"); process.exit(3)'], out: stdout, err: sink(), env: {} });
  assert.equal(code, 3);
  assert.match(out.join(''), /hello/, 'the output is still shown on the runner');
  const steps = calls.filter((c) => c.route === '/ci/app-builds/7/step').map((c) => JSON.parse(c.body).state);
  assert.deepEqual(steps, ['running', 'failed']);
  const shipped = calls.filter((c) => c.route === '/ci/app-builds/7/log').flatMap((c) => JSON.parse(c.body).lines);
  assert.deepEqual(shipped.map((l) => `${l.stream}:${l.text}`).sort(), ['err:oops', 'out:hello']);

  const logOnly = fakeBackend();
  await runCommand({ api: new Api({ base: BASE, secret: SECRET, fetchImpl: logOnly.fetchImpl, wait: noWait }), buildId: '7', step: 'verify', command: process.execPath, args: ['-e', '0'], state: 'log', out: sink(), err: sink(), env: {} });
  assert.equal(logOnly.calls.filter((c) => c.route.endsWith('/step')).length, 0, '--log-only never changes the step');
});

test('runCommand still runs the command when reporting is off or the command is missing', async () => {
  const off = new Api({ base: '', secret: '' });
  assert.equal(await runCommand({ api: off, buildId: '', step: 'build', command: process.execPath, args: ['-e', 'process.exit(0)'], out: sink(), err: sink(), env: {} }), 0);
  assert.equal(await runCommand({ api: off, buildId: '', step: 'build', command: 'definitely-not-a-command-xyz', args: [], out: sink(), err: sink(), env: {} }), 127);
});

const BADGING = `package: name='ir.naghshman.app' versionCode='46' versionName='1.0.1' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36'
minSdkVersion:'24'
targetSdkVersion:'36'
uses-permission: name='android.permission.CAMERA'
`;

test('reads the package, versionCode and versionName from aapt2 output', () => {
  assert.deepEqual(parseBadging(BADGING), { package: 'ir.naghshman.app', versionCode: 46, versionName: '1.0.1' });
  assert.throws(() => parseBadging('nothing useful'), /could not read/);
  assert.throws(() => parseBadging("package: name='a.b' versionCode='0' versionName='1'"), /could not read/);
});

test('finds the newest aapt2 in the Android SDK', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-'));
  try {
    for (const version of ['34.0.0', '36.0.0', '9.0.0']) {
      mkdirSync(join(root, 'build-tools', version), { recursive: true });
      writeFileSync(join(root, 'build-tools', version, 'aapt2'), '');
    }
    assert.equal(findAapt2({ ANDROID_HOME: root }), join(root, 'build-tools', '36.0.0', 'aapt2'));
    assert.throws(() => findAapt2({ ANDROID_HOME: join(root, 'missing'), HOME: join(root, 'nohome') }), /aapt2 not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uploadApk: announces, PUTs the bytes with their length, then has the backend verify', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apk-'));
  try {
    const apk = join(dir, 'app.apk');
    const bytes = Buffer.from('PK-fake-apk-'.repeat(1000));
    writeFileSync(apk, bytes);
    const puts = [];
    const { calls, fetchImpl } = fakeBackend({
      'POST /ci/app-builds/9/step': [200, { ok: true }],
      'POST /ci/app-builds/9/upload-url': [200, { key: 'releases/android/x.apk', upload: { method: 'PUT', url: 'https://s3.test/bucket/x.apk?sig=1', headers: { 'Content-Type': 'application/vnd.android.package-archive' } } }],
      'POST /ci/app-builds/9/complete': [200, { status: 'ready', url: 'https://cdn.test/x.apk' }],
    });
    const wrapped = async (url, init) => {
      if (url.startsWith('https://s3.test')) { puts.push({ url, init }); return new Response('', { status: 200 }); }
      return fetchImpl(url, init);
    };
    const api = new Api({ base: BASE, secret: SECRET, fetchImpl: wrapped, wait: noWait });
    const result = await uploadApk({ api, buildId: '9', apkPath: apk, inspect: async () => ({ package: 'ir.naghshman.app', versionCode: 46, versionName: '1.0.1' }), fetchImpl: wrapped, wait: noWait, log: () => {} });

    const grant = JSON.parse(calls.find((c) => c.route.endsWith('/upload-url')).body);
    assert.deepEqual(grant, {
      version_code: 46, version_name: '1.0.1', size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), md5: createHash('md5').update(bytes).digest('hex'),
    });
    assert.equal(puts.length, 1);
    assert.equal(puts[0].init.method, 'PUT');
    assert.ok(Buffer.isBuffer(puts[0].init.body) && puts[0].init.body.length === bytes.length, 'sent as a Buffer, so S3 gets a Content-Length');
    assert.equal(puts[0].init.headers['Content-Type'], 'application/vnd.android.package-archive');
    assert.equal(result.url, 'https://cdn.test/x.apk');
    assert.deepEqual(calls.map((c) => c.route.split('/').pop()), ['step', 'upload-url', 'complete']);

    await assert.rejects(
      () => uploadApk({ api, buildId: '9', apkPath: apk, inspect: async () => ({ package: 'evil.app', versionCode: 1, versionName: '1' }), fetchImpl: wrapped, wait: noWait, log: () => {} }),
      /expected ir\.naghshman\.app/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uploadApk fails the job when S3 keeps refusing or the backend rejects the file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apk-'));
  try {
    const apk = join(dir, 'app.apk');
    writeFileSync(apk, Buffer.from('x'.repeat(100)));
    const inspect = async () => ({ package: 'ir.naghshman.app', versionCode: 5, versionName: '1' });
    const grantRoutes = {
      'POST /ci/app-builds/9/step': [200, {}],
      'POST /ci/app-builds/9/upload-url': [200, { key: 'k', upload: { method: 'PUT', url: 'https://s3.test/k', headers: {} } }],
    };
    let attempts = 0;
    const refusing = fakeBackend(grantRoutes);
    const s3Down = async (url, init) => (url.startsWith('https://s3.test') ? (attempts += 1, new Response('AccessDenied', { status: 403 })) : refusing.fetchImpl(url, init));
    await assert.rejects(() => uploadApk({ api: new Api({ base: BASE, secret: SECRET, fetchImpl: s3Down, wait: noWait }), buildId: '9', apkPath: apk, inspect, fetchImpl: s3Down, wait: noWait, log: () => {} }), /could not be uploaded: S3 answered 403/);
    assert.equal(attempts, 4, 'four tries, then give up');

    const verifying = fakeBackend({ ...grantRoutes, 'POST /ci/app-builds/9/complete': [422, 'حجم فایل یکی نیست'] });
    const s3Ok = async (url, init) => (url.startsWith('https://s3.test') ? new Response('', { status: 200 }) : verifying.fetchImpl(url, init));
    await assert.rejects(() => uploadApk({ api: new Api({ base: BASE, secret: SECRET, fetchImpl: s3Ok, wait: noWait }), buildId: '9', apkPath: apk, inspect, fetchImpl: s3Ok, wait: noWait, log: () => {} }), /complete failed \(422\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
