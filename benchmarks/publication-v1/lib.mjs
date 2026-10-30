import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
export const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
export function observation(exe, args, cwd, timeout = 5000) {
  const r = spawnSync(exe, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  return {
    command: [exe, ...args],
    exitCode: r.status,
    error: r.error?.message,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}
export function checked(r) {
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.exitCode, 0, r.stderr + r.stdout);
  return r.stdout.trim();
}
export function command(exe, args, cwd, timeout = 120000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(exe, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '',
      stderr = '',
      error,
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (e) => {
      error = e.message;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command: [exe, ...args],
        cwd,
        exitCode,
        signal,
        error,
        timedOut,
        stdout,
        stderr,
        elapsedMs: Date.now() - start,
      });
    });
  });
}
export function files(root) {
  return readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(join(root, entry.name))
        : [join(root, entry.name)],
    );
}
export function manifest(root) {
  const entries = files(root)
    .filter((p) => p !== join(root, 'manifest.json'))
    .map((path) => ({
      path: relative(root, path).replaceAll('\\', '/'),
      sha256: sha256(path),
    }));
  writeJson(join(root, 'manifest.json'), entries);
  return entries;
}
export function verifyManifest(root) {
  for (const item of json(join(root, 'manifest.json')))
    assert.equal(sha256(join(root, item.path)), item.sha256, item.path);
}
