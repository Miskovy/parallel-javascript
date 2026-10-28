import type { PjsRuntimeStats } from './types.js';
import type { RuntimeSnapshot } from '../telemetry/snapshot.js';

/** Revocation is a cumulative endpoint observation, never a confirmed-exit gauge. */
export function projectBrowserStatistics(
  snapshot: RuntimeSnapshot,
): PjsRuntimeStats {
  const { confirmedLeaseExits, ...containment } = snapshot.containment;
  void confirmedLeaseExits;
  const details = snapshot.workers.details.map(({ threadId, ...state }) => {
    void threadId;
    return state;
  });
  return {
    ...snapshot,
    workers: { ...snapshot.workers, details },
    containment,
  };
}
