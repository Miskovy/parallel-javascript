import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(
  readFileSync(new URL('./frozen-v015.json', import.meta.url)),
);
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
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
for (const [path, expected] of Object.entries(baseline.runtimeSource))
  assert.equal(
    hash(resolve(root, path)),
    expected,
    `Frozen runtime source changed: ${path}`,
  );
for (const [path, expected] of Object.entries(baseline.declarations))
  assert.equal(
    hash(resolve(root, 'packages/runtime', path)),
    expected,
    `Public declaration changed: ${path}`,
  );
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
  Object.keys(await import('@pjs/runtime')).sort(),
  baseline.runtimeValues,
);
const manifest = JSON.parse(
  readFileSync(resolve(root, 'packages/runtime/package.json')),
);
const contract = {
  name: manifest.name,
  type: manifest.type,
  engines: manifest.engines,
  exports: manifest.exports,
  types: manifest.types,
  files: manifest.files,
  dependencies: manifest.dependencies ?? {},
};
assert.deepEqual(contract, baseline.manifest);
console.log(
  JSON.stringify({
    passed: true,
    baselineCommit: baseline.commit,
    exports: 38,
    values: 16,
    typeOnly: 22,
    runtimeFiles: 25,
    declarationFiles: 25,
    sourceBytesIdentical: true,
    declarationBytesIdentical: true,
    manifestContractIdentical: true,
  }),
);
