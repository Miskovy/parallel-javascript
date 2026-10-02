import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.md'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  ),
];
const failures = [];
let checked = 0;
for (const file of files) {
  const source = readFileSync(resolve(root, file), 'utf8').replace(
    /```[\s\S]*?```/g,
    '',
  );
  const links = [
    ...source.matchAll(
      /\]\(([^\s)]+)(?:\s+"[^"]*")?\)|href="([^"]+)"|^\[[^\]]+\]:\s*(\S+)/gm,
    ),
  ];
  for (const match of links) {
    const link = match[1] ?? match[2] ?? match[3];
    if (/^(?:[a-z]+:|\/\/)/i.test(link)) continue;
    const [path, fragment] = decodeURIComponent(
      link.replace(/^<|>$/g, ''),
    ).split('#');
    const target = resolve(root, dirname(file), path || file.split('/').at(-1));
    checked++;
    if (!existsSync(target)) {
      failures.push(`${file}: missing ${link}`);
      continue;
    }
    if (fragment && target.endsWith('.md') && statSync(target).isFile()) {
      const document = readFileSync(target, 'utf8');
      const headings = [...document.matchAll(/^#{1,6}\s+(.+)$/gm)].map((item) =>
        item[1]
          .toLowerCase()
          .replace(/<[^>]*>/g, '')
          .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
          .replace(/\s/g, '-'),
      );
      const anchors = [...document.matchAll(/(?:id|name)="([^"]+)"/g)].map(
        (item) => item[1],
      );
      if (![...headings, ...anchors].includes(fragment))
        failures.push(`${file}: missing anchor ${link}`);
    }
  }
}
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const example = readFileSync(
  resolve(root, 'examples/basic-run.mjs'),
  'utf8',
).trim();
assert.ok(
  readme.includes(example),
  'README basic-run must match the executable example',
);
assert.deepEqual(failures, [], failures.join('\n'));
console.log(
  `Checked ${checked} local links in ${files.length} Markdown files; README example matches executable source.`,
);
