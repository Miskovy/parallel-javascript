import type { PjsRuntimeOptions as Options } from '../configuration/runtime-options.js';
import type {
  PjsRuntimeStats as Stats,
  PjsWorkerStats as Workers,
  PjsContainmentStats as Containment,
} from '../diagnostics.js';
import type { WorkerState as State } from '../types/index.js';
import type { PjsTaskRegistry } from './registry.js';

export interface PjsRuntimeOptions extends Omit<
  Options,
  'registry' | 'resourceLimits'
> {
  registry: PjsTaskRegistry;
  /** A deployed copy of PJS browser/bootstrap.js; HTTP(S), same-origin. */
  workerURL?: URL;
  resourceLimits?: never;
}
export type WorkerState = Omit<State, 'threadId'>;
export interface PjsWorkerStats extends Omit<Workers, 'details'> {
  details: WorkerState[];
}
export interface PjsContainmentStats extends Omit<
  Containment,
  'confirmedLeaseExits'
> {
  /** Cumulative endpoints retired with unfinished invocations; not a live-thread gauge. */
  unconfirmedRetirements: number;
}
export interface PjsRuntimeStats extends Omit<
  Stats,
  'workers' | 'containment'
> {
  workers: PjsWorkerStats;
  containment: PjsContainmentStats;
}
