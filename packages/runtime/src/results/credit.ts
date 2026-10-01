import { PjsResultCapacityError } from '../errors/index.js';

export interface ResultCreditOperation {
  readonly id: string;
  readonly resultByteCapacity: number | undefined;
}

export interface ResultCreditContext {
  readonly operationId: string;
  readonly partitionIndex: number;
  readonly rangeStart: number;
  readonly rangeEnd: number;
}

interface ResultReservation {
  readonly taskId: string;
  readonly operation: ResultCreditOperation;
  readonly partitionIndex: number;
  readonly bytes: number;
  dispatched: boolean;
  executionDone: boolean;
  callerSettled: boolean;
}

interface OperationCredits {
  bytes: number;
  readonly taskByPartition: Map<number, string>;
}

const invariantChecksEnabled =
  process.env.PJS_DEBUG_RESERVATION_INVARIANTS === '1';

/** Owns exact binary-result credit from admission through physical termination/yield. */
export class ResultCreditManager {
  private readonly reservations = new Map<string, ResultReservation>();
  private readonly executions = new Map<string, string[]>();
  private readonly operations = new Map<
    ResultCreditOperation,
    OperationCredits
  >();
  private currentReservedResultBytes = 0;
  private peakReservedResultBytes = 0;
  private resultByteReservationWaits = 0;
  private resultByteReservationRejected = 0;
  private binaryResultContractFailures = 0;

  canReserve(operation: ResultCreditOperation, bytes: number): boolean {
    return bytes <= operation.resultByteCapacity! - this.reserved(operation);
  }

  reserved(operation: ResultCreditOperation): number {
    return this.operations.get(operation)?.bytes ?? 0;
  }

  taskForPartition(
    operation: ResultCreditOperation,
    partitionIndex: number,
  ): string | undefined {
    return this.operations.get(operation)?.taskByPartition.get(partitionIndex);
  }

  reserve(
    taskId: string,
    operation: ResultCreditOperation,
    partitionIndex: number,
    bytes: number,
    context: ResultCreditContext,
  ): void {
    if (
      operation.resultByteCapacity === undefined ||
      !this.canReserve(operation, bytes)
    )
      throw new PjsResultCapacityError(
        'Result-byte reservation invariant was violated before admission',
        {
          ...context,
          taskId,
          declaredBytes: bytes,
          resultByteCapacity: operation.resultByteCapacity!,
        },
      );
    if (this.reservations.has(taskId))
      throw new Error(`Duplicate result reservation ${taskId}`);
    let credits = this.operations.get(operation);
    if (!credits) {
      credits = { bytes: 0, taskByPartition: new Map() };
      this.operations.set(operation, credits);
    }
    if (credits.taskByPartition.has(partitionIndex))
      throw new Error(
        `Duplicate result reservation for operation ${operation.id} partition ${partitionIndex}`,
      );
    this.reservations.set(taskId, {
      taskId,
      operation,
      partitionIndex,
      bytes,
      dispatched: false,
      executionDone: false,
      callerSettled: false,
    });
    credits.taskByPartition.set(partitionIndex, taskId);
    credits.bytes += bytes;
    this.currentReservedResultBytes += bytes;
    this.peakReservedResultBytes = Math.max(
      this.peakReservedResultBytes,
      this.currentReservedResultBytes,
    );
    this.assertInvariants('reserve');
  }

  markDispatched(correlationId: string, taskIds: readonly string[]): void {
    const reservedIds = taskIds.filter((taskId) =>
      this.reservations.has(taskId),
    );
    if (reservedIds.length === 0) return;
    for (const taskId of reservedIds)
      this.reservations.get(taskId)!.dispatched = true;
    this.executions.set(correlationId, reservedIds);
    this.assertInvariants('dispatch');
  }

  markCallerSettled(taskId: string): void {
    const reservation = this.reservations.get(taskId);
    if (!reservation) return;
    reservation.callerSettled = true;
    if (!reservation.dispatched || reservation.executionDone)
      this.release(taskId);
    else this.assertInvariants('settle-running');
  }

  markExecutionEnded(correlationId: string): void {
    const taskIds = this.executions.get(correlationId);
    if (!taskIds) return;
    this.executions.delete(correlationId);
    for (const taskId of taskIds) {
      const reservation = this.reservations.get(taskId);
      if (!reservation) continue;
      reservation.executionDone = true;
      if (reservation.callerSettled) this.release(taskId, false);
    }
    this.assertInvariants('execution-ended');
  }

  releaseForPartition(
    operation: ResultCreditOperation,
    partitionIndex: number,
  ): void {
    const taskId = this.taskForPartition(operation, partitionIndex);
    if (taskId) this.release(taskId);
  }

  cancelOperation(operation: ResultCreditOperation): void {
    for (const [taskId, reservation] of this.reservations) {
      if (reservation.operation !== operation) continue;
      reservation.callerSettled = true;
      if (!reservation.dispatched || reservation.executionDone)
        this.release(taskId);
    }
    this.assertInvariants('cancel-operation');
  }

