import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { campaign, options } from './campaign.mjs';
import { MODEL_VERSION } from '../../packages/runtime/test/helpers/lifecycle-model.mjs';
import {
  generate,
  GENERATOR_VERSION,
} from '../../packages/runtime/test/helpers/lifecycle-generator.mjs';

const opt = options(['profile', 'seed', 'case', 'history', 'output']);
assert.ok(
  opt.history || (opt.seed !== undefined && opt.case !== undefined),
  'Specify --seed and --case, or --history',
);
assert.ok(
  !opt.history || (opt.seed === undefined && opt.case === undefined),
  'History and seed/case are mutually exclusive',
);
const history = opt.history
  ? JSON.parse(readFileSync(opt.history, 'utf8'))
  : generate(Number(opt.seed), Number(opt.case), opt.profile ?? 'smoke');
assert.equal(
  history.generatorVersion,
  GENERATOR_VERSION,
  'Use the original source revision for older histories',
);
assert.ok(
  !history.modelVersion || history.modelVersion === MODEL_VERSION,
  'Model version mismatch',
);
const report = await campaign({
  history,
  profile: history.profile,
  seed: history.seed,
  output: opt.output,
  reduce: false,
});
if (!report.passed) process.exitCode = 1;
