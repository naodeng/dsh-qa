import fs from 'node:fs';
import path from 'node:path';
import { createQualityTask, getQualityTask, listQualityTasks, normalizeQualityProject } from './task.js';
import { createAnalysisRequest, commitQualityMutation } from './analysis.js';
import { captureSources } from './source.js';
import { createExecutionProfile, createExecutionProfileVersion, disableExecutionProfile } from './execution-profile.js';
import { cancelRun, createRunPreview, startRun } from './test-runner.js';
import { createTestPlanVersion, getTestPlan, reviewTestPlan } from './test-plan.js';
import { finalizeEvidence, resolveEvidence, verifyEvidence } from './evidence.js';
import { compareRuns } from './run-comparison.js';
import { saveFailureAnalysis, promoteConfirmedDefect } from './failure-analysis.js';
import { createRegressionSet, excludeRegressionCase } from './regression.js';
import { enqueueArtifactCleanup, runArtifactCleanup } from './evidence-retention.js';
import { evaluateQualityGate } from './gate.js';

export function publicEvidence(bundle) {
  return { id: bundle.id, projectId: bundle.projectId, testRunId: bundle.testRunId, state: bundle.state, totalSize: bundle.totalSize, manifestSha256: bundle.manifestSha256, createdAt: bundle.createdAt, updatedAt: bundle.updatedAt, items: bundle.items.map(({ id, relativePath, size, sha256 }) => ({ id, relativePath, size, sha256 })) };
}

function revisionConflict(res, fail, message) {
  return fail(res, 409, message, 'QUALITY_REVISION_CONFLICT');
}

function onlyFields(body, fields) {
  return Object.keys(body || {}).every((field) => fields.includes(field));
}

