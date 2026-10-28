import { integer } from '../internal/integer.js';
import type { PjsTaskRegistry } from '../tasks/registry.js';
import type {
  RestartPolicy,
  WorkerResourceLimits,
  SchedulingTask,
} from '../types/index.js';

export interface PjsRuntimeOptions {
  registry: PjsTaskRegistry;
  workers?: number;
  /** Async invocations per worker; default one. Does not add CPU parallelism. */
  concurrency?: number;
  /** Synchronous ranking of immutable eligible work; stable FIFO on ties. */
  scheduling?: (
    a: Readonly<SchedulingTask>,
    b: Readonly<SchedulingTask>,
  ) => number;
  minWorkers?: number;
  maxWorkers?: number;
  /** Opt into elasticity; retire excess idle workers after these milliseconds. */
  idleTimeout?: number;
  /** Copied JS-engine limits, applied to every initial, grown and replacement worker. */
  resourceLimits?: WorkerResourceLimits;
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
export function normalizeRuntimeOptions(
  options: PjsRuntimeOptions,
  cpuCount: () => number,
) {
  const minimum = integer('minWorkers', options.minWorkers ?? 1, 1);
  const maximum = integer(
    'maxWorkers',
    options.maxWorkers ?? Math.max(minimum, options.workers ?? cpuCount()),
    minimum,
  );
  const configuredWorkers = options.workers;
  const selectedWorkers = integer(
    'workers',
    configuredWorkers ?? Math.max(minimum, Math.min(maximum, cpuCount())),
    minimum,
    maximum,
  );
  const idleTimeout = options.idleTimeout;
  if (idleTimeout !== undefined)
    integer('idleTimeout', idleTimeout, 1, 2 ** 31 - 1);
  const workers =
    idleTimeout !== undefined && configuredWorkers === undefined
      ? minimum
      : selectedWorkers;
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
  let resourceLimits: WorkerResourceLimits | undefined;
  const limits = options.resourceLimits;
  if (limits !== undefined) {
    if (limits === null || typeof limits !== 'object' || Array.isArray(limits))
      throw new TypeError('resourceLimits must be an object');
    const names = [
      'maxOldGenerationSizeMb',
      'maxYoungGenerationSizeMb',
      'codeRangeSizeMb',
      'stackSizeMb',
    ] as const;
    for (const key of Object.keys(limits))
      if (!(names as readonly string[]).includes(key))
        throw new TypeError(`Unsupported worker resource limit: ${key}`);
    resourceLimits = {};
    for (const key of names) {
      const value = limits[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value <= 0 || value > 2 ** 31 - 1)
        throw new RangeError(
          `resourceLimits.${key} must be a positive finite number at most 2147483647`,
        );
      resourceLimits[key] = value;
    }
    Object.freeze(resourceLimits);
  }
  const concurrency = integer(
    'concurrency',
    'concurrency' in options ? (options.concurrency ?? 1) : 1,
    1,
  );
  if (!Number.isSafeInteger(maximum * concurrency * 16))
    throw new RangeError(
      'Worker concurrency/window capacity exceeds safe integer bounds',
    );
  const scheduling = 'scheduling' in options ? options.scheduling : undefined;
  if (scheduling !== undefined && typeof scheduling !== 'function')
    throw new TypeError('scheduling must be a function');
  return {
    concurrency,
    ...(scheduling ? { scheduling } : {}),
    workers,
    minimum,
    maximum,
    ...(idleTimeout === undefined ? {} : { idleTimeout }),
    ...(resourceLimits ? { resourceLimits } : {}),
    startupTimeout,
    maxRestarts,
    ...(restartPolicy ? { restartPolicy } : {}),
  };
}
