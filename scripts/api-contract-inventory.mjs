import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

// Structural discovery, not a byte freeze. Policy remains in the canonical document.
const args = process.argv.slice(2);
assert.ok(
  args.every(
    (arg) =>
      arg === '--check' ||
      arg === '--entry=browser' ||
      arg.startsWith('--output='),
  ),
);
const browser = args.includes('--entry=browser');
const configuration = ts.readConfigFile(
  'packages/runtime/tsconfig.json',
  ts.sys.readFile,
);
assert.equal(configuration.error, undefined);
const parsed = ts.parseJsonConfigFileContent(
  configuration.config,
  ts.sys,
  'packages/runtime',
);
const format = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias;
const normalize = (text) => text.replace(/(__@\w+)@\d+/g, '$1');
const canonicalType = (text) => {
  const file = ts.createSourceFile(
    'type.ts',
    `type T = ${text};`,
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(file.parseDiagnostics.length, 0, `Unparseable type: ${text}`);
  const transformed = ts.transform(file, [
    (context) => {
      const visit = (node) => {
        const visited = ts.visitEachChild(node, visit, context);
        if (ts.isTypeLiteralNode(visited))
          return ts.factory.updateTypeLiteralNode(
            visited,
            [...visited.members].sort((a, b) =>
              (a.name?.getText(file) ?? '').localeCompare(
                b.name?.getText(file) ?? '',
              ),
            ),
          );
        if (ts.isUnionTypeNode(visited)) {
          const printer = ts.createPrinter();
          const key = (node) =>
            printer.printNode(ts.EmitHint.Unspecified, node, file);
          return ts.factory.updateUnionTypeNode(
            visited,
            [...visited.types].sort((a, b) => key(a).localeCompare(key(b))),
          );
        }
        return visited;
      };
      return visit;
    },
  ]);
  try {
    return ts.createPrinter().printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
};
const location = (node) => {
  const file = node.getSourceFile();
  return `${relative(process.cwd(), file.fileName).replaceAll('\\', '/')}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
};
const repositoryNode = (node) =>
  /packages\/runtime\/(src|dist)\//.test(
    node.getSourceFile().fileName.replaceAll('\\', '/'),
  );
const visible = (symbol) =>
  !symbol.declarations?.some(
    (node) =>
      ts.getCombinedModifierFlags(node) &
      (ts.ModifierFlags.Private | ts.ModifierFlags.Protected),
  );

function inspect(entry, options) {
  const program = ts.createProgram(
    entry.endsWith('.d.ts') ? [entry] : parsed.fileNames,
    options,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (name) => name,
      getNewLine: () => '\n',
    }),
  );
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(entry);
  assert.ok(file, `Build first: missing ${entry}`);
  const text = (type) => normalize(checker.typeToString(type, file, format));
  const exported = checker.getExportsOfModule(
    checker.getSymbolAtLocation(file),
  );
  const rootNames = new Set(exported.map((symbol) => symbol.name));
  const reachable = new Map();
  const seen = new Set();
  const at = (symbol) =>
    symbol.valueDeclaration ?? symbol.declarations?.[0] ?? file;
  const signatures = (type, kind) =>
    checker
      .getSignaturesOfType(type, kind)
      .map((signature) =>
        normalize(checker.signatureToString(signature, file, format)),
      );
  function visitSignature(signature) {
    for (const parameter of signature.getParameters())
      visit(checker.getTypeOfSymbolAtLocation(parameter, at(parameter)));
    visit(signature.getReturnType());
    for (const parameter of signature.typeParameters ?? []) {
      const constraint = checker.getBaseConstraintOfType(parameter);
      if (constraint) visit(constraint);
    }
  }
  function visit(type) {
    if (seen.has(type)) return;
    seen.add(type);
    for (const argument of type.aliasTypeArguments ?? []) visit(argument);
    if (type.objectFlags & ts.ObjectFlags.Reference)
      for (const argument of checker.getTypeArguments(type)) visit(argument);
    if (type.isUnionOrIntersection())
      for (const member of type.types) visit(member);
    for (const symbol of [type.aliasSymbol, type.getSymbol()]) {
      const declaration = symbol?.declarations?.find(
        (node) =>
          repositoryNode(node) &&
          (ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isClassDeclaration(node)),
      );
      if (declaration && !rootNames.has(symbol.name))
        reachable.set(symbol.name, {
          id: `REACH.${symbol.name}`,
          name: symbol.name,
          location: location(declaration),
          type: text(checker.getDeclaredTypeOfSymbol(symbol)),
          definition: declaration.getText().replace(/\s+/g, ' '),
        });
    }
    for (const signature of type.getCallSignatures()) visitSignature(signature);
    const properties = type
      .getProperties()
      .filter(
        (property) =>
          visible(property) && property.declarations?.some(repositoryNode),
      );
    for (const property of properties)
      visit(checker.getTypeOfSymbolAtLocation(property, at(property)));
  }
  const roots = exported
    .map((exportedSymbol) => {
      const symbol =
        exportedSymbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exportedSymbol)
          : exportedSymbol;
      const declaration = at(symbol);
      const kind =
        symbol.flags & ts.SymbolFlags.Class
          ? 'class'
          : symbol.flags & ts.SymbolFlags.Function
            ? 'function'
            : 'type';
      const value =
        kind !== 'type'
          ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
          : undefined;
      const type =
        kind === 'function' ? value : checker.getDeclaredTypeOfSymbol(symbol);
      visit(type);
      for (const signature of value?.getConstructSignatures() ?? [])
        visitSignature(signature);
      const members = type
        .getProperties()
        .filter(
          (property) =>
            visible(property) && property.declarations?.some(repositoryNode),
        )
        .map((property) => ({
          id: `MEM.${symbol.name}.${normalize(property.name)}`,
          name: normalize(property.name),
          location: location(at(property)),
          optional: Boolean(property.flags & ts.SymbolFlags.Optional),
          readonly: Boolean(
            ts.getCombinedModifierFlags(at(property)) &
            ts.ModifierFlags.Readonly,
          ),
          type: text(checker.getTypeOfSymbolAtLocation(property, at(property))),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: `ROOT.${symbol.name}`,
        name: symbol.name,
        kind,
        location: location(declaration),
        definition: kind === 'type' ? text(type) : undefined,
        calls: signatures(type, ts.SignatureKind.Call),
        constructors: value
          ? signatures(value, ts.SignatureKind.Construct)
          : [],
        members,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const runtime = exported.find((symbol) => symbol.name === 'PjsRuntime');
  const runtimeType = checker.getDeclaredTypeOfSymbol(
    checker.getAliasedSymbol(runtime),
  );
  const stats = runtimeType.getProperty('stats');
  const statsType = checker
    .getTypeOfSymbolAtLocation(stats, at(stats))
    .getCallSignatures()[0]
    .getReturnType();
  const statsFields = [];
  function fields(type, path = '', optional = false, origin) {
    const nonNull = checker.getNonNullableType(type);
    if (checker.isArrayType(nonNull)) {
      fields(
        checker.getTypeArguments(nonNull)[0],
        path + '[]',
        optional,
        origin,
      );
      return;
    }
    const properties = nonNull
      .getProperties()
      .filter((property) => property.declarations?.some(repositoryNode));
    if (properties.length === 0) {
      statsFields.push({
        id: `STAT.${path}`,
        path,
        type: text(type),
        optional,
        location: origin ? location(origin) : location(at(stats)),
      });
      return;
    }
    for (const property of properties)
      fields(
        checker.getTypeOfSymbolAtLocation(property, at(property)),
        path ? `${path}.${property.name}` : property.name,
        optional || Boolean(property.flags & ts.SymbolFlags.Optional),
        at(property),
      );
  }
  fields(statsType);
  return {
    roots,
    reachable: [...reachable.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    statsFields: statsFields.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

const entryPath = browser ? 'browser/index' : 'index';
const source = inspect(`packages/runtime/src/${entryPath}.ts`, {
  ...parsed.options,
  noEmit: true,
});
const declarations = inspect(`packages/runtime/dist/${entryPath}.d.ts`, {
  ...parsed.options,
  rootDir: undefined,
  noEmit: true,
});
const withoutLocation = ({ location, ...entry }) => {
  void location;
  return entry;
};
const shape = ({ roots, reachable, statsFields }) => ({
  roots: roots.map((entry) => ({
    ...withoutLocation(entry),
    definition: entry.definition ? canonicalType(entry.definition) : undefined,
    members: entry.members.map((member) => ({
      ...withoutLocation(member),
      type: canonicalType(member.type),
    })),
  })),
  reachable: reachable.map(({ name, type }) => ({
    name,
    type: canonicalType(type),
  })),
  statsFields: statsFields.map((field) => ({
    ...withoutLocation(field),
    type: canonicalType(field.type),
  })),
});
const sourceShape = shape(source);
const declarationShape = shape(declarations);
if (JSON.stringify(sourceShape) !== JSON.stringify(declarationShape)) {
  const differing = sourceShape.roots
    .filter(
      (root, index) =>
        JSON.stringify(root) !== JSON.stringify(declarationShape.roots[index]),
    )
    .map(({ name }) => name);
  console.error(
    JSON.stringify({
      differing,
      reachableEqual:
        JSON.stringify(sourceShape.reachable) ===
        JSON.stringify(declarationShape.reachable),
      statsEqual:
        JSON.stringify(sourceShape.statsFields) ===
        JSON.stringify(declarationShape.statsFields),
    }),
  );
  throw new Error('Source/declaration public shape drift');
}
const sourceFiles = programFiles();
function programFiles() {
  return parsed.fileNames.flatMap((file) => {
    const contents = readFileSync(file, 'utf8');
    return [...contents.matchAll(/experimental[A-Z][A-Za-z]+/g)].map(
      (match) => ({
        name: match[0],
        file: file.replaceAll('\\', '/'),
        line: contents.slice(0, match.index).split('\n').length,
      }),
    );
  });
}
const result = {
  entry: browser ? '@pjavascript/runtime/browser' : '@pjavascript/runtime',
  method:
    'Locked TypeScript checker; supported root declarations plus repository-owned signature-reachable types and statistics leaves; standard-library graphs and emitted private fields excluded.',
  counts: {
    rootExports: source.roots.length,
    values: source.roots.filter(({ kind }) => kind !== 'type').length,
    typeOnly: source.roots.filter(({ kind }) => kind === 'type').length,
    reachableNamedTypes: source.reachable.length,
    statsLeafPaths: source.statsFields.length,
  },
  source,
  declarations,
  experimentalNames: [...new Set(sourceFiles.map(({ name }) => name))].sort(),
  experimentalOccurrences: sourceFiles,
};
const entries = (source) => [
  ...source.roots,
  ...source.roots.flatMap(({ members }) => members),
  ...source.reachable,
  ...source.statsFields,
];
if (browser) {
  const node = inspect('packages/runtime/src/index.ts', {
    ...parsed.options,
    noEmit: true,
  });
  const baseline = new Map(entries(node).map((entry) => [entry.id, entry]));
  const changedRoots = new Set(['PjsRuntime', 'PjsTaskRegistry']);
  const comparable = (entry) =>
    JSON.stringify(entry, (key, value) =>
      key === 'location'
        ? undefined
        : typeof value === 'string'
          ? value.replaceAll('import("../', 'import("./')
          : value,
    );
  for (const root of source.roots)
    if (comparable(root) !== comparable(baseline.get(root.id)))
      changedRoots.add(root.name);
  result.browserContracts = entries(source)
    .filter(
      (entry) =>
        (entry.id.startsWith('ROOT.') && changedRoots.has(entry.name)) ||
        (entry.id.startsWith('MEM.') &&
          changedRoots.has(entry.id.split('.')[1])) ||
        comparable(entry) !== comparable(baseline.get(entry.id)),
    )
    .map((entry) => ({ ...entry, id: `BROWSER.${entry.id}` }));
  result.sharedContractIds = entries(source)
    .filter(
      (entry) =>
        !result.browserContracts.some(
          (changed) => changed.id === `BROWSER.${entry.id}`,
        ),
    )
    .map(({ id }) => id);
  result.omittedNodeContractIds = entries(node)
    .filter(
      (entry) =>
        !entries(source).some((candidate) => candidate.id === entry.id),
    )
    .map(({ id }) => id);
}
if (args.includes('--check')) {
  const inventory = readFileSync(
    'docs/research/v1-api-contract-inventory.md',
    'utf8',
  );
  for (const entry of browser
    ? [
        ...result.browserContracts,
        ...result.sharedContractIds.map((id) => ({ id })),
      ]
    : entries(source))
    assert.ok(
      inventory.includes('`' + entry.id + '`'),
      `Inventory missing ${entry.id}`,
    );
}
const output = args.find((arg) => arg.startsWith('--output='))?.slice(9);
if (output) {
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  });
}
console.log(
  JSON.stringify({
    ...result.counts,
    experimentalNames: result.experimentalNames,
    sourceDeclarationParity: true,
  }),
);
