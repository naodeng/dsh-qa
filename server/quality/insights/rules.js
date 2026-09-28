export const RULE_VERSION = 'quality-insight-rules-v1';

const TERMINAL_RUN_STATUSES = new Set(['passed', 'failed', 'cancelled', 'timed-out', 'environment-error']);
const ELIGIBLE_REGRESSION_STATUSES = new Set(['manual', 'calculated']);
const CLOSED_RISK_DISPOSITIONS = new Set(['mitigated', 'accepted', 'closed']);
const CLOSED_DEFECT_STATUSES = new Set(['closed', 'verified']);

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function sorted(values = []) {
  return [...new Set(values.map((value) => String(value)))].sort(compareText);
}

function candidate(kind, target, reason, evidenceRefs, severity, scope) {
  return { kind, target, reason, evidenceRefs: sorted(evidenceRefs), severity, scope };
}

function traceValues(trace) {
  if (Array.isArray(trace)) return trace.map((value) => String(value));
  if (trace === null || trace === undefined || trace === '') return [];
  return [String(trace)];
}

function riskDisposition(risk) {
  return risk.dispositionStatus || risk.disposition || risk.status || '';
}

function activeRisk(risk) {
  return risk.assessmentStatus !== 'dismissed' && !CLOSED_RISK_DISPOSITIONS.has(riskDisposition(risk));
}

function activeDefect(defect) {
  return !CLOSED_DEFECT_STATUSES.has(defect.status);
}

function riskSeverity(risk) {
  return String(risk.severity || '').toLowerCase();
}

function highRisk(risk) {
  return ['critical', 'high'].includes(riskSeverity(risk));
}

function matchingEvidence(run, bundle) {
  if (bundle.testRunId !== run.id || bundle.state !== 'ready' || bundle.integrity !== 'verified') return false;
  if (run.resultTrust === 'imported-summary') return false;
  if (run.resultTrust === 'controlled-host') {
    const hostExecutionId = run.provenance?.hostExecutionId;
    const hostResultDigest = run.provenance?.hostResultDigest;
    return typeof hostExecutionId === 'string' && hostExecutionId.length > 0
      && typeof hostResultDigest === 'string' && hostResultDigest.length > 0
      && bundle.provenance?.hostExecutionId === hostExecutionId
      && bundle.provenance?.hostResultDigest === hostResultDigest;
  }
  return run.resultTrust === 'controlled-local';
}

function runScope(run, relatedEvidence) {
  const hostFields = run.resultTrust === 'controlled-host'
    ? { hostExecutionId: run.provenance?.hostExecutionId ?? null, hostResultDigest: run.provenance?.hostResultDigest ?? null }
    : {};
  return {
    run: { id: run.id, status: run.status, resultTrust: run.resultTrust, ...hostFields },
    evidence: relatedEvidence.map((bundle) => ({
      id: bundle.id,
      testRunId: bundle.testRunId,
      state: bundle.state,
      integrity: bundle.integrity,
      ...(run.resultTrust === 'controlled-host'
        ? { hostExecutionId: bundle.provenance?.hostExecutionId ?? null, hostResultDigest: bundle.provenance?.hostResultDigest ?? null }
        : {}),
    })),
  };
}

function normalizedGateEvidenceRefs(snapshot, check) {
  const refs = sorted(check.evidenceRefs);
  const evidenceById = new Map(snapshot.evidenceBundles.map((bundle) => [bundle.id, bundle]));
  const missingRefs = refs.filter((ref) => {
    const bundle = evidenceById.get(ref);
    return !bundle || bundle.state !== 'ready' || bundle.integrity !== 'verified';
  });
  return { refs, missingRefs };
}

function gateEvidenceScope(snapshot, gate, check, refs) {
  const evidenceById = new Map(snapshot.evidenceBundles.map((bundle) => [bundle.id, bundle]));
  return {
    gateId: gate.id,
    check: { key: check.key, evidenceRefs: refs },
    evidence: refs.map((ref) => {
      const bundle = evidenceById.get(ref);
      return { id: ref, state: bundle?.state ?? null, integrity: bundle?.integrity ?? null };
    }),
  };
}

function currentRegressionSet(snapshot, qualityTaskId) {
  return snapshot.regressionSets
    .filter((set) => set.qualityTaskId === qualityTaskId && ELIGIBLE_REGRESSION_STATUSES.has(set.status))
    .sort((left, right) => Number(right.version || 0) - Number(left.version || 0) || compareText(left.id, right.id))[0] || null;
}

function requirementCandidates(snapshot) {
  const testcaseIds = new Set(snapshot.testcases.map((testcase) => testcase.id));
  const candidates = [];
  for (const requirement of snapshot.requirements) {
    const missingFields = [];
    if (!requirement.description) missingFields.push('description');
    if (!requirement.acceptance) missingFields.push('acceptance');
    if (missingFields.length) {
      candidates.push(candidate(
        'requirement_gap',
        { type: 'requirement', id: requirement.id },
        { code: 'missing-requirement-fields', args: { fields: missingFields } },
        [],
        'medium',
        { requirementId: requirement.id, description: requirement.description, acceptance: requirement.acceptance, missingFields },
      ));
    }

    const validLinks = requirement.links.filter((link) => testcaseIds.has(link.testcaseId));
    if (!validLinks.length) {
      const traceOnly = snapshot.testcases.some((testcase) => traceValues(testcase.trace).includes(requirement.id));
      candidates.push(candidate(
        'coverage_gap',
        { type: 'requirement', id: requirement.id },
        { code: 'no-valid-testcase-link', args: { traceOnly } },
        [],
        'medium',
        { requirementId: requirement.id, linkIds: [], traceOnly },
      ));
    }
  }
  return candidates;
}

