import { PjsBinaryResultContractError } from '../errors/index.js';
import type { BinaryResultInspection } from '../partition/binary-core.js';
import { serializeError } from './protocol.js';
import type {
  BatchItemResult,
  UpperBoundResultByteContract,
} from './protocol.js';

/** Validate visible bytes after transfer-envelope unwrapping and before posting. */
export function validateBinaryResult(
  inspected: BinaryResultInspection,
  declaredBytes: number,
  mode: 'exact' | 'upper-bound' = 'exact',
): number {
  if (
    inspected.problem ||
    (mode === 'exact'
      ? inspected.bytes !== declaredBytes
      : inspected.bytes! > declaredBytes)
  ) {
    let detail: string;
    switch (inspected.problem) {
      case 'shared':
        detail = 'uses SharedArrayBuffer backing';
        break;
      case 'detached':
        detail = 'is detached';
        break;
      case 'unsupported':
        detail = 'is not a direct binary value';
        break;
      default:
        detail = `contains ${inspected.bytes} visible bytes`;
    }
    throw new PjsBinaryResultContractError(
      `Binary result ${detail}; expected ${mode === 'exact' ? 'exactly' : 'at most'} ${declaredBytes} visible bytes`,
      {
        declaredBytes,
        ...(inspected.bytes === undefined
          ? {}
          : { actualBytes: inspected.bytes }),
        actualType: inspected.actualType,
      },
    );
  }
  return inspected.bytes!;
}

/** Output preparation failures are terminal serialization/contract failures, never task retries. */
export function outputFailure(
  cause: unknown,
  taskId: string,
  executionMs: number,
  contract: UpperBoundResultByteContract | undefined,
): Extract<BatchItemResult, { type: 'failure' }> {
  const binary = cause instanceof PjsBinaryResultContractError;
  return {
    type: 'failure',
    taskId,
    kind: binary ? 'binaryContract' : 'serialization',
    ...(binary
      ? {
          binaryContract: {
            declaredBytes: cause.declaredBytes!,
            ...(cause.actualBytes === undefined
              ? {}
              : { actualBytes: cause.actualBytes }),
            actualType: cause.actualType ?? 'unknown',
            ...(contract ? { mode: contract.mode } : {}),
          },
        }
      : {}),
    error: serializeError(cause),
    executionMs,
  };
}
