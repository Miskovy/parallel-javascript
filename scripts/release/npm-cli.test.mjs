import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertSupportedReleaseNpmVersion,
  releaseToolchain,
} from './toolchain.mjs';
import {
  packageName,
  parsePublishDryRunReport,
  validatePublishDryRunReport,
} from './npm-release.mjs';

test(
  'publication step selects the verified CLI for bare npm and nested npm scripts',
  { timeout: 180000 },
  (t) => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const workflow = readFileSync(
      join(root, '.github/workflows/publish-npm.yml'),
      'utf8',
    );
    const step = workflow.match(
      / {6}- name: Provision and select the reviewed publication npm\n {8}run: \|\n((?: {10}.+\n)+)/,
    );
    assert.ok(step, 'Publication must provision and select its CLI');
    assert.ok(
      step.index <
        workflow.indexOf('      - name: Require the exact reviewed Node'),
      'Provision and select before checking the publication toolchain',
    );
    const directory = mkdtempSync(join(tmpdir(), 'PJS publisher with spaces '));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    // Use the production shell on Unix and Git's bundled bash on Windows.
    const bash =
      process.platform === 'win32'
        ? resolve(
            execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(),
            '../../../bin/bash.exe',
          )
        : 'bash';
    const shellPath = (path) => path.replaceAll('\\', '/');
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (
        /token|auth|^npm_config_|^npm_execpath$|^PJS_NPM_CLI$|^path$/i.test(key)
      )
        delete env[key];
    Object.assign(env, {
      // Normalize Windows' Path key before applying the Actions PATH handoff.
      PATH: dirname(process.execPath) + delimiter + process.env.PATH,
      RUNNER_TEMP: shellPath(directory),
      GITHUB_PATH: shellPath(join(directory, 'github-path')),
      GITHUB_ENV: shellPath(join(directory, 'github-env')),
      GITHUB_OUTPUT: shellPath(join(directory, 'github-output')),
      npm_config_cache: join(directory, 'cache'),
    });
    const shell = (script, cwd, childEnv) => {
      const result = spawnSync(
        bash,
        ['--noprofile', '--norc', '-e', '-c', script],
        {
          cwd,
          env: childEnv,
          encoding: 'utf8',
          timeout: 150000,
          maxBuffer: 4 * 1024 ** 2,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout.trim();
    };
    shell(step[1].replaceAll(/^ {10}/gm, ''), root, env);
    // Apply the same file-command handoff that Actions uses for subsequent steps.
    for (const line of readFileSync(env.GITHUB_ENV, 'utf8')
      .trim()
      .split('\n')) {
      const equals = line.indexOf('=');
      assert.ok(equals > 0);
      env[line.slice(0, equals)] = line.slice(equals + 1);
    }
    env.PATH =
      readFileSync(env.GITHUB_PATH, 'utf8').trim() + delimiter + env.PATH;
    const cli = join(
      directory,
      'pjs-release-cli/node_modules/npm/bin/npm-cli.js',
    );
    const provision = JSON.parse(
      readFileSync(join(directory, 'pjs-release-cli/provision.json')),
    );
    assert.equal(provision.integrity, releaseToolchain.npmIntegrity);
    assert.equal(provision.cli, cli);
    assert.equal(realpathSync(env.PJS_NPM_CLI), realpathSync(cli));
    assertSupportedReleaseNpmVersion(shell('npm --version', directory, env));
    assert.equal(
      realpathSync(
        shell(
          process.platform === 'win32'
            ? 'cygpath -w "$(command -v npm)"'
            : 'command -v npm',
          directory,
          env,
        ),
      ),
      realpathSync(join(directory, 'pjs-release-cli/node_modules/.bin/npm')),
    );
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        private: true,
        scripts: { probe: 'node probe.mjs', nested: 'npm run --silent probe' },
      }),
    );
    writeFileSync(
      join(directory, 'probe.mjs'),
      `import { execSync } from 'node:child_process';
console.log(JSON.stringify({
  cli: process.env.npm_execpath,
  helperCli: process.env.PJS_NPM_CLI,
  node: process.execPath,
  bareVersion: execSync('npm --version', { encoding: 'utf8' }).trim(),
}));\n`,
    );
    for (const command of [
      'npm run --silent probe',
      'npm run --silent nested',
    ]) {
      const actual = JSON.parse(shell(command, directory, env));
      assert.equal(realpathSync(actual.cli), realpathSync(cli));
      assert.equal(realpathSync(actual.helperCli), realpathSync(cli));
      assert.equal(realpathSync(actual.node), realpathSync(process.execPath));
      assertSupportedReleaseNpmVersion(actual.bareVersion);
      t.diagnostic(JSON.stringify({ command, ...actual }));
    }
    if (process.versions.node === releaseToolchain.node) {
      const checked = JSON.parse(
        shell('node scripts/release/toolchain.mjs check', root, env),
      );
      assert.deepEqual(checked, {
        node: releaseToolchain.node,
        npm: releaseToolchain.npm,
        supported: true,
      });
    }
  },
);

