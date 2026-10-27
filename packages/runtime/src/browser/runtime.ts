import { RuntimeFacade } from '../runtime-facade.js';
import { createRuntimeComponents } from '../composition/create-runtime-components.js';
import { createBrowserHost } from '../hosts/browser.js';
import { isWindowHost } from './capabilities.js';
import type { PjsRuntimeOptions, PjsRuntimeStats } from './types.js';

export class PjsRuntime extends RuntimeFacade<PjsRuntimeStats> {
  constructor(options: PjsRuntimeOptions) {
    if (!isWindowHost())
      throw new TypeError('Browser runtime creation requires a Window host');
    if ('resourceLimits' in options)
      throw new TypeError('resourceLimits is unsupported in browsers');
    const workerURL =
      options.workerURL ?? new URL('./bootstrap.js', import.meta.url);
    if (
      !(workerURL instanceof URL) ||
      !['http:', 'https:'].includes(workerURL.protocol) ||
      workerURL.origin !== location.origin
    )
      throw new TypeError(
        'workerURL requires a same-origin HTTP(S) PJS module bootstrap',
      );
    const components = createRuntimeComponents(
      options,
      createBrowserHost(new URL(workerURL.href)),
    );
    super(components, (stats) => {
      const details = stats.workers.details.map((state) => {
        const copy: Partial<typeof state> = { ...state };
        delete copy.threadId;
        return copy as Omit<typeof state, 'threadId'>;
      });
      const containment: Partial<typeof stats.containment> = {
        ...stats.containment,
      };
      delete containment.confirmedLeaseExits;
      return {
        ...stats,
        workers: { ...stats.workers, details },
        containment: {
          ...containment,
          unconfirmedRetirements:
            components.dispatcher.recoverySnapshot().unconfirmedRetirements!,
        } as PjsRuntimeStats['containment'],
      };
    });
  }
}
