import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQualitySnapshot,
  analyzeQualityFacts,
  ignoreInsight,
  mergeQualityInsightDecisions,
  QualityInsightError,
  resolveInsight,
} from '../../server/quality/insights/engine.js';
import { appendQualityInsightAudit } from '../../server/quality/insights/audit.js';
import {
  makeEvidenceBundle,
  makeGate,
  makeProject,
  makeQualityTask,
  makeTestRun,
} from '../helpers/quality-fixtures.js';

function analyze(project) {
  return analyzeQualityFacts(buildQualitySnapshot(project));
}

function insightsOf(result, kind) {
  return result.insights.filter((insight) => insight.kind === kind);
}

function decisionProject() {
  return makeProject({
    id: 'project_decision',
    requirements: [{ id: 'req_decision', description: '', acceptance: '', links: [] }],
    qualityInsightDecisions: [],
  });
}

function currentDecisionInsight(project) {
  return insightsOf(analyze(project), 'requirement_gap')[0];
}

function primaryProjectState(project) {
  const copy = structuredClone(project);
  delete copy.qualityInsightDecisions;
  return copy;
}

function emptySnapshot(overrides = {}) {
  return {
    projectId: 'project_snapshot',
    requirements: [],
    testcases: [],
    qualityTasks: [],
    testruns: [],
    evidenceBundles: [],
    failureAnalyses: [],
    defects: [],
    regressionSets: [],
    gates: [],
    ...overrides,
  };
}

test('finds requirement and coverage gaps without treating trace text as coverage', () => {
  const project = makeProject({
    requirements: [
      { id: 'req_missing', statement: '', acceptance: '', links: [] },
      { id: 'req_trace_only', statement: '有描述', acceptance: '有验收', links: [] },
      { id: 'req_linked', statement: '有描述', acceptance: '有验收', links: [{ testcaseId: 'tc_valid' }] },
    ],
    testcases: [
      { id: 'tc_trace_only', trace: 'req_trace_only' },
      { id: 'tc_valid', trace: '任意文本' },
    ],
  });

  const result = analyze(project);
  const requirementGaps = insightsOf(result, 'requirement_gap');
  const coverageGaps = insightsOf(result, 'coverage_gap');

  assert.deepEqual(requirementGaps.map((item) => item.target.id), ['req_missing']);
  assert.deepEqual(coverageGaps.map((item) => item.target.id), ['req_missing', 'req_trace_only']);
  assert.equal(coverageGaps.some((item) => item.target.id === 'req_linked'), false);
  assert.equal(coverageGaps.find((item) => item.target.id === 'req_trace_only').reason.args.traceOnly, true);
  assert.equal(requirementGaps[0].severity, 'medium');
});

test('reports evidence gaps for terminal runs and rejects imported or mismatched host evidence', () => {
  const project = makeProject({
    testruns: [
      makeTestRun({ id: 'run_imported', status: 'passed', resultTrust: 'imported-summary' }),
      makeTestRun({ id: 'run_host', status: 'passed', resultTrust: 'controlled-host', provenance: { hostExecutionId: 'host-1', hostResultDigest: 'digest-1' } }),
      makeTestRun({ id: 'run_local', status: 'failed', resultTrust: 'controlled-local' }),
      makeTestRun({ id: 'run_running', status: 'running', resultTrust: 'controlled-local' }),
    ],
    evidenceBundles: [
      makeEvidenceBundle({ id: 'evidence_imported', testRunId: 'run_imported', state: 'ready', integrity: 'verified' }),
      makeEvidenceBundle({ id: 'evidence_host_wrong', testRunId: 'run_host', state: 'ready', integrity: 'verified', provenance: { hostExecutionId: 'host-2', hostResultDigest: 'digest-2' } }),
      makeEvidenceBundle({ id: 'evidence_local_unverified', testRunId: 'run_local', state: 'ready', integrity: 'failed' }),
    ],
  });

  const result = analyze(project);
  const gaps = insightsOf(result, 'evidence_gap');
  const runTargets = gaps.filter((item) => item.target.type === 'run');

  assert.deepEqual(runTargets.map((item) => item.target.id), ['run_host', 'run_imported', 'run_local']);
  assert.equal(runTargets.every((item) => item.severity === 'high'), true);
  assert.equal(runTargets.find((item) => item.target.id === 'run_imported').reason.args.resultTrust, 'imported-summary');
  assert.equal(runTargets.find((item) => item.target.id === 'run_host').evidenceRefs.includes('evidence_host_wrong'), true);
  assert.equal(runTargets.find((item) => item.target.id === 'run_local').evidenceRefs.includes('evidence_local_unverified'), true);
});

