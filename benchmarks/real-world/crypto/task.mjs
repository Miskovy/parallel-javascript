import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { transfer } from '@pjs/runtime';

export const bcrypt = await import('bcrypt')
  .then((m) => m.default)
  .catch(() => null);
export const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const argonOptions = { memory: 65536, passes: 3, tagLength: 32 };

export function compute(input) {
  const started = performance.timeOrigin + performance.now();
  let value;
  switch (input.kind) {
    case 'sha':
      value = Array.from({ length: input.batch }, () =>
        crypto.createHash(input.algorithm).update(input.data).digest('hex'),
      );
      break;
    case 'scrypt':
      value = crypto
        .scryptSync(input.password, input.salt, 32, scryptOptions)
        .toString('hex');
      break;
    case 'argon2':
      value = crypto
        .argon2Sync('argon2id', {
          ...argonOptions,
          message: input.password,
          nonce: input.salt,
          parallelism: input.lanes,
        })
        .toString('hex');
      break;
    case 'bcrypt':
      value = bcrypt.hashSync(input.password, input.bcryptSalt);
      break;
    case 'aes': {
      const cipher = crypto.createCipheriv('aes-256-gcm', input.key, input.iv);
      cipher.setAAD(input.aad);
      value = {
        ciphertext: Buffer.concat([cipher.update(input.data), cipher.final()]),
        tag: cipher.getAuthTag(),
      };
      break;
    }
    default:
      throw new Error(`Unknown workload ${input.kind}`);
  }
  return {
    value,
    started,
    executionMs: performance.timeOrigin + performance.now() - started,
    ...(input.ownership === 'transfer' ? { data: input.data } : {}),
  };
}

export function task(input) {
  const result = compute(input);
  return input.ownership === 'transfer'
    ? transfer(result, [result.data.buffer])
    : result;
}

export async function nativeAsync(input) {
  // Native queue and execution cannot be separated through these public APIs.
  const value = await new Promise((resolve, reject) => {
    const done = (error, result) => (error ? reject(error) : resolve(result));
    if (input.kind === 'scrypt')
      crypto.scrypt(input.password, input.salt, 32, scryptOptions, done);
    else if (input.kind === 'argon2')
      crypto.argon2(
        'argon2id',
        {
          ...argonOptions,
          message: input.password,
          nonce: input.salt,
          parallelism: input.lanes,
        },
        done,
      );
    else if (input.kind === 'bcrypt')
      bcrypt.hash(input.password, input.bcryptSalt, done);
    else throw new Error('No native async baseline for this workload');
  });
  return {
    value: typeof value === 'string' ? value : value.toString('hex'),
    started: null,
    executionMs: null,
  };
}
