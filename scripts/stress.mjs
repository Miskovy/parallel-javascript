import { spawnSync } from 'node:child_process';

const rounds = Number(process.env.PJS_STRESS_ROUNDS ?? 5);
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error('PJS_STRESS_ROUNDS must be a positive integer');
for (let round = 1; round <= rounds; round++) {
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-timeout=20000', 'packages/runtime/test/*.test.mjs'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`Stress round ${round} failed`);
  }
  console.log(`Stress round ${round}/${rounds} passed`);
}
