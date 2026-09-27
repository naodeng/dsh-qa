import crypto from 'node:crypto';
import { now, uid } from '../../store.js';
import { collectInsightCandidates, RULE_VERSION } from './rules.js';

export { RULE_VERSION };

export class QualityInsightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QualityInsightError';
    this.code = code;
  }
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const PROVENANCE_KEYS = ['sourceDigests', 'commit', 'testPlanVersion', 'regressionSetVersion', 'profileId', 'profileVersion', 'hostExecutionId', 'hostResultDigest'];

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value)))].sort(compareText);
}

function sortedById(values = []) {
  return [...values].sort((left, right) => compareText(left.id, right.id));
}

function textValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') return item.text ?? item.statement ?? item.description ?? '';
      return item ?? '';
    }).map((item) => String(item).trim()).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') return String(value.text ?? value.statement ?? value.description ?? '').trim();
  return String(value ?? '').trim();
}

function firstText(...values) {
  for (const value of values) {
    const normalized = textValue(value);
    if (normalized) return normalized;
  }
  return '';
}

function entityId(value) {
  const id = String(value ?? '').trim();
  return id;
}

function normalizeProvenance(provenance = {}) {
  const normalized = {};
  for (const key of PROVENANCE_KEYS) {
    if (key === 'sourceDigests') normalized[key] = sortedStrings(provenance[key]);
    else normalized[key] = provenance[key] ?? null;
  }
  return normalized;
}

function normalizeRequirements(requirements, testcaseIds) {
  return sortedById((Array.isArray(requirements) ? requirements : [])
    .map((requirement) => {
      const id = entityId(requirement?.id);
      if (!id) return null;
      const links = (Array.isArray(requirement.links) ? requirement.links : [])
        .map((link) => ({ testcaseId: entityId(link?.testcaseId) }))
        .filter((link) => testcaseIds.has(link.testcaseId))
        .filter((link, index, all) => all.findIndex((item) => item.testcaseId === link.testcaseId) === index)
        .sort((left, right) => compareText(left.testcaseId, right.testcaseId));
      return {
        id,
        description: firstText(requirement.description, requirement.statement, requirement.summary),
        acceptance: firstText(requirement.acceptanceCriteria, requirement.acceptance),
        links,
      };
    })
    .filter(Boolean));
}

function normalizeTestcases(testcases) {
  return sortedById((Array.isArray(testcases) ? testcases : [])
    .map((testcase) => {
      const id = entityId(testcase?.id);
      return id ? { id, trace: Array.isArray(testcase.trace) ? testcase.trace.map((value) => String(value)) : textValue(testcase.trace) } : null;
    })
    .filter(Boolean));
}

function normalizeRisk(risk) {
  if (typeof risk === 'string') return { id: risk, severity: '', assessmentStatus: '', dispositionStatus: '' };
  const id = entityId(risk?.id);
  return id ? {
    id,
    severity: String(risk.severity ?? ''),
    assessmentStatus: String(risk.assessmentStatus ?? ''),
    dispositionStatus: String(risk.dispositionStatus ?? risk.disposition ?? risk.status ?? ''),
  } : null;
}

function normalizeQualityTasks(tasks) {
  return sortedById((Array.isArray(tasks) ? tasks : [])
    .map((task) => {
      const id = entityId(task?.id);
      if (!id) return null;
      return {
        id,
        risks: (Array.isArray(task.risks) ? task.risks : []).map(normalizeRisk).filter(Boolean).sort((left, right) => compareText(left.id, right.id)),
      };
    })
    .filter(Boolean));
}

function normalizeRuns(runs) {
  return sortedById((Array.isArray(runs) ? runs : [])
    .map((run) => {
      const id = entityId(run?.id);
      if (!id) return null;
      return {
        id,
        status: String(run.status ?? ''),
        resultTrust: String(run.resultTrust || (run.mode === 'imported' ? 'imported-summary' : 'controlled-local')),
        evidenceRefs: sortedStrings(run.evidenceRefs),
        provenance: normalizeProvenance(run.provenance),
      };
    })
    .filter(Boolean));
}