test('requires complete Host provenance and scopes each rule to the facts it reads', () => {
  const hostProject = makeProject({
    testruns: [makeTestRun({ id: 'run_host_missing_provenance', status: 'passed', resultTrust: 'controlled-host', provenance: {} })],
    evidenceBundles: [makeEvidenceBundle({ id: 'evidence_host_missing_provenance', testRunId: 'run_host_missing_provenance', state: 'ready', integrity: 'verified', provenance: {} })],
  });
  assert.equal(insightsOf(analyze(hostProject), 'evidence_gap').some((item) => item.target.id === 'run_host_missing_provenance'), true);

  const localBase = makeProject({
    testruns: [makeTestRun({ id: 'run_local_scope', status: 'passed', resultTrust: 'controlled-local', provenance: {} })],
    evidenceBundles: [makeEvidenceBundle({ id: 'evidence_local_scope', testRunId: 'run_local_scope', state: 'ready', integrity: 'failed', provenance: { commit: 'first' } })],
  });
  const localChanged = structuredClone(localBase);
  localChanged.evidenceBundles[0].provenance.commit = 'unrelated-change';
  const localBefore = insightsOf(analyze(localBase), 'evidence_gap').find((item) => item.target.id === 'run_local_scope');
  const localAfter = insightsOf(analyze(localChanged), 'evidence_gap').find((item) => item.target.id === 'run_local_scope');
  assert.equal(localAfter.id, localBefore.id);
  assert.equal(localAfter.scopeDigest, localBefore.scopeDigest);

  const releaseBase = makeProject({
    gates: [makeGate({ id: 'gate_scope_release', kind: 'computed', verdict: 'WARN', checks: [{ key: 'verdict', status: 'failed', evidenceRefs: ['missing-release-ref'] }] })],
  });
  const releaseChanged = structuredClone(releaseBase);
  releaseChanged.gates[0].checks.push({ key: 'unrelated-check', status: 'passed', evidenceRefs: ['another-ref'] });
  const releaseBefore = insightsOf(analyze(releaseBase), 'release_risk').find((item) => item.target.id === 'gate_scope_release');
  const releaseAfter = insightsOf(analyze(releaseChanged), 'release_risk').find((item) => item.target.id === 'gate_scope_release');
  assert.equal(releaseAfter.id, releaseBefore.id);
  assert.equal(releaseAfter.scopeDigest, releaseBefore.scopeDigest);

  const task = makeQualityTask({ id: 'task_missing_set_scope', risks: [] });
  const regressionBase = makeProject({ qualityTasks: [task], defects: [] });
  const regressionChanged = structuredClone(regressionBase);
  regressionChanged.defects.push({ id: 'unrelated-open-defect', status: 'open' });
  const regressionBefore = insightsOf(analyze(regressionBase), 'regression_gap').find((item) => item.target.id === task.id);
  const regressionAfter = insightsOf(analyze(regressionChanged), 'regression_gap').find((item) => item.target.id === task.id);
  assert.equal(regressionAfter.id, regressionBefore.id);
  assert.equal(regressionAfter.scopeDigest, regressionBefore.scopeDigest);
});

