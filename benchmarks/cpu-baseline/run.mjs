import { runSuite } from '../harness.mjs';
await runSuite('cpu', [100_000, 1_000_000, 5_000_000]);
