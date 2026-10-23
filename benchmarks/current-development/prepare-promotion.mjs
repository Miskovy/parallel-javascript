import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Exact reviewed marker counts; drift must trigger review, never blanket removal.
const targets = {
  'packages/runtime/src/types/index.ts': 3,
  'packages/runtime/src/configuration/runtime-options.ts': 1,
  'packages/runtime/src/errors/index.ts': 1,
  'packages/runtime/src/runtime.ts': 5,
  'packages/runtime/src/partition/range.ts': 17,
  'packages/runtime/src/partition/stream.ts': 1,
};
let patch = '';
const temporary = mkdtempSync(join(tmpdir(), 'pjs-promotion-review-'));
function changes(path, transform) {
  const before = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const formatted = spawnSync(
    process.execPath,
    ['node_modules/prettier/bin/prettier.cjs', '--stdin-filepath', path],
    { input: transform(before), encoding: 'utf8' },
  );
  assert.equal(formatted.status, 0, formatted.stderr);
  const after = formatted.stdout;
  assert.notEqual(before, after, 'No changes for ' + path);
  const oldPath = join(temporary, 'before'),
    newPath = join(temporary, 'after');
  writeFileSync(oldPath, before);
  writeFileSync(newPath, after);
  const diff = spawnSync(
    'git',
    ['diff', '--no-index', '--text', '--no-color', '--', oldPath, newPath],
    { encoding: 'utf8' },
  );
  assert.equal(diff.status, 1, diff.stderr);
  const hunk = diff.stdout.indexOf('@@');
  assert.ok(hunk > 0);
  patch += `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
  patch += diff.stdout.slice(hunk);
}
for (const [path, count] of Object.entries(targets))
  changes(path, (text) => {
    assert.equal(
      [...text.matchAll(/@experimental /g)].length,
      count,
      path + ' marker scope changed',
    );
    return text
      .replaceAll('@experimental ', '')
      .replace(
        'Experimental parent/partition context',
        'Parent/partition context',
      )
      .replace(
        'Host-coordinated numeric ranges; this API is not yet stable.',
        'Host-coordinated numeric ranges with ordered retained results.',
      );
  });
const notices = {
  'docs/stability.md':
    'P1/P2/P3 are promoted in development after reviewed benchmark acceptance; all six deprecated aliases remain. Publication, hold applicability, C4 and Stage F/G remain separate.',
  'docs/research/v1-api-contract-inventory.md':
    'Development status: P1 containment, P2 range/count/map/batch and P3 strict-result contracts are promoted after reviewed benchmark acceptance. Historical inventory rows retain their execution attribution; all six aliases remain deprecated and accepted.',
  'docs/adr/0023-v1-api-stability-decisions.md':
    'P1/P2/P3 development promotion accepted following benchmark review; this does not accept unrelated policy/release decisions in this ADR. All six aliases and separate hold/C4/F/G gates remain.',
  'docs/research/v1-api-migration-plan.md':
    'P1/P2/P3 development annotations/status are promoted following benchmark acceptance review. The approved patch preserves all six aliases; transition release, hold applicability, C4 and F/G remain separate.',
  'docs/guide/core-api.md':
    'Development P2 range/count/map/batch contracts are promoted following benchmark review; all six deprecated option aliases remain accepted through the actual shared transition window.',
  'docs/guide/lifecycle.md':
    'Development P1 containment contracts are promoted following benchmark review; caller settlement still does not release physical ownership before validated completion or confirmed exit.',
  'docs/guide/errors.md':
    'P1/P2/P3 error contracts retain their hierarchy, metadata and ownership semantics following development promotion; error text is not a protocol.',
  'docs/guide/backpressure.md':
    'Development P2/P3 contracts are promoted following benchmark review; result-byte credits bound visible payload per stream and are not a process-memory limit.',
  'docs/partitioning.md':
    'Development P2/P3 range and strict-result contracts are promoted following benchmark review. All six deprecated aliases remain accepted; C4 needs the actual transition release and separate authorization.',
  'README.md':
    'Development P1/P2/P3 contracts are promoted following benchmark review; this does not change published RC4, begin the alias window or authorize a release.',
  'packages/runtime/README.md':
    'Development P1/P2/P3 contracts are promoted following benchmark review; all six deprecated aliases remain. Published RC4 and release authorization remain separate.',
};
const replacements = {
  'docs/adr/0023-v1-api-stability-decisions.md': [
    [
      'promotion/policy decisions pending',
      'remaining policy/release decisions pending',
    ],
    [
      'No surface is promoted and no final release is authorized.',
      'P1/P2/P3 are promoted in development; no final release is authorized.',
    ],
    [
      'deprecated aliases and experimental annotations remain.',
      'deprecated aliases remain; P1/P2/P3 annotations are removed.',
    ],
    ['Promotion, the shared', 'The shared'],
  ],
  'README.md': [
    ['Experimental                  |', 'Promoted in development       |'],
    [
      'All feature experimental annotations and all six aliases remain. Promotion,',
      'P1/P2/P3 are promoted in development; all six aliases remain. The',
    ],
    ["Development's experimental exclusive", "Development's exclusive"],
  ],
  'packages/runtime/README.md': [
    [
      'Range APIs and their controls remain experimental;',
      'Range APIs and their controls are promoted in development;',
    ],
    [
      'All feature experimental annotations and all six aliases remain. Promotion,',
      'P1/P2/P3 are promoted in development; all six aliases remain. The',
    ],
  ],
  'docs/guide/core-api.md': [
    [
      'remain [experimental](../stability.md)',
      'are [promoted in development](../stability.md)',
    ],
    [
      'adds experimental `run({ executionLease })`',
      'adds `run({ executionLease })`',
    ],
    [
      'Range streaming remains experimental.',
      'Range streaming is promoted in development.',
    ],
  ],
  'docs/guide/lifecycle.md': [
    [
      '## Experimental physical execution leases (R1 development)',
      '<a id="experimental-physical-execution-leases-r1-development"></a>\n\n## Physical execution leases (development)',
    ],
    ['separate experimental physical lease', 'separate physical lease'],
    [
      'contracts or experimental status',
      'contracts; P1 status is recorded above',
    ],
  ],
  'docs/guide/errors.md': [
    ['adds experimental PjsExecutionLeaseError', 'adds PjsExecutionLeaseError'],
    [
      'Error classes, metadata and experimental\nstatus are unchanged;',
      'Error classes and metadata are unchanged; P1/P2/P3\nstatus is recorded above;',
    ],
  ],
  'docs/partitioning.md': [
    ['# Experimental numeric range operations', '# Numeric range operations'],
    ['describes experimental mechanics', 'describes development mechanics'],
    [
      'All these features remain experimental; P2 promotion requires separate approval.',
      'These P2 features are promoted in development following benchmark review.',
    ],
    [
      'and their derived admission limits remain experimental; no stable',
      'and their derived admission limits are promoted in development; no implicit',
    ],
  ],
};
for (const [path, notice] of Object.entries(notices))
  changes(path, (text) => {
    for (const [before, after] of replacements[path] ?? []) {
      assert.ok(text.includes(before), path + ': status wording drift');
      text = text.replaceAll(before, after);
    }
    if (path === 'docs/stability.md')
      text = text
        .replace(
          '**All feature experimental\nannotations and all six aliases remain.**',
          '**P1/P2/P3 contracts are promoted in development;\nall six deprecated aliases remain.**',
        )
        .split('\n')
        .map((line) =>
          line.startsWith('|')
            ? line
                .replace(
                  /Experimental(?: development additions despite unprefixed names|; C2 names and deprecated aliases)?/g,
                  'Promoted development contract',
                )
                .replaceAll('Promote C1 after', 'C1 accepted after')
                .replaceAll('Promote C2:', 'C2 contract:')
                .replaceAll(
                  'P2 promotion remains separate',
                  'P2 promotion is accepted',
                )
                .replaceAll('separate P3 promotion after', 'P3 accepted after')
            : line,
        )
        .join('\n');
    if (path === 'docs/research/v1-api-contract-inventory.md')
      text = text
        .replace(
          'No feature is promoted.**',
          'P1/P2/P3 are promoted in development.**',
        )
        .replace(
          'Current experimental annotations remain.',
          'P1/P2/P3 experimental annotations are removed in development.',
        )
        .split('\n')
        .map((line) =>
          line.startsWith('|')
            ? line
                .replace(/\b[Ee]xperimental\b/g, 'promoted')
                .replace(
                  /P([123])\/C[123] promotion pending/g,
                  'P$1 promoted in development',
                )
                .replaceAll(
                  'P1 pending explicit approval/eligibility',
                  'P1 promoted; hold applicability separate',
                )
            : line,
        )
        .join('\n');
    const lines = text.split('\n'),
      index = lines.findIndex((line, i) => i > 0 && line === '');
    assert.ok(index > 0);
    lines.splice(index + 1, 0, '**Promotion status:** ' + notice, '');
    return lines.join('\n');
  });
writeFileSync(process.argv[2], patch, { flag: 'wx' });
const check = spawnSync('git', ['apply', '--check', resolve(process.argv[2])], {
  encoding: 'utf8',
});
assert.equal(check.status, 0, check.stderr);
console.log(
  JSON.stringify({
    sourceFiles: Object.keys(targets).length,
    annotationMarkers: Object.values(targets).reduce((a, b) => a + b, 0),
    statusFiles: Object.keys(notices).length,
    applied: false,
  }),
);
