import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { context } from '../cross-platform-v011/environment.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log(
    'node scripts/cross-platform-v012/observe.mjs --commit <source-hash> --mode reduced|full --node <existing-executable> --npm <matching-npm-cli.js> --label <machine> [--output <new-directory>] [--offline]',
  );
  process.exit(0);
}
const sourceCommit = value('commit');
assert.match(sourceCommit ?? '', /^[a-f0-9]{40}$/);
const mode = value('mode', 'reduced');
assert.ok(['reduced', 'full'].includes(mode));
const label = value('label', `${process.platform}-${process.arch}`);
assert.match(label, /^[a-z0-9][a-z0-9.-]*$/);
const node = resolve(value('node', process.execPath));
const npm = resolve(
  value('npm', join(dirname(node), 'node_modules/npm/bin/npm-cli.js')),
);
assert.ok(existsSync(node) && existsSync(npm));
const environment = JSON.parse(
  execFileSync(
    node,
    [join(here, '../cross-platform-v011/environment.mjs'), '--metadata'],
    { encoding: 'utf8' },
  ),
);
const major = environment.nodeVersion.slice(1).split('.')[0];
assert.ok(['22', '24'].includes(major));
const output = resolve(value('output', join(repository, 'benchmarks/results')));
const stem = `cross-platform-v0.12-${label}-node${major}-${mode}`;
const campaignFile = join(output, `${stem}.json`);
const metadataFile = join(output, `${stem}.metadata.json`);
assert.ok(!existsSync(campaignFile), `Refusing to overwrite ${campaignFile}`);
assert.ok(!existsSync(metadataFile), `Refusing to overwrite ${metadataFile}`);
const first = { phase: 'before', ...environment.context };
const power =
  process.platform === 'win32' ? first.powerProfile : first.powerSource;
assert.ok(
  power && power !== 'unavailable',
  'Cannot detect the actual power plan/source',
);
const runner = join(here, 'run.mjs');
const argv = [
  runner,
  '--commit',
  sourceCommit,
  '--mode',
  mode,
  '--node',
  node,
  '--npm',
  npm,
  '--label',
  label,
  '--output',
  output,
  ...(args.includes('--offline') ? ['--offline'] : []),
];
const metadata = {
  campaignFile,
  sourceCommit,
  controllerCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim(),
  mode,
  label,
  captureMethod:
    'Read-only companion observer; prepared campaign runner and reference source unchanged',
  environment,
  npmCli: npm,
  npmVersion: execFileSync(node, [npm, '--version'], {
    encoding: 'utf8',
  }).trim(),
  argv: [process.execPath, ...argv],
  powerEnvironmentValue: power,
  contextSamples: [first],
};
mkdirSync(output, { recursive: true });
const save = () =>
  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
save();
console.log(`Observed power plan/source: ${power}`);
const child = spawn(process.execPath, argv, {
  cwd: repository,
  env: { ...process.env, PJS_POWER_MODE: power },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const timer = setInterval(() => {
  metadata.contextSamples.push({ phase: 'periodic', ...context() });
  save();
}, 30000);
try {
  metadata.processResult = await new Promise((resolveResult, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveResult({ code, signal }));
  });
  process.exitCode = metadata.processResult.code ?? 1;
} catch (error) {
  metadata.processResult = { code: null, error: String(error) };
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  metadata.contextSamples.push({ phase: 'after', ...context() });
  metadata.completedAt = new Date().toISOString();
  if (existsSync(campaignFile)) {
    const bytes = readFileSync(campaignFile);
    const campaign = JSON.parse(bytes);
    metadata.lockfileSha256 = campaign.lockfileSha256;
    metadata.campaignFileSha256 = createHash('sha256')
      .update(bytes)
      .digest('hex');
  }
  save();
  console.log(`Companion metadata: ${metadataFile}`);
}
