// Discover every .test.mjs below scripts/test, including nested integration suites.
// Use stable ordering and Node's built-in test runner. No providers or network calls.
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function discover(directory) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const paths = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await discover(path));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) paths.push(path);
  }
  return paths;
}

const files = await discover(fileURLToPath(new URL('./test/', import.meta.url)));
if (files.length === 0) {
  console.error('No *.test.mjs files found in scripts/test');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) {
  console.error('Test runner failed:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