test(
  'selected real npm CLI dry-run satisfies the production parser without credentials or scripts',
  { timeout: 90000 },
  (t) => {
    const cli = process.env.PJS_NPM_CLI ?? process.env.npm_execpath;
    assert.ok(
      cli && isAbsolute(cli),
      'Select the qualification npm CLI: npm run test:release or PJS_NPM_CLI=absolute/path',
    );
    const directory = mkdtempSync(
      join(tmpdir(), 'PJS npm contract with spaces '),
    );
    const evidence = { node: process.version, npmCli: cli, commands: [] };
    const env = { ...process.env };
    // The fixture has no project config. Ignore caller registry/auth/provenance config.
    for (const key of Object.keys(env))
      if (/token|auth|^npm_config_/i.test(key)) delete env[key];
    for (const file of ['user.npmrc', 'global.npmrc'])
      writeFileSync(join(directory, file), '');
    env.npm_config_userconfig = join(directory, 'user.npmrc');
    env.npm_config_globalconfig = join(directory, 'global.npmrc');
    env.npm_config_cache = join(directory, 'cache');
    const npm = (args) => {
      const result = spawnSync(
        process.execPath,
        [cli, ...args, '--registry=https://registry.npmjs.org/'],
        {
          cwd: directory,
          env,
          encoding: 'utf8',
          timeout: 25000,
          maxBuffer: 2 * 1024 ** 2,
        },
      );
      evidence.commands.push({
        args,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
        error: result.error?.message,
      });
      assert.ifError(result.error);
      assert.equal(
        result.status,
        0,
        `Node ${process.version}, npm ${evidence.npm ?? cli}: ${result.stdout}${result.stderr}`,
      );
      return result.stdout;
    };
    try {
      evidence.npm = npm(['--version']).trim();
      assertSupportedReleaseNpmVersion(evidence.npm);
      evidence.supported = true;
      const version = '0.0.0-contract-test';
      const forbiddenScript = 'node -e "process.exit(97)"';
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
          name: packageName,
          version,
          type: 'module',
          files: ['index.js'],
          scripts: Object.fromEntries(
            [
              'prepack',
              'prepare',
              'postpack',
              'prepublishOnly',
              'publish',
              'postpublish',
            ].map((name) => [name, forbiddenScript]),
          ),
        }),
      );
      writeFileSync(
        join(directory, 'index.js'),
        'export const contract = true;\n',
      );
      const packedReports = JSON.parse(
        npm(['pack', '--ignore-scripts', '--json']),
      );
      assert.ok(Array.isArray(packedReports));
      assert.equal(packedReports.length, 1);
      const packed = packedReports[0];
      const tarball = join(directory, packed.filename);
      assert.ok(existsSync(tarball));
      const hash = () =>
        createHash('sha256').update(readFileSync(tarball)).digest('hex');
      const before = hash();
      const stdout = npm([
        'publish',
        tarball,
        '--dry-run',
        '--ignore-scripts',
        '--access',
        'public',
        '--tag',
        'next',
        '--json',
      ]);
      const report = parsePublishDryRunReport(stdout);
      validatePublishDryRunReport(report, version, packed.entryCount);
      assert.equal(hash(), before, 'npm dry-run changed the validated tarball');
      evidence.shape = Object.hasOwn(JSON.parse(stdout), 'name')
        ? 'direct record'
        : 'singleton package-name map';
      evidence.report = report;
      evidence.liveContractExecuted = true;
    } finally {
      t.diagnostic(JSON.stringify(evidence));
      if (process.env.PJS_NPM_CONTRACT_REPORT)
        writeFileSync(
          process.env.PJS_NPM_CONTRACT_REPORT,
          JSON.stringify(evidence, null, 2) + '\n',
          { flag: 'wx' },
        );
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
