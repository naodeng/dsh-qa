import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
const dataDir = fs.mkdtempSync(os.tmpdir() + '/dsh-quality-tools-');
process.env.QA_DATA_DIR = dataDir;
const store = await import('../../server/store.js');
const { TOOL_DEFS, executeTool } = await import('../../server/tools.js');

test.after(() => { store.flush(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('quality tools stay project-scoped and create analysis requests', async () => {
  store.loadStore();
  const first = store.createProject({ title: '分析项目' });
  const second = store.createProject({ title: '其他项目' });
  first.qualityTasks.push({ id: 'qt_tool', projectId: first.id, version: 1, sources: [], risks: [], acceptanceCriteria: [], testScope: [], analysisRuns: [] });
  const own = await executeTool(first.id, 'qa_quality_task_get', { taskId: 'qt_tool' });
  assert.equal(own.ok, true);
  const foreign = await executeTool(second.id, 'qa_quality_task_get', { taskId: 'qt_tool' });
  assert.equal(foreign.ok, false);
  const request = await executeTool(first.id, 'qa_quality_analysis_request', { taskId: 'qt_tool' });
  assert.equal(request.ok, true);
  assert.equal(request.request.taskId, 'qt_tool');
  const analysisTool = TOOL_DEFS.find((item) => item.function.name === 'qa_quality_analysis_save');
  assert.equal('projectId' in analysisTool.function.parameters.properties, false);
  assert.equal('dshSessionId' in analysisTool.function.parameters.properties, false);
});
