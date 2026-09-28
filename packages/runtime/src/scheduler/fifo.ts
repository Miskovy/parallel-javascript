import { PjsQueueFullError } from '../errors/index.js';
import type { ScheduledTask } from '../tasks/task.js';
import type { WorkerState } from '../types/index.js';

export interface Scheduler<T extends ScheduledTask> {
  readonly size: number;
  readonly capacity: number;
  enqueue(task: T): void;
  next(worker: Readonly<WorkerState>): T | undefined;
  remove(taskId: string): T | undefined;
}

/** Map insertion order supplies FIFO and O(1) queued cancellation without tombstones. */
export class PjsScheduler<T extends ScheduledTask> implements Scheduler<T> {
  private readonly queue = new Map<string, T>();
  private queuedWeight = 0;
  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 0)
      throw new RangeError('maxQueue must be a nonnegative safe integer');
  }
  get size(): number {
    return this.queuedWeight;
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
    this.queue.set(task.id, task);
    this.queuedWeight += weight;
  }
  next(worker: Readonly<WorkerState>): T | undefined {
    if (worker.status !== 'idle') return undefined;
    const task = this.queue.values().next().value as T | undefined;
    if (task) {
      this.queue.delete(task.id);
      this.queuedWeight -= task.admissionWeight ?? 1;
    }
    return task;
  }
  remove(taskId: string): T | undefined {
    const task = this.queue.get(taskId);
    if (task) {
      this.queue.delete(taskId);
      this.queuedWeight -= task.admissionWeight ?? 1;
    }
    return task;
  }
}
