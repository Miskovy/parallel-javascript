import type { WorkerSnapshot } from '../telemetry/snapshot.js';
import { PjsQueueFullError } from '../errors/index.js';
import type { ScheduledTask } from '../tasks/task.js';
import type { SchedulingTask } from '../types/index.js';

export interface Scheduler<T extends ScheduledTask> {
  readonly size: number;
  readonly capacity: number;
  enqueue(task: T): void;
  next(worker: Readonly<WorkerSnapshot>): T | undefined;
  remove(taskId: string): T | undefined;
}

/** PJS owns storage, weight and stable ties; application code only compares copies. */
export class PjsScheduler<T extends ScheduledTask> implements Scheduler<T> {
  private readonly queue = new Map<string, T>();
  private queuedWeight = 0;
  private sequence = 0;
  private revision = 0;
  private policy:
    | ((a: Readonly<SchedulingTask>, b: Readonly<SchedulingTask>) => number)
    | undefined;
  selecting = false;
  policyErrors = 0;
  constructor(
    readonly capacity: number,
    policy?: (
      a: Readonly<SchedulingTask>,
      b: Readonly<SchedulingTask>,
    ) => number,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 0)
      throw new RangeError('maxQueue must be a nonnegative safe integer');
    this.policy = policy;
  }
  get size(): number {
    return this.queuedWeight;
  }
  get dispatchCount(): number {
    return this.queue.size;
  }
  values(): T[] {
    return [...this.queue.values()];
  }
  stamp(task: T, metadata?: SchedulingTask): void {
    task.schedulingSequence = ++this.sequence;
    task.scheduling = Object.freeze(
      metadata ?? {
        taskId: task.id,
        taskName: task.id,
        priority: task.priority ?? 0,
        queuedAt: Date.now(),
        weight: task.admissionWeight ?? 1,
        exclusive: false,
      },
    );
  }
  /** Also invalidates a selection when external recovery/parent state changes. */
  invalidate(): void {
    this.revision++;
  }
  enqueue(task: T): void {
    const weight = task.admissionWeight ?? 1;
    if (!Number.isSafeInteger(weight) || weight < 1)
      throw new RangeError('Scheduled task admission weight must be positive');
    if (this.size + weight > this.capacity)
      throw new PjsQueueFullError(`Queue capacity ${this.capacity} exhausted`, {
        taskId: task.id,
      });
    if (this.queue.has(task.id))
      throw new Error(`Duplicate scheduled task ${task.id}`);
    if (task.schedulingSequence === undefined) this.stamp(task);
    this.queue.set(task.id, task);
    this.queuedWeight += weight;
    this.invalidate();
  }
  select(
    candidates: readonly T[],
    valid: () => boolean = () => true,
  ): T | undefined {
    if (this.selecting) return undefined;
    const revision = this.revision;
    const builtin = (a: T, b: T) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      (a.schedulingSequence ?? 0) - (b.schedulingSequence ?? 0);
    let selected: T | undefined;
    this.selecting = true;
    try {
      for (const candidate of candidates) {
        if (!selected) {
          selected = candidate;
          continue;
        }
        let order: unknown = this.policy
          ? this.policy(candidate.scheduling!, selected.scheduling!)
          : builtin(candidate, selected);
        if (typeof order !== 'number' || !Number.isFinite(order)) {
          void Promise.resolve(order).catch(() => {});
          throw new TypeError('scheduling must return a finite number');
        }
        if (this.revision !== revision || !valid())
          throw new Error('Reentrant scheduling mutation');
        if (order === 0)
          order =
            (candidate.schedulingSequence ?? 0) -
            (selected.schedulingSequence ?? 0);
        if ((order as number) < 0) selected = candidate;
      }
      return valid() && this.revision === revision ? selected : undefined;
    } catch {
      this.policy = undefined;
      this.policyErrors++;
      // Return control to the dispatcher to rebuild eligibility from live state.
      return undefined;
    } finally {
      this.selecting = false;
    }
  }
  next(worker: Readonly<WorkerSnapshot>): T | undefined {
    if (worker.status !== 'idle') return undefined;
    const task = this.select(this.values());
    return task ? this.remove(task.id) : undefined;
  }
  remove(taskId: string): T | undefined {
    const task = this.queue.get(taskId);
    if (task) {
      this.queue.delete(taskId);
      this.queuedWeight -= task.admissionWeight ?? 1;
      this.invalidate();
    }
    return task;
  }
}
