import { threadId } from 'node:worker_threads';
import { transfer } from '../../dist/index.js';
import { barrier, gate } from './tasks.mjs';

export function read({
  data,
  metadata = {},
  control,
  participants,
  crash = false,
}) {
  if (control) {
    if (participants) barrier({ buffer: control, participants });
    else gate({ buffer: control });
  }
  if (!(data.buffer instanceof SharedArrayBuffer))
    throw new Error('Not shared');
  if (crash) process.exit(23);
  const output = new Float64Array([data.reduce((a, b) => a + b, 0)]);
  metadata.worker = true;
  return transfer({ output, data, metadata, threadId }, [output.buffer]);
}

// Educational contract violation: force both non-atomic reads before either write.
export function increment({ data, control, atomic }) {
  const observed = data[0];
  barrier({ buffer: control, participants: 2 });
  if (atomic) Atomics.add(data, 0, 1);
  else data[0] = observed + 1;
  return threadId;
}

export function describe({ buffer, view, alias }) {
  return { buffer, view, alias, shared: buffer instanceof SharedArrayBuffer };
}