function normalizeEvidenceBundles(bundles) {
  return sortedById((Array.isArray(bundles) ? bundles : [])
    .map((bundle) => {
      const id = entityId(bundle?.id);
      if (!id) return null;
      return {
        id,
        testRunId: entityId(bundle.testRunId),
        state: String(bundle.state ?? ''),
        integrity: String(bundle.integrity ?? ''),
        provenance: normalizeProvenance(bundle.provenance),
      };
    })
    .filter(Boolean));
}

function normalizeFailureAnalyses(analyses) {
  return sortedById((Array.isArray(analyses) ? analyses : [])
    .map((analysis) => {
      const id = entityId(analysis?.id);
      return id ? {
        id,
        testRunId: entityId(analysis.testRunId),
        status: String(analysis.status ?? ''),
        decision: String(analysis.decision ?? ''),
        evidenceRefs: sortedStrings(analysis.evidenceRefs),
      } : null;
    })
    .filter(Boolean));
}

function normalizeDefects(defects) {
  return sortedById((Array.isArray(defects) ? defects : [])
    .map((defect) => {
      const id = entityId(defect?.id);
      return id ? { id, status: String(defect.status ?? ''), severity: String(defect.severity ?? ''), evidenceRefs: sortedStrings(defect.evidenceRefs) } : null;
    })
    .filter(Boolean));
}

function normalizeRegressionSets(sets) {
  return sortedById((Array.isArray(sets) ? sets : [])
    .map((set) => {
      const id = entityId(set?.id);
      return id ? {
        id,
        qualityTaskId: entityId(set.qualityTaskId),
        status: String(set.status ?? ''),
        version: Number.isFinite(Number(set.version)) ? Number(set.version) : 0,
        reasonRefs: sortedStrings(set.reasonRefs),
        testCaseIds: sortedStrings(set.testCaseIds),
      } : null;
    })
    .filter(Boolean));
}

function normalizeGates(gates) {
  return sortedById((Array.isArray(gates) ? gates : [])
    .map((gate) => {
      const id = entityId(gate?.id);
      if (!id) return null;
      const checks = (Array.isArray(gate.checks) ? gate.checks : [])
        .map((check) => ({
          key: String(check?.key ?? check?.checkKey ?? ''),
          status: String(check?.status ?? ''),
          evidenceRefs: sortedStrings(check?.evidenceRefs),
        }))
        .sort((left, right) => compareText(left.key, right.key) || compareText(left.status, right.status) || compareText(left.evidenceRefs.join('\u0000'), right.evidenceRefs.join('\u0000')));
      return {
        id,
        kind: gate.kind === 'computed' ? 'computed' : 'approval',
        verdict: gate.verdict ?? null,
        qualityTaskId: entityId(gate.qualityTaskId),
        checks,
      };
    })
    .filter(Boolean));
}

export function buildQualitySnapshot(project = {}) {
  const testcases = normalizeTestcases(project.testcases);
  const testcaseIds = new Set(testcases.map((testcase) => testcase.id));
  return {
    projectId: entityId(project.projectId || project.id),
    requirements: normalizeRequirements(project.requirements, testcaseIds),
    testcases,
    qualityTasks: normalizeQualityTasks(project.qualityTasks),
    testruns: normalizeRuns(project.testruns),
    evidenceBundles: normalizeEvidenceBundles(project.evidenceBundles),
    failureAnalyses: normalizeFailureAnalyses(project.failureAnalyses),
    defects: normalizeDefects(project.defects),
    regressionSets: normalizeRegressionSets(project.regressionSets),
    gates: normalizeGates(project.gates),
  };
}

function canonicalize(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => {
    const normalized = canonicalize(item);
    return normalized === undefined ? null : normalized;
  });
  return Object.fromEntries(Object.keys(value).sort(compareText).flatMap((key) => {
    const normalized = canonicalize(value[key]);
    return normalized === undefined ? [] : [[key, normalized]];
  }));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function insightSort(left, right) {
  return (SEVERITY_ORDER[left.severity] ?? 99) - (SEVERITY_ORDER[right.severity] ?? 99)
    || compareText(left.kind, right.kind)
    || compareText(left.target.type, right.target.type)
    || compareText(left.target.id, right.target.id)
    || compareText(left.reason.code, right.reason.code)
    || compareText(left.id, right.id);
}