test('preserves missing computed-gate evidence references and ignores approval gates', () => {
  const project = makeProject({
    gates: [
      makeGate({ id: 'gate_computed', kind: 'computed', verdict: 'BLOCK', checks: [
        { key: 'verified-evidence', status: 'failed', evidenceRefs: ['evidence_missing'] },
        { key: 'verified-evidence', status: 'failed', evidenceRefs: ['evidence_missing'] },
      ] }),
      makeGate({ id: 'gate_approval', kind: 'approval', status: 'pending', verdict: 'BLOCK', checks: [{ key: 'verified-evidence', status: 'failed', evidenceRefs: ['approval_ref'] }] }),
    ],
  });

  const result = analyze(project);
  const gateEvidenceGaps = insightsOf(result, 'evidence_gap').filter((item) => item.target.type === 'gate');
  const releaseRisks = insightsOf(result, 'release_risk');

  assert.equal(gateEvidenceGaps.length, 1);
  assert.deepEqual(gateEvidenceGaps[0].evidenceRefs, ['evidence_missing']);
  assert.equal(releaseRisks.some((item) => item.target.id === 'gate_approval'), false);
  assert.equal(releaseRisks.some((item) => item.target.id === 'gate_computed'), true);
});

test('does not treat TestRun references as computed-gate evidence bundle references', () => {
  const run = makeTestRun({ id: 'run_gate_result', status: 'passed', resultTrust: 'controlled-local' });
  const project = makeProject({
    testruns: [run],
    evidenceBundles: [makeEvidenceBundle({ id: 'evidence_gate_result', testRunId: run.id, state: 'ready', integrity: 'verified' })],
    gates: [makeGate({
      id: 'gate_complete',
      kind: 'computed',
      verdict: 'PASS',
      checks: [
        { key: 'critical-test-result', status: 'passed', evidenceRefs: [run.id] },
        { key: 'verified-evidence', status: 'passed', evidenceRefs: ['evidence_gate_result'] },
      ],
    })],
  });

  assert.equal(insightsOf(analyze(project), 'evidence_gap').some((item) => item.target.id === 'gate_complete'), false);
});

test('treats a run without an explicit mode or trust level as imported evidence', () => {
  const project = makeProject({
    testruns: [{ id: 'run_legacy_unknown', status: 'passed' }],
    evidenceBundles: [makeEvidenceBundle({ id: 'evidence_legacy_unknown', testRunId: 'run_legacy_unknown', state: 'ready', integrity: 'verified' })],
  });

  const gap = insightsOf(analyze(project), 'evidence_gap').find((item) => item.target.id === 'run_legacy_unknown');
  assert.ok(gap);
  assert.equal(gap.reason.args.resultTrust, 'imported-summary');
});

test('selects the current regression set and reports active risk and defect coverage gaps', () => {
  const task = makeQualityTask({
    id: 'task_regression',
    risks: [
      { id: 'risk_critical', severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' },
      { id: 'risk_accepted', severity: 'high', assessmentStatus: 'confirmed', dispositionStatus: 'accepted' },
    ],
  });
  const project = makeProject({
    qualityTasks: [task],
    defects: [
      { id: 'defect_open', status: 'open' },
      { id: 'defect_verified', status: 'verified' },
    ],
    regressionSets: [
      { id: 'set_old', qualityTaskId: task.id, status: 'manual', version: 3, reasonRefs: ['risk:risk_critical', 'defect:defect_open'] },
      { id: 'set_z', qualityTaskId: task.id, status: 'calculated', version: 4, reasonRefs: [] },
      { id: 'set_a', qualityTaskId: task.id, status: 'manual', version: 4, reasonRefs: ['risk:risk_accepted'] },
      { id: 'set_ignored', qualityTaskId: task.id, status: 'draft', version: 99, reasonRefs: [] },
      { id: 'set_project', qualityTaskId: '', status: 'manual', version: 99, reasonRefs: [] },
    ],
  });

  const result = analyze(project);
  const gaps = insightsOf(result, 'regression_gap');
  const selected = gaps.find((item) => item.target.id === 'set_a');

  assert.equal(gaps.length, 1);
  assert.ok(selected);
  assert.equal(selected.severity, 'high');
  assert.deepEqual(selected.reason.args, {
    qualityTaskId: task.id,
    setId: 'set_a',
    missingRiskRefs: ['risk:risk_critical'],
    missingDefectRefs: ['defect:defect_open'],
  });
});

test('reports a regression gap when a quality task has no eligible regression set', () => {
  const task = makeQualityTask({ id: 'task_without_set', risks: [] });
  const result = analyze(makeProject({ qualityTasks: [task], regressionSets: [] }));
  const gaps = insightsOf(result, 'regression_gap');

  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0].target, { type: 'quality-task', id: task.id });
  assert.equal(gaps[0].reason.code, 'missing-regression-set');
});

