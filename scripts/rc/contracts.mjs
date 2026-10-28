import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export function namedExports(root, path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(resolve(root, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  return source.statements
    .filter(ts.isExportDeclaration)
    .flatMap((statement) => {
      assert.ok(
        statement.exportClause && ts.isNamedExports(statement.exportClause),
        'Explicit exports required',
      );
      return statement.exportClause.elements.map((entry) => ({
        name: entry.name.text,
        kind: statement.isTypeOnly || entry.isTypeOnly ? 'type' : 'value',
        module: statement.moduleSpecifier.text,
      }));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
