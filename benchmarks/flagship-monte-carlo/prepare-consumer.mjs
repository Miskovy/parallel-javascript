import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { provenance } from './src/provenance.mjs';

export const repository = fileURLToPath(new URL('../../', import.meta.url));
export const consumer = fileURLToPath(
  new URL('../../.node-tools/flagship-monte-carlo/consumer/', import.meta.url),
);

export function command(file, args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '',
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 || timedOut)
        reject(
          new Error(
            `Child failure code=${code} signal=${signal} timeout=${timedOut}\n${stderr}\n${stdout}`,
          ),
        );
      else resolve(stdout.trim());
    });
  });
}

export async function prepare() {
  await mkdir(consumer, { recursive: true });
  for (const name of ['src', 'config.mjs'])
    await cp(new URL(name, import.meta.url), `${consumer}/${name}`, {
      recursive: true,
    });
  for (const name of ['package.json', 'package-lock.json'])
    await cp(
      new URL(`sandbox/${name}`, import.meta.url),
      `${consumer}/${name}`,
    );
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const resolved = JSON.parse(
    await command(
      npm,
      [
        'view',
        '@pjavascript/runtime@next',
        'version',
        'dist',
        '--json',
        '--registry=https://registry.npmjs.org/',
        '--fetch-retries=0',
        '--fetch-timeout=20000',
        '--cache',
        `${repository}/.node-tools/flagship-monte-carlo/npm-cache`,
      ],
      consumer,
    ),
  );
  if (resolved.version !== '1.0.0-rc.2')
    throw new Error(
      `Public next changed: ${resolved.version}; campaign pins rc.2 and requires review`,
    );
  const lock = JSON.parse(
    await readFile(`${consumer}/package-lock.json`, 'utf8'),
  );
  if (
    lock.packages['node_modules/@pjavascript/runtime'].integrity !==
    resolved.dist.integrity
  )
    throw new Error('Registry integrity disagrees with lock');
  await command(
    npm,
    [
      'ci',
      '--ignore-scripts',
      '--workspaces=false',
      '--registry=https://registry.npmjs.org/',
      '--fetch-retries=0',
      '--fetch-timeout=20000',
      '--cache',
      `${repository}/.node-tools/flagship-monte-carlo/npm-cache`,
    ],
    consumer,
  );
  const packages = provenance(consumer);
  const metadata = {
    requestedTag: '@pjavascript/runtime@next',
    resolvedTag: resolved.version,
    registry: 'https://registry.npmjs.org/',
    dist: resolved.dist,
    packages,
  };
  await writeFile(
    `${consumer}/provenance.json`,
    JSON.stringify(metadata, null, 2) + '\n',
  );
  console.log(JSON.stringify(metadata, null, 2));
  return metadata;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await prepare();
