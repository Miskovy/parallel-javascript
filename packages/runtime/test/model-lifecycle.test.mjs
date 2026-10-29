import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { generate, PROFILES } from './helpers/lifecycle-generator.mjs';
import { runHistory, reduceHistory } from './helpers/lifecycle-runner.mjs';
import { compare } from './helpers/lifecycle-oracles.mjs';

const negativeEvidence = [];
const saveNegative = () => {
  if (process.env.PJS_R2_NEGATIVE_REPORT)
    writeFileSync(
      process.env.PJS_R2_NEGATIVE_REPORT,
      JSON.stringify(negativeEvidence, null, 2) + '\n',
    );
};
saveNegative();

test(
  'R2 exclusive queue uses an idle replacement instead of retaining a busy-worker pin',
  { timeout: 10000 },
  async () => {
    const evidence = await runHistory(generate(19, 59, 'extended'));
    assert.ok(evidence.passed && evidence.cleanup);
  },
);

for (let caseId = 0; caseId < PROFILES.smoke.cases; caseId++)
  test(`R2 smoke seed=123456 case=${caseId}`, { timeout: 10000 }, async () => {
    const h = generate(123456, caseId);
    assert.deepEqual(generate(123456, caseId), h);
    const evidence = await runHistory(h);
    assert.ok(evidence.passed && evidence.cleanup);
  });

test(
  'R2 oracle rejects early completion in the actual controlled runtime',
  { timeout: 10000 },
  async () => {
    await assert.rejects(
      runHistory(generate(123456, 1), {
        mutateObservation(actual, a) {
          if (a.type === 'CANCEL_TASK') actual.workers[0].ids = [];
        },
      }),
      (error) =>
        error.invariant === 'I1' &&
        error.evidence.cleanup &&
        /Replay:/.test(error.message),
    );
    negativeEvidence.push({
      invariant: 'I1',
      fault: 'premature physical completion observation',
      passed: true,
    });
    saveNegative();
  },
);
const duplicate = (actual, a) => {
  if (a.type === 'CANCEL_TASK')
    actual.tasks.find((t) => t.id === a.task).settlements++;
};
test(
  'R2 oracle rejects duplicate settlement and reduces a valid failing history',
  { timeout: 10000 },
  async () => {
    const h = generate(123456, 1);
    const replay = (candidate) =>
      runHistory(candidate, { mutateObservation: duplicate });
    await assert.rejects(
      replay(h),
      (error) => error.invariant === 'I3' && error.evidence.cleanup,
    );
    const reduced = await reduceHistory(h, 'I3', replay, 64);
    assert.ok(reduced.reducedActions < reduced.originalActions);
    await assert.rejects(
      replay(reduced.history),
      (error) => error.invariant === 'I3',
    );
    negativeEvidence.push({
      invariant: 'I3',
      fault: 'duplicate settlement observation',
      passed: true,
      reduction: reduced,
      replayCommand: 'node packages/runtime/test/model-lifecycle.test.mjs',
    });
    saveNegative();
  },
);
test('R2 oracle rejects excess physical population and stale lease interference', () => {
  const expected = {
    state: 'running',
    tasks: [],
    workers: [],
    queue: 0,
    posts: 0,
  };
  assert.throws(
    () => compare(expected, { ...expected, livePopulation: 2, poolLimit: 1 }),
    (error) => error.invariant === 'I2',
  );
  const leased = { ...expected, leaseExpirations: 0 };
  assert.throws(
    () => compare(leased, { ...leased, leaseExpirations: 1 }),
    (error) => error.invariant === 'I7',
  );
  negativeEvidence.push({
    invariants: ['I2', 'I7'],
    fault: 'population/stale-lease observation doubles',
    passed: true,
  });
  saveNegative();
});
