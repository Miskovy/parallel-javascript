import { test } from 'node:test';
import { c4Contracts } from '../../../scripts/package/consumer/c4.mjs';

test(
  'C4 rejects every legacy own/inherited/undefined boundary without execution effects',
  c4Contracts,
);
