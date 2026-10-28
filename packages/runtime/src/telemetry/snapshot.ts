import type { WorkerState } from '../types/index.js';
import type {
  PjsRuntimeStats,
  PjsWorkerStats,
  PjsContainmentStats,
} from '../diagnostics.js';

/** Internal observations, projected by each entry into its existing public contract. */
export type WorkerSnapshot = Omit<WorkerState, 'threadId'> & {
  threadId?: number;
};
export interface ContainmentSnapshot extends PjsContainmentStats {
  unconfirmedRetirements: number;
}
export interface RuntimeSnapshot extends Omit<
  PjsRuntimeStats,
  'workers' | 'containment'
> {
  workers: Omit<PjsWorkerStats, 'details'> & { details: WorkerSnapshot[] };
  containment: ContainmentSnapshot;
}
