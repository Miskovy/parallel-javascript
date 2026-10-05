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
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

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
  switch (mode) {
    case 'gate': {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
      assert.equal(event.action, 'published');
      const manifest = JSON.parse(
        readFileSync(join(root, 'packages/runtime/package.json')),
      );
      validateManifest(manifest, manifest.version);
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
          ? `${packageName}@${version} already exists on npm. Publication skipped; no version or dist-tag mutation.`
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
      const files = command('tar', ['-tzf', tarball]).trim().split('\n');
      assert.ok(
        files.length >= 10 && files.length <= 1000,
        'Implausible file count',
      );
      assert.equal(files.length, packed.entryCount);
      assert.equal(new Set(files).size, files.length);
      assert.ok(
        files.every((file) =>
          /^package\/(?:dist\/|src\/|package.json$|README.md$|LICENSE$)/.test(
            file,
          ),
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
      validateManifest(
        JSON.parse(command('tar', ['-xOf', tarball, 'package/package.json'])),
        version,
      );
      // Inspect and install the artifact that the workflow will publish; never repack it.
      const dry = JSON.parse(
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
      assert.equal(dry.name, packageName);
      assert.equal(dry.version, version);
      assert.equal(dry.entryCount, files.length);
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
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const actual = JSON.parse(
            npm(['view', `${packageName}@${version}`, 'version', '--json'], {
              timeout: 30000,
            }),
          );
          const tags = JSON.parse(
            npm(['view', packageName, 'dist-tags', '--json'], {
              timeout: 30000,
            }),
          );
          verifyRegistry(version, distTag, actual, tags);
          summary(
            npm(['dist-tag', 'ls', packageName], { timeout: 30000 }).trim(),
          );
          summary(
            `Registry verified: ${packageName}@${version}; ${distTag} → ${version}.`,
          );
          return;
        } catch (error) {
          if (attempt === 5) throw error;
          console.log(
            `Registry visibility attempt ${attempt + 1} failed: ${error.message}`,
          );
          await delay(5000 * (attempt + 1));
        }
      }
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
