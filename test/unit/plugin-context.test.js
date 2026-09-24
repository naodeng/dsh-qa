import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('loads the Host plugin when the optional hostAdapters service is unavailable', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-plugin-'));
  const port = await findFreePort();
  const moduleUrl = pathToFileURL(path.resolve('lib/index.js')).href;
  const script = `
    import fs from 'node:fs';
    import { apply } from ${JSON.stringify(moduleUrl)};

    const logs = [];
    const registered = [];
    let effectPromise;
    const ctx = {
      effect(callback) {
        effectPromise = Promise.resolve().then(callback);
      },
      get(name) {
        if (name !== 'hostAdapters') throw new Error('unexpected optional service lookup');
        return undefined;
      },
      logger: { info(message) { logs.push(message); } },
      webServer: {
        register(definition) {
          registered.push(definition);
          return () => {};
        },
      },
    };
    Object.defineProperty(ctx, 'hostAdapters', {
      get() { throw new Error('direct hostAdapters access is not allowed'); },
    });

    apply(ctx, { dataDir: ${JSON.stringify(dataDir)}, port: ${port}, announceToAgent: false });
    const dispose = await effectPromise;
    if (logs.some((message) => message.includes('hostAdapters'))) {
      throw new Error(logs.join('\\n'));
    }
    if (registered.length !== 3) throw new Error('expected all three dsh-qa routes to register');
    dispose?.();
    fs.rmSync(${JSON.stringify(dataDir)}, { recursive: true, force: true });
  `;

  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: path.resolve('.'),
    env: { ...process.env, QA_DATA_DIR: dataDir },
    encoding: 'utf8',
  });

  try {
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
