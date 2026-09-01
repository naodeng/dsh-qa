import crypto from 'node:crypto';

const TERMINAL = new Set(['passed', 'failed', 'cancelled', 'timed-out', 'environment-error']);
const provenanceKeys = ['sourceDigests', 'commit', 'testPlanVersion', 'regressionSetVersion', 'profileId', 'profileVersion'];

function equalProvenance(actual = {}, expected = {}) {
  return provenanceKeys.every((key) => {
    const left = key === 'sourceDigests' ? [...(actual[key] || [])].sort() : (actual[key] ?? null);
    const right = key === 'sourceDigests' ? [...(expected[key] || [])].sort() : (expected[key] ?? null);
    return JSON.stringify(left) === JSON.stringify(right);
  });
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function check(key, status, severity, explanation, options = {}) {
  return { key, status, severity, explanation, waivable: Boolean(options.waivable), evidenceRefs: options.evidenceRefs || [] };
}

export function normalizeGate(gate = {}) {
  if (gate.kind === 'computed') return gate;
  return { ...gate, kind: 'approval' };
}

export function evaluateGate(facts = {}, rules = {}) {
  const provenance = facts.provenance || {};
  const run = facts.latestRun;
  const evidence = (facts.evidence || []).filter((bundle) => bundle.state === 'ready');
  const checks = [];
  const stale = !run || !equalProvenance(run.provenance, provenance) || evidence.some((bundle) => !equalProvenance(bundle.provenance, provenance));
  checks.push(check('stale-evidence', stale ? 'failed' : 'passed', 'block', stale ? '测试运行或证据与当前输入不一致' : '执行来源与当前输入一致'));
  const verified = evidence.filter((bundle) => bundle.integrity === 'verified' && (!run || bundle.testRunId === run.id));
  const missingEvidence = Boolean(rules.requireVerifiedEvidence) && !verified.length;
  checks.push(check('verified-evidence', missingEvidence ? 'failed' : 'passed', 'block', missingEvidence ? '缺少已验证的必需证据' : '必需证据已验证', { evidenceRefs: verified.map((bundle) => bundle.id) }));
  const failedRun = !run || run.resultTrust !== 'controlled-local' || run.status !== 'passed';
  checks.push(check('critical-test-result', failedRun ? 'failed' : 'passed', 'block', failedRun ? '缺少受控且通过的关键测试运行' : '关键测试运行已通过', { evidenceRefs: run ? [run.id] : [] }));
  const criticalRisk = (facts.risks || []).some((risk) => risk.severity === 'critical' && risk.assessmentStatus !== 'dismissed' && !['mitigated', 'accepted', 'closed'].includes(risk.dispositionStatus || risk.status));
  checks.push(check('critical-risk', Boolean(rules.blockCriticalOpenRisk) && criticalRisk ? 'failed' : 'passed', 'block', criticalRisk ? '存在未处置的严重风险' : '严重风险已处置'));
  const mediumHigh = (facts.risks || []).some((risk) => ['medium', 'high'].includes(risk.severity) && risk.assessmentStatus !== 'dismissed' && !['mitigated', 'accepted', 'closed'].includes(risk.dispositionStatus || risk.status));
  checks.push(check('medium-coverage', mediumHigh ? 'failed' : 'passed', 'warn', mediumHigh ? '存在未完全覆盖的中高风险范围' : '中高风险范围已覆盖', { waivable: true }));
  const verdict = checks.some((item) => item.status === 'failed' && item.severity === 'block') ? 'BLOCK' : checks.some((item) => item.status === 'failed') ? 'WARN' : 'PASS';
  return { verdict, checks, rulesetVersion: rules.version || 'gate-rules-v1', inputDigest: digest({ provenance, run: run?.id || '', evidence: evidence.map((item) => item.id).sort(), risks: facts.risks || [] }), inputProvenance: structuredClone(provenance) };
}

export function applyGateExceptions(result, exceptions = [], at = new Date()) {
  const checks = (result.checks || []).map((item) => ({ ...item, waived: false }));
  const now = new Date(at).getTime();
  for (const exception of exceptions) {
    const target = checks.find((item) => item.key === exception.checkKey && item.status === 'failed');
    if (!target || !target.waivable || !String(exception.actorLabel || '').trim() || !String(exception.reason || '').trim() || Number.isNaN(Date.parse(exception.expiresAt)) || Date.parse(exception.expiresAt) <= now) continue;
    target.waived = true;
    target.exception = { checkKey: exception.checkKey, actorLabel: exception.actorLabel, reason: exception.reason, expiresAt: exception.expiresAt };
  }
  const hasBlock = checks.some((item) => item.status === 'failed' && !item.waived && (item.severity === 'block' || !item.waivable));
  const hasWarn = checks.some((item) => item.status === 'failed');
  return { ...result, checks, verdict: hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : result.verdict === 'PASS' ? 'PASS' : 'WARN' };
}

export function evaluateQualityGate(project) {
  const blockers = [];
  const runs = project.testruns || [];
  if (runs.some((run) => run.status === 'failed')) blockers.push('存在失败测试运行');
  if (runs.some((run) => !TERMINAL.has(run.status))) blockers.push('存在未完成测试运行');
  if ((project.evidenceBundles || []).some((bundle) => bundle.state !== 'ready')) blockers.push('存在未就绪证据包');
  if ((project.risks || []).some((risk) => risk.severity === 'high' && risk.status !== 'closed' && risk.status !== 'accepted')) blockers.push('存在未关闭高风险');
  return { status: blockers.length ? 'blocked' : 'passed', blockers, evaluatedAt: new Date().toISOString() };
}
