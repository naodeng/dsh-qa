import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { saveFailureAnalysis, promoteConfirmedDefect } from '../../server/quality/failure-analysis.js';
import * as regression from '../../server/quality/regression.js';
const { createRegressionSet, excludeRegressionCase, calculateRegressionSet } = regression;

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

test('failure analysis stores structured decision, confidence, step, and historical links', () => {
  const project = makeProject();
  const run = makeTestRun({ projectId: project.id, status: 'failed', resultTrust: 'controlled-local' });
  project.testruns.push(run);

  const analysis = saveFailureAnalysis(project, run.id, {
    category: 'product', summary: '按钮未提交', suspectedCause: '接口返回 500', confidence: 0.8,
    decision: 'candidate', failureStep: '提交订单', errorSummary: 'HTTP 500', historicalDefectIds: ['def-old'],
  });

  assert.equal(analysis.suspectedCause, '接口返回 500');
  assert.equal(analysis.confidence, 0.8);
  assert.equal(analysis.decision, 'candidate');
  assert.equal(analysis.failureStep, '提交订单');
  assert.equal(analysis.errorSummary, 'HTTP 500');
  assert.deepEqual(analysis.historicalDefectIds, ['def-old']);
});

test('failure analysis cannot promote a rejected decision or accept blank confirmation', () => {
  const project = makeProject();
  const run = makeTestRun({ projectId: project.id, status: 'failed', resultTrust: 'controlled-local' });
  project.testruns.push(run);
  const analysis = saveFailureAnalysis(project, run.id, { summary: '已拒绝故障', decision: 'rejected' });

  assert.throws(() => promoteConfirmedDefect(project, analysis.id, { actorLabel: '   ', confirmed: true }), /人工确认/);
  assert.throws(() => promoteConfirmedDefect(project, analysis.id, { actorLabel: 'tester', confirmed: true }), /拒绝/);
});

test('regression set is deterministic and exclusions retain actor and reason', () => {
  const project = makeProject({ testcases: [{ id: 'tc-b' }, { id: 'tc-a' }, { id: 'tc-c' }] });
  const set = createRegressionSet(project, { name: '核心回归', testCaseIds: ['tc-c', 'tc-a', 'tc-b'] });
  assert.deepEqual(set.testCaseIds, ['tc-a', 'tc-b', 'tc-c']);
  excludeRegressionCase(set, 'tc-b', { actor: 'tester', reason: '依赖外部支付环境' });
  assert.deepEqual(set.exclusions, [{ testCaseId: 'tc-b', actor: 'tester', reason: '依赖外部支付环境' }]);
  assert.equal(set.status, 'manual');
  assert.deepEqual(set.cases, [
    { testCaseId: 'tc-a', included: true },
    { testCaseId: 'tc-b', included: false },
    { testCaseId: 'tc-c', included: true },
  ]);
  assert.throws(() => excludeRegressionCase(set, 'tc-a', { actor: '  ', reason: '理由' }), /操作者/);
});

test('regression set rejects unknown cases instead of silently dropping them', () => {
  const project = makeProject({ testcases: [{ id: 'tc-known' }] });
  assert.throws(() => createRegressionSet(project, { name: '核心回归', testCaseIds: ['tc-known', 'tc-missing'] }), /用例不存在/);
});

test('calculated regression set records stable input digest, cases, status, and reason references', () => {
  const project = makeProject({ requirements: [{ id: 'req-2' }, { id: 'req-1' }], defects: [{ id: 'def-1', status: 'open' }], qualityTasks: [{ id: 'task-1', risks: [{ id: 'risk-1' }] }], testcases: [{ id: 'tc-1' }] });
  const first = calculateRegressionSet(project, 'task-1', 'sha256:change-1');
  const second = calculateRegressionSet(project, 'task-1', 'sha256:change-1');
  assert.deepEqual(first, second);
  assert.equal(first.inputDigest, 'sha256:change-1');
  assert.equal(first.status, 'calculated');
  assert.deepEqual(first.cases, [{ testCaseId: 'tc-1', included: true }]);
  assert.deepEqual(first.reasonRefs, ['change:sha256:change-1', 'defect:def-1', 'requirement:req-1', 'requirement:req-2', 'risk:risk-1']);
  assert.deepEqual(first.references, { requirementIds: ['req-1', 'req-2'], defectIds: ['def-1'] });

  project.regressionSets = [structuredClone(first)];
  assert.equal(typeof regression.recalculateRegressionSet, 'function');
  const recalculated = regression.recalculateRegressionSet(project, first.id, 'sha256:change-2');
  assert.equal(recalculated.version, 2);
  assert.equal(recalculated.inputDigest, 'sha256:change-2');
  assert.equal(recalculated.status, 'calculated');
});

test('calculated regression set requires an existing quality task', () => {
  assert.throws(() => calculateRegressionSet(makeProject(), 'missing-task', 'change-1'), /质量任务不存在/);
});
