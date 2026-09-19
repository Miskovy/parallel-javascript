export interface ErrorContext {
  taskId?: string;
  workerId?: number;
  cause?: unknown;
}

export class PjsError extends Error {
  readonly taskId: string | undefined;
  readonly workerId: number | undefined;
  constructor(message: string, context: ErrorContext = {}) {
    super(message, { cause: context.cause });
    this.name = new.target.name;
    this.taskId = context.taskId;
    this.workerId = context.workerId;
  }
}

export class PjsTaskError extends PjsError {
  readonly remoteName: string;
  readonly remoteStack: string | undefined;
  constructor(
    error: { name: string; message: string; stack?: string },
    context: ErrorContext,
  ) {
    super(error.message, context);
    this.remoteName = error.name;
    this.remoteStack = error.stack;
    if (error.stack)
      this.stack = `${this.stack}\nWorker stack (${error.name}):\n${error.stack}`;
  }
}
export class PjsWorkerError extends PjsError {}
export class PjsQueueFullError extends PjsError {}
export class PjsTimeoutError extends PjsError {}
export class PjsCancelledError extends PjsError {}
export class PjsSerializationError extends PjsError {}
export class PjsRuntimeStateError extends PjsError {}
export class PjsTaskRegistrationError extends PjsError {}
