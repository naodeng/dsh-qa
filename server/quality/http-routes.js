import fs from 'node:fs';
import path from 'node:path';
import { createQualityTask, getQualityTask, listQualityTasks, normalizeQualityProject } from './task.js';
import { createAnalysisRequest, commitQualityMutation } from './analysis.js';
import { captureSources } from './source.js';
import { createExecutionProfile, createExecutionProfileVersion, disableExecutionProfile } from './execution-profile.js';
import { mapHostExecutionResult, startHostExecution, validateHostExecutionRequest } from './harness-execution.js';
import { createTestRun } from './test-run.js';
import { cancelRun, createRunPreview, startRun } from './test-runner.js';
import { createTestPlanVersion, getTestPlan, reviewTestPlan } from './test-plan.js';
import { ensureEvidenceIntegrity, finalizeEvidence, getEvidenceItemMetadata, resolveEvidence, verifyEvidence } from './evidence.js';
import { compareRuns } from './run-comparison.js';
import { saveFailureAnalysis, promoteConfirmedDefect } from './failure-analysis.js';
import { calculateRegressionSet, createRegressionSet, excludeRegressionCase, recalculateRegressionSet } from './regression.js';
import { enqueueArtifactCleanup, runArtifactCleanup } from './evidence-retention.js';
import { applyGateExceptions, evaluateGate, evaluateQualityGate } from './gate.js';
import { buildDeliveryReport } from './report.js';
import { buildGateTrend } from './gate-trend.js';

export function publicEvidence(bundle) {
  const provenance = bundle.provenance || {};
  return {
    id: bundle.id,
    projectId: bundle.projectId,
    testRunId: bundle.testRunId,
    revision: bundle.revision || 1,
    state: bundle.state,
    integrity: bundle.integrity || 'unknown',
    provenance: {
      sourceDigests: [...(provenance.sourceDigests || [])].sort(),
      commit: provenance.commit ?? bundle.commit ?? null,
      testPlanVersion: provenance.testPlanVersion ?? null,
      regressionSetVersion: provenance.regressionSetVersion ?? null,
      profileId: provenance.profileId ?? null,
      profileVersion: provenance.profileVersion ?? null,
    },
    commit: bundle.commit ?? provenance.commit ?? null,
    verifiedAt: bundle.verifiedAt || null,
    totalSize: bundle.totalSize,
    manifestHash: bundle.manifestHash || bundle.manifestSha256,
    manifestSha256: bundle.manifestSha256,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
    items: (bundle.items || []).map((item) => ({
      id: item.id,
      relativePath: item.relativePath,
      type: item.type || getEvidenceItemMetadata(item.relativePath).type,
      mimeType: item.mimeType || getEvidenceItemMetadata(item.relativePath).mimeType,
      size: item.size,
      sha256: item.sha256,
      capturedAt: item.capturedAt || bundle.verifiedAt || bundle.createdAt || null,
    })),
  };
}

function revisionConflict(res, fail, message) {
  return fail(res, 409, message, 'QUALITY_REVISION_CONFLICT');
}

function onlyFields(body, fields) {
  return Object.keys(body || {}).every((field) => fields.includes(field));
}

const LOCAL_PROFILE_FIELDS = ['name', 'executor', 'cwdRelative', 'targetFiles', 'networkIntent', 'timeoutMs'];
const HOST_PROFILE_FIELDS = ['name', 'kind', 'provider', 'capabilities', 'targetPolicy', 'artifactPolicy', 'timeoutMs'];
const HOST_EXECUTION_FIELDS = ['profileId', 'provider', 'capability', 'target', 'timeoutMs', 'artifactPolicy', 'expectedRevision', 'attemptGroupId'];
const HOST_EXECUTION_STATUSES = new Set(['queued', 'running', 'passed', 'failed', 'cancelled', 'timed_out', 'provider_error', 'blocked', 'not_run']);
const TERMINAL_HOST_EXECUTION_STATUSES = new Set(['passed', 'failed', 'cancelled', 'timed_out', 'provider_error', 'blocked', 'not_run']);
const retryClaims = new WeakSet();

