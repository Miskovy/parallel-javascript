import type { PjsRuntimeStats } from '../diagnostics.js';
import type { RuntimeSnapshot } from '../telemetry/snapshot.js';

export function projectNodeStatistics(
  snapshot: RuntimeSnapshot,
): PjsRuntimeStats {
  const { unconfirmedRetirements, ...containment } = snapshot.containment;
  void unconfirmedRetirements;
  const details = snapshot.workers.details.map((state) => {
    if (state.threadId === undefined)
      throw new Error('Node snapshot requires a threadId');
    return { ...state, threadId: state.threadId };
  });
  return {
    ...snapshot,
    workers: { ...snapshot.workers, details },
    containment,
  };
}
