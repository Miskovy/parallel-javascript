import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseToolchain = JSON.parse(
  readFileSync(new URL('./toolchain.json', import.meta.url)),
);

export function classifyReleaseNpmVersion(version) {
  return {
    supported: version === releaseToolchain.npm,
    expected: releaseToolchain.npm,
  };
}

export function assertSupportedReleaseNpmVersion(version) {
  assert.equal(
    classifyReleaseNpmVersion(version).supported,
    true,
    `Unsupported publisher npm ${version}; reviewed release CLI is ${releaseToolchain.npm}`,
  );
}

export function assertPublicationToolchain(node, npm) {
  assert.equal(
    node,
    releaseToolchain.node,
    `Publication requires reviewed Node ${releaseToolchain.node}`,
  );
  assertSupportedReleaseNpmVersion(npm);
}

export function verifyReleaseNpmArchive(bytes) {
  const integrity =
    'sha512-' + createHash('sha512').update(bytes).digest('base64');
  assert.equal(
    integrity,
    releaseToolchain.npmIntegrity,
    'Pinned release npm archive integrity mismatch',
  );
}

const selectedNpm = () => process.env.PJS_NPM_CLI ?? process.env.npm_execpath;
function npmVersion() {
  const cli = selectedNpm();
  return execFileSync(
    cli ? process.execPath : 'npm',
    cli ? [cli, '--version'] : ['--version'],
    { encoding: 'utf8', timeout: 30000 },
  ).trim();
}

function output(name, value) {
  assert.ok(!/[\r\n]/.test(value));
  console.log(`${name}=${value}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const [mode, directory] = process.argv.slice(2);
  if (mode === 'outputs') {
    output('node', releaseToolchain.node);
    output('npm', releaseToolchain.npm);
  } else if (mode === 'check') {
    const actualNpm = npmVersion();
    assertPublicationToolchain(process.versions.node, actualNpm);
    console.log(
      JSON.stringify({
        node: process.versions.node,
        npm: actualNpm,
        supported: true,
      }),
    );
  } else if (mode === 'provision') {
    assert.ok(directory, 'Specify a NEW release CLI directory');
    const destination = resolve(directory);
    mkdirSync(destination, { recursive: false });
    const response = await globalThis.fetch(releaseToolchain.npmTarball, {
      signal: globalThis.AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200, 'Pinned npm download failed');
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyReleaseNpmArchive(bytes);
    const tarball = join(destination, 'npm.tgz');
    writeFileSync(tarball, bytes, { flag: 'wx' });
    const installer = selectedNpm();
    assert.ok(
      installer,
      'Provision via npm run or set PJS_NPM_CLI to the installer',
    );
    execFileSync(
      process.execPath,
      [
        installer,
        'install',
        tarball,
        '--prefix',
        destination,
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 ** 2 },
    );
    const cli = join(destination, 'node_modules/npm/bin/npm-cli.js');
    const version = execFileSync(process.execPath, [cli, '--version'], {
      encoding: 'utf8',
      timeout: 30000,
    }).trim();
    assertSupportedReleaseNpmVersion(version);
    const evidence = {
      node: process.version,
      npm: version,
      integrity: releaseToolchain.npmIntegrity,
      cli,
    };
    writeFileSync(
      join(destination, 'provision.json'),
      JSON.stringify(evidence, null, 2) + '\n',
      { flag: 'wx' },
    );
    output('path', cli);
  } else throw new Error(`Unknown release toolchain command: ${mode}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