test('uses saved computed gate verdicts and active critical risks for release risk only', () => {
  const task = makeQualityTask({
    id: 'task_release',
    risks: [{ id: 'risk_release', severity: 'critical', assessmentStatus: 'confirmed', dispositionStatus: 'open' }],
  });
  const project = makeProject({
    qualityTasks: [task],
    gates: [
      makeGate({ id: 'gate_warn', kind: 'computed', verdict: 'WARN', checks: [] }),
      makeGate({ id: 'gate_approval_only', kind: 'approval', status: 'pending', verdict: 'BLOCK' }),
    ],
  });

  const result = analyze(project);
  const risks = insightsOf(result, 'release_risk');

  assert.equal(risks.some((item) => item.target.id === 'gate_warn' && item.severity === 'medium'), true);
  assert.equal(risks.some((item) => item.target.id === 'gate_approval_only'), false);
  assert.equal(risks.some((item) => item.target.id === task.id && item.reason.code === 'critical-risk-open' && item.severity === 'high'), true);
});

test('normalizes runtime fields and keeps the project immutable during analysis', () => {
  const project = makeProject({
    requirements: [{ id: 'req_runtime', statement: '描述', acceptance: '验收', links: [], at: '2026-01-01T00:00:00.000Z' }],
    testruns: [makeTestRun({ id: 'run_runtime', status: 'passed', artifactDir: '/private/secret', command: ['node', 'secret'] })],
  });
  const before = structuredClone(project);
  const snapshot = buildQualitySnapshot(project);

  assert.equal(JSON.stringify(snapshot).includes('2026-01-01T00:00:00.000Z'), false);
  assert.equal(JSON.stringify(snapshot).includes('/private/secret'), false);
  assert.deepEqual(project, before);
});

test('canonicalizes nested keys and semantically sorted collections', () => {
  const first = emptySnapshot({
    requirements: [{ id: 'req-1', description: '', acceptance: '', links: [] }],
    evidenceBundles: [{ id: 'evidence-1', testRunId: 'run-1', state: 'ready', integrity: 'verified', provenance: { z: 2, nested: { b: 2, a: 1 }, a: 1 } }],
  });
  const second = emptySnapshot({
    requirements: [{ acceptance: '', links: [], description: '', id: 'req-1' }],
    evidenceBundles: [{ provenance: { a: 1, nested: { a: 1, b: 2 }, z: 2 }, integrity: 'verified', state: 'ready', testRunId: 'run-1', id: 'evidence-1' }],
  });

  const firstResult = analyzeQualityFacts(first);
  const secondResult = analyzeQualityFacts(second);

  assert.equal(firstResult.inputDigest, secondResult.inputDigest);
  assert.deepEqual(firstResult.insights, secondResult.insights);
});

test('sorts insights by severity and deduplicates identical computed-gate candidates', () => {
  const task = makeQualityTask({ id: 'task_order', risks: [{ id: 'risk_order', severity: 'medium', dispositionStatus: 'open' }] });
  const result = analyze(makeProject({
    qualityTasks: [task],
    gates: [makeGate({ id: 'gate_order', kind: 'computed', verdict: 'BLOCK', checks: [
      { key: 'evidence', status: 'failed', evidenceRefs: ['missing-order'] },
      { key: 'evidence', status: 'failed', evidenceRefs: ['missing-order'] },
    ] })],
  }));

  assert.equal(new Set(result.insights.map((item) => `${item.kind}:${item.target.type}:${item.target.id}:${item.reason.code}:${item.evidenceRefs.join(',')}`)).size, result.insights.length);
  assert.deepEqual(result.insights.map((item) => item.severity), [...result.insights].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - ({ high: 0, medium: 1, low: 2 }[b.severity]))).map((item) => item.severity));
});

