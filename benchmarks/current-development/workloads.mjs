import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { inflateRawSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { sharedReadonly } from '@pjavascript/runtime';
import { referencePrimeCount } from '../prime-search/task.mjs';
import { matrices, referenceMultiply } from '../matrix-multiplication/task.mjs';
import { prefixSum } from '../shared-memory/kernel.mjs';
import { skewOracle } from '../partitioning/kernel.mjs';
import { corpus } from '../real-world/compression/core.mjs';
import {
  bcrypt,
  scryptOptions,
  argonOptions,
} from '../real-world/crypto/task.mjs';
import { createModel, shareModel } from '../flagship-monte-carlo/src/model.mjs';
import {
  simulate,
  reduceResults,
} from '../flagship-monte-carlo/src/kernel.mjs';
import { execute } from './task.mjs';
import { policy } from './config.mjs';

export function partitions(size, grain) {
  return Array.from({ length: Math.ceil(size / grain) }, (_, index) => ({
    index,
    start: index * grain,
    end: Math.min(size, (index + 1) * grain),
  }));
}

export function workload(config, engine) {
  const c = config;
  const range = { start: 0, end: c.size, grainSize: c.grain };
  const parts = partitions(c.size, c.grain);
  const task = engine.task;
  const options = { dispatchBatchSize: c.batch };
  const run = (input, opts) => engine.run(input, opts);
  const collect = async (factory, opts = options) =>
    engine.runtime
      ? engine.runtime.partitionRange(
          task,
          range,
          (p) => ({ input: factory(p) }),
          opts,
        )
      : Promise.all(parts.map((p) => run(factory(p))));
  let invoke, validate, skip;
  switch (c.family) {
    case 'cpu': {
      const expected = referencePrimeCount(c.size);
      invoke = async () => {
        const chunks = partitions(c.size, Math.ceil(c.size / c.workers));
        return Promise.all(
          chunks.map((p) => run({ kind: 'cpu', from: p.start, to: p.end })),
        );
      };
      validate = (result) =>
        assert.equal(
          result.reduce((a, b) => a + b, 0),
          expected,
        );
      break;
    }
    case 'matrix': {
      const data = matrices(c.size),
        expected = referenceMultiply(data);
      invoke = async () => {
        const b = sharedReadonly(data.b);
        const chunks = partitions(c.size, Math.ceil(c.size / c.workers));
        const blocks = await Promise.all(
          chunks.map(async (p) => ({
            p,
            output: await run({
              kind: 'matrix',
              a: data.a.slice(p.start * c.size, p.end * c.size),
              b,
              size: c.size,
              rows: p.end - p.start,
            }),
          })),
        );
        const output = new Float64Array(c.size ** 2);
        for (const { p, output: block } of blocks)
          output.set(block, p.start * c.size);
        return output;
      };
      validate = (result) => assert.deepEqual(result, expected);
      break;
    }
    case 'transport': {
      const source = Uint8Array.from({ length: c.size }, (_, i) => i % 251);
      invoke = async () => {
        const data =
          c.transport === 'shared' ? sharedReadonly(source) : source.slice();
        const output = await run(
          { kind: 'scan', data },
          c.transport === 'transfer' ? { transferList: [data.buffer] } : {},
        );
        return { output, detached: data.buffer.byteLength === 0 };
      };
      validate = ({ output, detached }) => {
        assert.equal(output.sum, prefixSum(c.size));
        assert.equal(output.shared, c.transport === 'shared');
        // A zero-byte live buffer and a detached buffer both report zero length.
        if (c.size) assert.equal(detached, c.transport === 'transfer');
      };
      break;
    }
    case 'dispatch':
    case 'skew':
      invoke = () =>
        collect((partition) => ({
          kind: c.family === 'skew' ? 'skew' : 'noop',
          partition,
        }));
      validate = (result) =>
        assert.deepEqual(
          result,
          parts.map((p) =>
            c.family === 'skew' ? skewOracle(p.start, p.end) : p.index,
          ),
        );
      break;
    case 'completion':
      invoke = () =>
        engine.runtime.parallelFor(
          task,
          range,
          (partition) => ({ input: { kind: 'completion', partition } }),
          options,
        );
      validate = (result) => assert.equal(result, undefined);
      break;
    case 'shared-output':
      invoke = async () => {
        const output = new Uint8Array(new SharedArrayBuffer(c.size));
        await engine.runtime.parallelFor(
          task,
          range,
          (partition) => ({ input: { kind: c.family, partition, output } }),
          options,
        );
        return output;
      };
      validate = (result) =>
        assert.deepEqual(
          result,
          Uint8Array.from({ length: c.size }, (_, i) => i % 251),
        );
      break;
    case 'generic-map':
    case 'typed-map':
      invoke = () =>
        engine.runtime.parallelMapRange(
          task,
          range,
          (partition) => ({ input: { kind: c.family, partition } }),
          {
            ...options,
            ...(c.family === 'typed-map'
              ? { outputConstructor: Float64Array }
              : {}),
          },
        );
      validate = (result) =>
        assert.deepEqual(
          result,
          c.family === 'typed-map'
            ? Float64Array.from({ length: c.size }, (_, i) => 2 * i + 1)
            : Array.from({ length: c.size }, (_, value) => ({ value })),
        );
      break;
    case 'stream':
    case 'pipeline': {
      invoke = async () => {
        const beforeStats = engine.runtime.stats().streamResults;
        const maximum = c.bytes * (c.mode === 'upper' ? 2 : 1);
        const stream = engine.runtime.streamRange(
          task,
          range,
          (partition) => ({
            input: {
              kind: 'binary',
              partition,
              bytes: c.bytes,
              move: c.transport === 'transfer',
            },
          }),
          {
            maxBufferedResults: c.capacity,
            ...(c.mode === 'exact'
              ? {
                  resultBytes: c.bytes,
                  maxReservedResultBytes: maximum * c.capacity,
                }
              : {}),
            ...(c.mode === 'upper'
              ? {
                  maxResultBytes: () => maximum,
                  maxReservedResultBytes: maximum * c.capacity,
                }
              : {}),
          },
        );
        const results = [],
          arrival = [],
          started = performance.now();
        let firstResultMs;
        try {
          for await (const { partition, output } of stream) {
            firstResultMs ??= performance.now() - started;
            arrival.push(partition.index);
            if (c.family === 'pipeline') {
              const result = await run(
                { kind: 'scan', data: output },
                { transferList: [output.buffer] },
              );
              results.push({
                index: partition.index,
                bytes: c.bytes,
                sum: result.sum,
              });
            } else {
              // Retain only constant-size validation observations, not the payload.
              let valid = output.byteLength === c.bytes;
              for (const byte of output)
                valid &&= byte === partition.index % 251;
              results.push({ index: partition.index, valid });
            }
            if (c.slowMs) await delay(c.slowMs);
          }
        } finally {
          await stream.return();
        }
        return {
          results,
          arrival,
          firstResultMs,
          beforeStats,
          stats: engine.runtime.stats(),
        };
      };
      validate = ({ results, arrival, stats, beforeStats }) => {
        assert.deepEqual(
          [...arrival].sort((a, b) => a - b),
          parts.map((p) => p.index),
        );
        for (const result of results) {
          if (c.family === 'pipeline')
            assert.equal(result.sum, (result.index % 251) * c.bytes);
          else assert.equal(result.valid, true);
        }
        assert.equal(stats.streamResults.currentReservedResultBytes, 0);
        assert.equal(stats.streamResults.buffered, 0);
        assert.ok(stats.streamResults.peakBuffered <= c.capacity);
        if (c.mode !== 'count' && c.family !== 'pipeline')
          assert.ok(
            stats.streamResults.peakReservedResultBytes <=
              c.bytes * (c.mode === 'upper' ? 2 : 1) * c.capacity,
          );
        if (c.mode === 'upper' && c.bytes) {
          assert.equal(
            stats.streamResults.resultByteRefunds -
              beforeStats.resultByteRefunds,
            parts.length,
          );
          assert.equal(
            stats.streamResults.refundedResultBytes -
              beforeStats.refundedResultBytes,
            c.bytes * parts.length,
          );
          assert.equal(
            stats.streamResults.upperBoundResultsReconciled -
              beforeStats.upperBoundResultsReconciled,
            parts.length,
          );
        }
      };
      break;
    }
    case 'fairness':
      invoke = async () => {
        const ordinary = [],
          start = performance.now();
        const producer = (async () => {
          for (let i = 0; i < 16; i++) {
            const before = performance.now();
            assert.equal(await run({ value: i }), i);
            ordinary.push(performance.now() - before);
          }
        })();
        const streams = (async () => {
          let seen = 0;
          for await (const item of engine.runtime.streamRange(
            task,
            range,
            (p) => ({ input: { partition: p } }),
            { maxBufferedResults: 1 },
          )) {
            assert.equal(item.output, item.partition.index);
            seen++;
            await delay(1);
          }
          return seen;
        })();
        const [, collected, , seen] = await Promise.all([
          producer,
          collect((partition) => ({ partition })),
          engine.runtime.parallelFor(task, range, (partition) => ({
            input: { kind: 'completion', partition },
          })),
          streams,
        ]);
        return {
          ordinary,
          collected,
          seen,
          elapsedMs: performance.now() - start,
        };
      };
      validate = (result) => {
        assert.equal(result.ordinary.length, 16);
        assert.deepEqual(
          result.collected,
          parts.map((p) => p.index),
        );
        assert.equal(result.seen, parts.length);
      };
      break;
    case 'compression': {
      const data = corpus(c.corpus, c.size, policy.seed);
      invoke = () =>
        collect((partition) => ({
          kind: 'compression',
          data: data.slice(partition.start, partition.end),
          level: 6,
        }));
      validate = (result) => {
        const output = new Uint8Array(c.size);
        result.forEach((bytes, i) =>
          output.set(inflateRawSync(bytes), parts[i].start),
        );
        assert.deepEqual(output, data);
      };
      break;
    }
    case 'crypto': {
      if (c.kind === 'argon2' && typeof crypto.argon2Sync !== 'function')
        skip = 'node:crypto.argon2Sync unavailable in executing Node';
      if (c.kind === 'bcrypt' && !bcrypt)
        skip = 'locked optional bcrypt 6.0.0 native module unavailable';
      const data = corpus('poor', c.size, policy.seed),
        password = 'pjs-campaign-20261023',
        salt = 'pjs-fixed-salt-20261023';
      const job = {
        kind: c.kind,
        data,
        algorithm: 'sha256',
        batch: 8,
        key: new Uint8Array(32).fill(7),
        iv: new Uint8Array(12).fill(3),
        aad: new Uint8Array([1, 2, 3]),
        password,
        salt,
        lanes: 1,
        bcryptSalt: '$2b$06$abcdefghijklmnopqrstuu',
      };
      let expected;
      if (!skip) {
        if (c.kind === 'sha')
          expected = Array(8).fill(
            crypto.createHash('sha256').update(data).digest('hex'),
          );
        if (c.kind === 'scrypt')
          expected = crypto
            .scryptSync(password, salt, 32, scryptOptions)
            .toString('hex');
        if (c.kind === 'argon2')
          expected = crypto
            .argon2Sync('argon2id', {
              ...argonOptions,
              message: password,
              nonce: salt,
              parallelism: 1,
            })
            .toString('hex');
      }
      invoke = async () =>
        Promise.all(
          Array.from({ length: 4 }, () =>
            run({ kind: 'crypto', job: { ...job, data: data.slice() } }),
          ),
        );
      validate = (results) => {
        assert.equal(results.length, 4);
        for (const result of results) {
          if (c.kind === 'aes') {
            const decipher = crypto.createDecipheriv(
              'aes-256-gcm',
              job.key,
              job.iv,
            );
            decipher.setAAD(job.aad);
            decipher.setAuthTag(result.tag);
            assert.deepEqual(
              new Uint8Array(
                Buffer.concat([
                  decipher.update(result.ciphertext),
                  decipher.final(),
                ]),
              ),
              data,
            );
          } else if (c.kind === 'bcrypt')
            assert.equal(bcrypt.compareSync(password, result), true);
          else assert.deepEqual(result, expected);
        }
      };
      break;
    }
    case 'monte-carlo': {
      const model = createModel({
        factors: 8,
        positions: 32,
        seed: policy.seed,
      });
      // Different chunking supplies the pathwise oracle; aggregate sums use a stated tolerance.
      const oracle = simulate({
        model,
        seed: policy.seed,
        start: 0,
        end: c.size,
        id: 0,
        mode: 'distribution',
      });
      const reference = reduceResults([oracle], 'distribution');
      invoke = async () => {
        const inputModel = shareModel(model, sharedReadonly);
        const results = await collect((partition) => ({
          kind: 'monte-carlo',
          model: inputModel,
          seed: policy.seed,
          start: partition.start,
          end: partition.end,
          id: partition.index,
          mode: c.mode,
        }));
        return reduceResults(results, c.mode);
      };
      validate = (result) => {
        assert.equal(result.summary.count, c.size);
        assert.equal(result.summary.checksum, reference.summary.checksum);
        assert.equal(result.summary.minimum, reference.summary.minimum);
        assert.equal(result.summary.maximum, reference.summary.maximum);
        for (const key of ['sum', 'sumSquares'])
          assert.ok(
            Math.abs(result.summary[key] - reference.summary[key]) <=
              Math.max(1, Math.abs(reference.summary[key])) * 1e-12,
          );
        if (c.mode === 'distribution') {
          assert.deepEqual(result.output, reference.output);
          assert.equal(result.summary.var99, reference.summary.var99);
          assert.equal(
            result.summary.expectedShortfall99,
            reference.summary.expectedShortfall99,
          );
        }
      };
      break;
    }
    default:
      throw new Error('Unknown family ' + c.family);
  }
  let workUnits = c.size,
    unit = 'range elements';
  if (c.family === 'matrix') {
    workUnits = c.size ** 3;
    unit = 'multiply-adds';
  }
  if (['transport', 'compression'].includes(c.family)) unit = 'input bytes';
  if (['dispatch', 'completion'].includes(c.family)) {
    workUnits = parts.length;
    unit = 'partitions';
  }
  if (['stream', 'pipeline'].includes(c.family)) {
    workUnits = c.bytes * parts.length;
    unit = 'delivered bytes';
  }
  if (c.family === 'fairness') {
    workUnits = 3 * parts.length + 16;
    unit = 'completed tasks';
  }
  if (c.family === 'crypto') {
    workUnits = ['sha', 'aes'].includes(c.kind)
      ? 4 * c.size * (c.kind === 'sha' ? 8 : 1)
      : 4;
    unit = ['sha', 'aes'].includes(c.kind)
      ? 'processed bytes'
      : 'crypto operations';
  }
  if (c.family === 'monte-carlo') unit = 'simulation paths';
  return { invoke, validate, skip, workUnits, unit };
}

export function serialEngine() {
  return { run: async (input) => execute(input) };
}
