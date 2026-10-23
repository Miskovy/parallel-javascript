import { availableParallelism } from 'node:os';
import { integer } from '../internal/integer.js';
import type { PjsTaskRegistry } from '../tasks/registry.js';
import type { RestartPolicy } from '../types/index.js';

export interface PjsRuntimeOptions {
  registry: PjsTaskRegistry;
  workers?: number;
  minWorkers?: number;
  maxWorkers?: number;
  maxQueue?: number;
  startupTimeout?: number;
  /** Lifetime recovery decision budget without restartPolicy; defaults to workers * 4. Zero is valid. */
  maxRestarts?: number;
  /**
   * Rolling pool-wide restart budget, copied during construction.
   * A defined value is mutually exclusive with defined maxRestarts; omitting policy uses the lifetime budget.
   */
  restartPolicy?: RestartPolicy;
}

/** Normalize scalar construction options in their original observable read order.
 * Registry snapshot and maxQueue reads remain in composition, in that order.
 */
export function normalizeRuntimeOptions(options: PjsRuntimeOptions) {
  const minimum = integer('minWorkers', options.minWorkers ?? 1, 1);
  const maximum = integer(
    'maxWorkers',
    options.maxWorkers ??
      Math.max(minimum, options.workers ?? availableParallelism()),
    minimum,
  );
  const workers = integer(
    'workers',
    options.workers ??
      Math.max(minimum, Math.min(maximum, availableParallelism())),
    minimum,
    maximum,
  );
  const startupTimeout = integer(
    'startupTimeout',
    options.startupTimeout ?? 30_000,
    1,
    2 ** 31 - 1,
  );
  const maxRestarts = integer(
    'maxRestarts',
    options.maxRestarts ?? workers * 4,
    0,
  );
  let restartPolicy: RestartPolicy | undefined;
  if (options.restartPolicy !== undefined) {
    if (options.maxRestarts !== undefined)
      throw new TypeError(
        'restartPolicy and maxRestarts are mutually exclusive',
      );
    restartPolicy = {
      maxRestarts: integer(
        'restartPolicy.maxRestarts',
        options.restartPolicy.maxRestarts,
        0,
      ),
      windowMs: integer(
        'restartPolicy.windowMs',
        options.restartPolicy.windowMs,
        1,
      ),
    };
  }
  return {
    workers,
    startupTimeout,
    maxRestarts,
    ...(restartPolicy ? { restartPolicy } : {}),
  };
}
