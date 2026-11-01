import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sign } from './ci/report-lib.mjs';

const SECRET = 'c'.repeat(40);
const CLI = new URL('./ci/report.mjs', import.meta.url).pathname;

/** A stand-in for the backend: records requests, checks every signature, answers from `answers`. */
async function backend(answers = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const route = req.url.replace('/wp-json/meydan/v1', '');
      const valid = req.headers['x-ci-signature'] === sign(SECRET, req.method, route, req.headers['x-ci-timestamp'], req.headers['x-ci-nonce'], body);
      requests.push({ route, valid, body: body ? JSON.parse(body) : null });
      const [status, data] = valid ? (answers[`${req.method} ${route}`] ?? [200, {}]) : [401, 'bad signature'];
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status < 400 ? { data } : { error: { message: data } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, url: `http://127.0.0.1:${server.address().port}/wp-json/meydan/v1`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function cli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

test('the whole CLI as the workflow uses it: start → step → run → failed upload → finish with the real reason', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-'));
  const api = await backend({
    'POST /ci/app-builds/start': [201, { build_id: 77, status: 'building' }],
    'POST /ci/app-builds/77/upload-url': [422, 'حجم نامعتبر'],
  });
  t.after(async () => { await api.close(); rmSync(dir, { recursive: true, force: true }); });
  const ghEnv = join(dir, 'github-env');
  writeFileSync(ghEnv, '');
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { version: '1.0.1' } }));
  writeFileSync(join(dir, 'fake.apk'), 'not-an-apk');
  const base = { MEYDAN_CI_API: api.url, MEYDAN_CI_SECRET: SECRET, MEYDAN_CI_ALLOW_HTTP: '1', GITHUB_ENV: ghEnv, GITHUB_RUN_ID: '4242', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: 'e'.repeat(40), GITHUB_REF_NAME: 'main', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', EXPO_TOKEN: 'super-secret-expo-token-1' };

  // start: from the repo root, app.json is read from the working directory
  const started = await new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, 'start'], { cwd: dir, env: { PATH: process.env.PATH, ...base }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => resolve({ code, out }));
  });
  assert.equal(started.code, 0);
  assert.match(readFileSync(ghEnv, 'utf8'), /^MEYDAN_BUILD_ID=77$/m, 'the build id is handed to the later steps through GITHUB_ENV');
  const opened = api.requests[0];
  assert.equal(opened.valid, true);
  assert.deepEqual(
    { run_id: opened.body.run_id, run_attempt: opened.body.run_attempt, version_name: opened.body.version_name, commit_sha: opened.body.commit_sha, branch: opened.body.branch, run_url: opened.body.run_url },
    { run_id: 4242, run_attempt: 2, version_name: '1.0.1', commit_sha: 'e'.repeat(40), branch: 'main', run_url: 'https://github.com/o/r/actions/runs/4242/attempts/2' },
  );

  const withBuild = { ...base, MEYDAN_BUILD_ID: '77' };
  const ran = await cli(['run', '--step', 'build', '--', process.execPath, '-e', 'console.log("compiling"); console.error("token " + process.env.EXPO_TOKEN)'], withBuild);
  assert.equal(ran.code, 0);
  assert.match(ran.out, /compiling/, 'the command output still reaches the runner log');
  const shipped = api.requests.filter((r) => r.route === '/ci/app-builds/77/log').flatMap((r) => r.body.lines).map((l) => l.text);
  assert.ok(shipped.includes('compiling') && shipped.includes('token ***'), 'and the shipped copy has the secret redacted');
  assert.ok(api.requests.every((r) => r.valid), 'every request carried a valid signature');

  const failing = await cli(['run', '--step', 'verify', '--', process.execPath, '-e', 'process.exit(5)'], withBuild);
  assert.equal(failing.code, 5, 'a failing command fails the step with its own exit code');

  // the upload is refused by the backend: the CLI exits 1 and leaves the reason for the closing step
  const upload = await cli(['upload', join(dir, 'fake.apk')], { ...withBuild, AAPT2: process.execPath });
  assert.equal(upload.code, 1);
  assert.match(readFileSync(ghEnv, 'utf8'), /^MEYDAN_BUILD_ERROR=.+/m, 'the reason is written for the next step');

  const reason = readFileSync(ghEnv, 'utf8').match(/^MEYDAN_BUILD_ERROR=(.+)$/m)[1];
  const finished = await cli(['finish', '--conclusion', 'failure'], { ...withBuild, MEYDAN_BUILD_ERROR: reason });
  assert.equal(finished.code, 0);
  const closing = api.requests.findLast((r) => r.route === '/ci/app-builds/77/finish');
  assert.equal(closing.body.conclusion, 'failure');
  assert.ok(closing.body.error.length > 0, 'finish reports the upload error to the panel');
});

test('without configuration nothing breaks: start/step/finish are no-ops and run just runs', async () => {
  const quiet = { MEYDAN_CI_API: '', MEYDAN_CI_SECRET: '' };
  assert.equal((await cli(['start'], quiet)).code, 0);
  assert.equal((await cli(['step', 'verify', 'running'], quiet)).code, 0);
  assert.equal((await cli(['finish', '--conclusion', 'success'], quiet)).code, 0);
  const ran = await cli(['run', '--step', 'build', '--', process.execPath, '-e', 'console.log("still built"); process.exit(0)'], quiet);
  assert.equal(ran.code, 0);
  assert.match(ran.out, /still built/);
  assert.equal((await cli(['upload', 'x.apk'], quiet)).code, 0, 'the APK stays a GitHub artifact only');
  assert.equal((await cli(['nonsense'], quiet)).code, 2);
  // a plain-http backend is refused (the secret must not travel in the clear) but never stops the build
  const insecure = await cli(['run', '--step', 'build', '--', process.execPath, '-e', 'process.exit(0)'], { MEYDAN_CI_API: 'http://example.test/api', MEYDAN_CI_SECRET: 'x'.repeat(40) });
  assert.equal(insecure.code, 0);
  assert.match(insecure.out, /reporting is off: MEYDAN_CI_API must be an https URL/);
});
