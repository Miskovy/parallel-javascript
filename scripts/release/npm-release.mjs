import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { baseline, assertFrozenPackage } from '../rc/baseline.mjs';
import { assertSupportedReleaseNpmVersion } from './toolchain.mjs';

export const packageName = '@pjavascript/runtime';
const root = fileURLToPath(new URL('../../', import.meta.url));
const registry = 'https://registry.npmjs.org/';
const numeric = '(0|[1-9]\\d*)';
const identifier = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const semver = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`,
);

export function releasePolicy(version, release) {
  assert.equal(typeof version, 'string');
  const match = semver.exec(version);
  assert.ok(match, `Invalid SemVer: ${version}`);
  assert.equal(release.tag_name, `v${version}`, 'Release tag/version mismatch');
  assert.equal(release.draft, false, 'Release must be published');
  const prerelease = match[4] !== undefined;
  assert.equal(
    release.prerelease,
    prerelease,
    'Prerelease classification mismatch',
  );
  return { version, distTag: prerelease ? 'next' : 'latest' };
}

export function validateManifest(manifest, version) {
  assert.equal(manifest.name, packageName);
  assert.equal(manifest.version, version);
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ])
    assert.deepEqual(manifest[field] ?? {}, {}, `${field} must be empty`);
  assert.equal((manifest.bundledDependencies ?? []).length, 0);
  assert.equal((manifest.bundleDependencies ?? []).length, 0);
  assert.deepEqual(manifest.repository, {
    type: 'git',
    url: 'git+https://github.com/Miskovy/parallel-javascript.git',
    directory: 'packages/runtime',
  });
  assert.deepEqual(manifest.bugs, {
    url: 'https://github.com/Miskovy/parallel-javascript/issues',
  });
  // Keep registry, access, tag and provenance under workflow control.
  assert.deepEqual(manifest.publishConfig ?? {}, {});
}

// Observed with npm 11.8.0 (direct record) and 11.19.0 (package-name map).
// This is deliberately not a generic npm-output normalizer.
export function parsePublishDryRunReport(stdout) {
  assert.equal(typeof stdout, 'string', 'npm dry-run stdout must be text');
  assert.ok(stdout.trim(), 'npm dry-run stdout is empty');
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error('npm dry-run stdout is not valid JSON');
  }
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    'Unsupported npm dry-run JSON shape: expected an object',
  );
  // JSON.parse discards duplicate keys. Reject ambiguity, including escaped keys.
  const containers = [];
  for (const match of stdout.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]]/g)) {
    const token = match[0];
    if (token === '{') containers.push(new Set());
    else if (token === '[') containers.push(null);
    else if (token === '}' || token === ']') containers.pop();
    else if (
      stdout
        .slice(match.index + token.length)
        .trimStart()
        .startsWith(':')
    ) {
      const key = JSON.parse(token);
      const keys = containers.at(-1);
      assert.ok(!keys.has(key), `Duplicate npm dry-run JSON key: ${key}`);
      keys.add(key);
    }
  }
  let record = value;
  if (!Object.hasOwn(value, 'name')) {
    assert.deepEqual(
      Object.keys(value),
      [packageName],
      'Unsupported npm dry-run JSON shape: expected exactly one package-name key',
    );
    record = value[packageName];
  }
  assert.ok(
    record && typeof record === 'object' && !Array.isArray(record),
    'npm dry-run package record must be an object',
  );
  const fields = new Set([
    'id',
    'name',
    'version',
    'size',
    'unpackedSize',
    'shasum',
    'integrity',
    'filename',
    'files',
    'entryCount',
    'bundled',
  ]);
  assert.ok(
    Object.keys(record).every((key) => fields.has(key)),
    'Unknown or ambiguous npm dry-run package fields',
  );
  for (const key of ['name', 'version'])
    assert.ok(
      typeof record[key] === 'string' && record[key].length > 0,
      `npm dry-run ${key} must be a nonempty string`,
    );
  assert.ok(
    Number.isSafeInteger(record.entryCount) && record.entryCount > 0,
    'npm dry-run entryCount must be a positive safe integer',
  );
  return {
    name: record.name,
    version: record.version,
    entryCount: record.entryCount,
  };
}

export function parseTarListing(stdout) {
  assert.equal(typeof stdout, 'string', 'Tar listing must be text');
  assert.ok(stdout.length > 0, 'Tar listing is empty');
  assert.ok(!stdout.includes('\0'), 'Tar listing contains NUL');
  assert.ok(!/\r(?!\n)/.test(stdout), 'Tar listing contains bare CR');
  const crlf = stdout.includes('\r\n');
  assert.ok(
    !crlf || !/(?<!\r)\n/.test(stdout),
    'Tar listing has mixed line endings',
  );
  const separator = crlf ? '\r\n' : '\n';
  const records = stdout.split(separator);
  if (records.at(-1) === '') records.pop();
  assert.ok(
    records.length > 0 && records.every((path) => path.length > 0),
    'Tar listing has empty records',
  );
  return records;
}

export function validateTarListing(files, entryCount) {
  assert.ok(
    files.length >= 10 && files.length <= 1000,
    'Implausible file count',
  );
  assert.equal(files.length, entryCount);
  assert.equal(new Set(files).size, files.length);
  assert.ok(
    files.every((file) =>
      /^package\/(?:dist\/|src\/|package.json$|README.md$|LICENSE$)/.test(file),
    ),
  );
  assert.ok(files.every((file) => !file.split('/').includes('..')));
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/workers/bootstrap.js',
  ])
    assert.ok(files.includes(`package/${required}`), `Missing ${required}`);
}

export function validatePublishDryRunReport(report, version, entryCount) {
  assert.equal(report.name, packageName, 'npm dry-run package name mismatch');
  assert.equal(report.version, version, 'npm dry-run version mismatch');
  assert.equal(
    report.entryCount,
    entryCount,
    'npm dry-run entryCount mismatch',
  );
}

function summary(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

function output(name, value) {
  assert.ok(!/[\r\n]/.test(String(value)));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 ** 2,
    ...options,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

function npm(args, options) {
  const selectedCli = process.env.PJS_NPM_CLI ?? process.env.npm_execpath;
  if (selectedCli)
    return command(
      process.execPath,
      [resolve(selectedCli), ...args, '--registry', registry],
      options,
    );
  return command('npm', [...args, '--registry', registry], options);
}

export function registryPresence(result, version) {
  assert.ifError(result.error);
  if (result.status === 0) {
    assert.equal(
      JSON.parse(result.stdout),
      version,
      'Unexpected registry version',
    );
    return true;
  }
  // Only an explicit registry E404 permits a publish; network/auth errors fail closed.
  const response = JSON.parse(result.stdout);
  assert.equal(response.error?.code, 'E404', result.stdout + result.stderr);
  return false;
}

export function verifyRegistry(version, distTag, actualVersion, tags) {
  assert.equal(actualVersion, version, 'Published version is not visible');
  assert.equal(
    tags[distTag],
    version,
    `${distTag} does not point to ${version}`,
  );
}

function registryFailure(classification, message, retryable = false) {
  return Object.assign(new Error(message), { classification, retryable });
}

// Unknown errors fail closed. Only explicit npm/network transient codes retry.
const transientRegistryCodes = new Set([
  'E404',
  'E408',
  'E429',
  'E500',
  'E502',
  'E503',
  'E504',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

export function parseRegistryResponse(result) {
  if (result.error)
    throw registryFailure(
      result.error.code ?? 'PROCESS_ERROR',
      result.error.message,
      result.error.code === 'ETIMEDOUT',
    );
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw registryFailure(
      'MALFORMED_RESPONSE',
      'Registry response is not JSON',
    );
  }
  if (result.status !== 0) {
    const code = response?.error?.code;
    if (typeof code !== 'string')
      throw registryFailure(
        'MALFORMED_RESPONSE',
        'Missing registry error code',
      );
    throw registryFailure(
      code,
      `Registry request failed: ${code}`,
      transientRegistryCodes.has(code),
    );
  }
  return response;
}

export function requestRegistry(version, field, timeoutMs, run = spawnSync) {
  const args = [
    'view',
    field === 'identity' ? `${packageName}@${version}` : packageName,
    ...(field === 'identity' ? ['name', 'version'] : ['dist-tags']),
    '--json',
    '--registry',
    registry,
    '--fetch-retries=0',
    `--fetch-timeout=${timeoutMs}`,
    '--prefer-online',
  ];
  const cli = process.env.PJS_NPM_CLI ?? process.env.npm_execpath;
  return parseRegistryResponse(
    run(cli ? process.execPath : 'npm', cli ? [resolve(cli), ...args] : args, {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 8 * 1024 ** 2,
    }),
  );
}

export async function convergeRegistry(
  version,
  distTag,
  {
    request = (field, timeoutMs) => requestRegistry(version, field, timeoutMs),
    now = () => performance.now(),
    sleep = delay,
    log = console.log,
  } = {},
) {
  assert.ok(semver.test(version), 'Invalid registry version');
  assert.equal(distTag, semver.exec(version)?.[4] ? 'next' : 'latest');
  const started = now();
  const deadlineMs = 600_000;
  let attempt = 0;
  let retryDelayMs = 5000;
  let lastClassification = 'NONE';
  const remaining = () => deadlineMs - (now() - started);
  const diagnostic = (classification, action) =>
    log(
      `Registry convergence attempt=${attempt} elapsedMs=${Math.floor(now() - started)} remainingMs=${Math.max(0, Math.floor(remaining()))} classification=${classification} action=${action}`,
    );
  const exhausted = () => {
    diagnostic(lastClassification, 'deadline-exhausted');
    return registryFailure(
      'DEADLINE_EXHAUSTED',
      `Registry convergence deadline exhausted after ${attempt} attempts; last classification: ${lastClassification}`,
    );
  };
  const query = async (field) => {
    const timeoutMs = Math.min(30_000, Math.floor(remaining()));
    if (timeoutMs <= 0) throw exhausted();
    const response = await request(field, timeoutMs);
    if (remaining() <= 0) throw exhausted();
    return response;
  };
  while (remaining() > 0) {
    attempt++;
    diagnostic('NONE', 'query');
    try {
      const identity = await query('identity');
      if (
        !identity ||
        typeof identity !== 'object' ||
        Array.isArray(identity) ||
        typeof identity.name !== 'string' ||
        typeof identity.version !== 'string'
      )
        throw registryFailure(
          'MALFORMED_RESPONSE',
          'Registry identity must contain name and version',
        );
      if (identity.name !== packageName || identity.version !== version)
        throw registryFailure(
          'IDENTITY_MISMATCH',
          'Registry package identity/version mismatch',
        );
      const tags = await query('tags');
      if (
        !tags ||
        typeof tags !== 'object' ||
        Array.isArray(tags) ||
        Object.values(tags).some(
          (tag) => typeof tag !== 'string' || !semver.test(tag),
        )
      )
        throw registryFailure(
          'MALFORMED_RESPONSE',
          'Registry dist-tags must map names to valid versions',
        );
      if (tags[distTag] !== version)
        throw registryFailure(
          'DIST_TAG_PENDING',
          `${distTag} does not point to ${version}`,
          true,
        );
      verifyRegistry(version, distTag, identity.version, tags);
      if (remaining() <= 0) throw exhausted();
      diagnostic('CONVERGED', 'success');
      return tags;
    } catch (error) {
      if (error.classification === 'DEADLINE_EXHAUSTED') throw error;
      lastClassification = error.classification ?? 'PERMANENT_ERROR';
      if (!error.retryable) {
        diagnostic(lastClassification, 'fail');
        throw error;
      }
      if (remaining() <= 0) throw exhausted();
      const waitMs = Math.min(retryDelayMs, remaining());
      diagnostic(lastClassification, `retry-in-${Math.floor(waitMs)}ms`);
      await sleep(waitMs);
      retryDelayMs = Math.min(30_000, retryDelayMs * 2);
    }
  }
  throw exhausted();
}

function smoke(spec, version, offline = false) {
  const consumer = mkdtempSync(join(tmpdir(), 'pjs-release-consumer-'));
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'pjs-release-consumer',
      private: true,
      type: 'module',
    }),
  );
  npm(
    [
      'install',
      spec,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      ...(offline ? ['--offline'] : []),
    ],
    {
      cwd: consumer,
      env: { ...process.env, npm_config_cache: join(consumer, 'cache') },
    },
  );
  validateManifest(
    JSON.parse(
      readFileSync(join(consumer, 'node_modules', packageName, 'package.json')),
    ),
    version,
  );
  for (const file of ['smoke.mjs', 'tasks.mjs'])
    cpSync(join(root, 'scripts/package-consumer', file), join(consumer, file));
  summary(
    command(
      process.execPath,
      ['--enable-source-maps', join(consumer, 'smoke.mjs')],
      {
        cwd: tmpdir(),
        timeout: 30000,
      },
    ).trim(),
  );
  summary(
    `External consumer passed for ${spec}; temporary project: ${consumer}`,
  );
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  assertSupportedReleaseNpmVersion(npm(['--version']).trim());
  switch (mode) {
    case 'gate': {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
      assert.equal(event.action, 'published');
      const manifest = JSON.parse(
        readFileSync(join(root, 'packages/runtime/package.json')),
      );
      validateManifest(manifest, manifest.version);
      assert.equal(
        manifest.version,
        baseline.manifest.version,
        'Review a matching release baseline before publication',
      );
      const { version, distTag } = releasePolicy(
        manifest.version,
        event.release,
      );
      output('version', version);
      output('dist-tag', distTag);
      summary(
        `Release ${event.release.tag_name}: version ${version}, npm dist-tag ${distTag}.`,
      );
      break;
    }
    case 'registry-check': {
      const [version] = args;
      assert.ok(semver.test(version));
      const result = spawnSync(
        'npm',
        [
          'view',
          `${packageName}@${version}`,
          'version',
          '--json',
          '--registry',
          registry,
        ],
        { encoding: 'utf8', timeout: 30000 },
      );
      const exists = registryPresence(result, version);
      output('exists', exists);
      summary(
        exists
          ? `${packageName}@${version} already exists on npm. Publication skipped; no version or dist-tag mutation. Registry verification and consumer smoke will still run.`
          : `${packageName}@${version} is absent from npm; qualification may proceed.`,
      );
      break;
    }
    case 'tarball': {
      const [packJson, directory, version, distTag] = args;
      assert.equal(distTag, semver.exec(version)?.[4] ? 'next' : 'latest');
      const reports = JSON.parse(readFileSync(packJson));
      assert.equal(reports.length, 1);
      const packed = reports[0];
      assert.equal(packed.name, packageName);
      assert.equal(packed.version, version);
      assert.equal(basename(packed.filename), packed.filename);
      assert.ok(packed.filename.endsWith('.tgz'));
      const tarball = resolve(directory, packed.filename);
      const listing = command('tar', ['-tzf', tarball]);
      const transport = {
        platform: process.platform,
        stdout: listing,
        crlf: (listing.match(/\r\n/g) ?? []).length,
        lf: (listing.match(/(?<!\r)\n/g) ?? []).length,
        bareCr: (listing.match(/\r(?!\n)/g) ?? []).length,
      };
      summary(
        'Tar listing transport: ' +
          JSON.stringify({ ...transport, stdout: listing.slice(0, 600) }),
      );
      if (process.env.PJS_TAR_LISTING_REPORT)
        writeFileSync(
          process.env.PJS_TAR_LISTING_REPORT,
          JSON.stringify(transport, null, 2) + '\n',
          { flag: 'wx' },
        );
      const files = parseTarListing(listing);
      validateTarListing(files, packed.entryCount);
      const manifest = JSON.parse(
        command('tar', ['-xOf', tarball, 'package/package.json']),
      );
      validateManifest(manifest, version);
      assertFrozenPackage(
        manifest,
        Object.fromEntries(
          files.map((file) => [
            file.slice('package/'.length),
            createHash('sha256')
              .update(
                command('tar', ['-xOf', tarball, file], { encoding: null }),
              )
              .digest('hex'),
          ]),
        ),
      );
      // Inspect and install the artifact that the workflow will publish; never repack it.
      const dry = parsePublishDryRunReport(
        npm([
          'publish',
          tarball,
          '--dry-run',
          '--ignore-scripts',
          '--access',
          'public',
          '--tag',
          distTag,
          '--json',
        ]),
      );
      validatePublishDryRunReport(dry, version, files.length);
      smoke(tarball, version, true);
      const sha256 = createHash('sha256')
        .update(readFileSync(tarball))
        .digest('hex');
      output('tarball', tarball);
      output('sha256', sha256);
      summary(
        `Validated exact tarball: ${packed.filename}; files: ${files.length}; SHA-256: ${sha256}`,
      );
      break;
    }
    case 'verify': {
      const [version, distTag] = args;
      const tags = await convergeRegistry(version, distTag);
      summary(JSON.stringify(tags));
      summary(
        `Registry verified: ${packageName}@${version}; ${distTag} → ${version}.`,
      );
      break;
    }
    case 'registry-smoke': {
      const [version, distTag] = args;
      assert.ok(['next', 'latest'].includes(distTag));
      smoke(`${packageName}@${distTag}`, version);
      break;
    }
    default:
      throw new Error(`Unknown release check: ${mode}`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
