import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-qa-config-'));
process.env.QA_DATA_DIR = dataDir;
const config = await import('../../server/config.js');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('配置读取默认值并创建工作目录', () => {
  assert.deepEqual(config.loadConfig(), { port: 8899, host: '127.0.0.1' });
  assert.equal(fs.existsSync(config.CONV_DIR), true);
});

test('配置读取可用值，并在文件损坏或字段无效时回退默认值', () => {
  config.saveConfig({ port: 9012, host: 'localhost' });
  assert.deepEqual(config.loadConfig(), { port: 9012, host: 'localhost' });

  fs.writeFileSync(config.CONFIG_PATH, '{invalid json');
  assert.deepEqual(config.loadConfig(), { port: 8899, host: '127.0.0.1' });

  config.saveConfig({ port: 'invalid', host: '' });
  assert.deepEqual(config.loadConfig(), { port: 8899, host: '127.0.0.1' });
});
