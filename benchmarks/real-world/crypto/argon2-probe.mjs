// Standalone investigation of native async submission; no PJS import or runtime.
import { argon2, scrypt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';

const observations = [];
for (const kind of ['scrypt', 'argon2']) {
  for (let trial = 0; trial < 8; trial++) {
    const starts = [];
    const callbackMs = [];
    let timerMs;
    const begin = performance.now();
    const timer = delay(10).then(() => {
      timerMs = performance.now() - begin;
    });
    const pending = Array.from(
      { length: 4 },
      (_, index) =>
        new Promise((resolve, reject) => {
          const start = performance.now();
          const done = (error, result) => {
            callbackMs[index] = performance.now() - begin;
            if (error) reject(error);
            else resolve(result.toString('hex'));
          };
          if (kind === 'argon2')
            argon2(
              'argon2id',
              {
                message: 'synthetic benchmark-only password',
                nonce: new Uint8Array(16).fill(0x13),
                memory: 65536,
                passes: 3,
                tagLength: 32,
                parallelism: 1,
              },
              done,
            );
          else
            scrypt(
              'synthetic benchmark-only password',
              new Uint8Array(16).fill(0x13),
              32,
              { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 ** 2 },
              done,
            );
          starts.push(performance.now() - start);
        }),
    );
    const values = await Promise.all(pending);
    if (!values.every((value) => value === values[0]))
      throw new Error('Outputs disagree');
    const wallMs = performance.now() - begin;
    await timer;
    observations.push({
      kind,
      trial,
      warmup: trial < 2,
      submitCallMs: starts,
      callbackMs,
      timer10msFiredAtMs: timerMs,
      wallMs,
    });
    await delay(20);
  }
}
const result = {
  node: process.version,
  openssl: process.versions.openssl,
  purpose:
    'Native API submission diagnosis, not a replacement for controlled workload results',
  observations,
};
if (process.argv[2])
  await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  });
else console.log(JSON.stringify(result, null, 2));