  releaseAll(): void {
    this.executions.clear();
    for (const taskId of [...this.reservations.keys()])
      this.release(taskId, false);
    this.assertInvariants('release-all');
  }

  recordWait(): void {
    this.resultByteReservationWaits++;
  }

  recordRejected(): void {
    this.resultByteReservationRejected++;
  }

  recordContractFailure(): void {
    this.binaryResultContractFailures++;
  }

  snapshot() {
    return {
      currentReservedResultBytes: this.currentReservedResultBytes,
      peakReservedResultBytes: this.peakReservedResultBytes,
      resultByteReservationWaits: this.resultByteReservationWaits,
      resultByteReservationRejected: this.resultByteReservationRejected,
      binaryResultContractFailures: this.binaryResultContractFailures,
    };
  }

  /** @internal Test/soak visibility without exposing mutable bookkeeping. */
  diagnostics() {
    return {
      reservations: this.reservations.size,
      executions: this.executions.size,
      operations: this.operations.size,
    };
  }

  private release(taskId: string, checkInvariants = true): void {
    const reservation = this.reservations.get(taskId);
    if (!reservation) return;
    this.reservations.delete(taskId);
    const credits = this.operations.get(reservation.operation);
    if (credits) {
      if (credits.taskByPartition.get(reservation.partitionIndex) === taskId)
        credits.taskByPartition.delete(reservation.partitionIndex);
      credits.bytes -= reservation.bytes;
      if (credits.taskByPartition.size === 0)
        this.operations.delete(reservation.operation);
    }
    this.currentReservedResultBytes -= reservation.bytes;
    if (checkInvariants) this.assertInvariants('release');
  }

  private assertInvariants(stage: string): void {
    if (!invariantChecksEnabled) return;
    const fail = (detail: string): never => {
      throw new Error(
        `Result reservation invariant failed after ${stage}: ${detail}`,
      );
    };
    const current = this.currentReservedResultBytes;
    if (!Number.isSafeInteger(current) || current < 0)
      fail(`current reserved bytes is ${current}`);

    const correlated = new Set<string>();
    for (const [correlationId, taskIds] of this.executions) {
      if (taskIds.length === 0)
        fail(`execution ${correlationId} has no logical reservations`);
      for (const taskId of taskIds) {
        if (correlated.has(taskId))
          fail(`reservation ${taskId} has multiple execution correlations`);
        correlated.add(taskId);
        const reservation =
          this.reservations.get(taskId) ??
          fail(`execution ${correlationId} references missing ${taskId}`);
        if (!reservation.dispatched || reservation.executionDone)
          fail(`execution ${correlationId} references inactive ${taskId}`);
      }
    }

    let reservationBytes = 0;
    for (const [taskId, reservation] of this.reservations) {
      if (reservation.taskId !== taskId)
        fail(`reservation key ${taskId} disagrees with record task ID`);
      if (!Number.isSafeInteger(reservation.bytes) || reservation.bytes < 0)
        fail(`reservation ${taskId} has invalid byte count`);
      const credits = this.operations.get(reservation.operation);
      if (credits?.taskByPartition.get(reservation.partitionIndex) !== taskId)
        fail(`reservation ${taskId} has no matching partition mapping`);
      if (reservation.dispatched && !reservation.executionDone) {
        if (!correlated.has(taskId))
          fail(`dispatched reservation ${taskId} has no execution correlation`);
      } else if (correlated.has(taskId))
        fail(`inactive reservation ${taskId} retains execution correlation`);
      reservationBytes += reservation.bytes;
      if (!Number.isSafeInteger(reservationBytes))
        fail('reservation byte sum exceeds safe integer range');
    }
    if (reservationBytes !== current)
      fail(
        `metric ${current} disagrees with reservation sum ${reservationBytes}`,
      );

    let operationBytes = 0;
    for (const [operation, credits] of this.operations) {
      if (!Number.isSafeInteger(credits.bytes) || credits.bytes < 0)
        fail(`operation ${operation.id} has invalid reserved bytes`);
      if (
        operation.resultByteCapacity !== undefined &&
        credits.bytes > operation.resultByteCapacity
      )
        fail(`operation ${operation.id} exceeds its result byte capacity`);
      for (const [partitionIndex, taskId] of credits.taskByPartition) {
        const reservation = this.reservations.get(taskId);
        if (
          !reservation ||
          reservation.operation !== operation ||
          reservation.partitionIndex !== partitionIndex
        )
          fail(
            `operation ${operation.id} has stale partition ${partitionIndex}`,
          );
      }
      operationBytes += credits.bytes;
      if (!Number.isSafeInteger(operationBytes))
        fail('operation byte sum exceeds safe integer range');
    }
    if (operationBytes !== current)
      fail(`metric ${current} disagrees with operation sum ${operationBytes}`);
  }
}