function hostAdapterFor(hostAdapters, request) {
  if (!hostAdapters) return undefined;
  const keys = [...new Set([request.adapterId, request.request?.adapterId, `${request.provider}:${request.capability}`, request.provider].filter(Boolean))];
  if (hostAdapters instanceof Map) return keys.map((key) => hostAdapters.get(key)).find(Boolean);
  if (typeof hostAdapters === 'object') return keys.map((key) => hostAdapters[key]).find(Boolean);
  return undefined;
}

function hostResultFromExecution(execution) {
  return {
    status: execution.status,
    artifacts: execution.artifacts || [],
    ...(execution.providerExecutionId ? { providerExecutionId: execution.providerExecutionId } : {}),
    ...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
    ...(execution.errorSummary ? { errorSummary: execution.errorSummary } : {}),
    ...(execution.summary ? { summary: execution.summary } : {}),
  };
}

function defaultHostErrorCode(status) {
  if (status === 'provider_error') return 'provider_error';
  if (status === 'blocked' || status === 'not_run') return 'provider_unavailable';
  return undefined;
}

function normalizeHostExecutionForStore(execution, testRunId) {
  const safe = structuredClone(execution);
  delete safe.stagingRoot;
  delete safe.artifactDir;
  delete safe.command;
  if (safe.request && typeof safe.request === 'object') {
    delete safe.request.stagingRoot;
    delete safe.request.artifactDir;
    delete safe.request.command;
  }
  if (testRunId) safe.testRunId = testRunId;
  if (HOST_EXECUTION_STATUSES.has(safe.status)) safe.errorCode ||= defaultHostErrorCode(safe.status);
  return safe;
}

function publicHostExecution(execution) {
  return normalizeHostExecutionForStore(execution);
}

function publicTestRun(run) {
  if (!run) return null;
  const { artifactDir, command, ...safe } = run;
  return safe;
}

function hostExecutionForMapping(project, execution) {
  if (execution.stagingRoot || !project?.artifactRoot) return execution;
  return { ...execution, stagingRoot: path.join(project.artifactRoot, `${execution.id}.staging`) };
}

function createHostTestRun(project, execution, testRunPatch, clock = () => new Date().toISOString()) {
  const run = createTestRun(project, {
    mode: 'local',
    executor: `host:${execution.provider}:${execution.capability}`,
    summary: testRunPatch.summary || '',
    provenance: testRunPatch.provenance,
  });
  Object.assign(run, testRunPatch, { revision: 1, updatedAt: clock() });
  return run;
}

function findHostExecution(project, executionId) {
  return project?.hostExecutions?.find((item) => item.id === executionId) || null;
}

function hostFailure(res, fail, error) {
  const status = error?.code === 'QUALITY_REVISION_CONFLICT' || error?.code === 'HOST_EXECUTION_NOT_CANCELLABLE' || error?.code === 'HOST_EXECUTION_SUPERSEDED' || error?.code === 'HOST_EXECUTION_RETRY_IN_FLIGHT' ? 409 : 400;
  return fail(res, status, error?.message || 'Host execution 请求无效', error?.code);
}

function publishHostExecution(broadcast, project, execution) {
  broadcast('quality.host-execution.updated', {
    projectId: project.id,
    entityId: execution.id,
    attemptGroupId: execution.attemptGroupId,
    status: execution.status,
    revision: execution.revision,
    updatedAt: execution.updatedAt,
  });
}

function publishTestRun(broadcast, project, run) {
  broadcast('quality.test-run.updated', { projectId: project.id, runId: run.id, status: run.status, revision: run.revision, updatedAt: run.updatedAt });
}

function persistHostExecutionTransition(project, execution, store, broadcast, emitProject) {
  if (HOST_EXECUTION_STATUSES.has(execution.status)) execution.errorCode ||= defaultHostErrorCode(execution.status);
  project.hostExecutions ||= [];
  let record = findHostExecution(project, execution.id);
  let run = record?.testRunId ? project.testruns?.find((item) => item.id === record.testRunId) : null;

  if (!record) {
    const testRunPatch = mapHostExecutionResult(project, hostExecutionForMapping(project, execution), hostResultFromExecution(execution));
    run = createHostTestRun(project, execution, testRunPatch, store.now);
    execution.testRunId = run.id;
    record = normalizeHostExecutionForStore(execution, run.id);
    project.hostExecutions.push(record);
  } else {
    if (!run) throw new Error('Host execution 对应的 TestRun 不存在');
    const testRunPatch = mapHostExecutionResult(project, hostExecutionForMapping(project, execution), hostResultFromExecution(execution));
    Object.assign(run, testRunPatch, { revision: (run.revision || 1) + 1, updatedAt: store.now() });
    Object.assign(record, normalizeHostExecutionForStore(execution, run.id));
  }

  store.touch(project);
  store.persist();
  publishHostExecution(broadcast, project, record);
  publishTestRun(broadcast, project, run);
  emitProject(project.id);
  return { execution: record, run };
}

