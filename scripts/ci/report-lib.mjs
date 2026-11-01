// What the Android build workflow tells the Meydan backend while it runs:
// the build starting, each step, the live log, the finished APK, and how it ended.
// No dependencies, and no side effects on import (see report.mjs for the CLI).
//
// Every request is signed with MEYDAN_CI_SECRET (HMAC-SHA256, see backend
// AppBuilds/CiAuth.php). Reporting is best effort: if the backend is down or the
// secret is missing the build still runs and still uploads its GitHub artifact.
// Only the APK upload is allowed to fail the job, because a build nobody can
// download is not a release.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STEP_KEYS = ['verify', 'build', 'inspect', 'upload'];
export const EXPECTED_PACKAGE = 'ir.naghshman.app';

/** HMAC over METHOD, route (the path after /meydan/v1), timestamp, nonce and the body's SHA-256. */
export function sign(secret, method, route, ts, nonce, body) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update([method.toUpperCase(), route, ts, nonce, bodyHash].join('\n'))
    .digest('hex');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Api {
  /**
   * @param {{ base?: string, secret?: string, fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void>,
   *   allowInsecure?: boolean, now?: () => number }} options
   */
  constructor({ base = '', secret = '', fetchImpl = globalThis.fetch, wait = sleep, allowInsecure = false, now = Date.now } = {}) {
    this.base = base.replace(/\/+$/, '');
    this.secret = secret;
    this.fetchImpl = fetchImpl;
    this.wait = wait;
    this.now = now;
    if (this.base && !allowInsecure && !this.base.startsWith('https://')) {
      throw new Error('MEYDAN_CI_API must be an https URL');
    }
  }

  get enabled() {
    return this.base !== '' && this.secret.length >= 32;
  }

  /**
   * One signed call. Never throws: the result says what happened.
   * Network errors, 429 and 5xx are retried (each try is signed afresh); other 4xx are final.
   * @returns {Promise<{ ok: boolean, status: number, data: any, error: string }>}
   */
  async call(method, route, payload = {}, { retries = 0, timeoutMs = 15000 } = {}) {
    if (!this.enabled) return { ok: false, status: 0, data: null, error: 'reporting is not configured' };
    const body = JSON.stringify(payload);
    let last = { ok: false, status: 0, data: null, error: 'no attempt' };
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await this.wait(Math.min(2000 * 2 ** (attempt - 1), 15000));
      const ts = String(Math.floor(this.now() / 1000));
      const nonce = randomBytes(16).toString('hex');
      try {
        const response = await this.fetchImpl(this.base + route, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-ci-timestamp': ts,
            'x-ci-nonce': nonce,
            'x-ci-signature': sign(this.secret, method, route, ts, nonce, body),
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON: an HTML error page from a proxy */ }
        const message = json?.error?.message || json?.message || text.slice(0, 200);
        last = { ok: response.ok, status: response.status, data: json?.data ?? null, error: response.ok ? '' : String(message) };
        if (response.ok || (response.status < 500 && response.status !== 429)) return last;
      } catch (error) {
        last = { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : String(error) };
      }
    }
    return last;
  }

  /** Like `call`, but a failure throws (for the steps a release cannot do without). */
  async must(method, route, payload, options) {
    const result = await this.call(method, route, payload, options);
    if (!result.ok) throw new Error(`${method} ${route} failed (${result.status || 'no response'}): ${result.error}`);
    return result.data;
  }
}

// ── secrets must not travel to the panel ──────────────────────────────────────

const SECRET_NAME = /TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|KEYSTORE/i;
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\b(x-amz-signature|x-amz-credential|signature|x-ci-signature)=[^\s&"']{8,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

/** Replaces the values of secret-looking environment variables and known token shapes. */
export function makeRedactor(env) {
  const values = [...new Set(
    Object.entries(env)
      .filter(([name, value]) => SECRET_NAME.test(name) && typeof value === 'string' && value.length >= 8 && !/^(true|false|null|undefined)$/i.test(value))
      .map(([, value]) => value),
  )].sort((a, b) => b.length - a.length);
  return (text) => {
    let out = text;
    for (const value of values) if (out.includes(value)) out = out.split(value).join('***');
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '***');
    return out;
  };
}

