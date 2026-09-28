import { execute } from './kernel.mjs';

export default function dispatchEfficiencyTask(input) {
  return input.batchItems
    ? input.batchItems.map((item) => execute(item))
    : execute(input);
}
