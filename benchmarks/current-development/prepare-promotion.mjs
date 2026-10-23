import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

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
function changes(path, transform) {
  const before = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const after = transform(before);
  const oldLines = before.trimEnd().split('\n'),
    newLines = after.trimEnd().split('\n');
  assert.equal(
    oldLines.length,
    newLines.length,
    'Minimal patch must preserve line positions',
  );
  const indexes = oldLines.flatMap((line, i) =>
    line === newLines[i] ? [] : [i],
  );
  assert.ok(indexes.length > 0, 'No changes for ' + path);
  patch += `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
  let end = -1;
  for (const index of indexes) {
    if (index <= end) continue;
    const start = Math.max(0, index - 3);
    end = Math.min(oldLines.length - 1, index + 3);
    for (const next of indexes)
      if (next > end && next <= end + 6)
        end = Math.min(oldLines.length - 1, next + 3);
    patch += `@@ -${start + 1},${end - start + 1} +${start + 1},${end - start + 1} @@\n`;
    for (let i = start; i <= end; i++)
      patch +=
        oldLines[i] === newLines[i]
          ? ' ' + oldLines[i] + '\n'
          : '-' + oldLines[i] + '\n+' + newLines[i] + '\n';
  }
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
// Add a status line at an existing blank line, preserving the original history.
// The review patch is intentionally unapplied and cannot itself assert acceptance.
for (const [path, notice] of Object.entries(notices))
  changes(path, (text) => {
    const lines = text.split('\n'),
      index = lines.findIndex((line, i) => i > 0 && line === '');
    assert.ok(index > 0);
    lines[index] = '**Promotion status:** ' + notice;
    return lines.join('\n');
  });
writeFileSync(process.argv[2], patch, { flag: 'wx' });
console.log(
  JSON.stringify({
    sourceFiles: Object.keys(targets).length,
    annotationMarkers: Object.values(targets).reduce((a, b) => a + b, 0),
    statusFiles: Object.keys(notices).length,
    applied: false,
  }),
);