function evidenceCandidates(snapshot) {
  const candidates = [];
  for (const run of snapshot.testruns) {
    if (!TERMINAL_RUN_STATUSES.has(run.status)) continue;
    const relatedEvidence = snapshot.evidenceBundles.filter((bundle) => bundle.testRunId === run.id);
    if (!relatedEvidence.some((bundle) => matchingEvidence(run, bundle))) {
      candidates.push(candidate(
        'evidence_gap',
        { type: 'run', id: run.id },
        { code: 'missing-verified-evidence', args: { runId: run.id, resultTrust: run.resultTrust } },
        relatedEvidence.map((bundle) => bundle.id),
        'high',
        runScope(run, relatedEvidence),
      ));
    }
  }

  for (const gate of snapshot.gates.filter((item) => item.kind === 'computed')) {
    for (const check of gate.checks.filter((item) => item.key === 'verified-evidence')) {
      const { refs, missingRefs } = normalizedGateEvidenceRefs(snapshot, check);
      if (!missingRefs.length) continue;
      candidates.push(candidate(
        'evidence_gap',
        { type: 'gate', id: gate.id },
        { code: 'invalid-evidence-reference', args: { checkKey: check.key, missingRefs } },
        refs,
        'high',
        gateEvidenceScope(snapshot, gate, check, refs),
      ));
    }
  }
  return candidates;
}

function regressionCandidates(snapshot) {
  const activeDefects = snapshot.defects.filter(activeDefect);
  const candidates = [];
  for (const task of snapshot.qualityTasks) {
    const activeRisks = task.risks.filter(activeRisk);
    const current = currentRegressionSet(snapshot, task.id);
    const selectedSet = current && {
      id: current.id,
      qualityTaskId: current.qualityTaskId,
      status: current.status,
      version: current.version,
      reasonRefs: current.reasonRefs,
    };
    if (!current) {
      const severity = activeRisks.some(highRisk) ? 'high' : 'medium';
      candidates.push(candidate(
        'regression_gap',
        { type: 'quality-task', id: task.id },
        { code: 'missing-regression-set', args: { qualityTaskId: task.id } },
        [],
        severity,
        { qualityTaskId: task.id, selectedSet: null, missingRiskRefs: [], missingDefectRefs: [], severity },
      ));
      continue;
    }

    const reasonRefs = new Set(current.reasonRefs);
    const missingRiskRefs = sorted(activeRisks.filter((risk) => !reasonRefs.has(`risk:${risk.id}`)).map((risk) => `risk:${risk.id}`));
    const missingDefectRefs = sorted(activeDefects.filter((defect) => !reasonRefs.has(`defect:${defect.id}`)).map((defect) => `defect:${defect.id}`));
    if (!missingRiskRefs.length && !missingDefectRefs.length) continue;
    const severity = activeRisks.some(highRisk) ? 'high' : 'medium';
    candidates.push(candidate(
      'regression_gap',
      { type: 'regression-set', id: current.id },
      { code: 'regression-coverage-gap', args: { qualityTaskId: task.id, setId: current.id, missingRiskRefs, missingDefectRefs } },
      [],
      severity,
      { qualityTaskId: task.id, selectedSet, missingRiskRefs, missingDefectRefs, severity },
    ));
  }
  return candidates;
}

function releaseCandidates(snapshot) {
  const candidates = [];
  for (const gate of snapshot.gates.filter((item) => item.kind === 'computed' && ['BLOCK', 'WARN'].includes(item.verdict))) {
    const code = gate.verdict === 'BLOCK' ? 'computed-gate-blocked' : 'computed-gate-warning';
    candidates.push(candidate(
      'release_risk',
      { type: 'gate', id: gate.id },
      { code, args: { gateId: gate.id, verdict: gate.verdict } },
      [],
      gate.verdict === 'BLOCK' ? 'high' : 'medium',
      { gateId: gate.id, verdict: gate.verdict },
    ));
  }

  for (const task of snapshot.qualityTasks) {
    const activeCriticalRisks = task.risks.filter((risk) => activeRisk(risk) && highRisk(risk));
    if (!activeCriticalRisks.length) continue;
    const riskIds = sorted(activeCriticalRisks.map((risk) => risk.id));
    candidates.push(candidate(
      'release_risk',
      { type: 'quality-task', id: task.id },
      { code: 'critical-risk-open', args: { qualityTaskId: task.id, riskIds } },
      [],
      'high',
      { qualityTaskId: task.id, riskIds },
    ));
  }
  return candidates;
}

export function collectInsightCandidates(snapshot) {
  return [
    ...requirementCandidates(snapshot),
    ...evidenceCandidates(snapshot),
    ...regressionCandidates(snapshot),
    ...releaseCandidates(snapshot),
  ];
}
