import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { checked, command, files } from './evidence.mjs';

const output = resolve(
  process.argv[2] ?? '.node-tools/benchmark-inventory.json',
);
const receipt = command(
  process.execPath,
  [
    'scripts/api-contract-inventory.mjs',
    '--check',
    '--output=' + output + '.public.json',
  ],
  process.cwd(),
);
checked(receipt);
const inventory = JSON.parse(readFileSync(output + '.public.json', 'utf8'));
const families = {
  'cpu-baseline': 'cpu; sieve oracle; serial/PJS/Piscina',
  'matrix-multiplication':
    'matrix; independent i-j-k oracle; serial/PJS/Piscina',
  transfer: 'transport clone/transfer; preparation and scan',
  'shared-memory': 'transport shared input and matrix shared B',
  partitioning: 'dispatch/skew; uneven partitions and ordered collection',
  'dispatch-efficiency': 'dispatch batches 1/4/16; fairness',
  'completion-only':
    'completion/shared-output; unserializable discarded values',
  streaming:
    'stream count/exact/upper; capacities; fast/slow; health iterator cleanup',
  mapping: 'generic-map/typed-map; ordered assembly; pipeline/fairness',
  'binary-results': 'stream exact clone/transfer; capacity and visible bytes',
  'reservation-audit':
    'stream exact; pipeline; existing result-credit/R3 contracts',
  'upper-bound-results':
    'stream upper; positive refunds; existing upper-bound/R3 contracts',
  'runtime-architecture':
    'same-harness baseline/candidate ABBA controls for every case',
  'real-world/compression':
    'compression high/moderate/poor; round-trip validation',
  'real-world/crypto':
    'SHA/AES/scrypt/Argon2/bcrypt; feature-detected native skips',
  'flagship-monte-carlo':
    'monte-carlo aggregate/distribution; frozen kernels, new package installation',
};
const benchmarkFiles = files('benchmarks').filter(
  (p) =>
    p.endsWith('.mjs') && !p.includes('node_modules') && !p.includes('results'),
);
const historical = benchmarkFiles
  .filter((p) => !p.includes('current-development'))
  .map((path) => {
    const text = readFileSync(path, 'utf8'),
      normalized = path.replaceAll('\\', '/');
    const family =
      Object.keys(families)
        .sort((a, b) => b.length - a.length)
        .find((name) => normalized.startsWith('benchmarks/' + name + '/')) ??
      'shared harness';
    const lines = text.split(/\r?\n/);
    return {
      path: normalized,
      family,
      role: /(?:run|compare|regression|fairness|pipeline|profile|report|refund|probe|analyze|prepare-consumer|lifecycle|native-diagnostic|bounds|measure|profile-child)\.mjs$/.test(
        path,
      )
        ? 'executable or report entrypoint'
        : 'kernel/helper/test',
      imports: [
        ...text.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g),
      ].map((m) => m[2]),
      writes: lines.flatMap((line, i) =>
        /writeFile|appendFile|results\/|outputName|\.json['"`]/.test(line)
          ? [{ line: i + 1, text: line.trim() }]
          : [],
      ),
      limitations: [
        'Historical definitions/artifacts preserved; never invoked by the current campaign',
        ...(/v0\.|rc\.2/.test(text)
          ? [
              'Historical version labels or package pin; not a current acceptance source',
            ]
          : []),
        ...(/_profile|profileSink|recordInternalProfile|runtimeComponents|holdMaximum|disableRefund|experimentalDisable/.test(
          text,
        )
          ? ['Private/instrumented control: diagnostic only']
          : []),
        ...(/gc\(/.test(text)
          ? [
              'Forced-GC diagnostic may be present; excluded from primary current samples',
            ]
          : []),
      ],
      replacement:
        families[family] ?? 'copied helper reused by the new consumer harness',
      command:
        'npm run benchmark:current -- --baseline=ABS_BASELINE --output=NEW_DIRECTORY --profile=performance',
      artifact:
        'report.json configuration/results plus *.config.json, *.result.json and *.process.json',
    };
  });
const methods = {
  PjsTaskRegistry: [
    'registration-construction-ready-worker-resolution',
    'registry.test.mjs',
  ],
  PjsRuntime: [
    'health.cases; all configuration families',
    'runtime.test.mjs; range/map/stream/containment contracts',
  ],
  transfer: [
    'input-transfer-and-worker-output-transfer-detachment; stream clone/transfer',
    'transfer.test.mjs; physical-boundary.test.mjs',
  ],
  sharedReadonly: [
    'sharedReadonly-five-overloads-visible-copy; transport/shared-output',
    'shared.test.mjs',
  ],
};
const publicRoots = inventory.source.roots.map((entry) => ({
  id: entry.id,
  name: entry.name,
  kind: entry.kind,
  coverage:
    entry.kind === 'type'
      ? [
          'Both locked complete public compiler fixtures and installed declarations; source/declaration parity',
          'npm run test:types; npm run typecheck:compat; npm run test:package; node node_modules/typescript/bin/tsc6 -p packages/runtime/test/tsconfig.json',
        ]
      : entry.name.endsWith('Error')
        ? [
            'diagnostics-defensive-copy-and-exported-errors; full negative contract suites',
            'npm run test:contracts; npm run test:package',
          ]
        : methods[entry.name],
  receipt:
    entry.kind === 'type'
      ? 'ordinary.json checks + ordinary.json.package.json + supplemental fixture/inventory receipts'
      : 'candidate-health.json cases + ordinary.json.contracts.json + ordinary.json.package.json',
}));
assert.ok(
  publicRoots.every((entry) => entry.coverage),
  'Unmapped executable public export',
);
const result = {
  source:
    'Current checker-derived public inventory; no throughput claims for type-only exports',
  counts: inventory.counts,
  inventoryReceipt: receipt,
  publicRoots,
  historical,
  lifecycle: {
    command:
      'npm run runtime:qualify -- --release-npm-cli=PINNED_CLI --output=NEW_ORDINARY_JSON',
    receipt:
      'ordinary.json.contracts.json; ordinary.json.r2/; ordinary.json.r3/',
    diagnosticBoundary:
      'Existing deterministic owner/fault-injection tests inspect internals only outside timed performance; no new runtime hooks',
    cases: [
      'Cancellation/logical deadlines',
      'Ordinary successful-post execution leases',
      'First shutdown identity and escalation',
      'Restart lifetime/rolling budgets and recovery',
      'Early stream exit cleanup',
      'Physical ownership until validated completion or confirmed exit',
      'All six alias presence/getter/exclusion contracts',
    ],
  },
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    output: relative(process.cwd(), output),
    counts: result.counts,
    benchmarkFiles: historical.length,
  }),
);