export function analyzeQualityFacts(snapshot = {}) {
  const normalized = buildQualitySnapshot(snapshot);
  const inputDigest = digest(normalized);
  const seen = new Set();
  const insights = [];
  for (const item of collectInsightCandidates(normalized)) {
    const evidenceRefs = sortedStrings(item.evidenceRefs);
    const reason = canonicalize(item.reason);
    const duplicateKey = canonicalJson({ kind: item.kind, target: item.target, reason, evidenceRefs });
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    const scopeDigest = digest(item.scope);
    const id = `insight_${digest({ ruleVersion: RULE_VERSION, scopeDigest, kind: item.kind, target: item.target, reason, evidenceRefs })}`;
    insights.push({
      id,
      kind: item.kind,
      target: item.target,
      reason,
      evidenceRefs,
      severity: item.severity,
      status: 'open',
      inputDigest,
      scopeDigest,
      ruleVersion: RULE_VERSION,
      revision: 0,
    });
  }
  insights.sort(insightSort);
  return { insights, inputDigest, generatedAt: new Date().toISOString(), ruleVersion: RULE_VERSION };
}

export function mergeQualityInsightDecisions(analysis, decisions = []) {
  const decisionByInsightId = new Map((Array.isArray(decisions) ? decisions : []).map((decision) => [decision.insightId, decision]));
  return {
    ...analysis,
    insights: analysis.insights.map((insight) => {
      const decision = decisionByInsightId.get(insight.id);
      return decision ? { ...insight, status: decision.status, revision: decision.revision } : insight;
    }),
  };
}

function currentInsight(project, insightId) {
  const analysis = analyzeQualityFacts(buildQualitySnapshot(project));
  const insight = analysis.insights.find((item) => item.id === insightId);
  if (!insight) throw new QualityInsightError('QUALITY_INSIGHT_NOT_FOUND', '当前快照中不存在该 Insight');
  return insight;
}

function validateDecision(project, insightId, options, status) {
  const insight = currentInsight(project, insightId);
  if (options?.scopeDigest !== insight.scopeDigest) throw new QualityInsightError('QUALITY_INSIGHT_STALE', 'Insight 事实范围已变化，请重新加载');
  project.qualityInsightDecisions = Array.isArray(project.qualityInsightDecisions) ? project.qualityInsightDecisions : [];
  if (project.qualityInsightDecisions.some((decision) => decision.insightId === insightId)) {
    throw new QualityInsightError('QUALITY_INSIGHT_ALREADY_DECIDED', '该 Insight 已经有人工决定');
  }
  if (options?.expectedRevision !== insight.revision) throw new QualityInsightError('QUALITY_REVISION_CONFLICT', 'Insight 版本已变化，请重新加载');
  if (!String(options?.actorLabel || '').trim()) throw new QualityInsightError('QUALITY_INSIGHT_ACTOR_INVALID', '操作者不能为空');
  if (status === 'ignored' && !String(options?.reason || '').trim()) throw new QualityInsightError('QUALITY_INSIGHT_REASON_INVALID', '忽略理由不能为空');
  return insight;
}

function saveDecision(project, insight, options, status) {
  const timestamp = now();
  const decision = {
    id: uid('quality-insight-decision'),
    insightId: insight.id,
    inputDigest: insight.inputDigest,
    scopeDigest: insight.scopeDigest,
    status,
    revision: 1,
    actorLabel: String(options.actorLabel).trim(),
    reason: status === 'ignored' ? String(options.reason).trim() : '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  project.qualityInsightDecisions.push(decision);
  return decision;
}

export function resolveInsight(project, insightId, options = {}) {
  const insight = validateDecision(project, insightId, options, 'resolved');
  return saveDecision(project, insight, options, 'resolved');
}

export function ignoreInsight(project, insightId, options = {}) {
  const insight = validateDecision(project, insightId, options, 'ignored');
  return saveDecision(project, insight, options, 'ignored');
}
