// One command: functional tests, external-consumer smoke, optional publication
// campaign, complete analysis and Matplotlib PNG/SVG generation.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.mjs';
import { command, checked, writeJson, manifest } from './lib.mjs';
import { root, here } from './prepare.mjs';

const options = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--(output|profile|npm-cli|host-note|python)=(.+)$/.exec(arg);
  assert.ok(
    match && !Object.hasOwn(options, match[1]),
    `Unknown/duplicate argument: ${arg}`,
  );
  options[match[1]] = match[2];
}
assert.equal(process.versions.node, config.node);
assert.ok(options.output, 'Required: --output=NEW_DIRECTORY');
const output = resolve(options.output),
  profile = options.profile ?? 'smoke';
assert.ok(['smoke', 'publication'].includes(profile));
if (profile === 'publication')
  assert.ok(
    options['host-note'],
    'Record observed host conditions using --host-note=...',
  );
mkdirSync(resolve(output, '..'), { recursive: true });
mkdirSync(output);
const receipts = [];
async function step(label, exe, args, timeout = 120000) {
  console.log(`START ${label}`);
  const receipt = await command(exe, args, root, timeout);
  receipts.push({ label, ...receipt });
  writeJson(join(output, `step-${receipts.length}.json`), receipts.at(-1));
  checked(receipt);
  console.log(`PASS ${label}`);
}
let status = 'failed',
  error;
try {
  const python = options.python ?? 'python';
  await step('plot dependency versions', python, [
    '-c',
    "import sys,matplotlib,numpy; assert matplotlib.__version__=='3.10.3'; assert numpy.__version__=='2.1.3'; print(sys.executable); print(sys.version); print(matplotlib.__version__,numpy.__version__)",
  ]);
  await step('functional fixtures', process.execPath, [
    '--test',
    '--test-timeout=20000',
    join(here, 'harness.test.mjs'),
    join(here, 'analysis.test.mjs'),
  ]);
  const extra = ['npm-cli', 'host-note']
    .filter((key) => options[key])
    .map((key) => `--${key}=${options[key]}`);
  await step(
    'correctness and cleanup smoke',
    process.execPath,
    [
      join(here, 'run.mjs'),
      '--profile=smoke',
      `--output=${join(output, 'smoke')}`,
      ...extra,
    ],
    600000,
  );
  if (profile === 'publication')
    await step(
      'frozen publication measurements',
      process.execPath,
      [
        join(here, 'run.mjs'),
        '--profile=publication',
        `--output=${join(output, 'raw')}`,
        ...extra,
      ],
      14400000,
    );
  const raw = join(output, profile === 'publication' ? 'raw' : 'smoke');
  await step('complete analysis', process.execPath, [
    join(here, 'analyze.mjs'),
    raw,
    join(output, 'analysis'),
  ]);
  await step('PNG and SVG graphics', python, [
    join(here, 'plot.py'),
    join(output, 'analysis/summary.json'),
    join(output, 'graphics'),
  ]);
  status = 'passed';
} catch (e) {
  error = { message: e.message, stack: e.stack };
  process.exitCode = 1;
} finally {
  writeJson(join(output, 'campaign.json'), {
    status,
    profile,
    error,
    command: [process.execPath, ...process.argv.slice(1)],
    finished: new Date().toISOString(),
    receipts: receipts.map((r) => ({ label: r.label, exitCode: r.exitCode })),
  });
  manifest(output);
}
console.log(JSON.stringify({ output, status }));
