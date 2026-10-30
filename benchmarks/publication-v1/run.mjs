import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { config, cases, balancedOrder } from './config.mjs';
import { machine } from './environment.mjs';
import { prepare as install, npmCli, here, root } from './prepare.mjs';
import {
  command,
  checked,
  observation,
  writeJson,
  json,
  files,
  sha256,
  manifest,
} from './lib.mjs';
import { prepare, execute, collect } from './src/kernels.mjs';

const options = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--(output|profile|npm-cli|host-note)=(.+)$/.exec(arg);
  assert.ok(
    match && !Object.hasOwn(options, match[1]),
    `Unknown/duplicate argument: ${arg}`,
  );
  options[match[1]] = match[2];
}
assert.ok(options.output, 'Required: --output=NEW_DIRECTORY');
const profile = options.profile ?? 'smoke';
assert.ok(['smoke', 'publication'].includes(profile));
assert.equal(
  process.versions.node,
  config.node,
  `Select exactly Node ${config.node}`,
);
if (profile === 'publication')
  assert.ok(
    options['host-note'],
    'Record observed power, thermals and quiet/background conditions with --host-note=...',
  );
const output = resolve(options.output);
mkdirSync(resolve(output, '..'), { recursive: true });
mkdirSync(output); // Exclusive creation: never overwrite evidence.
const report = {
  schema: 1,
  profile,
  status: 'setup',
  started: new Date().toISOString(),
  hostNote:
    options['host-note'] ??
    'Managed session; background load and power conditions not verified',
  command: [process.execPath, ...process.argv.slice(1)],
  executions: [],
};
let frozen;
try {
  const git = (...args) =>
    checked(
      observation('git', ['-c', `safe.directory=${root}`, ...args], root),
    );
  const source = {
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    status: git('status', '--porcelain=v1'),
    origin: git('remote', 'get-url', 'origin'),
  };
  if (profile === 'publication')
    assert.equal(
      source.status,
      '',
      'Commit frozen source/spec/lock before publication campaign',
    );
  const environment = machine();
  const matrix = cases(environment.usableCapacity, profile);
  const trials = profile === 'publication' ? config.trials : 1;
  const jobs = [];
  for (let trial = 0; trial < trials; trial++) {
    const caseOrder = balancedOrder(matrix.cases, trial, config.orderSeed);
    for (const spec of caseOrder) {
      const order = balancedOrder(
        config.contenders,
        trial,
        config.orderSeed ^ matrix.cases.findIndex((c) => c.id === spec.id),
      );
      for (const contender of order)
        jobs.push({
          id: `${String(jobs.length).padStart(4, '0')}-${spec.id}-${contender}-t${trial}`,
          trial,
          contender,
          spec,
          profile,
        });
    }
  }
  const sourceFiles = files(here)
    .filter(
      (p) =>
        !p.includes('evidence') &&
        !p.includes('node_modules') &&
        !p.includes('__pycache__'),
    )
    .map((path) => ({
      path: relative(root, path).replaceAll('\\', '/'),
      sha256: sha256(path),
    }));
  // Freeze complete specifications, order, code digests and analysis policy
  // before installation, serial references or ANY competitor execution.
  frozen = {
    schema: 1,
    campaign: config.campaign,
    created: new Date().toISOString(),
    profile,
    config,
    source,
    sourceFiles,
    environment,
    hostNote: report.hostNote,
    matrix,
    trials,
    jobs,
    analysis: {
      bootstrapResamples: 2000,
      interval: 'percentile 95% median bootstrap, descriptive',
      practicalDifference:
        'more than 5% median advantage AND non-overlapping wall-time intervals',
      outlierRemoval: false,
      selectiveReruns: false,
    },
  };
  writeJson(join(output, 'freeze.json'), frozen);
  const packages = await install(output, npmCli(options['npm-cli']));
  writeJson(join(output, 'packages.json'), packages);
  mkdirSync(join(output, 'oracles'));
  const references = {};
  for (const spec of matrix.cases) {
    const started = performance.now();
    const value = collect(spec, prepare(spec).map(execute));
    const path = join(
      output,
      'oracles',
      spec.id + (spec.family === 'image' ? '.bin' : '.json'),
    );
    writeFileSync(
      path,
      spec.family === 'image' ? value : JSON.stringify(value) + '\n',
      { flag: 'wx' },
    );
    references[spec.id] = {
      path,
      sha256: sha256(path),
      preparationAndComputeMs: performance.now() - started,
    };
  }
  writeJson(join(output, 'references.json'), references);
  mkdirSync(join(output, 'children'));
  report.status = 'running';
  for (const job of jobs) {
    const oracle = references[job.spec.id];
    const childJob = {
      ...job,
      referencePath: oracle.path,
      referenceSha256: oracle.sha256,
    };
    const input = join(output, 'children', job.id + '.config.json');
    const result = join(output, 'children', job.id + '.result.json');
    writeJson(input, childJob);
    const receipt = await command(
      process.execPath,
      [join(packages.consumer, 'src/child.mjs'), input, result],
      packages.consumer,
      config.timeoutMs,
    );
    writeJson(join(output, 'children', job.id + '.process.json'), receipt);
    let child;
    try {
      child = json(result);
    } catch {
      child = {
        status: 'failed',
        error: { message: 'No complete child result' },
      };
    }
    if (
      receipt.exitCode !== 0 ||
      receipt.timedOut ||
      receipt.error ||
      child.cleanup !== 'awaited'
    )
      child.status = 'failed';
    const entry = {
      id: job.id,
      job: childJob,
      process: receipt,
      result: child,
    };
    appendFileSync(join(output, 'raw.jsonl'), JSON.stringify(entry) + '\n');
    report.executions.push({
      id: job.id,
      status: child.status,
      exitCode: receipt.exitCode,
      timedOut: receipt.timedOut,
    });
    console.log(
      `${report.executions.length}/${jobs.length} ${child.status} ${job.id}`,
    );
    // A failed smoke still completes the bounded smoke matrix; failures are
    // retained. Publication likewise never selectively reruns a failed cell.
  }
  report.status = report.executions.every((r) => r.status === 'passed')
    ? 'passed'
    : 'failed';
  report.environmentAfter = machine();
  assert.equal(git('rev-parse', 'HEAD'), source.commit);
  for (const file of sourceFiles)
    assert.equal(
      sha256(join(root, file.path)),
      file.sha256,
      'Source changed during campaign',
    );
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack };
} finally {
  report.finished = new Date().toISOString();
  report.planned = frozen?.jobs.length ?? 0;
  writeJson(join(output, 'run.json'), report);
  manifest(output);
}
if (report.status !== 'passed') process.exitCode = 1;
console.log(
  JSON.stringify({
    output,
    status: report.status,
    executed: report.executions.length,
  }),
);
