import type { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import {
  PjsCancelledError,
  PjsRuntimeStateError,
  PjsWorkerError,
} from '../errors/index.js';
import { integer } from '../internal/integer.js';
import type { RangeCoordinator } from '../partition/coordinator.js';
import type { ResultCreditManager } from '../results/credit.js';
import type { TaskCoordinator } from '../tasks/coordinator.js';
import type { RuntimeState, ShutdownOptions } from '../types/index.js';

/** Owns runtime state, lifecycle promises, escalation, and the single guarded pump. */
export class RuntimeController {
  private state: RuntimeState = 'created';
  private pumping = false;
  private readyPromise!: Promise<void>;
  private shutdownPromise: Promise<void> | undefined;
  private drainMode = true;
  private shutdownEscalations = 0;
  private shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  private drainResolve: (() => void) | undefined;

  constructor(
    private readonly dispatcher: ExecutionDispatcher,
    private readonly taskCoordinator: TaskCoordinator,
    private readonly rangeCoordinator: RangeCoordinator,
    private readonly resultCredits: ResultCreditManager,
  ) {}

  get currentState(): RuntimeState {
    return this.state;
  }
  get escalations(): number {
    return this.shutdownEscalations;
  }
  canAccept(child: boolean): boolean {
    return (
      this.state === 'starting' ||
      this.state === 'running' ||
      (child && this.state === 'stopping' && this.drainMode)
    );
  }

  /** Composition calls once, synchronously, after all owners and callbacks exist. */
  start(): void {
    this.state = 'starting';
    this.readyPromise = this.dispatcher
      .start()
      .then(() => {
        if (this.state === 'starting') this.state = 'running';
        if (
          this.state === 'failed' ||
          this.state === 'stopped' ||
          (this.state === 'stopping' && !this.drainMode)
        )
          throw new PjsRuntimeStateError('Runtime stopped during startup');
        this.pump();
      })
      .catch((cause: unknown) => {
        const error =
          cause instanceof Error ? cause : new PjsWorkerError(String(cause));
        if (this.state !== 'stopping' && this.state !== 'stopped')
          this.fail(error);
        throw error;
      });
    void this.readyPromise.catch(() => {});
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    const forceAfter = options.forceAfter;
    if (forceAfter !== undefined) {
      integer('forceAfter', forceAfter, 1, 2 ** 31 - 1);
      if (options.drain === false)
        throw new TypeError('forceAfter requires graceful shutdown');
    }
    this.drainMode = options.drain ?? true;
    const failed = this.state === 'failed';
    if (!failed) this.state = 'stopping';
    if (!failed && forceAfter !== undefined) {
      const deadline = this.monotonicNow() + forceAfter;
      const escalate = () => {
        const remaining = deadline - this.monotonicNow();
        if (remaining > 0) {
          this.shutdownTimer = this.scheduleShutdownTimer(escalate, remaining);
          return;
        }
        this.shutdownTimer = undefined;
        if (this.state !== 'stopping' || !this.drainMode) return;
        this.drainMode = false;
        this.shutdownEscalations++;
        this.cancelForShutdown();
        // Begin termination even if startup or the graceful drain waiter is pending.
        void this.dispatcher.stop().catch(() => {});
        this.drainResolve?.();
        this.drainResolve = undefined;
      };
      this.shutdownTimer = this.scheduleShutdownTimer(escalate, forceAfter);
    }
    // Defer the body so the idempotent promise is installed before any cleanup occurs.
    this.shutdownPromise = Promise.resolve().then(async () => {
      if (!failed && this.drainMode) {
        await this.readyPromise.catch(() => {});
        if (this.drainMode && this.state !== 'failed')
          await new Promise<void>((resolve) => {
            this.drainResolve = resolve;
            this.pump();
            this.checkDrained();
          });
      } else {
        this.cancelForShutdown();
      }
      try {
        await this.dispatcher.stop();
        this.resultCredits.releaseAll();
        this.rangeCoordinator.stopProduction();
        this.state = 'stopped';
      } finally {
        if (this.shutdownTimer !== undefined)
          this.cancelShutdownTimer(this.shutdownTimer);
        this.shutdownTimer = undefined;
      }
    });
    return this.shutdownPromise;
  }

  private monotonicNow(): number {
    return performance.now();
  }

  private scheduleShutdownTimer(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(callback, delay);
  }

  private cancelShutdownTimer(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer);
  }

  private cancelForShutdown(): void {
    this.rangeCoordinator.finishAll(
      'cancelled',
      (operation) =>
        new PjsCancelledError(
          'Runtime shutdown cancelled partition operation',
          { operationId: operation.id },
        ),
    );
    for (const task of this.taskCoordinator.values())
      this.taskCoordinator.settle(
        task,
        'cancelled',
        new PjsCancelledError('Runtime shutdown cancelled task', {
          taskId: task.id,
          ...(task.snapshot.workerId !== undefined
            ? { workerId: task.snapshot.workerId }
            : {}),
        }),
      );
  }

  dispatchAllowed(): boolean {
    return (
      this.state === 'running' || (this.state === 'stopping' && this.drainMode)
    );
  }

  pump(): void {
    if (this.pumping) return;
    if (!this.dispatchAllowed()) {
      this.checkDrained();
      return;
    }
    this.pumping = true;
    try {
      this.dispatcher.dispatchQueued(() => this.dispatchAllowed());
      if (this.rangeCoordinator.size > 0) {
        this.rangeCoordinator.produce();
        this.dispatcher.dispatchQueued(() => this.dispatchAllowed());
      }
    } finally {
      this.pumping = false;
    }
    this.checkDrained();
  }

  private checkDrained(): void {
    if (
      this.taskCoordinator.size === 0 &&
      this.rangeCoordinator.size === 0 &&
      this.dispatcher.busy === 0
    ) {
      this.drainResolve?.();
      this.drainResolve = undefined;
    }
  }

  fail(error: Error): void {
    if (this.state === 'failed' || this.state === 'stopped') return;
    this.state = 'failed';
    this.rangeCoordinator.finishAll(
      'failed',
      (operation) =>
        new PjsWorkerError(error.message, {
          operationId: operation.id,
          cause: error,
        }),
    );
    for (const task of this.taskCoordinator.values())
      this.taskCoordinator.settle(
        task,
        'failed',
        new PjsWorkerError(error.message, {
          taskId: task.id,
          ...(task.snapshot.workerId !== undefined
            ? { workerId: task.snapshot.workerId }
            : {}),
          cause: error,
        }),
      );
    void this.dispatcher
      .stop()
      .then(() => {
        this.resultCredits.releaseAll();
        this.checkDrained();
      })
      .catch(() => {
        // A failed termination cannot justify physical credit release.
        this.drainResolve?.();
        this.drainResolve = undefined;
      });
  }
}
