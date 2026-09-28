import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { median } from '../harness.mjs';

function run(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [new URL('./profile-child.mjs', import.meta.url).pathname, mode],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`profile child exited ${code}`));
      resolve(JSON.parse(output));
    });
  });
}

const sessions = [];
for (const mode of ['off', 'on', 'on', 'off']) sessions.push(await run(mode));

const host = {};
function measureHost(name, count, fn) {
  for (let index = 0; index < 3; index++) fn(Math.min(count, 10_000));
  const samples = [];
  for (let sample = 0; sample < 7; sample++) {
    const started = performance.now();
    fn(count);
    samples.push(performance.now() - started);
  }
  host[name] = { count, samples, medianMs: median(samples) };
}
const iterations = 500_000;
measureHost('loop', iterations, (count) => {
  let sink = 0;
  for (let index = 0; index < count; index++) sink += index;
  globalThis.__pjsSink = sink;
});
measureHost('descriptorPlain', iterations, (count) => {
  let value;
  for (let index = 0; index < count; index++)
    value = { index, start: index * 2, end: index * 2 + 2 };
  globalThis.__pjsSink = value;
});
measureHost('descriptorFrozen', iterations, (count) => {
  let value;
  for (let index = 0; index < count; index++)
    value = Object.freeze({ index, start: index * 2, end: index * 2 + 2 });
  globalThis.__pjsSink = value;
});
measureHost('numericTriple', iterations, (count) => {
  let a = 0;
  let b = 0;
  let c = 0;
  for (let index = 0; index < count; index++) {
    a = index;
    b = index * 2;
    c = b + 2;
  }
  globalThis.__pjsSink = a + b + c;
});
measureHost('uuid', 100_000, (count) => {
  let value;
  for (let index = 0; index < count; index++) value = randomUUID();
  globalThis.__pjsSink = value;
});
measureHost('mapInsertDelete', iterations, (count) => {
  const map = new Map();
  for (let index = 0; index < count; index++) {
    map.set(index, index);
    map.delete(index);
  }
  globalThis.__pjsSink = map;
});
measureHost('promiseConstruction', 100_000, (count) => {
  let value;
  for (let index = 0; index < count; index++)
    value = new Promise((resolve) => resolve(index));
  globalThis.__pjsSink = value;
});
measureHost('abortListenerLifecycle', 100_000, (count) => {
  const signal = new AbortController().signal;
  const listener = () => {};
  for (let index = 0; index < count; index++) {
    signal.addEventListener('abort', listener, { once: true });
    signal.removeEventListener('abort', listener);
  }
});

const report = {
  version: '0.5.0',
  timestamp: new Date().toISOString(),
  node: process.version,
  methodology: {
    sessionOrder: ['off', 'on', 'on', 'off'],
    runtimeSamplesPerSession: 8,
    runtimeWarmInterpretation: 'report uses final two samples per session',
    hostSamples: 7,
    warning: 'Stage durations overlap and must not be summed into wall time.',
  },
  sessions,
  summary: sessions.map((session) => ({
    enabled: session.enabled,
    finalTwoMedianMs: median(session.samples.slice(-2)),
  })),
  host,
};
await writeFile(
  new URL('../results/dispatch-profile-v0.5.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(report.summary);