test('keeps unrelated input out of an insight scope and changes scope for related risk facts', () => {
  const task = makeQualityTask({ id: 'task_scope', risks: [{ id: 'risk_scope', severity: 'medium', dispositionStatus: 'open' }] });
  const base = makeProject({
    qualityTasks: [task],
    regressionSets: [{ id: 'set_scope', qualityTaskId: task.id, status: 'calculated', version: 1, reasonRefs: [] }],
    defects: [{ id: 'defect_closed', status: 'closed' }],
  });
  const first = analyze(base);
  const firstGap = insightsOf(first, 'regression_gap')[0];

  const unrelated = structuredClone(base);
  unrelated.defects.push({ id: 'defect_unrelated_closed', status: 'closed' });
  const unrelatedResult = analyze(unrelated);
  const unrelatedGap = insightsOf(unrelatedResult, 'regression_gap')[0];

  const related = structuredClone(base);
  related.qualityTasks[0].risks[0].severity = 'critical';
  const relatedResult = analyze(related);
  const relatedGap = insightsOf(relatedResult, 'regression_gap')[0];

  assert.notEqual(first.inputDigest, unrelatedResult.inputDigest);
  assert.equal(firstGap.scopeDigest, unrelatedGap.scopeDigest);
  assert.equal(firstGap.id, unrelatedGap.id);
  assert.notEqual(firstGap.scopeDigest, relatedGap.scopeDigest);
  assert.notEqual(firstGap.id, relatedGap.id);
});

test('overlays a matching decision without changing the current analysis digest', () => {
  const project = decisionProject();
  const analysis = analyze(project);
  const insight = currentDecisionInsight(project);
  const decision = {
    id: 'decision_overlay',
    insightId: insight.id,
    inputDigest: analysis.inputDigest,
    scopeDigest: insight.scopeDigest,
    status: 'resolved',
    revision: 1,
    actorLabel: 'QA',
    reason: '',
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
  };

  const merged = mergeQualityInsightDecisions(analysis, [decision]);
  const mergedInsight = merged.insights.find((item) => item.id === insight.id);

  assert.equal(merged.inputDigest, analysis.inputDigest);
  assert.equal(mergedInsight.status, 'resolved');
  assert.equal(mergedInsight.revision, 1);
  assert.equal(mergedInsight.id, insight.id);
});

test('resolve stores a revision-one decision and leaves primary quality facts unchanged', () => {
  const project = decisionProject();
  const before = primaryProjectState(project);
  const insight = currentDecisionInsight(project);

  const decision = resolveInsight(project, insight.id, {
    expectedRevision: 0,
    scopeDigest: insight.scopeDigest,
    actorLabel: '张测试',
  });

  assert.equal(decision.insightId, insight.id);
  assert.equal(decision.status, 'resolved');
  assert.equal(decision.revision, 1);
  assert.equal(decision.inputDigest, insight.inputDigest);
  assert.equal(decision.scopeDigest, insight.scopeDigest);
  assert.equal(decision.actorLabel, '张测试');
  assert.equal(typeof decision.createdAt, 'string');
  assert.deepEqual(primaryProjectState(project), before);
  assert.equal(project.qualityInsightDecisions.length, 1);
});

