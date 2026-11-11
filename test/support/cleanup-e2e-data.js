import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default async function cleanupE2eData() {
  await fs.rm(path.join(testDir, '.data', 'e2e'), { recursive: true, force: true });
}
