import type {
  WorkerConnection,
  NodeWorkerConnection,
  BrowserWorkerConnection,
  NodeWorkerServices,
  BrowserWorkerServices,
  TaskServices,
  RangeServices,
  PoolServices,
  DispatchServices,
} from '../dist/hosts/contracts.js';
import type { BootstrapData } from '../dist/workers/protocol.js';

// Compiler-only ownership boundaries, checked by both locked compilers.
function contracts(
  node: NodeWorkerConnection,
  browser: BrowserWorkerConnection,
  connection: WorkerConnection,
  nodeServices: NodeWorkerServices,
  browserServices: BrowserWorkerServices,
  task: TaskServices,
  range: RangeServices,
  pool: PoolServices,
  dispatcher: DispatchServices,
  data: BootstrapData,
) {
  const exit: Promise<number> = node.thread.terminate();
  const revoke: void = browser.thread.terminate();
  const messages = { message() {}, messageError() {}, error() {} };
  node.listen({
    ...messages,
    exit(code) {
      const value: number = code;
      void value;
    },
  });
  browser.listen(messages);
  // @ts-expect-error Browser revocation is not an observable native join.
  const join: Promise<number> = browser.thread.terminate();
  // @ts-expect-error Browser endpoints expose no Node thread observation.
  void browser.thread.threadId;
  // @ts-expect-error An exit callback is unsupported on a browser connection.
  browser.listen({ ...messages, exit() {} });
  // @ts-expect-error Node transports must wire confirmed-exit observations.
  node.listen(messages);
  // @ts-expect-error Browser connections cannot substitute for Node lifecycle evidence.
  const invalidNode: NodeWorkerConnection = browser;
  if (connection.lifecycle === 'confirmed-exit') {
    const joined: Promise<number> = connection.thread.terminate();
    void joined;
  } else {
    // @ts-expect-error The discriminator does not certify browser exit.
    const joined: Promise<number> = connection.thread.terminate();
    void joined;
  }
  nodeServices.create(data, { maxOldGenerationSizeMb: 64 });
  nodeServices.profiling.timestampNs();
  browserServices.create(data);
  // @ts-expect-error Resource limits are absent from the browser transport contract.
  browserServices.create(data, { maxOldGenerationSizeMb: 64 });
  // @ts-expect-error No throwing browser profiling stub masquerades as a capability.
  browserServices.profiling.timestampNs();
  // @ts-expect-error Logical task coordination cannot construct workers.
  task.worker.create(data);
  // @ts-expect-error Range production cannot change recovery policy.
  void range.recovery;
  // @ts-expect-error Pool lifecycle does not own logical task IDs.
  pool.id();
  // @ts-expect-error Dispatch cannot reconstruct input through host services.
  dispatcher.snapshotTransferList([]);
  // @ts-expect-error Dispatch gets profiling availability, not the native clock.
  dispatcher.profiling?.timestampNs();
  // @ts-expect-error Capabilities are immutable after assembly.
  task.sharedMemory = true;
  void [exit, revoke, join, invalidNode];
}
void contracts;