export async function handleQualityRoutes({ req, res, url, body, store, broadcast, emitProject, ok, created, accepted, fail }) {
  const parts = url.pathname.split('/').filter(Boolean);
  const m = (method) => req.method === method;

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && !parts[4]) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    normalizeQualityProject(c);
    if (m('GET')) return ok(res, { tasks: listQualityTasks(c) });
    if (m('POST')) {
      if (!onlyFields(body, ['title', 'sources'])) return fail(res, 400, '包含不允许的字段');
      if (!String(body.title || '').trim()) return fail(res, 400, '质量任务标题不能为空');
      try {
        const sources = await captureSources(c, body.sources || []);
        const task = createQualityTask(c, { title: body.title, sources });
        store.touch(c); store.persist(); emitProject(c.id);
        return created(res, { task });
      } catch (error) { return fail(res, 400, error.message); }
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && !parts[5] && m('GET')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    return ok(res, { task });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'analysis-requests' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const request = createAnalysisRequest(c, parts[4]);
    if (!request) return fail(res, 404, '质量任务不存在');
    store.touch(c); store.persist();
    return accepted(res, { request });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'decisions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    if (!onlyFields(body, ['expectedRevision', 'riskId', 'action', 'actorLabel', 'reason'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== task.version) return revisionConflict(res, fail, '质量任务版本已变化，请重新加载');
    if (!String(body.actorLabel || '').trim() || !['confirm', 'dismiss', 'mitigate', 'accept', 'close'].includes(body.action)) return fail(res, 400, '风险决定参数无效');
    const updated = commitQualityMutation(c, task.id, body.expectedRevision, (target) => {
      const risk = (target.risks || []).find((item) => item.id === body.riskId);
      if (!risk) throw new Error('风险不存在');
      if (body.action === 'confirm') risk.assessmentStatus = 'confirmed';
      if (body.action === 'dismiss') risk.assessmentStatus = 'dismissed';
      if (body.action === 'mitigate') risk.dispositionStatus = 'mitigated';
      if (body.action === 'accept') risk.dispositionStatus = 'accepted';
      if (body.action === 'close') risk.dispositionStatus = 'closed';
      target.decisions.push({ riskId: risk.id, action: body.action, actorLabel: String(body.actorLabel).trim(), reason: String(body.reason || ''), createdAt: store.now() });
    }, { action: 'risk-decide', source: 'http', actorLabel: String(body.actorLabel).trim() });
    if (!updated) return revisionConflict(res, fail, '质量任务版本已变化，请重新加载');
    emitProject(c.id);
    return ok(res, { task: updated });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'manual-analyses' && m('POST')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    if (!onlyFields(body, ['expectedRevision', 'actorLabel', 'sourceDigests', 'acceptanceCriteria', 'risks', 'testScope'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== task.version) return revisionConflict(res, fail, '质量任务版本已变化，请重新加载');
    const sourceDigests = Array.isArray(body.sourceDigests) ? [...body.sourceDigests].sort() : [];
    const currentDigests = (task.sources || []).map((source) => source.digest).sort();
    if (!String(body.actorLabel || '').trim() || sourceDigests.join('|') !== currentDigests.join('|')) return fail(res, 400, '手工分析需要确认人和当前来源摘要');
    const updated = commitQualityMutation(c, task.id, body.expectedRevision, (target) => {
      target.acceptanceCriteria = Array.isArray(body.acceptanceCriteria) ? body.acceptanceCriteria : [];
      target.risks = Array.isArray(body.risks) ? body.risks : [];
      target.testScope = Array.isArray(body.testScope) ? body.testScope : [];
      target.analysisOrigin = 'manual'; target.analysisRuns ||= [];
      target.analysisRuns.push({ actorLabel: String(body.actorLabel).trim(), dshSessionId: '', at: store.now(), origin: 'manual', sourceDigests });
    }, { action: 'manual-analysis-save', source: 'http', actorLabel: String(body.actorLabel).trim() });
    if (!updated) return revisionConflict(res, fail, '质量任务版本已变化，请重新加载');
    emitProject(c.id);
    return created(res, { task: updated });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['name', 'executor', 'cwdRelative', 'targetFiles', 'networkIntent', 'timeoutMs'])) return fail(res, 400, '包含不允许的字段');
    try { const profile = createExecutionProfile(c, body); store.touch(c); store.persist(); return created(res, { profile }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && parts[4] && parts[5] === 'versions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const profile = c?.executionProfiles?.find((item) => item.id === parts[4]);
    if (!profile) return fail(res, 404, '执行配置不存在');
    if (!onlyFields(body, ['expectedRevision', 'name', 'executor', 'cwdRelative', 'targetFiles', 'networkIntent', 'timeoutMs'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== (profile.currentVersion || profile.version)) return revisionConflict(res, fail, '执行配置版本已变化，请重新加载');
    try { const version = createExecutionProfileVersion(c, profile.id, body); store.touch(c); store.persist(); return created(res, { profile: version }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && parts[4] && parts[5] === 'disable' && m('POST')) {
    const c = store.getProject(parts[2]);
    const profile = c?.executionProfiles?.find((item) => item.id === parts[4]);
    if (!profile) return fail(res, 404, '执行配置不存在');
    if (!onlyFields(body, ['expectedRevision'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== (profile.currentVersion || profile.version)) return revisionConflict(res, fail, '执行配置版本已变化，请重新加载');
    const disabled = disableExecutionProfile(c, profile.id); store.touch(c); store.persist(); return ok(res, { profile: disabled });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'run-preview' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['profileId'])) return fail(res, 400, '包含不允许的字段');
    try { return ok(res, { preview: createRunPreview(c, parts[4], body.profileId) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'review' && m('POST')) {
    const c = store.getProject(parts[2]);
    const plan = c && getTestPlan(c, parts[4]);
    if (!plan) return fail(res, 404, '测试计划不存在');
    if (!onlyFields(body, ['expectedRevision', 'actorLabel'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== plan.version) return revisionConflict(res, fail, '测试计划版本已变化，请重新加载');
    try { const reviewed = reviewTestPlan(c, plan.id, body.actorLabel); store.touch(c); store.persist(); return ok(res, { plan: reviewed }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'versions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const plan = c && getTestPlan(c, parts[4]);
    if (!plan) return fail(res, 404, '测试计划不存在');
    if (!onlyFields(body, ['expectedRevision', 'testcaseIds'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== plan.version) return revisionConflict(res, fail, '测试计划版本已变化，请重新加载');
    try { const version = createTestPlanVersion(c, plan.id, body); store.touch(c); store.persist(); return created(res, { plan: version }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'runs' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['previewToken'])) return fail(res, 400, '包含不允许的字段');
    try {
      const run = await startRun(c, body.previewToken, { defer: true, planId: parts[4] });
      return accepted(res, { run: { id: run.id, status: run.status, revision: run.revision, mode: run.mode, resultTrust: run.resultTrust } });
    } catch (error) {
      return fail(res, error.code === 'QUALITY_RUN_PREVIEW_STALE' ? 409 : 400, error.message, error.code);
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'cancel' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const run = c.testruns?.find((item) => item.id === parts[4]);
    if (!run) return fail(res, 404, '测试运行不存在');
    if (!onlyFields(body, ['expectedRevision'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== (run.revision || 1)) return revisionConflict(res, fail, '测试运行版本已变化，请重新加载');
    try {
      const cancelled = await cancelRun(c, parts[4], body.expectedRevision);
      return ok(res, { run: { id: cancelled.id, status: cancelled.status, revision: cancelled.revision } });
    } catch (error) {
      return fail(res, error.code === 'QUALITY_REVISION_CONFLICT' ? 409 : 400, error.message, error.code);
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'evidence' && parts[6] === 'finalize' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const run = c.testruns?.find((item) => item.id === parts[4]);
    if (!run) return fail(res, 404, '测试运行不存在');
    if (!onlyFields(body, ['expectedRunRevision'])) return fail(res, 400, '包含不允许的字段');
    const existing = c.evidenceBundles?.find((item) => item.testRunId === run.id && item.state === 'ready');
    if (!existing && body.expectedRunRevision !== (run.revision || 1)) return revisionConflict(res, fail, '测试运行版本已变化，请重新加载');
    try {
      const bundle = await finalizeEvidence(c, parts[4]);
      if (!existing) {
        run.evidenceRefs = [...new Set([...(run.evidenceRefs || []), bundle.id])];
        store.touch(c); store.persist();
        broadcast('quality.evidence.updated', { projectId: c.id, entityId: bundle.id, revision: 1, updatedAt: bundle.updatedAt });
        return created(res, { evidence: publicEvidence(bundle) });
      }
      return ok(res, { evidence: publicEvidence(bundle) });
    } catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && !parts[4] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['otherRunId'])) return fail(res, 400, '包含不允许的字段');
    return ok(res, { evidence: (c.evidenceBundles || []).map(publicEvidence) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && parts[4] && parts[5] === 'items' && parts[7] === 'download' && m('GET')) {
    const c = store.getProject(parts[2]);
    const bundle = c && resolveEvidence(c, parts[4]);
    if (!bundle) return fail(res, 404, '证据包不存在');
    const itemId = parts[6];
    const item = bundle.items.find((entry) => entry.id === itemId);
    const resolvedPath = item?.relativePath || '';
    if (!item || path.isAbsolute(resolvedPath) || resolvedPath.split(/[\\/]/).includes('..')) return fail(res, 400, '证据文件路径无效');
    if (!(await verifyEvidence(bundle)).ok) return fail(res, 409, '证据完整性校验失败');
    const file = path.join(bundle.root, resolvedPath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, '证据文件不存在');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(item.size), 'Content-Disposition': `attachment; filename="${path.basename(resolvedPath).replace(/[^a-zA-Z0-9._-]/g, '_')}"` });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && parts[4] && parts[5] === 'download') return fail(res, 404, '接口不存在');

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'compare' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['category', 'summary', 'rootCause'])) return fail(res, 400, '包含不允许的字段');
    try { return ok(res, { comparison: compareRuns(c, parts[4], body.otherRunId) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'compare' && parts[6] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { return ok(res, { comparison: compareRuns(c, parts[4], parts[6]) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'failure-analysis' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const analysis = saveFailureAnalysis(c, parts[4], body); store.touch(c); store.persist(); return created(res, { analysis }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'failure-analyses' && parts[4] && parts[5] === 'promote-defect' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const analysis = c.failureAnalyses?.find((item) => item.id === parts[4]);
    if (!analysis) return fail(res, 404, '故障分析不存在');
    if (!onlyFields(body, ['expectedRevision', 'actor', 'actorLabel', 'confirmed'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== analysis.version) return revisionConflict(res, fail, '故障分析版本已变化，请重新加载');
    try { const defect = promoteConfirmedDefect(c, parts[4], body); store.touch(c); store.persist(); return created(res, { defect }); }
    catch (error) { return fail(res, /已升级|已创建/.test(error.message) ? 409 : 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'regression-sets' && !parts[4]) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (m('GET')) return ok(res, { regressionSets: c.regressionSets || [] });
    if (m('POST')) {
      if (!onlyFields(body, ['name', 'testCaseIds'])) return fail(res, 400, '包含不允许的字段');
      try { const set = createRegressionSet(c, body); store.touch(c); store.persist(); return created(res, { regressionSet: set }); }
      catch (error) { return fail(res, 400, error.message); }
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'regression-sets' && parts[4] && parts[5] === 'exclude' && m('POST')) {
    const c = store.getProject(parts[2]);
    const set = c?.regressionSets?.find((item) => item.id === parts[4]);
    if (!set) return fail(res, 404, '回归集不存在');
    if (!onlyFields(body, ['expectedRevision', 'testCaseId', 'actor', 'reason'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== set.version) return revisionConflict(res, fail, '回归集版本已变化，请重新加载');
    try { const updated = excludeRegressionCase(set, body.testCaseId, body); store.touch(c); store.persist(); return ok(res, { regressionSet: updated }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-gate' && !parts[4] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['before'])) return fail(res, 400, '包含不允许的字段');
    return ok(res, { gate: evaluateQualityGate(c) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'artifact-cleanup' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, [])) return fail(res, 400, '包含不允许的字段');
    try { const job = enqueueArtifactCleanup(c, body); store.touch(c); store.persist(); return accepted(res, { job }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'artifact-cleanup' && parts[4] && parts[5] === 'run' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const job = await runArtifactCleanup(c, parts[4]); store.touch(c); store.persist(); return ok(res, { job }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  return false;
}
