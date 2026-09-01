import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvidenceBundle, makeProject, makeTestRun } from '../helpers/quality-fixtures.js';
import { applyGateExceptions, evaluateGate, evaluateQualityGate, normalizeGate } from '../../server/quality/gate.js';

test('normalizes legacy approval gates without rewriting their historical fields', () => {
  const legacy = { id: 'gate_legacy', status: 'approved', decision: 'approve', requestedAt: '2026-08-25T10:00:00.000Z', decidedAt: '2026-08-25T11:00:00.000Z' };
  const normalized = normalizeGate(legacy);
  assert.equal(normalized.kind, 'approval');
  assert.equal(normalized.status, 'approved');
  assert.equal(normalized.decision, 'approve');
  assert.equal(normalized.requestedAt, legacy.requestedAt);
  assert.equal(normalized.decidedAt, legacy.decidedAt);
});

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

test('evaluates deterministic computed gates from provenance, evidence, risk, and run facts', () => {
  const provenance = { sourceDigests: ['source-v2'], commit: 'abc123', testPlanVersion: 2, regressionSetVersion: 3, profileId: 'profile_1', profileVersion: 4 };
  const run = makeTestRun({ id: 'run_passed', status: 'passed', resultTrust: 'controlled-local', provenance });
  const evidence = makeEvidenceBundle({ id: 'evidence_1', testRunId: run.id, provenance, state: 'ready', integrity: 'verified' });
  const rules = { version: 'gate-rules-v1', requireVerifiedEvidence: true, blockCriticalOpenRisk: true };
  const pass = evaluateGate({ latestRun: run, evidence: [evidence], provenance, risks: [] }, rules);
  assert.equal(pass.verdict, 'PASS');
  assert.equal(pass.rulesetVersion, 'gate-rules-v1');
  assert.ok(pass.inputDigest);

  const stale = evaluateGate({ latestRun: { ...run, provenance: { ...provenance, commit: 'old' } }, evidence: [evidence], provenance, risks: [] }, rules);
  assert.equal(stale.verdict, 'BLOCK');
  assert.equal(stale.checks.find((check) => check.key === 'stale-evidence').status, 'failed');

  const critical = evaluateGate({ latestRun: run, evidence: [evidence], provenance, risks: [{ severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' }] }, rules);
  assert.equal(critical.verdict, 'BLOCK');
  assert.equal(critical.checks.find((check) => check.key === 'critical-risk').waivable, false);

  const missingEvidence = evaluateGate({ latestRun: run, evidence: [], provenance, risks: [] }, rules);
  assert.equal(missingEvidence.verdict, 'BLOCK');
  assert.equal(missingEvidence.checks.find((check) => check.key === 'verified-evidence').waivable, false);
});

test('gate exceptions only waive eligible warnings and never change the verdict to pass', () => {
  const result = { verdict: 'WARN', checks: [{ key: 'medium-coverage', status: 'failed', severity: 'warn', waivable: true, explanation: '范围覆盖不足' }] };
  const now = new Date('2026-08-25T00:00:00.000Z');
  const applied = applyGateExceptions(result, [{ checkKey: 'medium-coverage', actorLabel: 'QA', reason: '本次范围外', expiresAt: '2026-08-26T00:00:00.000Z' }], now);
  assert.equal(applied.verdict, 'WARN');
  assert.equal(applied.checks[0].waived, true);
  const blocked = applyGateExceptions({ verdict: 'BLOCK', checks: [{ key: 'critical-risk', status: 'failed', waivable: false }] }, [{ checkKey: 'critical-risk', actorLabel: 'QA', reason: '接受', expiresAt: '2026-08-26T00:00:00.000Z' }], now);
  assert.equal(blocked.verdict, 'BLOCK');
  assert.equal(blocked.checks[0].waived, false);
});
