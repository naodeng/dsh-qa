import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';

const dataDir = fs.mkdtempSync(`${os.tmpdir()}/dsh-qa-native-tools-`);
process.env.QA_DATA_DIR = dataDir;
const { apply, createToolDefinition, projectForCwd } = await import('../../lib/tools.js');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('native tools resolve only the project whose workspace matches the DSH cwd', () => {
  const projects = [
    { id: 'one', workspacePath: '/tmp/qa/one' },
    { id: 'two', workspacePath: '/tmp/qa/two' },
  ];
  assert.equal(projectForCwd(projects, '/tmp/qa/one')?.id, 'one');
  assert.equal(projectForCwd(projects, '/tmp/qa/missing'), null);
  assert.equal(projectForCwd(projects, ''), null);
});

test('native registration exposes testcase_add and keeps execution project-scoped', async () => {
  const registered = [];
  await apply({ tools: { register: (definition) => registered.push(definition) } });
  const testcase = registered.find((definition) => definition.name === 'testcase_add');
  assert.ok(testcase);
  assert.equal(testcase.parameters.additionalProperties, false);

  const calls = [];
  const definition = createToolDefinition({
    function: {
      name: 'testcase_add',
      description: 'add a testcase',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  }, {
    projectForCwd: (cwd) => cwd === '/tmp/qa/one' ? { id: 'one' } : null,
    executeTool: async (...args) => { calls.push(args); return { ok: true }; },
  });
  const result = await definition.execute({}, { signal: new AbortController().signal, agent: { session: { header: { cwd: '/tmp/qa/one' } } } });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [['one', 'testcase_add', {}]]);
});
