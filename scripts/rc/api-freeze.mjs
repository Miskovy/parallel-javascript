import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { namedExports } from './contracts.mjs';
import {
  baselineForWorkspace,
  assertArguments,
  assertFrozenFiles,
  assertFrozenWorkspace,
} from './baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
assertArguments([]);
const baseline = baselineForWorkspace(root);
assertFrozenWorkspace(root);
assertFrozenFiles(root);
for (const path of Object.keys(baseline.runtimeSource)) {
  const tree = ts.createSourceFile(
    path,
    readFileSync(resolve(root, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const walk = (node) => {
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      ts.isIdentifier(node.expression)
    )
      assert.ok(
        !['eval', 'Function'].includes(node.expression.text),
        `Source evaluation in production: ${path}`,
      );
    ts.forEachChild(node, walk);
  };
  walk(tree);
}
const named = namedExports(root, 'packages/runtime/src/index.ts');
assert.deepEqual(named, baseline.namedExports);
assert.deepEqual(
  Object.keys(await import('@pjavascript/runtime')).sort(),
  baseline.runtimeValues,
);
if (baseline.browserNamedExports) {
  assert.deepEqual(
    namedExports(root, 'packages/runtime/src/browser/index.ts'),
    baseline.browserNamedExports,
  );
  assert.deepEqual(
    Object.keys(await import('@pjavascript/runtime/browser')).sort(),
    baseline.browserRuntimeValues,
  );
}
const manifest = JSON.parse(
  readFileSync(resolve(root, 'packages/runtime/package.json')),
);
assert.deepEqual(
  manifest,
  baseline.manifest,
  'Frozen package manifest changed',
);
console.log(
  JSON.stringify({
    passed: true,
    release: baseline.release,
    runtimeSourceCommit: baseline.runtimeSourceCommit,
    exports: named.length,
    values: baseline.runtimeValues.length,
    typeOnly: named.filter((entry) => entry.kind === 'type').length,
    runtimeReferenceCommit: baseline.runtimeReferenceCommit,
    runtimeTestFiles: Object.keys(baseline.runtimeTests).length,
    runtimeFiles: Object.keys(baseline.runtimeSource).length,
    declarationFiles: Object.keys(baseline.declarations).length,
    sourceBytesIdentical: true,
    declarationBytesIdentical: true,
    manifestIdentical: true,
  }),
);
