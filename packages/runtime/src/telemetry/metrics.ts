export class Metrics {
  accepted = 0;
  rejected = 0;
  completed = 0;
  failed = 0;
  cancelled = 0;
  timedOut = 0;
  private queueTotal = 0;
  private queueSamples = 0;
  private executionTotal = 0;
  private executionSamples = 0;
  private totalLatency = 0;
  private settledSamples = 0;

  scheduled(queueMs: number): void {
    this.queueTotal += queueMs;
    this.queueSamples++;
  }
  executed(executionMs: number): void {
    this.executionTotal += executionMs;
    this.executionSamples++;
  }
  settled(totalMs: number): void {
    this.totalLatency += totalMs;
    this.settledSamples++;
  }
  timing() {
    return {
      averageQueueMs: this.queueSamples
        ? this.queueTotal / this.queueSamples
        : 0,
      averageExecutionMs: this.executionSamples
        ? this.executionTotal / this.executionSamples
        : 0,
      averageTotalMs: this.settledSamples
        ? this.totalLatency / this.settledSamples
        : 0,
      queueSamples: this.queueSamples,
      executionSamples: this.executionSamples,
      settledSamples: this.settledSamples,
    };
  }
}
