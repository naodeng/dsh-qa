import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { saveFailureAnalysis, promoteConfirmedDefect } from '../../server/quality/failure-analysis.js';
import { createRegressionSet, excludeRegressionCase, calculateRegressionSet } from '../../server/quality/regression.js';

test('failure analysis requires a failed controlled run and human confirmation for defect promotion', () => {
  const project = makeProject();
  const run = makeTestRun({ projectId: project.id, status: 'failed', resultTrust: 'controlled-local' });
  project.testruns.push(run);
  const analysis = saveFailureAnalysis(project, run.id, { category: 'product', summary: '按钮未提交', rootCause: '接口返回 500' });
  assert.equal(analysis.status, 'proposed');
  assert.throws(() => promoteConfirmedDefect(project, analysis.id), /人工确认/);
  const defect = promoteConfirmedDefect(project, analysis.id, { actor: 'tester', confirmed: true });
  assert.equal(defect.status, 'open');
  assert.throws(() => promoteConfirmedDefect(project, analysis.id, { actor: 'tester', confirmed: true }), /已升级/);
});

test('regression set is deterministic and exclusions retain actor and reason', () => {
  const project = makeProject({ testcases: [{ id: 'tc-b' }, { id: 'tc-a' }, { id: 'tc-c' }] });
  const set = createRegressionSet(project, { name: '核心回归', testCaseIds: ['tc-c', 'tc-a', 'tc-b'] });
  assert.deepEqual(set.testCaseIds, ['tc-a', 'tc-b', 'tc-c']);
  excludeRegressionCase(set, 'tc-b', { actor: 'tester', reason: '依赖外部支付环境' });
  assert.deepEqual(set.exclusions, [{ testCaseId: 'tc-b', actor: 'tester', reason: '依赖外部支付环境' }]);
});

test('calculated regression set records stable input digest and risk references', () => {
  const project = makeProject({ requirements: [{ id: 'req-2' }, { id: 'req-1' }], defects: [{ id: 'def-1', status: 'open' }] });
  const first = calculateRegressionSet(project, 'task-1', 'sha256:change-1');
  const second = calculateRegressionSet(project, 'task-1', 'sha256:change-1');
  assert.deepEqual(first, second);
  assert.equal(first.inputDigest, 'sha256:change-1');
  assert.deepEqual(first.references, { requirementIds: ['req-1', 'req-2'], defectIds: ['def-1'] });
});
