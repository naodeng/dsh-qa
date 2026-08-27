import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? collect(file) : entry.name.endsWith('.test.js') ? [file] : [];
  });
}

const files = [...collect('test/unit'), ...collect('test/helpers')].sort();
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