// ── live log ──────────────────────────────────────────────────────────────────

/** Splits output into lines (a bare \r is a progress redraw: its own line) and ships them in order, in batches. */
export class LogShipper {
  /**
   * @param {{ send: (lines: object[]) => Promise<unknown>, step?: string, redact?: (t: string) => string,
   *   flushMs?: number, maxBatch?: number, maxQueue?: number, now?: () => number }} options
   */
  constructor({ send, step = '', redact = (text) => text, flushMs = 2000, maxBatch = 200, maxQueue = 4000, now = Date.now }) {
    this.send = send;
    this.step = step;
    this.redact = redact;
    this.flushMs = flushMs;
    this.maxBatch = maxBatch;
    this.maxQueue = maxQueue;
    this.now = now;
    this.queue = [];
    this.partial = { out: '', err: '' };
    this.dropped = 0;
    this.chain = Promise.resolve();
    this.timer = null;
    this.previous = '';
  }

  start() {
    this.timer = setInterval(() => void this.flush(), this.flushMs);
    this.timer.unref?.();
  }

  /** Adds raw output of a stream; incomplete trailing text waits for the rest. */
  feed(stream, chunk) {
    const text = this.partial[stream] + chunk.toString('utf8');
    const parts = text.split(/\r\n|\n|\r/);
    this.partial[stream] = parts.pop() ?? '';
    for (const line of parts) this.push(stream, line);
  }

  push(stream, line) {
    const text = this.redact(line).replace(/\s+$/, '');
    if (text === '' || (text === this.previous && stream === 'out')) return;
    this.previous = text;
    this.queue.push({ step: this.step, stream, text, ts: this.now() });
    if (this.queue.length > this.maxQueue) {
      this.queue.shift();
      this.dropped += 1;
    }
    if (this.queue.length >= this.maxBatch) void this.flush();
  }

  /** Sends what is queued (in order, one request at a time). Never rejects. */
  flush() {
    if (this.dropped > 0) {
      this.queue.unshift({ step: this.step, stream: 'sys', text: `… ${this.dropped} خط لاگ به‌خاطر قطعی اتصال به سرور ارسال نشد`, ts: this.now() });
      this.dropped = 0;
    }
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxBatch);
      this.chain = this.chain.then(() => this.send(batch)).catch(() => {});
    }
    return this.chain;
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    for (const stream of ['out', 'err']) {
      if (this.partial[stream]) this.push(stream, this.partial[stream]);
      this.partial[stream] = '';
    }
    await this.flush();
  }
}

/**
 * Runs a command, shows its output as usual, ships it to the panel, and marks the step.
 * `state: 'auto'` marks running → done/failed; `'log'` only ships the log.
 * @returns {Promise<number>} the command's exit code
 */
export async function runCommand({ api, buildId, step, command, args = [], state = 'auto', env = process.env, out = process.stdout, err = process.stderr, spawnImpl = spawn }) {
  const reporting = api.enabled && Boolean(buildId);
  const shipper = new LogShipper({
    step,
    redact: makeRedactor(env),
    send: (lines) => api.call('POST', `/ci/app-builds/${buildId}/log`, { lines }, { retries: 1, timeoutMs: 10000 }),
  });
  if (reporting && state === 'auto') await api.call('POST', `/ci/app-builds/${buildId}/step`, { step, state: 'running' });
  if (reporting) shipper.start();
  const code = await new Promise((resolve) => {
    const child = spawnImpl(command, args, { stdio: ['inherit', 'pipe', 'pipe'], env });
    child.stdout.on('data', (chunk) => { out.write(chunk); if (reporting) shipper.feed('out', chunk); });
    child.stderr.on('data', (chunk) => { err.write(chunk); if (reporting) shipper.feed('err', chunk); });
    const forward = (signal) => () => child.kill(signal);
    const handlers = { SIGINT: forward('SIGINT'), SIGTERM: forward('SIGTERM') };
    for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
    child.on('error', (error) => { err.write(`${error.message}\n`); resolve(127); });
    child.on('close', (exit, signal) => {
      for (const [name, handler] of Object.entries(handlers)) process.off(name, handler);
      resolve(exit ?? (signal ? 128 : 1));
    });
  });
  if (reporting) {
    await shipper.stop();
    if (state === 'auto') await api.call('POST', `/ci/app-builds/${buildId}/step`, { step, state: code === 0 ? 'done' : 'failed' });
  }
  return code;
}

