import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(
  new URL('../packages/runtime/test/', import.meta.url),
);
const results = [];
for (const file of readdirSync(directory)
  .filter((file) => file.endsWith('.test.mjs'))
  .sort()) {
  const child = spawnSync(process.execPath, [join(directory, file)], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  const counts = Object.fromEntries(
    [...output.matchAll(/[ℹ#] (tests|pass|fail|cancelled|skipped) (\d+)/g)].map(
      (match) => [match[1], Number(match[2])],
    ),
  );
  results.push({
    file,
    exitCode: child.status,
    error: child.error?.message,
    counts,
    output,
  });
  console.log(`${file}: ${counts.pass ?? '?'} passed, exit ${child.status}`);
}
const totals = Object.fromEntries(
  ['tests', 'pass', 'fail', 'cancelled', 'skipped'].map((name) => [
    name,
    results.reduce((sum, result) => sum + (result.counts[name] ?? 0), 0),
  ]),
);
if (process.env.PJS_CONTRACT_REPORT)
  writeFileSync(
    process.env.PJS_CONTRACT_REPORT,
    `${JSON.stringify({ node: process.version, totals, results }, null, 2)}\n`,
  );
for (const result of results) {
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.exitCode, 0, result.output);
  assert.ok(
    result.counts.tests > 0,
    `No individual test summary for ${result.file}`,
  );
  assert.equal(result.counts.fail, 0, result.output);
  assert.equal(result.counts.cancelled, 0, result.output);
}
console.log(JSON.stringify(totals));
