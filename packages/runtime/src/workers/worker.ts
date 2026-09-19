import { Worker } from 'node:worker_threads';
import { PjsSerializationError, PjsWorkerError } from '../errors/index.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import type { WorkerState } from '../types/index.js';
import { isWorkerMessage } from './protocol.js';
import type {
  BootstrapData,
  HostMessage,
  TaskResultMessage,
} from './protocol.js';

export interface WorkerCallbacks {
  ready(worker: PjsWorker): void;
  started(worker: PjsWorker, taskId: string): void;
  result(worker: PjsWorker, message: TaskResultMessage): void;
  failed(worker: PjsWorker, error: PjsWorkerError, wasStarting: boolean): void;
}

export class PjsWorker {
  readonly ready: Promise<void>;
  private readonly thread: Worker;
  private readonly state: WorkerState;
  private readonly startupTimer: ReturnType<typeof setTimeout>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private stopPromise: Promise<void> | undefined;
  private executionPhase: 'none' | 'scheduled' | 'running' = 'none';

  constructor(
    readonly id: number,
    tasks: TaskDescriptor[],
    startupTimeout: number,
    private readonly callbacks: WorkerCallbacks,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // A replacement can fail before the pool attaches a readiness waiter.
    void this.ready.catch(() => {});
    this.thread = new Worker(new URL('./bootstrap.js', import.meta.url), {
      workerData: { version: 1, tasks } satisfies BootstrapData,
    });
    this.state = {
      id,
      threadId: this.thread.threadId,
      status: 'starting',
      completedTasks: 0,
      failedTasks: 0,
      totalExecutionTimeMs: 0,
    };
    this.startupTimer = setTimeout(
      () => this.fail('Worker startup deadline exceeded'),
      startupTimeout,
    );
    this.thread.on('message', (message: unknown) => this.receive(message));
    this.thread.on('messageerror', (cause: Error) =>
      this.fail('Worker message could not be deserialized', cause),
    );
    this.thread.on('error', (cause: Error) =>
      this.fail(`Worker error: ${cause.message}`, cause),
    );
    this.thread.on('exit', (code) => {
      if (this.state.status !== 'stopped' && this.state.status !== 'failed')
        this.fail(`Worker unexpectedly exited with code ${code}`);
    });
  }

  snapshot(): WorkerState {
    return { ...this.state };
  }

  execute(taskId: string, taskName: string, input: unknown): void {
    if (this.state.status !== 'idle')
      throw new PjsWorkerError('Worker is not idle', {
        taskId,
        workerId: this.id,
      });
    this.state.status = 'busy';
    this.state.currentTaskId = taskId;
    this.executionPhase = 'scheduled';
    try {
      this.thread.postMessage({
        type: 'execute',
        taskId,
        taskName,
        input,
      } satisfies HostMessage);
    } catch (cause) {
      this.state.status = 'idle';
      delete this.state.currentTaskId;
      this.executionPhase = 'none';
      throw new PjsSerializationError('Task input could not be cloned', {
        taskId,
        workerId: this.id,
        cause,
      });
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    clearTimeout(this.startupTimer);
    this.rejectReady(
      new PjsWorkerError('Worker stopped before ready', { workerId: this.id }),
    );
    if (this.state.status === 'idle')
      this.thread.postMessage({ type: 'shutdown' } satisfies HostMessage);
    this.state.status = 'stopped';
    delete this.state.currentTaskId;
    this.stopPromise = this.thread.terminate().then(() => {
      this.thread.removeAllListeners();
    });
    return this.stopPromise;
  }

  private receive(value: unknown): void {
    if (this.state.status === 'failed' || this.state.status === 'stopped')
      return;
    if (!isWorkerMessage(value)) {
      this.fail('Invalid worker protocol message');
      return;
    }
    if (value.type === 'bootstrapFailure') {
      this.fail(`Worker bootstrap failed: ${value.error.message}`, value.error);
      return;
    }
    if (value.type === 'ready') {
      if (this.state.status !== 'starting') {
        this.fail('Duplicate worker readiness');
        return;
      }
      clearTimeout(this.startupTimer);
      this.state.status = 'idle';
      this.resolveReady();
      this.callbacks.ready(this);
      return;
    }
    if (
      this.state.status !== 'busy' ||
      this.state.currentTaskId !== value.taskId
    ) {
      this.fail(`Unexpected task message for ${value.taskId}`);
      return;
    }
    if (value.type === 'started') {
      if (this.executionPhase !== 'scheduled') {
        this.fail('Duplicate task start');
        return;
      }
      this.executionPhase = 'running';
      this.callbacks.started(this, value.taskId);
      return;
    }
    if (this.executionPhase !== 'running') {
      this.fail('Task result arrived before start');
      return;
    }
    this.state.status = 'idle';
    delete this.state.currentTaskId;
    this.executionPhase = 'none';
    if (value.type === 'success') this.state.completedTasks++;
    else this.state.failedTasks++;
    this.state.totalExecutionTimeMs += value.executionMs;
    this.callbacks.result(this, value);
  }

  private fail(message: string, cause?: unknown): void {
    if (this.state.status === 'failed' || this.state.status === 'stopped')
      return;
    const wasStarting = this.state.status === 'starting';
    const taskId = this.state.currentTaskId;
    if (taskId) this.state.failedTasks++;
    this.state.status = 'failed';
    clearTimeout(this.startupTimer);
    const error = new PjsWorkerError(message, {
      workerId: this.id,
      ...(taskId ? { taskId } : {}),
      cause,
    });
    this.rejectReady(error);
    this.callbacks.failed(this, error, wasStarting);
  }
}
