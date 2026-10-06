import { performance } from 'node:perf_hooks';
import { mix32 } from './prng.mjs';

export function partition(n, chunks) {
  if (
    !Number.isSafeInteger(n) ||
    n < 1 ||
    !Number.isSafeInteger(chunks) ||
    chunks < 1
  )
    throw new RangeError('Invalid partition');
  chunks = Math.min(n, chunks);
  return Array.from({ length: chunks }, (_, id) => ({
    id,
    start: Math.floor((n * id) / chunks),
    end: Math.floor((n * (id + 1)) / chunks),
  }));
}

export function shuffled(cells, seed) {
  const result = [...cells];
  for (let i = result.length - 1; i > 0; i--) {
    seed = mix32(seed + 0x9e3779b9);
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function execute(pool, options, model, onFirst = () => {}) {
  const chunks = partition(options.simulations, options.chunks);
  const results = new Array(chunks.length),
    tasks = new Array(chunks.length);
  let cursor = 0,
    first = true;
  async function lane() {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      const submitted = performance.timeOrigin + performance.now();
      const result = await pool.run({
        ...chunk,
        seed: options.seed,
        mode: options.mode,
        model,
      });
      const completed = performance.timeOrigin + performance.now();
      if (first) {
        first = false;
        onFirst(completed);
      }
      results[chunk.id] = result;
      tasks[chunk.id] = {
        ...chunk,
        count: chunk.end - chunk.start,
        submitted,
        workerStart: result.workerStart,
        workerEnd: result.workerEnd,
        completed,
        latencyMs: completed - submitted,
      };
    }
  }
  await Promise.all(
    Array.from(
      {
        length: pool.serial ? 1 : Math.min(chunks.length, 2 * options.workers),
      },
      lane,
    ),
  );
  return { results, tasks };
}
