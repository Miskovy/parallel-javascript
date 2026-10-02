import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compressionBound, fedoraBuild, qualifyCodec } from './codec.mjs';

export const diagnosticSizes = Object.freeze([
  0, 1, 2, 3, 7, 8, 9, 15, 16, 17, 63, 64, 65, 127, 128, 255, 256, 1023, 1024,
  1025, 4095, 4096, 4097, 16383, 16384, 16385, 65535, 65536, 65537, 262143,
  262144, 262145, 1048575, 1048576, 1048577, 4194304, 8388608,
]);
const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const command = (file, args) =>
  execFileSync(file, args, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 2 * 1024 ** 2,
  }).trim();

function packageFile(path, name) {
  const real = realpathSync(path);
  const packageIdentity = command('rpm', [
    '-qf',
    '--qf',
    '%{NAME} %{VERSION} %{RELEASE} %{ARCH}\n',
    real,
  ]);
  assert.equal(
    packageIdentity,
    `${name} 2.3.3 3.fc44 x86_64`,
    'unqualified codec RPM',
  );
  const entry = command('rpm', ['-q', '--dump', name])
    .split('\n')
    .find((line) => line.split(' ')[0] === real);
  assert.ok(entry, 'RPM file digest unavailable');
  const digest = sha256(real);
  assert.equal(
    digest,
    entry.split(' ')[3],
    'installed codec/header differs from RPM',
  );
  return { path: real, packageIdentity, sha256: digest };
}

// This runs once per host campaign, before any credit admission or timing.
export function probeInstalledCodec() {
  assert.equal(process.platform, 'linux', 'zlib-ng platform not qualified');
  assert.equal(process.arch, 'x64', 'zlib-ng architecture not qualified');
  assert.equal(
    process.config.variables.node_shared_zlib,
    true,
    'bundled codec not qualified',
  );
  assert.ok(!process.env.LD_PRELOAD, 'preloaded codec not qualified');
  const objects = process.report.getReport().sharedObjects;
  const libraries = [
    ...new Set(
      objects.filter((p) => /\/libz\.so\./.test(p)).map((p) => realpathSync(p)),
    ),
  ];
  assert.equal(libraries.length, 1, 'ambiguous Node codec linkage');
  const library = packageFile(libraries[0], 'zlib-ng-compat');
  const header = packageFile('/usr/include/zlib.h', 'zlib-ng-compat-devel');
  const nodeLibrary = objects.find((p) => /\/libnode\.so\./.test(p));
  assert.ok(nodeLibrary, 'shared Node library missing');
  const symbols = command('nm', ['-D', nodeLibrary]);
  for (const name of ['deflate', 'deflateInit2_', 'zlibVersion'])
    assert.match(
      symbols,
      new RegExp(`\\bU ${name}\\r?$`, 'm'),
      'Node codec symbol is not imported',
    );
  const codec = qualifyCodec({
    version: process.versions.zlib,
    implementationVersion: '2.3.3',
    build: fedoraBuild,
  });
  const directory = mkdtempSync(join(tmpdir(), 'pjs-codec-qualification-'));
  try {
    const source = fileURLToPath(new URL('./native-bound.c', import.meta.url));
    const binary = join(directory, 'native-bound');
    const compileArgs = [
      '-std=c11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      source,
      '-o',
      binary,
      '-ldl',
    ];
    command('gcc', compileArgs);
    const args = [library.path, ...diagnosticSizes.map(String)];
    const native = JSON.parse(command(binary, args));
    assert.equal(
      realpathSync(native.libraryPath),
      library.path,
      'helper/Node library mismatch',
    );
    assert.equal(native.libraryVersion, process.versions.zlib);
    assert.equal(native.headerVersion, process.versions.zlib);
    for (const row of native.rows) {
      const raw = compressionBound({ codec, inputBytes: row.inputBytes });
      const wrapperBytes =
        row.windowBits === -15 ? 0 : row.windowBits === 15 ? 6 : 18;
      assert.equal(
        row.nativeBound,
        raw + wrapperBytes,
        'native bound/build profile mismatch',
      );
    }
    return {
      codec,
      library,
      header,
      nodeLibrary: realpathSync(nodeLibrary),
      nodeSharedZlib: true,
      nodeSymbolsImported: true,
      compiler: command('gcc', ['--version']),
      compileCommand: ['gcc', ...compileArgs],
      helperCommand: [binary, ...args],
      helperSourceSha256: sha256(source),
      helperLinkage: command('ldd', [binary]),
      native,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
