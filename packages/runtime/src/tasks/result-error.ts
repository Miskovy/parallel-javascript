import {
  PjsBinaryResultContractError,
  PjsSerializationError,
  PjsTaskError,
} from '../errors/index.js';
import type { TaskResultMessage } from '../workers/protocol.js';

/** Project a validated worker failure onto the logical caller's identity. */
export function taskResultError(
  message: Extract<TaskResultMessage, { type: 'failure' }>,
  taskId: string,
  workerId: number,
): Error {
  const context = { taskId, workerId };
  switch (message.kind) {
    case 'serialization':
      return new PjsSerializationError(
        `Task output could not be serialized: ${message.error.message}`,
        { ...context, cause: message.error },
      );
    case 'binaryContract': {
      // The protocol validator requires details for this failure kind.
      const contract = message.binaryContract!;
      return new PjsBinaryResultContractError(message.error.message, {
        ...context,
        cause: message.error,
        declaredBytes: contract.declaredBytes,
        ...(contract.actualBytes === undefined
          ? {}
          : { actualBytes: contract.actualBytes }),
        actualType: contract.actualType,
      });
    }
    default:
      return new PjsTaskError(message.error, context);
  }
}
