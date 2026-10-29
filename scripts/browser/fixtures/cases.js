// Executed in a real Window; tasks always run in separately loaded module workers.
export async function runCases(pjs, taskURL, workerURL) {
  const results = [];
  const equal = (actual, expected, message = 'equality') => {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(
        `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
      );
  };
  const ok = (value, message = 'assertion') => {
    if (!value) throw new Error(message);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (check) => {
    const end = performance.now() + 5000;
    while (!check()) {
      if (performance.now() > end)
        throw new Error('Timed out waiting for state');
      await delay(5);
    }
  };
  const rejects = async (operation, name) => {
    try {
      await (typeof operation === 'function' ? operation() : operation);
    } catch (error) {
      if (name) equal(error.name, name, error.message);
      return error;
    }
    throw new Error(`Expected rejection ${name ?? ''}`);
  };
  const names = [
    'info',
    'echo',
    'arity',
    'wait',
    'cpu',
    'hang',
    'hardFailure',
    'silentClose',
    'generic',
    'typed',
    'owned',
    'recover',
    'fallback',
    'callCounts',
    'serialization',
    'rebuild',
    'invalidMap',
    'taskError',
    'invalidProgress',
    'shared',
    'cooperativeCPU',
    'cooperativeAsync',
    'progress',
  ];
  const setup = async (options = {}) => {
    const registry = new pjs.PjsTaskRegistry();
    const tasks = Object.fromEntries(
      names.map((name) => [name, registry.register(name, taskURL, name)]),
    );
    const runtime = new pjs.PjsRuntime({
      registry,
      workers: 1,
      workerURL,
      ...options,
    });
    await runtime.ready();
    return { runtime, tasks, registry };
  };
  const test = async (name, callback, options) => {
    const fixture = await setup(options);
    let watchdog;
    try {
      await Promise.race([
        callback(fixture),
        new Promise((_, reject) => {
          watchdog = setTimeout(
            () => reject(new Error('Behavioral case exceeded 10 seconds')),
            10000,
          );
        }),
      ]);
      results.push(name);
    } catch (error) {
      throw new Error(`${name}: ${error.stack ?? error}`, { cause: error });
    } finally {
      clearTimeout(watchdog);
      await fixture.runtime.shutdown({ drain: false });
    }
  };
  const range = { start: 0, end: 4, grainSize: 1 };
  const caps = pjs.browserCapabilities();
  await test('C4 removed options reject before factories and posting', async ({
    runtime,
    tasks,
  }) => {
    for (const [legacy, method] of [
      ['experimentalDispatchBatchSize', 'partitionRange'],
      ['experimentalMaxBufferedResults', 'streamRange'],
      ['experimentalOutputConstructor', 'parallelMapRange'],
      ['experimentalResultBytes', 'streamRange'],
      ['experimentalMaxResultBytes', 'streamRange'],
      ['experimentalMaxReservedResultBytes', 'streamRange'],
    ])
      for (const inherited of [false, true])
        for (const value of [undefined, 1]) {
          const fields = {};
          let reads = 0;
          Object.defineProperty(fields, legacy, {
            get() {
              reads++;
              return value;
            },
          });
          const options = inherited ? Object.create(fields) : fields;
          const before = runtime.stats().dispatch.executeMessages;
          const error = await rejects(() => {
            const result = runtime[method](
              tasks.generic,
              range,
              () => {
                throw new Error('factory invoked');
              },
              options,
            );
            return method === 'streamRange' ? result.next() : result;
          }, 'TypeError');
          ok(error.message.includes('was removed'));
          equal(reads, 0);
          equal(runtime.stats().dispatch.executeMessages, before);
        }
  });
  await test('dedicated execution, exact arity and responsive UI', async ({
    runtime,
    tasks,
  }) => {
    const info = await runtime.run(tasks.info, null);
    equal(info, {
      dedicated: true,
      windowHost: false,
      sharedMemory: caps.sharedMemory,
      nestedRejected: true,
      process: 'undefined',
    });
    equal(await runtime.run(tasks.arity, null), 1);
    equal(await runtime.run(tasks.arity, null, { onProgress() {} }), 2);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    try {
      ok(await runtime.run(tasks.cpu, { ms: 100 }));
      ok(ticks > 1, 'UI event processing');
    } finally {
      clearInterval(timer);
    }
    ok(!('threadId' in runtime.stats().workers.details[0]));
    ok(!('confirmedLeaseExits' in runtime.stats().containment));
    await rejects(
      () =>
        new pjs.PjsRuntime({
          registry: new pjs.PjsTaskRegistry(),
          resourceLimits: undefined,
        }),
      'TypeError',
    );
    await rejects(
      () =>
        new pjs.PjsTaskRegistry().register('bad', new URL('file:///bad.js')),
      'PjsTaskRegistrationError',
    );
  });
  await test(
    'all range APIs, map contracts and completion-order streams',
    async ({ runtime, tasks }) => {
      const input = (partition) => ({ input: partition });
      equal(
        await runtime.partitionRange(tasks.echo, range, input),
        [0, 1, 2, 3].map((index) => ({ index, start: index, end: index + 1 })),
      );
      equal(await runtime.parallelFor(tasks.echo, range, input), undefined);
      equal(
        await runtime.parallelMapRange(
          tasks.generic,
          { ...range, grainSize: 2 },
          input,
        ),
        [0, 2, 4, 6],
      );
      const typed = await runtime.parallelMapRange(
        tasks.typed,
        { ...range, grainSize: 2 },
        input,
        { outputConstructor: Float64Array },
      );
      ok(typed instanceof Float64Array);
      equal([...typed], [0, 2, 4, 6]);
      const stream = runtime.streamRange(
        tasks.wait,
        range,
        (partition) => ({
          input: { value: partition.index, ms: partition.index === 0 ? 80 : 1 },
        }),
        { maxBufferedResults: 4 },
      );
      const values = [];
      for await (const item of stream) values.push(item.output);
      equal([...values].sort(), [0, 1, 2, 3]);
      ok(values[0] !== 0, 'completion order');
      await rejects(
        runtime.parallelMapRange(
          tasks.invalidMap,
          { ...range, grainSize: 2 },
          input,
        ),
        'PjsMapContractError',
      );
    },
    { concurrency: 2 },
  );
  await test('strict bytes, upper-bound refunds, transfer helper identity and cleanup', async ({
    runtime,
    tasks,
  }) => {
    for (const bound of [{ resultBytes: 4 }, { maxResultBytes: 8 }]) {
      const stream = runtime.streamRange(
        tasks.owned,
        range,
        () => ({ input: { bytes: 4, move: true } }),
        { ...bound, maxReservedResultBytes: 16, maxBufferedResults: 4 },
      );
      for await (const { output } of stream) {
        ok(output instanceof Uint8Array);
        equal([...output], [7, 7, 7, 7]);
      }
      equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    }
    ok(runtime.stats().streamResults.refundedResultBytes >= 16);
    const stream = runtime.streamRange(
      tasks.owned,
      range,
      () => ({ input: { bytes: 4, ms: 10 } }),
      {
        resultBytes: 4,
        maxReservedResultBytes: 8,
        maxBufferedResults: 2,
        cancellation: 'terminate',
      },
    );
    await stream.next();
    await stream.return();
    await until(
      () => runtime.stats().streamResults.currentReservedResultBytes === 0,
    );
    const bytes = new Uint8Array([1, 2, 3]);
    equal(
      [
        ...(await runtime.run(tasks.echo, bytes, {
          transferList: [bytes.buffer],
        })),
      ],
      [1, 2, 3],
    );
    equal(bytes.byteLength, 0);
    const retained = new Uint8Array([1]);
    await runtime.run(tasks.echo, retained);
    equal(retained.byteLength, 1);
  });
  await test(
    'task-error recovery, reconstruction and genuine batch skipped suffix',
    async ({ runtime, tasks }) => {
      const result = await runtime.partitionRange(
        tasks.recover,
        range,
        (partition) => ({ input: { index: partition.index } }),
        {
          dispatchBatchSize: 4,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: (partition, next) => ({
            input: { index: partition.index, attempt: next.attempt },
          }),
        },
      );
      equal(
        result.map((value) => value.index),
        [0, 1, 2, 3],
      );
      equal(await runtime.run(tasks.callCounts, null), [
        [0, 1],
        [1, 2],
        [2, 1],
        [3, 1],
      ]);
      const fallback = await runtime.run(
        tasks.recover,
        { index: 1, fail: 'always' },
        {
          repeatable: true,
          fallback: { task: tasks.fallback },
        },
      );
      equal(fallback.fallback, true);
      const first = new Uint8Array([9, 8]);
      const built = [];
      const output = await runtime.run(
        tasks.rebuild,
        { bytes: first },
        {
          transferList: [first.buffer],
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: (next) => {
            const bytes = new Uint8Array([9, 8]);
            built.push(bytes);
            return {
              input: { bytes, attempt: next.attempt },
              transferList: [bytes.buffer],
            };
          },
        },
      );
      equal([...output], [9, 8]);
      equal(first.byteLength, 0);
      equal(built[0].byteLength, 0);
      let calls = 0;
      const bytes = new Uint8Array([1]);
      await rejects(
        runtime.run(tasks.echo, bytes, {
          transferList: [bytes.buffer],
          repeatable: true,
          retry: { maxAttempts: 2, on: ['worker-crash'] },
          rebuildInput() {
            calls++;
            return { input: bytes };
          },
        }),
      );
      equal(calls, 0);
      equal(bytes.byteLength, 1);
      await rejects(
        runtime.partitionRange(
          tasks.echo,
          range,
          () => {
            calls++;
            return { input: 1 };
          },
          {
            repeatable: true,
            retry: { maxAttempts: 2, on: ['execution-lease'] },
          },
        ),
      );
      equal(calls, 0);
    },
    { maxQueue: 0 },
  );
  await test(
    'range transfers rebuild only after admission and abort prevents replay',
    async ({ runtime, tasks }) => {
      const built = [];
      const prepare = (attempt) => {
        const bytes = new Uint8Array([4, 5]);
        built.push(bytes);
        return {
          input: { bytes, attempt },
          transferList: [bytes.buffer],
        };
      };
      const result = await runtime.partitionRange(
        tasks.rebuild,
        range,
        () => prepare(1),
        {
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: (_partition, next) => prepare(next.attempt),
        },
      );
      equal(
        result.map((bytes) => [...bytes]),
        [
          [4, 5],
          [4, 5],
          [4, 5],
          [4, 5],
        ],
      );
      ok(built.every((bytes) => bytes.byteLength === 0));
      let rebuilt = 0;
      const controller = new AbortController();
      await rejects(
        runtime.run(tasks.taskError, null, {
          signal: controller.signal,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput() {
            rebuilt++;
            controller.abort();
            return { input: null };
          },
        }),
        'PjsCancelledError',
      );
      equal(rebuilt, 1);
      const delayed = new AbortController();
      rebuilt = 0;
      const pending = rejects(
        runtime.run(tasks.taskError, null, {
          signal: delayed.signal,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 100 },
          rebuildInput() {
            rebuilt++;
            return { input: null };
          },
        }),
        'PjsCancelledError',
      );
      await until(() =>
        runtime
          .stats()
          .activeTasks.some((task) => task.status === 'recovering'),
      );
      delayed.abort();
      await pending;
      await delay(110);
      equal(rebuilt, 0);
      const bytes = new Uint8Array([1]);
      let calls = 0;
      await rejects(
        runtime.partitionRange(
          tasks.echo,
          range,
          () => {
            calls++;
            return { input: bytes, transferList: [bytes.buffer] };
          },
          { dispatchBatchSize: 2 },
        ),
      );
      ok(calls > 0);
      equal(bytes.byteLength, 1);
    },
    { maxQueue: 0 },
  );
  for (const custom of [false, true]) {
    await test(
      `${custom ? 'custom policy' : 'stable priority'} keeps bounded dispatch`,
      async ({ runtime, tasks }) => {
        const busy = runtime.run(tasks.wait, { ms: 50, value: 'busy' });
        const order = [];
        const low = runtime
          .run(tasks.echo, 'low', { priority: -1 })
          .then((value) => order.push(value));
        const first = runtime
          .run(tasks.echo, 'first', { priority: 2 })
          .then((value) => order.push(value));
        const second = runtime
          .run(tasks.echo, 'second', { priority: 2 })
          .then((value) => order.push(value));
        await Promise.all([busy, low, first, second]);
        equal(
          order,
          custom ? ['low', 'first', 'second'] : ['first', 'second', 'low'],
        );
        equal(runtime.stats().queue.size, 0);
      },
      custom ? { scheduling: (a, b) => a.priority - b.priority } : {},
    );
  }
  await test('serialization skipped IDs never authorize replay', async ({
    runtime,
    tasks,
  }) => {
    let rebuilt = 0;
    await rejects(
      runtime.partitionRange(
        tasks.serialization,
        range,
        (partition) => ({ input: { index: partition.index } }),
        {
          dispatchBatchSize: 4,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput() {
            rebuilt++;
            return { input: { index: 0 } };
          },
        },
      ),
      'PjsSerializationError',
    );
    equal(rebuilt, 0);
    equal(await runtime.run(tasks.callCounts, null), [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });
  await test('range fallback preserves original output contracts and byte reservations', async ({
    runtime,
    tasks,
  }) => {
    const options = { repeatable: true, fallback: { task: tasks.generic } };
    equal(
      await runtime.parallelMapRange(
        tasks.taskError,
        { ...range, grainSize: 2 },
        (partition) => ({ input: partition }),
        options,
      ),
      [0, 2, 4, 6],
    );
    await rejects(
      runtime.parallelMapRange(
        tasks.taskError,
        { ...range, grainSize: 2 },
        (partition) => ({ input: partition }),
        { ...options, fallback: { task: tasks.invalidMap } },
      ),
      'PjsMapContractError',
    );
    const stream = runtime.streamRange(
      tasks.taskError,
      range,
      () => ({ input: { bytes: 4, move: true } }),
      {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 5 },
        fallback: { task: tasks.owned },
        maxResultBytes: 8,
        maxReservedResultBytes: 16,
      },
    );
    let count = 0;
    for await (const { output } of stream) {
      equal(output.byteLength, 4);
      count++;
    }
    equal(count, 4);
    equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    const invalid = runtime.streamRange(
      tasks.taskError,
      range,
      () => ({ input: { bytes: 9 } }),
      {
        repeatable: true,
        fallback: { task: tasks.owned },
        resultBytes: 4,
        maxReservedResultBytes: 8,
      },
    );
    const failure = await rejects(invalid.next(), 'AggregateError');
    ok(
      failure.errors.some(
        (error) => error.name === 'PjsBinaryResultContractError',
      ),
    );
    await invalid.return();
    await until(
      () => runtime.stats().streamResults.currentReservedResultBytes === 0,
    );
  });
  await test('bounded lossy progress, observer isolation and argument convention', async ({
    runtime,
    tasks,
  }) => {
    equal(
      await runtime.run(tasks.invalidProgress, null, {
        onProgress() {
          throw new Error('invalid payload delivered');
        },
      }),
      [false, false, false],
    );
    const progress = [];
    await runtime.run(
      tasks.progress,
      { count: 100000, async: false },
      { onProgress: (event) => progress.push(event) },
    );
    ok(progress.length > 0 && progress.length < 100000, 'bounded coalescing');
    for (let i = 1; i < progress.length; i++)
      ok(progress[i].sequence > progress[i - 1].sequence);
    let callbacks = 0;
    await runtime.run(
      tasks.progress,
      { count: 1000, async: true },
      {
        onProgress() {
          callbacks++;
          throw new Error('observer');
        },
      },
    );
    equal(callbacks, 1);
    equal(runtime.stats().progress.callbackErrors, 1);
    const events = [];
    await runtime.parallelFor(
      tasks.progress,
      range,
      () => ({ input: { count: 1000, async: true } }),
      { onProgress: (event) => events.push(event) },
    );
    ok(
      events.some(
        (event) => Number.isInteger(event.partitionIndex) && event.operationId,
      ),
    );
  });
  await test('confirmed buffered results survive unrelated endpoint revocation', async ({
    runtime,
    tasks,
  }) => {
    const stream = runtime.streamRange(
      tasks.owned,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { bytes: 4, move: true } }),
      { resultBytes: 4, maxReservedResultBytes: 4 },
    );
    await until(() => runtime.stats().streamResults.buffered === 1);
    const controller = new AbortController();
    let started = false;
    const cancelled = rejects(
      runtime.run(tasks.hang, null, {
        cancellation: 'terminate',
        signal: controller.signal,
        onProgress() {
          started = true;
        },
      }),
      'PjsCancelledError',
    );
    await until(() => started);
    controller.abort();
    await cancelled;
    equal(await runtime.run(tasks.echo, true), true);
    equal(runtime.stats().streamResults.currentReservedResultBytes, 4);
    equal((await stream.next()).value.output.byteLength, 4);
    await stream.return();
    equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  });
  await test('cooperation capability and cleanup ownership', async ({
    runtime,
    tasks,
  }) => {
    if (!caps.sharedMemory) {
      await rejects(
        runtime.run(tasks.echo, 1, { cancellation: 'cooperative' }),
        'TypeError',
      );
      await rejects(() => pjs.sharedReadonly(new Uint8Array([1])), 'TypeError');
      return;
    }
    equal(
      await runtime.run(
        tasks.shared,
        pjs.sharedReadonly(new Uint8Array([1, 2])),
      ),
      [1, 2],
    );
    for (const task of [tasks.cooperativeCPU, tasks.cooperativeAsync]) {
      const state = new Int32Array(new SharedArrayBuffer(4));
      const controller = new AbortController();
      const work = runtime.run(task, state.buffer, {
        cancellation: 'cooperative',
        signal: controller.signal,
      });
      const settled = rejects(work, 'PjsCancelledError');
      await until(() => Atomics.load(state, 0) === 1);
      controller.abort();
      await settled;
      if (task === tasks.cooperativeAsync) {
        await until(() => Atomics.load(state, 0) === 2);
        equal(
          runtime.stats().workers.activeExecutions,
          1,
          'async cleanup retains slot',
        );
      }
      await until(() => runtime.stats().workers.activeExecutions === 0);
      equal(Atomics.load(state, 0), task === tasks.cooperativeCPU ? 2 : 3);
    }
  });
  await test('termination, leases, replacement readiness and restart accounting', async ({
    runtime,
    tasks,
  }) => {
    const controller = new AbortController();
    let started = false;
    const work = runtime.run(tasks.hang, null, {
      signal: controller.signal,
      cancellation: 'terminate',
      onProgress() {
        started = true;
      },
    });
    const cancelled = rejects(work, 'PjsCancelledError');
    await until(() => started);
    controller.abort();
    await cancelled;
    equal(await runtime.run(tasks.echo, 42), 42);
    equal(runtime.stats().containment.unconfirmedRetirements, 1);
    equal(
      runtime.stats().workers.restarts,
      0,
      'intentional termination is budget exempt',
    );
    await rejects(
      runtime.run(tasks.hang, null, { executionLease: 30 }),
      'PjsExecutionLeaseError',
    );
    equal(await runtime.run(tasks.echo, 43), 43);
    equal(runtime.stats().workers.restarts, 1);
    await rejects(
      runtime.run(tasks.silentClose, null, { executionLease: 30 }),
      'PjsExecutionLeaseError',
    );
    equal(await runtime.run(tasks.echo, 44), 44);
  });
  await test('all range termination paths and stream cleanup', async ({
    runtime,
    tasks,
  }) => {
    for (const method of [
      'partitionRange',
      'parallelFor',
      'parallelMapRange',
      'streamRange',
    ]) {
      const controller = new AbortController();
      let started = false;
      const operation = runtime[method](
        tasks.hang,
        range,
        () => ({ input: null }),
        {
          signal: controller.signal,
          cancellation: 'terminate',
          dispatchBatchSize: 2,
          onProgress() {
            started = true;
          },
        },
      );
      const pending = method === 'streamRange' ? operation.next() : operation;
      const cancelled = rejects(pending, 'PjsCancelledError');
      await until(() => started);
      controller.abort();
      await cancelled;
      if (method === 'streamRange') await operation.return();
      equal(await runtime.run(tasks.echo, method), method);
    }
    await rejects(
      runtime.run(tasks.hang, null, { timeout: 40, cancellation: 'terminate' }),
      'PjsTimeoutError',
    );
    equal(await runtime.run(tasks.echo, true), true);
  });
  await test(
    'shared async slots, exclusive drain cancellation and crash fanout',
    async ({ runtime, tasks }) => {
      const one = runtime.run(tasks.wait, { ms: 80, value: 1 });
      const two = runtime.run(tasks.wait, { ms: 80, value: 2 });
      await until(() => runtime.stats().workers.activeExecutions === 2);
      const controller = new AbortController();
      const exclusive = runtime.run(tasks.echo, 0, {
        cancellation: 'terminate',
        signal: controller.signal,
      });
      const cancelled = rejects(exclusive, 'PjsCancelledError');
      controller.abort();
      await cancelled;
      equal(await Promise.all([one, two]), [1, 2]);
      const a = rejects(runtime.run(tasks.hardFailure, null), 'PjsWorkerError');
      const b = rejects(
        runtime.run(tasks.wait, { ms: 1000, value: 1 }),
        'PjsWorkerError',
      );
      await Promise.all([a, b]);
      equal(await runtime.run(tasks.echo, 3), 3);
      equal(
        runtime.stats().workers.restarts,
        1,
        'one restart decision per endpoint',
      );
      const abort = new AbortController();
      let started = false;
      const exclusiveWork = rejects(
        runtime.run(tasks.hang, null, {
          cancellation: 'terminate',
          signal: abort.signal,
          onProgress() {
            started = true;
          },
        }),
        'PjsCancelledError',
      );
      await until(() => started);
      const peer = runtime.run(tasks.echo, 'unrelated');
      equal(
        runtime.stats().workers.activeExecutions,
        1,
        'destructive execution is exclusive',
      );
      abort.abort();
      await exclusiveWork;
      equal(await peer, 'unrelated');
    },
    { concurrency: 2 },
  );
  await test('reentrant clone abort, rollback and forced shutdown quiesce before retirement', async ({
    runtime,
    tasks,
  }) => {
    const controller = new AbortController();
    let inside = false;
    const input = {
      get value() {
        controller.abort();
        inside = true;
        equal(runtime.stats().containment.unconfirmedRetirements, 0);
        return 1;
      },
    };
    await rejects(
      runtime.run(tasks.echo, input, {
        signal: controller.signal,
        cancellation: 'terminate',
      }),
      'PjsCancelledError',
    );
    ok(inside);
    equal(await runtime.run(tasks.echo, 1), 1);
    const before = runtime.stats().containment.unconfirmedRetirements;
    const fail = new AbortController();
    await rejects(
      runtime.run(
        tasks.echo,
        {
          get value() {
            fail.abort();
            throw new Error('clone rollback');
          },
        },
        {
          signal: fail.signal,
          cancellation: 'terminate',
        },
      ),
      'PjsCancelledError',
    );
    equal(await runtime.run(tasks.echo, 2), 2);
    equal(
      runtime.stats().containment.unconfirmedRetirements,
      before,
      'failed post is not abandoned',
    );
    let shutdown;
    const pending = runtime.run(tasks.echo, {
      get value() {
        shutdown = runtime.shutdown({ drain: false });
        return 1;
      },
    });
    await rejects(pending, 'PjsCancelledError');
    await shutdown;
    equal(runtime.stats().tasks.pending, 0);
    equal(runtime.stats().workers.total, 0);
  });
  await test(
    'elastic endpoint retirement and graceful drain',
    async ({ runtime, tasks }) => {
      const pending = [1, 2, 3].map((value) =>
        runtime.run(tasks.wait, { ms: 50, value }),
      );
      await until(() => runtime.stats().workers.total === 3);
      equal(await Promise.all(pending), [1, 2, 3]);
      await until(() => runtime.stats().workers.total === 1);
      const work = runtime.run(tasks.wait, { ms: 20, value: 'drained' });
      const stop = runtime.shutdown();
      equal(await work, 'drained');
      await stop;
      equal(runtime.stats().workers.total, 0);
    },
    { workers: undefined, minWorkers: 1, maxWorkers: 3, idleTimeout: 30 },
  );
  await test(
    'elastic terminate retirement releases graceful shutdown without replacement or another pump',
    async ({ runtime, tasks }) => {
      const { dispatcher, controller } = runtime.components;
      const pool = dispatcher.pool;
      equal(runtime.stats().workers.total, 2);
      const nextWorkerId = pool.nextId;
      const started = Promise.withResolvers();
      const retirement = Promise.withResolvers();
      const release = Promise.withResolvers();
      const draining = Promise.withResolvers();
      const abort = new AbortController();
      const work = rejects(
        runtime.run(tasks.hang, null, {
          cancellation: 'terminate',
          signal: abort.signal,
          onProgress() {
            started.resolve();
          },
        }),
        'PjsCancelledError',
      );
      await started.promise;
      const worker = [...pool.workers.values()].find(
        (worker) => worker.hasPhysicalExecution,
      );
      const postingQuiescent = worker.callbacks.postingQuiescent;
      worker.callbacks.postingQuiescent = async (owner) => {
        await postingQuiescent(owner);
        equal(dispatcher.postings.size, 0);
        retirement.resolve();
        await release.promise;
      };
      const revoked = worker.callbacks.revoked;
      let notifications = 0;
      worker.callbacks.revoked = (owner, ids) => {
        // This also makes an ordering regression fail immediately, rather than
        // leaving the fixture's cleanup waiting on the same graceful promise.
        equal(
          owner.activeExecutions,
          0,
          'retirement notification sees committed occupancy',
        );
        notifications++;
        revoked(owner, ids);
      };
      const checkDrained = controller.checkDrained.bind(controller);
      controller.checkDrained = () => {
        checkDrained();
        if (controller.drainResolve) draining.resolve();
      };
      try {
        abort.abort();
        await Promise.all([work, retirement.promise]);
        equal(
          worker.activeExecutions,
          1,
          'pending retirement retains occupancy',
        );
        const shutdown = runtime.shutdown();
        await draining.promise;
        equal(pool.desired, 1);
        release.resolve();
        await shutdown; // No submission, external pump, forceAfter or forced stop.
        equal(notifications, 1);
        equal(
          pool.nextId,
          nextWorkerId,
          'no growth or replacement readiness event',
        );
        equal(pool.replacements, 0);
        equal(runtime.stats().containment.unconfirmedRetirements, 1);
        equal(runtime.stats().containment.shutdownEscalations, 0);
        equal(runtime.stats().state, 'stopped');
        equal(runtime.stats().workers.total, 0);
        equal(runtime.stats().workers.activeExecutions, 0);
      } finally {
        release.resolve();
      }
    },
    { workers: 2, minWorkers: 1, maxWorkers: 2, idleTimeout: 2147483647 },
  );
  for (const rollback of [false, true]) {
    await test(`binary posting ${rollback ? 'rollback' : 'commit'} retains credits through reentrant shutdown`, async ({
      runtime,
      tasks,
    }) => {
      const bytes = new Uint8Array([1]);
      let stop;
      const stream = runtime.streamRange(
        tasks.owned,
        { start: 0, end: 1, grainSize: 1 },
        () => ({
          input: {
            get bytes() {
              stop = runtime.shutdown({ drain: false });
              equal(
                runtime.stats().streamResults.currentReservedResultBytes,
                4,
              );
              equal(runtime.stats().containment.unconfirmedRetirements, 0);
              if (rollback) throw new Error('rollback clone');
              return 4;
            },
            buffer: bytes,
          },
          transferList: [bytes.buffer],
        }),
        { resultBytes: 4, maxReservedResultBytes: 4 },
      );
      await rejects(
        stream.next(),
        rollback ? 'PjsSerializationError' : 'PjsCancelledError',
      );
      await stop;
      equal(bytes.byteLength, rollback ? 1 : 0);
      equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
      equal(
        runtime.stats().containment.unconfirmedRetirements,
        rollback ? 0 : 1,
      );
      await stream.return();
    });
  }
  // Startup errors are fatal configuration failures, never a respawn loop.
  for (const [module, exportName] of [
    ['missing.js', 'default'],
    ['tasks.js', 'missing'],
    ['hanging.js', 'default'],
  ]) {
    const registry = new pjs.PjsTaskRegistry();
    const task = registry.register(
      'bad',
      new URL(`/app/${module}`, taskURL),
      exportName,
    );
    const runtime = new pjs.PjsRuntime({
      registry,
      workers: 1,
      workerURL,
      startupTimeout: 100,
    });
    const ready = rejects(runtime.ready(), 'PjsWorkerError');
    const work = rejects(runtime.run(task, 0), 'PjsWorkerError');
    await Promise.all([ready, work]);
    await runtime.shutdown({ drain: false });
    equal(runtime.stats().workers.restarts, 0);
  }
  results.push('startup import/export/timeout failures without respawn');
  for (const invalidProtocol of [false, true]) {
    const NativeWorker = globalThis.Worker;
    let terminations = 0;
    globalThis.Worker = class extends NativeWorker {
      postMessage(message, ...args) {
        if (message.type === 'initialize') {
          if (!invalidProtocol) throw new Error('initial posting failed');
          message = { ...message, browserProtocol: 0 };
        }
        return super.postMessage(message, ...args);
      }
      terminate() {
        terminations++;
        return super.terminate();
      }
    };
    try {
      const registry = new pjs.PjsTaskRegistry();
      registry.register('echo', taskURL, 'echo');
      const runtime = new pjs.PjsRuntime({ registry, workers: 1, workerURL });
      await rejects(runtime.ready(), 'PjsWorkerError');
      await runtime.shutdown({ drain: false });
      equal(terminations, 1);
      equal(runtime.stats().workers.total, 0);
      equal(runtime.stats().workers.restarts, 0);
    } finally {
      globalThis.Worker = NativeWorker;
    }
  }
  results.push(
    'initial posting failure and incompatible cached bootstrap clean once',
  );
  {
    const NativeWorker = globalThis.Worker;
    const endpoints = [];
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        endpoints.push(this);
      }
      terminate() {
        throw new Error('native termination rejected');
      }
    };
    try {
      const { runtime, tasks } = await setup();
      const stream = runtime.streamRange(
        tasks.owned,
        { start: 0, end: 1, grainSize: 1 },
        () => ({ input: { bytes: 4, ms: 1000 } }),
        { resultBytes: 4, maxReservedResultBytes: 4 },
      );
      const cancelled = rejects(stream.next(), 'PjsCancelledError');
      await until(() => runtime.stats().workers.activeExecutions === 1);
      await rejects(runtime.shutdown({ drain: false }));
      await cancelled;
      equal(
        runtime.stats().streamResults.currentReservedResultBytes,
        4,
        'failed termination retains ownership',
      );
      equal(runtime.stats().containment.unconfirmedRetirements, 0);
      equal(runtime.stats().containment.workerReplacements, 0);
    } finally {
      for (const endpoint of endpoints)
        NativeWorker.prototype.terminate.call(endpoint);
      globalThis.Worker = NativeWorker;
    }
    results.push('throwing native termination fails cleanup closed');
  }
  return { capability: caps, cases: results };
}
