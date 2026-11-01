#!/usr/bin/env node
// CLI used by .github/workflows/build-android.yml to report to the Meydan backend.
//
//   report.mjs start                              open the build (writes MEYDAN_BUILD_ID to $GITHUB_ENV)
//   report.mjs step <verify|build|inspect|upload> <running|done|failed|skipped>
//   report.mjs run --step <key> [--log-only] -- <command> [args…]
//                                                 run a command, ship its output live, mark the step
//   report.mjs upload <apk>                       upload the APK to S3 and have the backend verify it
//   report.mjs finish --conclusion <success|failure|cancelled> [--error <text>]
//
// Needs MEYDAN_CI_API (https://…/wp-json/meydan/v1) and MEYDAN_CI_SECRET. Without them every command
// except `run` and `upload` does nothing, and `run` just runs the command.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

import { Api, STEP_KEYS, makeRedactor, runCommand, uploadApk } from './report-lib.mjs';

const env = process.env;
/** A bad MEYDAN_CI_API (not https) turns reporting off; it must never stop a build. */
function createApi() {
  try {
    return new Api({ base: env.MEYDAN_CI_API ?? '', secret: env.MEYDAN_CI_SECRET ?? '', allowInsecure: env.MEYDAN_CI_ALLOW_HTTP === '1' });
  } catch (error) {
    console.log(`::warning::Meydan build reporting is off: ${error instanceof Error ? error.message : error}`);
    return new Api();
  }
}
const api = createApi();
const buildId = env.MEYDAN_BUILD_ID ?? '';
const [command, ...rest] = process.argv.slice(2);

function option(name, args = rest) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function annotate(level, message) {
  console.log(`::${level}::${message}`);
}

async function start() {
  if (!api.enabled) {
    annotate('notice', 'Meydan build reporting is off (MEYDAN_CI_API / MEYDAN_CI_SECRET not set).');
    return 0;
  }
  const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
  const runId = env.GITHUB_RUN_ID;
  const attempt = env.GITHUB_RUN_ATTEMPT ?? '1';
  const result = await api.call('POST', '/ci/app-builds/start', {
    run_id: Number(runId),
    run_attempt: Number(attempt),
    version_name: appConfig.expo?.version ?? '',
    commit_sha: env.GITHUB_SHA,
    commit_subject: git('log', '-1', '--format=%s'),
    commit_author: git('log', '-1', '--format=%an'),
    branch: env.GITHUB_REF_NAME ?? '',
    run_url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${runId}/attempts/${attempt}`,
  }, { retries: 2 });
  if (!result.ok || !result.data?.build_id) {
    annotate('warning', `Could not open the build on the Meydan panel (${result.status || 'no response'}: ${result.error}). The build goes on without live reporting.`);
    return 0;
  }
  if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `MEYDAN_BUILD_ID=${result.data.build_id}\n`);
  annotate('notice', `Reporting this build to the Meydan panel as #${result.data.build_id}.`);
  return 0;
}

async function step() {
  const [key, state] = rest;
  if (!api.enabled || !buildId) return 0;
  const result = await api.call('POST', `/ci/app-builds/${buildId}/step`, { step: key, state });
  if (!result.ok) annotate('warning', `step ${key}: ${result.error}`);
  return 0;
}

async function run() {
  const separator = rest.indexOf('--');
  const key = option('step', separator >= 0 ? rest.slice(0, separator) : rest);
  if (separator < 0 || separator === rest.length - 1) {
    console.error('usage: report.mjs run --step <key> [--log-only] -- <command> [args…]');
    return 2;
  }
  if (!STEP_KEYS.includes(key ?? '')) {
    console.error(`--step must be one of ${STEP_KEYS.join(', ')}`);
    return 2;
  }
  const [file, ...args] = rest.slice(separator + 1);
  const state = rest.slice(0, separator).includes('--log-only') ? 'log' : 'auto';
  return runCommand({ api, buildId, step: key, command: file, args, state, env });
}

async function upload() {
  const apkPath = rest[0];
  if (!apkPath) {
    console.error('usage: report.mjs upload <apk>');
    return 2;
  }
  if (!api.enabled || !buildId) {
    annotate('notice', 'Meydan build reporting is off: the APK stays a GitHub artifact only.');
    return 0;
  }
  try {
    await uploadApk({ api, buildId, apkPath });
    return 0;
  } catch (error) {
    const message = makeRedactor(env)(error instanceof Error ? error.message : String(error));
    console.error(`::error::${message}`);
    // The last workflow step closes the build; hand it the real reason so the panel shows it.
    if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `MEYDAN_BUILD_ERROR=${message.replace(/\s+/g, ' ').slice(0, 300)}\n`);
    await api.call('POST', `/ci/app-builds/${buildId}/step`, { step: 'upload', state: 'failed' });
    return 1;
  }
}

async function finish() {
  const conclusion = option('conclusion') ?? 'failure';
  if (!api.enabled || !buildId) return 0;
  const result = await api.call('POST', `/ci/app-builds/${buildId}/finish`, { conclusion, error: option('error') ?? env.MEYDAN_BUILD_ERROR ?? '' }, { retries: 3 });
  if (!result.ok) annotate('warning', `Could not close the build on the Meydan panel: ${result.error}`);
  return 0;
}

const commands = { start, step, run, upload, finish };
if (!commands[command]) {
  console.error(`usage: report.mjs <${Object.keys(commands).join('|')}> …`);
  process.exit(2);
}
process.exit(await commands[command]());
