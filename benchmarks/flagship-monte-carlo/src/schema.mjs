import assert from 'node:assert/strict';

export function validateTrial(row) {
  assert.equal(row.type, 'trial');
  assert.ok(['ok', 'failure'].includes(row.status));
  for (const field of [
    'campaign',
    'stage',
    'contender',
    'transport',
    'mode',
    'problemSize',
  ])
    assert.equal(typeof row[field], 'string');
  for (const field of [
    'simulations',
    'positions',
    'factors',
    'workers',
    'chunks',
    'trial',
  ])
    assert.ok(Number.isSafeInteger(row[field]) && row[field] > 0, field);
  assert.ok(row.environment && row.packages);
  if (row.status === 'failure') {
    assert.equal(typeof row.error, 'string');
    return row;
  }
  for (const field of [
    'wallMs',
    'simulationMs',
    'reductionMs',
    'cpuUserMs',
    'cpuSystemMs',
    'peakRssBytes',
  ])
    assert.ok(Number.isFinite(row[field]) && row[field] >= 0, field);
  assert.equal(row.resultValidation.count, row.simulations);
  assert.equal(row.tasks.length, row.chunks);
  let offset = 0;
  row.tasks.forEach((task, id) => {
    assert.equal(task.id, id);
    assert.equal(task.start, offset);
    assert.ok(task.end > offset);
    offset = task.end;
    assert.ok(task.completed >= task.submitted);
    assert.ok(task.workerEnd >= task.workerStart);
  });
  assert.equal(offset, row.simulations);
  assert.equal(row.cleanup, true);
  return row;
}