async function startAndPersistHostExecution(project, normalizedRequest, adapter, store, broadcast, emitProject) {
  let currentRecord = null;
  const result = await startHostExecution(project, normalizedRequest, adapter, {
    onTransition: async (execution) => {
      const transition = persistHostExecutionTransition(project, execution, store, broadcast, emitProject);
      currentRecord = transition.execution;
    },
    shouldStop: () => currentRecord?.status === 'cancelled' || TERMINAL_HOST_EXECUTION_STATUSES.has(currentRecord?.status),
  });
  const execution = findHostExecution(project, result.id) || currentRecord;
  const run = execution?.testRunId ? project.testruns?.find((item) => item.id === execution.testRunId) : null;
  if (!execution || !run) throw new Error('Host execution 未能建立对应的 TestRun');
  return { execution, run };
}

function gateFacts(project, task) {
  const runs = project.testruns || [];
  const latestRun = runs.at(-1);
  const profile = latestRun?.provenance?.profileId && (project.executionProfiles || []).find((item) => item.id === latestRun.provenance.profileId);
  const plan = latestRun?.provenance?.planId && (project.testPlans || []).find((item) => item.id === latestRun.provenance.planId);
  const regression = (project.regressionSets || []).filter((item) => item.qualityTaskId === task.id).at(-1);
  return {
    latestRun,
    evidence: (project.evidenceBundles || []).filter((bundle) => bundle.testRunId === latestRun?.id),
    risks: task.risks || [],
    provenance: {
      sourceDigests: (task.sources || []).map((source) => source.digest).sort(),
      commit: task.commit ?? latestRun?.provenance?.commit ?? null,
      testPlanVersion: plan?.version || latestRun?.provenance?.testPlanVersion || null,
      regressionSetVersion: regression?.version || latestRun?.provenance?.regressionSetVersion || null,
      profileId: profile?.id ?? latestRun?.provenance?.profileId ?? null,
      profileVersion: profile?.currentVersion || latestRun?.provenance?.profileVersion || null,
    },
  };
}