// ── the APK ───────────────────────────────────────────────────────────────────

/** `aapt2 dump badging` → the package line. */
export function parseBadging(text) {
  const line = text.split('\n').find((candidate) => candidate.startsWith('package:'));
  const read = (key) => line?.match(new RegExp(`${key}='([^']*)'`))?.[1];
  const versionCode = Number(read('versionCode'));
  if (!line || !read('name') || !Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error('could not read the package, versionCode and versionName from the APK');
  }
  return { package: read('name'), versionCode, versionName: read('versionName') ?? '' };
}

/** The newest build-tools' aapt2: AAPT2 env, else the Android SDK (GitHub's runner image has one). */
export function findAapt2(env = process.env, { runnerRoots = ['/usr/local/lib/android/sdk'] } = {}) {
  if (env.AAPT2 && existsSync(env.AAPT2)) return env.AAPT2;
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, ...runnerRoots, env.HOME && join(env.HOME, 'Android/Sdk')].filter(Boolean);
  for (const root of roots) {
    const tools = join(root, 'build-tools');
    if (!existsSync(tools)) continue;
    const versions = readdirSync(tools).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = join(tools, version, 'aapt2');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('aapt2 not found (set AAPT2, or ANDROID_HOME with build-tools installed)');
}

/** Reads the APK's own package, versionCode and versionName (EAS assigns the code, app.json does not hold it). */
export async function inspectApk(apkPath, { env = process.env, exec } = {}) {
  const aapt2 = findAapt2(env);
  const run = exec ?? ((file, args) => new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`aapt2 failed: ${stderr.trim().slice(0, 300)}`))));
  }));
  return parseBadging(await run(aapt2, ['dump', 'badging', apkPath]));
}

/**
 * Uploads the finished APK: asks the backend for a one-key upload URL, PUTs the
 * file there (no S3 credentials in GitHub), and has the backend verify it.
 * Throws on any failure: this is the step that makes a build downloadable.
 */
export async function uploadApk({ api, buildId, apkPath, inspect = inspectApk, expectedPackage = EXPECTED_PACKAGE, fetchImpl = globalThis.fetch, wait = sleep, log = console.log }) {
  const info = await inspect(apkPath);
  if (info.package !== expectedPackage) throw new Error(`the APK is ${info.package}, expected ${expectedPackage}`);
  const bytes = readFileSync(apkPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const md5 = createHash('md5').update(bytes).digest('hex');
  log(`APK ${info.package} ${info.versionName} (versionCode ${info.versionCode}), ${(bytes.length / 1048576).toFixed(2)} MiB, sha256 ${sha256.slice(0, 12)}…`);

  await api.call('POST', `/ci/app-builds/${buildId}/step`, { step: 'upload', state: 'running' });
  const grant = await api.must('POST', `/ci/app-builds/${buildId}/upload-url`, {
    version_code: info.versionCode, version_name: info.versionName, size: bytes.length, sha256, md5,
  }, { retries: 3 });

  let lastError = '';
  let uploaded = false;
  for (let attempt = 0; attempt < 4 && !uploaded; attempt += 1) {
    if (attempt > 0) await wait(2000 * 2 ** (attempt - 1));
    try {
      // A Buffer, not a stream: S3 needs a Content-Length, and a stream would be sent chunked.
      const response = await fetchImpl(grant.upload.url, { method: 'PUT', headers: grant.upload.headers, body: bytes, signal: AbortSignal.timeout(600000) });
      if (response.ok) uploaded = true;
      else lastError = `S3 answered ${response.status}: ${(await response.text()).slice(0, 200)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (!uploaded) log(`upload attempt ${attempt + 1} failed: ${lastError}`);
  }
  if (!uploaded) throw new Error(`the APK could not be uploaded: ${lastError}`);

  const done = await api.must('POST', `/ci/app-builds/${buildId}/complete`, {}, { retries: 3, timeoutMs: 60000 });
  log(`uploaded and verified: ${done?.url ?? '(no url)'}`);
  return { ...info, sha256, size: bytes.length, url: done?.url ?? null };
}
