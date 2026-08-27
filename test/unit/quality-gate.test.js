import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { evaluateQualityGate } from '../../server/quality/gate.js';

test('quality gate blocks failed runs, unready evidence, and open high risks', () => {
  const project = makeProject({ risks: [{ id: 'risk-1', severity: 'high', status: 'open' }] });
  project.testruns.push(makeTestRun({ projectId: project.id, status: 'failed' }));
  project.evidenceBundles.push({ id: 'ev-1', testRunId: project.testruns[0].id, state: 'finalizing' });
  const result = evaluateQualityGate(project);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['存在失败测试运行', '存在未就绪证据包', '存在未关闭高风险']);
});

test('quality gate passes only when terminal runs and evidence are clean', () => {
  const project = makeProject();
  const run = makeTestRun({ projectId: project.id, status: 'passed' });
  project.testruns.push(run);
  project.evidenceBundles.push({ id: 'ev-1', testRunId: run.id, state: 'ready' });
  const result = evaluateQualityGate(project);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.blockers, []);
});
