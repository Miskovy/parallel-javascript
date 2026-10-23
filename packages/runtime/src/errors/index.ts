export interface PjsErrorContext {
  taskId?: string;
  workerId?: number;
  cause?: unknown;
  operationId?: string;
  partitionIndex?: number;
  rangeStart?: number;
  rangeEnd?: number;
}

export interface PjsBinaryResultErrorContext extends PjsErrorContext {
  declaredBytes?: number;
  actualBytes?: number;
  actualType?: string;
  resultByteCapacity?: number;
}

export interface PjsTaskErrorDetails {
  name: string;
  message: string;
  stack?: string;
}

export class PjsError extends Error {
  readonly taskId: string | undefined;
  readonly workerId: number | undefined;
  readonly operationId: string | undefined;
  readonly partitionIndex: number | undefined;
  readonly rangeStart: number | undefined;
  readonly rangeEnd: number | undefined;
  constructor(message: string, context: PjsErrorContext = {}) {
    super(message, { cause: context.cause });
    this.name = new.target.name;
    this.taskId = context.taskId;
    this.workerId = context.workerId;
    this.operationId = context.operationId;
    this.partitionIndex = context.partitionIndex;
    this.rangeStart = context.rangeStart;
    this.rangeEnd = context.rangeEnd;
  }
}

export class PjsTaskError extends PjsError {
  readonly remoteName: string;
  readonly remoteStack: string | undefined;
  constructor(error: PjsTaskErrorDetails, context: PjsErrorContext) {
    super(error.message, context);
    this.remoteName = error.name;
    this.remoteStack = error.stack;
    if (error.stack)
      this.stack = `${this.stack}\nWorker stack (${error.name}):\n${error.stack}`;
  }
}
export class PjsWorkerError extends PjsError {}
/** Containment initiated for an expired physical dispatch lease. */
export class PjsExecutionLeaseError extends PjsWorkerError {}
export class PjsQueueFullError extends PjsError {}
export class PjsTimeoutError extends PjsError {}
export class PjsCancelledError extends PjsError {}
export class PjsSerializationError extends PjsError {}
export class PjsRuntimeStateError extends PjsError {}
export class PjsTaskRegistrationError extends PjsError {}
export class PjsMapContractError extends PjsError {}
export class PjsBinaryResultContractError extends PjsError {
  readonly declaredBytes: number | undefined;
  readonly actualBytes: number | undefined;
  readonly actualType: string | undefined;
  constructor(message: string, context: PjsBinaryResultErrorContext = {}) {
    super(message, context);
    this.declaredBytes = context.declaredBytes;
    this.actualBytes = context.actualBytes;
    this.actualType = context.actualType;
  }
}
export class PjsResultCapacityError extends PjsError {
  readonly declaredBytes: number | undefined;
  readonly resultByteCapacity: number | undefined;
  constructor(message: string, context: PjsBinaryResultErrorContext = {}) {
    super(message, context);
    this.declaredBytes = context.declaredBytes;
    this.resultByteCapacity = context.resultByteCapacity;
  }
}
