import { LifecycleModel } from './lifecycle-model.mjs';

export const GENERATOR_VERSION = 'r2-generator-1';
export const PROFILES = {
  smoke: { seeds: [123456], cases: 18, steps: 6 },
  standard: { seeds: [7, 42, 123456], cases: 54, steps: 16 },
  extended: {
    seeds: [
      1, 7, 19, 42, 99, 127, 1024, 8191, 65537, 123456, 20261011, 0xffffffff,
    ],
    cases: 72,
    steps: 32,
  },
};
export function random(seed, caseId) {
  let state = (seed ^ Math.imul(caseId + 1, 0x9e3779b9)) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}
export function enabled(model, serial) {
  const actions = [];
  if (model.state !== 'running') return actions;
  const idle = [...model.workers.values()].some((w) => w.status === 'idle');
  if (serial < 8 && (idle || model.queue.length < model.config.maxQueue))
    actions.push({
      type: 'SUBMIT_TASK',
      task: 't' + serial,
      leased: serial % 2 === 0,
    });
  for (const t of model.tasks.values())
    if (!t.stream && !t.outcome)
      actions.push(
        { type: 'CANCEL_TASK', task: t.id },
        { type: 'EXPIRE_CALLER_TIMEOUT', task: t.id },
      );
  for (const w of model.workers.values()) {
    if (w.status === 'starting')
      actions.push({ type: 'OBSERVE_REPLACEMENT_READY', worker: w.id });
    if (w.termination && w.live)
      actions.push({ type: 'CONFIRM_WORKER_EXIT', worker: w.id });
    if (w.status === 'busy') {
      if (!w.execution.started)
        actions.push({ type: 'DELIVER_STARTED', worker: w.id });
      else
        actions.push(
          { type: 'DELIVER_VALID_RESULT', worker: w.id, bytes: 3 },
          { type: 'DELIVER_TASK_FAILURE', worker: w.id },
        );
      if (w.execution.leaseDeadline !== undefined)
        actions.push({ type: 'ADVANCE_LEASE_CLOCK', worker: w.id });
      actions.push(
        { type: 'INJECT_WORKER_ERROR', worker: w.id },
        { type: 'INJECT_PROTOCOL_FAILURE', worker: w.id },
      );
    }
    if (w.staleLeases) actions.push({ type: 'FIRE_STALE_LEASE', worker: w.id });
  }
  for (const [id, s] of model.streams)
    if (!s.closed) {
      actions.push({ type: 'ABANDON_STREAM', stream: id });
      if (s.buffer.length) actions.push({ type: 'CONSUME_STREAM', stream: id });
    }
  if (model.config.rolling)
    actions.push({ type: 'EXPIRE_RESTART_WINDOW', ms: 100 });
  return actions;
}
export function generate(seed, caseId, profile = 'smoke') {
  if (
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 0xffffffff ||
    !Number.isInteger(caseId) ||
    caseId < 0
  )
    throw new Error(
      'seed must be uint32 > 0; case must be a nonnegative integer',
    );
  const settings = PROFILES[profile];
  if (!settings) throw new Error('Unknown profile: ' + profile);
  const rng = random(seed, caseId);
  const kind = caseId % 18;
  const config = {
    workers: [1, 2, 4][Math.floor(caseId / 18) % 3],
    maxQueue: [0, 1, 3][caseId % 3],
    rolling: kind === 3 || kind === 2 || Boolean(caseId % 2),
    maxRestarts: kind === 2 ? 1 : 2,
  };
  // The smoke corpus also exercises the four-worker, shared-budget boundary.
  if (kind === 2) config.workers = 4;
  if (kind === 4 || kind === 5) config.workers = 2;
  if (kind === 0 || kind === 13) config.maxQueue = 1;
  if (kind === 6) config.maxQueue = 1;
  if (kind === 13) config.workers = 1;
  const model = new LifecycleModel(config);
  const actions = [];
  const add = (type, params = {}) => {
    const a = { type, ...params };
    model.apply(a);
    actions.push(a);
  };
  const submit = (task, extra = {}) =>
    add('SUBMIT_TASK', { task, leased: true, ...extra });
  add('CREATE_RUNTIME');
  if (kind === 11) {
    submit('t0', { leased: false });
    add('BEGIN_FORCED_SHUTDOWN');
  } else {
    add('OBSERVE_READY');
    if (kind === 0) {
      submit('t0');
      submit('t1');
      add('CANCEL_TASK', { task: 't1' });
      add('EXPIRE_CALLER_TIMEOUT', { task: 't0' });
      add('ADVANCE_LEASE_CLOCK', { worker: 1 });
      add('INJECT_WORKER_ERROR', { worker: 1 });
      add('DELIVER_STALE_RESULT', { worker: 1 });
      add('CONFIRM_WORKER_EXIT', { worker: 1 });
      add('OBSERVE_REPLACEMENT_READY', { worker: config.workers + 1 });
      submit('t2');
      add('DELIVER_DUPLICATE_EXIT', { worker: 1 });
      add('FIRE_STALE_LEASE', { worker: 1 });
      add('DELIVER_STALE_RESULT', { worker: 1 });
      add('EXPIRE_CALLER_TIMEOUT', { task: 't0' });
    } else if (kind === 1) {
      submit('t0');
      add('DELIVER_STARTED', { worker: 1 });
      add('CANCEL_TASK', { task: 't0' });
      add('DELIVER_VALID_RESULT', { worker: 1, bytes: 3 });
      submit('t1');
      add('FIRE_STALE_LEASE', { worker: 1 });
    } else if (kind === 2) {
      submit('t0');
      submit('t1');
      add('ADVANCE_LEASE_CLOCK', { worker: 1 });
      add('ADVANCE_LEASE_CLOCK', { worker: 2 });
      add('INJECT_WORKER_ERROR', { worker: 1 });
    } else if (kind === 3) {
      submit('t0');
      add('INJECT_WORKER_ERROR', { worker: 1 });
      add('CONFIRM_WORKER_EXIT', { worker: 1 });
      add('OBSERVE_REPLACEMENT_READY', { worker: config.workers + 1 });
      add('EXPIRE_RESTART_WINDOW', { ms: 99 });
      add('EXPIRE_RESTART_WINDOW', { ms: 1 });
      submit('t1');
      add('INJECT_PROTOCOL_FAILURE', { worker: config.workers + 1 });
    } else if (kind === 4 || kind === 5) {
      add('START_BINARY_STREAM', {
        stream: 's0',
        count: 2,
        mode: kind === 4 ? 'exact' : 'upper-bound',
        ...(kind === 4 && caseId >= 18
          ? { post: caseId >= 36 ? 'fail' : 'cancel' }
          : {}),
      });
      if (!(kind === 4 && caseId >= 36)) add('DELIVER_STARTED', { worker: 1 });
      if (kind === 4) {
        add('ABANDON_STREAM', { stream: 's0' });
        add('INJECT_PROTOCOL_FAILURE', { worker: 1 });
      } else {
        add('DELIVER_VALID_RESULT', { worker: 1, bytes: rng() % 8 });
        add('CONSUME_STREAM', { stream: 's0' });
        add('ABANDON_STREAM', { stream: 's0' });
      }
    } else if (kind >= 6 && kind <= 8) {
      submit('t0', {
        post: ['cancel', 'fail', 'shutdown'][kind - 6],
        ...(kind === 6 ? { reentrant: true, transfer: true } : {}),
      });
    } else if (kind === 9) {
      submit('t0');
      add('BEGIN_GRACEFUL_SHUTDOWN', { forceAfter: 10 });
      add('CONCURRENT_SHUTDOWN');
      add('ADVANCE_SHUTDOWN_CLOCK');
    } else if (kind === 10) {
      submit('t0');
      add('INJECT_WORKER_ERROR', { worker: 1 });
      add('CONFIRM_WORKER_EXIT', { worker: 1 });
      add('INJECT_BOOTSTRAP_FAILURE', { worker: config.workers + 1 });
    } else if (kind === 12) {
      submit('t0', { leased: false });
      add('DELIVER_STARTED', { worker: 1 });
      add('BEGIN_GRACEFUL_SHUTDOWN');
      add('CONCURRENT_SHUTDOWN');
      add('DELIVER_VALID_RESULT', { worker: 1, bytes: 8 });
    } else if (kind === 13) {
      submit('t0');
      submit('t1', { leased: false });
      add('BEGIN_GRACEFUL_SHUTDOWN');
      add('ADVANCE_LEASE_CLOCK', { worker: 1 });
      add('CONFIRM_WORKER_EXIT', { worker: 1 });
      add('OBSERVE_REPLACEMENT_READY', { worker: 2 });
      add('DELIVER_STARTED', { worker: 2 });
      add('DELIVER_VALID_RESULT', { worker: 2, bytes: 8 });
    } else if (kind === 14) {
      submit('t0');
      add('INJECT_WORKER_ERROR', { worker: 1 });
      add('BEGIN_FORCED_SHUTDOWN');
    } else if (kind === 15 || kind === 16) {
      add('START_BINARY_STREAM', {
        stream: 's0',
        count: 2,
        mode: kind === 15 ? 'upper-bound' : 'exact',
      });
      add('DELIVER_STARTED', { worker: 1 });
      if (kind === 15) add('INJECT_PROTOCOL_FAILURE', { worker: 1 });
      else {
        add('DELIVER_VALID_RESULT', { worker: 1, bytes: 8 });
        add('CONSUME_STREAM', { stream: 's0' });
        add('CONSUME_STREAM', { stream: 's0' });
      }
    } else if (kind === 17) {
      submit('t0');
      add('INJECT_TERMINATION_REJECTION', { worker: 1 });
      add('BEGIN_FORCED_SHUTDOWN');
      add('OBSERVE_SHUTDOWN_REJECTION');
    }
    let serial = 2;
    while (model.tasks.has('t' + serial)) serial++;
    for (let step = 0; step < settings.steps; step++) {
      const candidates = enabled(model, serial);
      if (!candidates.length) break;
      const a = candidates[rng() % candidates.length];
      add(
        a.type,
        Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'type')),
      );
      if (a.type === 'SUBMIT_TASK') serial++;
    }
  }
  if (model.shutdown === 'none' || model.shutdown === 'fatal')
    add('BEGIN_FORCED_SHUTDOWN');
  if (model.state === 'stopping' && model.drain && model.forceAfter)
    add('ADVANCE_SHUTDOWN_CLOCK');
  for (const w of [...model.workers.values()])
    if (w.live && w.termination) add('CONFIRM_WORKER_EXIT', { worker: w.id });
  add(
    model.terminationRejected
      ? 'OBSERVE_SHUTDOWN_REJECTION'
      : 'OBSERVE_SHUTDOWN_COMPLETION',
  );
  return {
    seed,
    caseId,
    generatorVersion: GENERATOR_VERSION,
    profile,
    config,
    actions,
  };
}