test('ignore requires a reason and cannot be applied twice', () => {
  const project = decisionProject();
  const insight = currentDecisionInsight(project);
  const decision = ignoreInsight(project, insight.id, {
    expectedRevision: 0,
    scopeDigest: insight.scopeDigest,
    actorLabel: 'QA',
    reason: '当前范围明确不覆盖',
  });

  assert.equal(decision.status, 'ignored');
  assert.equal(decision.reason, '当前范围明确不覆盖');
  assert.throws(
    () => ignoreInsight(project, insight.id, { expectedRevision: 1, scopeDigest: insight.scopeDigest, actorLabel: 'QA', reason: '再次忽略' }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_ALREADY_DECIDED',
  );
});

test('rejects stale scope, stale revision, invalid actor/reason, and missing insights', () => {
  const staleScopeProject = decisionProject();
  const staleScopeInsight = currentDecisionInsight(staleScopeProject);
  assert.throws(
    () => resolveInsight(staleScopeProject, staleScopeInsight.id, { expectedRevision: 0, scopeDigest: 'stale-scope', actorLabel: 'QA' }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_STALE',
  );

  const staleRevisionProject = decisionProject();
  const staleRevisionInsight = currentDecisionInsight(staleRevisionProject);
  assert.throws(
    () => resolveInsight(staleRevisionProject, staleRevisionInsight.id, { expectedRevision: 1, scopeDigest: staleRevisionInsight.scopeDigest, actorLabel: 'QA' }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_REVISION_CONFLICT',
  );

  const invalidProject = decisionProject();
  const invalidInsight = currentDecisionInsight(invalidProject);
  assert.throws(
    () => resolveInsight(invalidProject, invalidInsight.id, { expectedRevision: 0, scopeDigest: invalidInsight.scopeDigest, actorLabel: ' ' }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_ACTOR_INVALID',
  );
  assert.throws(
    () => resolveInsight(invalidProject, invalidInsight.id, { expectedRevision: 0, scopeDigest: invalidInsight.scopeDigest, actorLabel: {} }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_ACTOR_INVALID',
  );
  assert.throws(
    () => ignoreInsight(invalidProject, invalidInsight.id, { expectedRevision: 0, scopeDigest: invalidInsight.scopeDigest, actorLabel: 'QA', reason: ' ' }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_REASON_INVALID',
  );
  assert.throws(
    () => ignoreInsight(invalidProject, invalidInsight.id, { expectedRevision: 0, scopeDigest: invalidInsight.scopeDigest, actorLabel: 'QA', reason: {} }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_REASON_INVALID',
  );
  assert.throws(
    () => resolveInsight(invalidProject, 'missing-insight', { expectedRevision: 0, scopeDigest: 'none', actorLabel: 'QA' }),
    (error) => error instanceof QualityInsightError && error.code === 'QUALITY_INSIGHT_NOT_FOUND',
  );
});

test('rejects unknown fields in direct decision calls', () => {
  const project = decisionProject();
  const insight = currentDecisionInsight(project);

  assert.throws(
    () => resolveInsight(project, insight.id, {
      expectedRevision: 0,
      scopeDigest: insight.scopeDigest,
      actorLabel: 'QA',
      snapshot: { rawLog: 'should not be accepted' },
    }),
    (error) => error instanceof TypeError && /决策参数包含不允许的字段/.test(error.message),
  );
});

test('keeps a decision through unrelated changes but invalidates it for related facts', () => {
  const project = decisionProject();
  const original = currentDecisionInsight(project);
  resolveInsight(project, original.id, { expectedRevision: 0, scopeDigest: original.scopeDigest, actorLabel: 'QA' });

  project.defects.push({ id: 'closed-unrelated', status: 'closed' });
  const unrelated = currentDecisionInsight(project);
  const merged = mergeQualityInsightDecisions(analyze(project), project.qualityInsightDecisions);
  assert.equal(unrelated.id, original.id);
  assert.equal(unrelated.scopeDigest, original.scopeDigest);
  assert.equal(merged.insights.find((item) => item.id === original.id).status, 'resolved');

  project.requirements[0].description = '补充需求描述';
  const related = currentDecisionInsight(project);
  assert.notEqual(related.id, original.id);
  assert.notEqual(related.scopeDigest, original.scopeDigest);
  assert.equal(mergeQualityInsightDecisions(analyze(project), project.qualityInsightDecisions).insights.some((item) => item.id === related.id && item.status !== 'open'), false);
});

test('creates a redacted quality insight audit record', () => {
  const project = decisionProject();
  const audit = appendQualityInsightAudit(project, {
    entityId: 'insight_audit',
    action: 'resolve',
    actorLabel: 'QA',
    fromRevision: 0,
    toRevision: 1,
    result: 'success',
    errorCode: '',
    reason: '',
    inputDigest: 'input-digest',
    scopeDigest: 'scope-digest',
    snapshot: { shouldNotPersist: true },
    rawLog: 'should-not-persist',
  });

  assert.equal(audit.entityType, 'quality-insight');
  assert.equal(audit.source, 'http');
  assert.equal('snapshot' in audit, false);
  assert.equal('rawLog' in audit, false);
  assert.deepEqual(project.qualityAudit.at(-1), audit);
});