export async function handleQualityRoutes({ req, res, url, body, store, hostAdapters, broadcast, emitProject, ok, created, accepted, fail }) {
  const parts = url.pathname.split('/').filter(Boolean);
  const m = (method) => req.method === method;
  const refreshEvidence = async (project) => {
    if (!await ensureEvidenceIntegrity(project)) return false;
    store.touch(project); store.persist(); emitProject(project.id);
    return true;
  };

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

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'host-executions' && parts[6] === 'preview' && !parts[7] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!getQualityTask(c, parts[4])) return fail(res, 404, '质量任务不存在');
    if (!onlyFields(body, HOST_EXECUTION_FIELDS)) return fail(res, 400, '包含不允许的字段');
    try {
      const request = validateHostExecutionRequest(c, parts[4], body);
      return ok(res, { preview: { ...request, adapterAvailable: Boolean(hostAdapterFor(hostAdapters, request)) } });
    } catch (error) { return hostFailure(res, fail, error); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'host-executions' && !parts[6] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!getQualityTask(c, parts[4])) return fail(res, 404, '质量任务不存在');
    if (!onlyFields(body, HOST_EXECUTION_FIELDS)) return fail(res, 400, '包含不允许的字段');
    try {
      const request = validateHostExecutionRequest(c, parts[4], body);
      const result = await startAndPersistHostExecution(c, request, hostAdapterFor(hostAdapters, request), store, broadcast, emitProject);
      return accepted(res, { execution: result.execution, testRun: publicTestRun(result.run) });
    } catch (error) { return hostFailure(res, fail, error); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'host-executions' && parts[4] && !parts[5] && m('GET')) {
    const c = store.getProject(parts[2]);
    const execution = findHostExecution(c, parts[4]);
    if (!execution) return fail(res, 404, 'Host execution 不存在');
    const run = c.testruns?.find((item) => item.id === execution.testRunId) || null;
    return ok(res, { execution: publicHostExecution(execution), testRun: publicTestRun(run) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'host-executions' && parts[4] && parts[5] === 'cancel' && !parts[6] && m('POST')) {
    const c = store.getProject(parts[2]);
    const execution = findHostExecution(c, parts[4]);
    if (!execution) return fail(res, 404, 'Host execution 不存在');
    if (!onlyFields(body, ['expectedRevision'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== execution.revision) return revisionConflict(res, fail, 'Host execution 版本已变化，请重新加载');
    if (!['queued', 'running'].includes(execution.status)) return hostFailure(res, fail, Object.assign(new Error('Host execution 当前不可取消'), { code: 'HOST_EXECUTION_NOT_CANCELLABLE' }));
    execution.status = 'cancelled';
    execution.revision += 1;
    execution.updatedAt = store.now();
    const transition = persistHostExecutionTransition(c, execution, store, broadcast, emitProject);
    const adapter = hostAdapterFor(hostAdapters, execution);
    if (typeof adapter?.cancel === 'function') {
      try {
        const cancelResult = adapter.cancel(structuredClone(execution.request || execution));
        if (cancelResult && typeof cancelResult.catch === 'function') cancelResult.catch(() => {});
      } catch {
        // Cancellation is already persisted as the source-of-truth state.
      }
    }
    const run = transition.run;
    return ok(res, { execution: publicHostExecution(execution), testRun: publicTestRun(run) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'host-executions' && parts[4] && parts[5] === 'retry' && !parts[6] && m('POST')) {
    const c = store.getProject(parts[2]);
    const previous = findHostExecution(c, parts[4]);
    if (!previous) return fail(res, 404, 'Host execution 不存在');
    if (!onlyFields(body, ['expectedRevision'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== previous.revision) return revisionConflict(res, fail, 'Host execution 版本已变化，请重新加载');
    if (!TERMINAL_HOST_EXECUTION_STATUSES.has(previous.status)) return hostFailure(res, fail, Object.assign(new Error('只有终态 Host execution 可以重试'), { code: 'HOST_EXECUTION_NOT_RETRYABLE' }));
    if (previous.supersededBy) return hostFailure(res, fail, Object.assign(new Error('Host execution 已被新的尝试替代'), { code: 'HOST_EXECUTION_SUPERSEDED' }));
    if (retryClaims.has(previous)) return hostFailure(res, fail, Object.assign(new Error('Host execution 重试已在进行中'), { code: 'HOST_EXECUTION_RETRY_IN_FLIGHT' }));
    retryClaims.add(previous);
    try {
      const request = validateHostExecutionRequest(c, previous.qualityTaskId, {
        profileId: previous.profileId,
        provider: previous.provider,
        capability: previous.capability,
        target: previous.target,
        timeoutMs: previous.timeoutMs,
        artifactPolicy: previous.artifactPolicy,
        expectedRevision: previous.request?.expectedRevision,
        attemptGroupId: previous.attemptGroupId,
      });
      const result = await startAndPersistHostExecution(c, request, hostAdapterFor(hostAdapters, request), store, broadcast, emitProject);
      previous.supersededBy = result.execution.id;
      previous.revision += 1;
      previous.updatedAt = store.now();
      store.touch(c); store.persist();
      publishHostExecution(broadcast, c, previous);
      emitProject(c.id);
      return accepted(res, { execution: result.execution, testRun: publicTestRun(result.run) });
    } catch (error) { return hostFailure(res, fail, error); }
    finally { retryClaims.delete(previous); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const profileFields = body?.kind === 'host' ? HOST_PROFILE_FIELDS : LOCAL_PROFILE_FIELDS;
    if (!onlyFields(body, profileFields)) return fail(res, 400, '包含不允许的字段');
    try { const profile = createExecutionProfile(c, body); store.touch(c); store.persist(); return created(res, { profile }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && parts[4] && parts[5] === 'versions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const profile = c?.executionProfiles?.find((item) => item.id === parts[4]);
    if (!profile) return fail(res, 404, '执行配置不存在');
    const profileFields = profile.kind === 'host' ? HOST_PROFILE_FIELDS : LOCAL_PROFILE_FIELDS;
    if (!onlyFields(body, ['expectedRevision', ...profileFields])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== (profile.currentVersion || profile.version)) return revisionConflict(res, fail, '执行配置版本已变化，请重新加载');
    try {
      const { expectedRevision, ...versionFields } = body;
      void expectedRevision;
      const version = createExecutionProfileVersion(c, profile.id, versionFields); store.touch(c); store.persist(); return created(res, { profile: version });
    }
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
    } catch (error) { return fail(res, /完整性/.test(error.message) ? 409 : 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'evidence' && !parts[6] && m('GET')) {
    const c = store.getProject(parts[2]);
    const run = c?.testruns?.find((item) => item.id === parts[4]);
    if (!c || !run) return fail(res, 404, '测试运行不存在');
    await refreshEvidence(c);
    return ok(res, { evidence: (c.evidenceBundles || []).filter((bundle) => bundle.testRunId === run.id).map(publicEvidence) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && !parts[4] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    await refreshEvidence(c);
    return ok(res, { evidence: (c.evidenceBundles || []).map(publicEvidence) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && parts[4] && parts[5] === 'items' && parts[7] === 'download' && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    await refreshEvidence(c);
    const rawBundle = c.evidenceBundles?.find((item) => item.id === parts[4]);
    if (rawBundle?.state === 'integrity-failed' || rawBundle?.integrity === 'failed') return fail(res, 409, '证据完整性校验失败');
    const bundle = resolveEvidence(c, parts[4]);
    if (!bundle) return fail(res, 404, '证据包不存在');
    const itemId = parts[6];
    const item = bundle.items.find((entry) => entry.id === itemId);
    const resolvedPath = item?.relativePath || '';
    if (!item || path.isAbsolute(resolvedPath) || resolvedPath.split(/[\\/]/).includes('..')) return fail(res, 400, '证据文件路径无效');
    const integrity = await verifyEvidence(bundle);
    if (!integrity.ok) return fail(res, 409, '证据完整性校验失败');
    const file = path.join(bundle.root, resolvedPath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, '证据文件不存在');
    const mimeType = item.mimeType || getEvidenceItemMetadata(resolvedPath).mimeType;
    const previewable = ['text/plain', 'image/png', 'image/jpeg'].includes(mimeType.split(';')[0]);
    res.writeHead(200, { 'Content-Type': mimeType, 'Content-Length': String(item.size), 'Content-Disposition': `${previewable ? 'inline' : 'attachment'}; filename="${path.basename(resolvedPath).replace(/[^a-zA-Z0-9._-]/g, '_')}"` });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && parts[4] && parts[5] === 'download') return fail(res, 404, '接口不存在');

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'compare' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['otherRunId'])) return fail(res, 400, '包含不允许的字段');
    try { return ok(res, { comparison: compareRuns(c, body.otherRunId, parts[4]) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'compare' && parts[6] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { return ok(res, { comparison: compareRuns(c, parts[4], parts[6]) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && ['failure-analysis', 'failure-analyses'].includes(parts[5]) && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!onlyFields(body, ['category', 'summary', 'rootCause', 'suspectedCause', 'confidence', 'decision', 'failureStep', 'errorSummary', 'historicalDefectIds'])) return fail(res, 400, '包含不允许的字段');
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

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'regression-sets' && !parts[6] && m('POST')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    if (!onlyFields(body, ['name', 'inputDigest'])) return fail(res, 400, '包含不允许的字段');
    try {
      const calculated = calculateRegressionSet(c, task.id, String(body.inputDigest || ''));
      const existing = (c.regressionSets || []).find((item) => item.id === calculated.id);
      if (existing) return ok(res, { regressionSet: existing });
      calculated.name = String(body.name || `质量任务 ${task.title} 回归`);
      calculated.createdAt = store.now(); calculated.updatedAt = calculated.createdAt;
      c.regressionSets ||= []; c.regressionSets.push(calculated); store.touch(c); store.persist(); emitProject(c.id);
      return created(res, { regressionSet: calculated });
    } catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'regression-sets' && parts[4] && parts[5] === 'recalculate' && m('POST')) {
    const c = store.getProject(parts[2]);
    const set = c?.regressionSets?.find((item) => item.id === parts[4]);
    if (!set) return fail(res, 404, '回归集不存在');
    if (!onlyFields(body, ['expectedRevision', 'inputDigest'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== set.version) return revisionConflict(res, fail, '回归集版本已变化，请重新加载');
    try { const updated = recalculateRegressionSet(c, set.id, String(body.inputDigest || '')); store.touch(c); store.persist(); emitProject(c.id); return ok(res, { regressionSet: updated }); }
    catch (error) { return fail(res, 400, error.message); }
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
    await refreshEvidence(c);
    return ok(res, { gate: evaluateQualityGate(c) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'gates' && parts[6] === 'evaluate' && m('POST')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    if (!onlyFields(body, [])) return fail(res, 400, '包含不允许的字段');
    await refreshEvidence(c);
    const result = evaluateGate(gateFacts(c, task), { version: 'gate-rules-v1', requireVerifiedEvidence: true, blockCriticalOpenRisk: true });
    const gate = { id: store.uid('gate'), kind: 'computed', revision: 1, qualityTaskId: task.id, ...result, exceptions: [], calculatedAt: store.now() };
    c.gates.push(gate); store.touch(c); store.persist();
    broadcast('quality.gate.updated', { projectId: c.id, entityId: gate.id, revision: gate.revision, updatedAt: gate.calculatedAt });
    emitProject(c.id);
    return created(res, { gate });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'gates' && parts[4] && !parts[5] && m('GET')) {
    const c = store.getProject(parts[2]);
    const gate = c?.gates?.find((item) => item.id === parts[4]);
    if (!gate) return fail(res, 404, '门禁不存在');
    return ok(res, { gate });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'gates' && parts[4] && parts[5] === 'exceptions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const gate = c?.gates?.find((item) => item.id === parts[4] && item.kind === 'computed');
    if (!gate) return fail(res, 404, '计算门禁不存在');
    if (!onlyFields(body, ['expectedRevision', 'checkKey', 'actorLabel', 'reason', 'expiresAt'])) return fail(res, 400, '包含不允许的字段');
    if (body.expectedRevision !== gate.revision) return revisionConflict(res, fail, '门禁版本已变化，请重新加载');
    const preview = applyGateExceptions(gate, [{ checkKey: body.checkKey, actorLabel: body.actorLabel, reason: body.reason, expiresAt: body.expiresAt }]);
    if (!preview.checks.some((check) => check.checkKey === body.checkKey || check.key === body.checkKey && check.waived)) return fail(res, 400, '门禁例外无效或不可豁免');
    gate.exceptions.push({ checkKey: body.checkKey, actorLabel: String(body.actorLabel).trim(), reason: String(body.reason).trim(), expiresAt: body.expiresAt, createdAt: store.now() });
    gate.revision += 1; gate.checks = preview.checks; gate.verdict = preview.verdict; gate.updatedAt = store.now(); store.touch(c); store.persist();
    broadcast('quality.gate.updated', { projectId: c.id, entityId: gate.id, revision: gate.revision, updatedAt: gate.updatedAt }); emitProject(c.id);
    return created(res, { gate });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'reports' && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c || !getQualityTask(c, parts[4])) return fail(res, 404, '质量任务不存在');
    await refreshEvidence(c);
    const gate = (c.gates || []).filter((item) => item.kind === 'computed' && item.qualityTaskId === parts[4]).at(-1);
    if (!gate) return fail(res, 404, '尚未生成质量门禁');
    try { return ok(res, { report: buildDeliveryReport(c, gate.id) }); } catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'gate-trends' && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c || !getQualityTask(c, parts[4])) return fail(res, 404, '质量任务不存在');
    return ok(res, { trend: buildGateTrend(c, parts[4]) });
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
    catch (error) { store.touch(c); store.persist(); return fail(res, 400, error.message); }
  }

  return false;
}
