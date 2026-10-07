import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { test } from 'node:test';
import {
  packageName,
  parsePublishDryRunReport,
  validatePublishDryRunReport,
} from './npm-release.mjs';

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
