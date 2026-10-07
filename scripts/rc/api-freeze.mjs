import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  baseline,
  assertArguments,
  assertFrozenFiles,
  assertFrozenWorkspace,
} from './baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
assertArguments([]);
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
const source = ts.createSourceFile(
  'index.ts',
  readFileSync(resolve(root, 'packages/runtime/src/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const named = source.statements
  .filter(ts.isExportDeclaration)
  .flatMap((s) => {
    assert.ok(
      s.exportClause && ts.isNamedExports(s.exportClause),
      'Explicit exports required',
    );
    return s.exportClause.elements.map((e) => ({
      name: e.name.text,
      kind: s.isTypeOnly || e.isTypeOnly ? 'type' : 'value',
      module: s.moduleSpecifier.text,
    }));
  })
  .sort((a, b) => a.name.localeCompare(b.name));
assert.deepEqual(named, baseline.namedExports);
assert.deepEqual(
  Object.keys(await import('@pjavascript/runtime')).sort(),
  baseline.runtimeValues,
);
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
    runtimeFiles: Object.keys(baseline.runtimeSource).length,
    declarationFiles: Object.keys(baseline.declarations).length,
    sourceBytesIdentical: true,
    declarationBytesIdentical: true,
    manifestIdentical: true,
  }),
);
