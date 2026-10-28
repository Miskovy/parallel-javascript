import assert from 'node:assert/strict';
import { assertArtifact } from '../rc/artifact.mjs';
import { assertFrozenWorkspace, assertFrozenFiles } from '../rc/baseline.mjs';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer, build, preview } from 'vite';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = await mkdtemp(join(tmpdir(), 'pjs-browser-'));
const consumer = join(temporary, 'consumer');
const fixture = join(root, 'scripts/browser/fixtures');
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run through npm run test:browser');
const command = (args, cwd = root) =>
  execFileSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: join(temporary, 'cache') },
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const headers = (isolated) =>
  isolated
    ? {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }
    : {};
let browser;
const cleanup = [];
try {
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    '{"private":true,"type":"module"}',
  );
  const staged = process.env.PJS_CANDIDATE_TARBALL;
  let packed;
  if (staged) {
    assertFrozenWorkspace(root);
    assertFrozenFiles(root);
    const artifact = assertArtifact(resolve(staged));
    packed = artifact.packed;
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(git('status', '--short'), '');
    console.log(
      JSON.stringify({
        sourceCommit: git('rev-parse', 'HEAD'),
        sourceTree: git('rev-parse', 'HEAD^{tree}'),
        artifactSha256: artifact.sha256,
      }),
    );
  } else {
    [packed] = JSON.parse(
      command([
        npm,
        'pack',
        '--workspace',
        '@pjavascript/runtime',
        '--pack-destination',
        temporary,
        '--json',
      ]),
    );
  }
  command(
    [
      npm,
      'install',
      staged ? resolve(staged) : join(temporary, packed.filename),
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    consumer,
  );
  const installed = join(consumer, 'node_modules/@pjavascript/runtime');
  // A consumer without a Node type package: both locked compilers, no skipLibCheck.
  await cp(join(fixture, 'consumer.ts'), join(consumer, 'consumer.ts'));
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        types: [],
        lib: ['ES2022', 'DOM'],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
      },
      files: ['consumer.ts'],
    }),
  );
  for (const compiler of ['@typescript/native/bin/tsc', 'typescript/bin/tsc6'])
    command([
      join(root, 'node_modules', compiler),
      '-p',
      join(consumer, 'tsconfig.json'),
    ]);
  // Follow installed static imports/reexports, including declaration-only edges.
  for (const entry of [
    'browser/index.js',
    'browser/bootstrap.js',
    'browser/index.d.ts',
  ]) {
    const seen = new Set();
    const visit = async (path) => {
      if (seen.has(path)) return;
      seen.add(path);
      const text = await readFile(path, 'utf8');
      const file = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const inspect = async (node) => {
        if (ts.isIdentifier(node))
          assert.ok(
            !['process', 'Buffer', 'NodeJS'].includes(node.text),
            `${path}: Node global ${node.text}`,
          );
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier
        ) {
          const specifier = node.moduleSpecifier.text;
          assert.ok(
            specifier.startsWith('.'),
            `${path}: nonportable import ${specifier}`,
          );
          const dependency = resolve(dirname(path), specifier);
          await visit(
            path.endsWith('.d.ts')
              ? dependency.replace(/\.js$/, '.d.ts')
              : dependency,
          );
        }
        const children = [];
        ts.forEachChild(node, (child) => {
          children.push(child);
        });
        for (const child of children) await inspect(child);
      };
      await inspect(file);
    };
    await visit(join(installed, 'dist', entry));
    console.log(`Installed Node-free graph ${entry}: ${seen.size} modules`);
  }
  // Importing either entry must create no workers, even in a non-Window host.
  command(
    [
      '--input-type=module',
      '-e',
      `const p = await import('@pjavascript/runtime/browser'); if(p.browserCapabilities().windowHost) throw Error('Window invented'); try { new p.PjsRuntime({registry:new p.PjsTaskRegistry()}); throw Error('constructed'); } catch(e) { if(e.message === 'constructed') throw e; }`,
    ],
    consumer,
  );
  const publicDirectory = join(consumer, 'public');
  await mkdir(join(publicDirectory, 'vendor'), { recursive: true });
  await cp(join(installed, 'dist'), join(publicDirectory, 'vendor/pjs'), {
    recursive: true,
  });
  await cp(join(fixture, 'tasks.js'), join(publicDirectory, 'tasks.js'));
  await cp(join(fixture, 'hanging.js'), join(publicDirectory, 'hanging.js'));
  await cp(join(fixture, 'cases.js'), join(publicDirectory, 'cases.js'));
  // A separately emitted browser-ready task asset; worker helper identity stays canonical.
  await cp(join(fixture, 'tasks.js'), join(consumer, 'tasks.js'));
  await writeFile(
    join(consumer, 'index.html'),
    '<!doctype html><title>PJS Vite</title><script type="module" src="/host.js"></script>',
  );
  await writeFile(
    join(consumer, 'host.js'),
    `import * as pjs from '@pjavascript/runtime/browser';
import taskURL from './tasks.js?url&no-inline';
globalThis.pjsFixture = { pjs, taskURL: new URL(taskURL, location.href).href,
workerURL: new URL(import.meta.env.BASE_URL+'vendor/pjs/browser/bootstrap.js', location.href).href };`,
  );
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  console.log(
    `Actual browser: Chromium ${browser.version()}; Node ${process.versions.node}`,
  );
  const exercise = async (url, isolated, vite = false) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    try {
      await page.goto(url);
      if (vite) await page.waitForFunction(() => globalThis.pjsFixture);
      const result = await page.evaluate(
        async ({ vite }) => {
          const initial = globalThis.Worker;
          let created = 0;
          globalThis.Worker = class extends initial {
            constructor(...args) {
              super(...args);
              created++;
            }
          };
          try {
            const pjs = vite
              ? globalThis.pjsFixture.pjs
              : await import('/app/vendor/pjs/browser/index.js');
            if (created !== 0) throw new Error('Import created workers');
            const taskURL = new URL(
              vite ? globalThis.pjsFixture.taskURL : '/app/tasks.js',
              globalThis.location.href,
            );
            const workerURL = vite
              ? new URL(globalThis.pjsFixture.workerURL)
              : undefined;
            const { runCases } = await import('/app/cases.js');
            return await runCases(pjs, taskURL, workerURL);
          } finally {
            globalThis.Worker = initial;
          }
        },
        { vite },
      );
      assert.equal(result.capability.sharedMemory, isolated);
      assert.deepEqual(errors, []);
      console.log(
        `${vite ? 'Vite' : 'Native'} ${isolated ? 'isolated' : 'non-isolated'}: ${result.cases.length} behavioral cases passed`,
      );
      return result;
    } finally {
      await page.close();
    }
  };
  for (const isolated of [false, true]) {
    const server = createServer(async (request, response) => {
      try {
        const path = new URL(request.url, 'http://localhost').pathname;
        const target = resolve(
          publicDirectory,
          '.' + path.slice('/app'.length),
        );
        if (
          !path.startsWith('/app/') ||
          (target !== publicDirectory &&
            !target.startsWith(publicDirectory + sep))
        ) {
          response.writeHead(404);
          response.end();
          return;
        }
        if (path === '/app/') {
          response.writeHead(200, {
            ...headers(isolated),
            'Content-Type': 'text/html',
          });
          response.end('<!doctype html><title>PJS Native</title>');
          return;
        }
        const contents = await readFile(target);
        response.writeHead(200, {
          ...headers(isolated),
          'Content-Type': 'text/javascript',
        });
        response.end(contents);
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await exercise(
        `http://127.0.0.1:${server.address().port}/app/`,
        isolated,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
  const config = {
    root: consumer,
    base: '/app/',
    configFile: false,
    logLevel: 'warn',
  };
  const dev = await createViteServer({
    ...config,
    server: { host: '127.0.0.1', port: 0, headers: headers(false) },
  });
  cleanup.push(() => dev.close());
  await dev.listen();
  await exercise(
    `http://127.0.0.1:${dev.httpServer.address().port}/app/`,
    false,
    true,
  );
  await dev.close();
  cleanup.pop();
  await build(config);
  const production = await preview({
    ...config,
    preview: { host: '127.0.0.1', port: 0, headers: headers(true) },
  });
  cleanup.push(
    () => new Promise((resolve) => production.httpServer.close(resolve)),
  );
  await exercise(
    `http://127.0.0.1:${production.httpServer.address().port}/app/`,
    true,
    true,
  );
} finally {
  for (const close of cleanup.reverse()) await close();
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
