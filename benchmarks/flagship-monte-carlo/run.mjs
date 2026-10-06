import assert from 'node:assert/strict';
import { readFile, mkdir, open, cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { machineReport } from '../environment.mjs';
import { prepare, consumer, repository, command } from './prepare-consumer.mjs';
import { config } from './config.mjs';
import { cells } from './src/campaign.mjs';
import { shuffled } from './src/scheduling.mjs';
import { summarize } from './src/stats.mjs';
import { validateTrial } from './src/schema.mjs';
import { analyze } from './analyze.mjs';

async function environment(profile) {
  const optional = async (path) => {
    try {
      return (await readFile(path, 'utf8')).trim();
    } catch {
      return null;
    }
  };
  return {
    ...machineReport({ profile }),
    timestamp: new Date().toISOString(),
    branch: await command(
      'git',
      ['branch', '--show-current'],
      repository,
      5000,
    ),
    npm: await command(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['--version'],
      repository,
      5000,
    ),
    osRelease: await optional('/etc/os-release'),
    governor: await optional(
      '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
    ),
    meminfo: await optional('/proc/meminfo'),
    loadavg: await optional('/proc/loadavg'),
    acPower: await optional('/sys/class/power_supply/AC/online'),
    backgroundApplications:
      'uncontrolled; no applications closed or system settings changed',
  };
}

export async function run(profile, prepared = false) {
  if (profile === 'calibrate')
    assert.equal(
      config.sizes,
      null,
      'Config is already frozen; calibration is an initial-registration operation',
    );
  if (!['smoke', 'full', 'calibrate', 'test'].includes(profile))
    throw new Error(`Invalid profile ${profile}`);
  let metadata;
  if (prepared) {
    for (const name of ['src', 'config.mjs'])
      await cp(new URL(name, import.meta.url), `${consumer}/${name}`, {
        recursive: true,
      });
    metadata = JSON.parse(
      await readFile(`${consumer}/provenance.json`, 'utf8'),
    );
  } else metadata = await prepare();
  const proof = JSON.parse(
    await command(
      process.execPath,
      ['src/trial.mjs', JSON.stringify({ provenanceOnly: true })],
      consumer,
    ),
  );
  console.log(`Verified public packages: ${JSON.stringify(proof)}`);
  const checks = JSON.parse(
    await command(
      process.execPath,
      ['src/correctness.mjs', '--correctness'],
      consumer,
      config.timeoutMs,
    ),
  );
  console.log(
    `Correctness: ${checks.length} contender/transport checks passed`,
  );
  if (profile === 'test') return checks;
  const env = await environment(profile);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const id = `${date}-${env.platform}-${env.architecture}-node${process.versions.node}-${profile}-${Date.now()}`;
  const directory = `${repository}/benchmarks/results/flagship-monte-carlo`;
  await mkdir(directory, { recursive: true });
  const output = `${directory}/${id}.jsonl`;
  const file = await open(output, 'wx');
  const append = async (value) => {
    await file.write(JSON.stringify(value) + '\n');
    await file.sync();
  };
  await append({
    type: 'campaign',
    campaign: config.campaign,
    id,
    profile,
    config,
    environment: env,
    provenance: metadata,
    correctness: checks,
  });
  try {
    if (profile === 'calibrate') {
      const measurements = [];
      for (const simulations of config.candidates) {
        const options = {
          ...config,
          stage: 'calibration',
          contender: 'serial',
          transport: 'clone',
          mode: 'aggregate',
          problemSize: 'candidate',
          simulations,
          workers: 1,
          chunks: 8,
        };
        const samples = [];
        for (let trial = 1; trial <= 3; trial++) {
          const row = {
            type: 'trial',
            timestamp: new Date().toISOString(),
            ...options,
            trial,
            environment: env,
            packages: metadata.packages,
          };
          try {
            Object.assign(
              row,
              JSON.parse(
                await command(
                  process.execPath,
                  ['src/trial.mjs', JSON.stringify(options)],
                  consumer,
                  config.timeoutMs,
                ),
              ),
              { status: 'ok' },
            );
            validateTrial(row);
          } catch (error) {
            row.status = 'failure';
            row.error = error.stack;
          }
          await append(row);
          if (row.status === 'failure') throw new Error(row.error);
          samples.push(row.wallMs);
        }
        measurements.push({ simulations, ...summarize(samples) });
        console.log(
          `Serial calibration N=${simulations}: ${measurements.at(-1).median.toFixed(2)} ms`,
        );
        if (measurements.at(-1).median >= 10000) break;
      }
      const sizes = Object.fromEntries(
        [
          ['small', 100],
          ['medium', 1000],
          ['large', 5000],
        ].map(([name, target]) => [
          name,
          [...measurements].sort(
            (a, b) =>
              Math.abs(Math.log(a.median / target)) -
              Math.abs(Math.log(b.median / target)),
          )[0].simulations,
        ]),
      );
      assert.equal(
        new Set(Object.values(sizes)).size,
        3,
        'Calibration did not distinguish three sizes',
      );
      await append({ type: 'calibration', sizes, measurements });
      const path = fileURLToPath(new URL('./config.mjs', import.meta.url));
      const source = await readFile(path, 'utf8');
      assert.ok(
        source.includes('sizes: null'),
        'Config is already frozen; do not silently recalibrate',
      );
      await writeFile(
        path,
        source.replace('sizes: null', `sizes: ${JSON.stringify(sizes)}`),
      );
      console.log(
        `Frozen sizes ${JSON.stringify(sizes)}; commit config before full.`,
      );
    } else {
      if (profile === 'full')
        assert.equal(
          env.worktreeDirty,
          false,
          'Full requires clean committed harness/config',
        );
      const matrix = cells(profile);
      const stages = [...new Set(matrix.map((c) => c.stage))];
      let order = 0,
        failures = 0;
      for (const stage of stages)
        for (
          let trial = 1;
          trial <= (profile === 'smoke' ? 1 : config.trials);
          trial++
        ) {
          for (const cell of shuffled(
            matrix.filter((c) => c.stage === stage),
            config.scheduleSeed + trial,
          )) {
            const options = {
              ...config,
              ...cell,
              warmups: profile === 'smoke' ? 1 : config.warmups,
            };
            const row = {
              type: 'trial',
              timestamp: new Date().toISOString(),
              ...options,
              trial,
              order: order++,
              environment: env,
              packages: metadata.packages,
            };
            try {
              Object.assign(
                row,
                JSON.parse(
                  await command(
                    process.execPath,
                    ['src/trial.mjs', JSON.stringify(options)],
                    consumer,
                    config.timeoutMs,
                  ),
                ),
                { status: 'ok' },
              );
              validateTrial(row);
            } catch (error) {
              failures++;
              row.status = 'failure';
              row.error = error.stack;
            }
            await append(row);
            console.log(
              `${stage} ${order}/${matrix.length * (profile === 'smoke' ? 1 : config.trials)} ${cell.contender} ${cell.problemSize} p=${cell.workers} chunks=${cell.chunks} ${cell.transport} #${trial}: ${row.status === 'ok' ? row.wallMs.toFixed(2) + 'ms' : 'FAILURE'}`,
            );
          }
        }
      await append({ type: 'completion', trials: order, failures });
      if (failures) process.exitCode = 1;
    }
  } finally {
    await file.close();
    console.log(`Raw evidence: ${output}`);
  }
  if (profile !== 'calibrate') await analyze(output);
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await run(process.argv[2] ?? 'smoke', process.argv.includes('--prepared'));
