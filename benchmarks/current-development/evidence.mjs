import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
export function command(executable, args, cwd, options = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 32 * 1024 ** 2,
    ...options,
  });
  return {
    command: [executable, ...args],
    cwd,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
export function checked(receipt) {
  assert.equal(receipt.error, undefined, receipt.error);
  assert.equal(receipt.exitCode, 0, receipt.stdout + receipt.stderr);
  return receipt.stdout.trim();
}
export function source(root) {
  const git = (...args) => checked(command('git', args, root));
  const dirty = git('status', '--porcelain=v1');
  assert.equal(
    dirty,
    '',
    'Campaign requires a clean committed source: ' + root,
  );
  return {
    root,
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    status: dirty,
  };
}
export function files(root) {
  return readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    });
}
export function manifest(root) {
  const entries = files(root)
    .filter((p) => !p.endsWith('digests.json'))
    .map((path) => ({
      path: relative(root, path).replaceAll('\\', '/'),
      sha256: sha256(path),
    }));
  writeFileSync(
    join(root, 'digests.json'),
    JSON.stringify(entries, null, 2) + '\n',
    { flag: 'wx' },
  );
  for (const entry of entries)
    assert.equal(sha256(join(root, entry.path)), entry.sha256);
  return entries.length;
}
export function summary(values) {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  assert.ok(n > 0);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(
    sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1),
  );
  return {
    n,
    median:
      n % 2
        ? sorted[Math.floor(n / 2)]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
    mean,
    cv: mean ? sd / mean : 0,
  };
}
export function assess(children, policy) {
  if (children.some((x) => x.status === 'failed')) return { status: 'failed' };
  if (children.some((x) => x.status === 'skipped'))
    return {
      status: 'skipped',
      reasons: [...new Set(children.map((x) => x.reason).filter(Boolean))],
    };
  const arm = (name) =>
    summary(
      children
        .filter((x) => x.arm === name)
        .flatMap((x) =>
          x.phases
            .filter((p) => p.phase === 'measurement')
            .map((p) => p.wallMs),
        ),
    );
  const baseline = arm('baseline'),
    candidate = arm('candidate');
  const ratio = candidate.median / baseline.median,
    deltaMs = candidate.median - baseline.median;
  const paired = [1, 2].map(
    (i, j) =>
      summary(
        children[i].phases
          .filter((p) => p.phase === 'measurement')
          .map((p) => p.wallMs),
      ).median /
      summary(
        children[j === 0 ? 0 : 3].phases
          .filter((p) => p.phase === 'measurement')
          .map((p) => p.wallMs),
      ).median,
  );
  const noisy = baseline.cv > policy.maxCV || candidate.cv > policy.maxCV;
  const signal =
    ratio > policy.slowdown &&
    deltaMs > policy.minimumDeltaMs &&
    !noisy &&
    paired.every((x) => x > policy.pairedSlowdown);
  return {
    status: signal
      ? 'signal'
      : noisy && deltaMs > policy.minimumDeltaMs
        ? 'inconclusive'
        : 'accepted',
    baseline,
    candidate,
    ratio,
    deltaMs,
    paired,
    tiny: Math.max(baseline.median, candidate.median) < 2,
    noisy,
  };
}
