import { RuntimeFacade } from './runtime-facade.js';
import { createRuntimeComponents } from './composition/create-runtime-components.js';
import { projectNodeStatistics } from './hosts/node-statistics.js';
import { nodeHost } from './hosts/node.js';
import type { PjsRuntimeOptions } from './configuration/runtime-options.js';
export type { PjsRuntimeOptions } from './configuration/runtime-options.js';

/** Node binding; import and require reach this same constructor. */
export class PjsRuntime extends RuntimeFacade {
  constructor(options: PjsRuntimeOptions) {
    super(createRuntimeComponents(options, nodeHost), projectNodeStatistics);
  }
}
