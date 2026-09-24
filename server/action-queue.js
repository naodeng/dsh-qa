const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;
const PRIORITY_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });
const STATUS_RANK = Object.freeze({ blocked: 3, needs_action: 2, in_progress: 1 });
const SAFE_REASON = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export class ActionQueueSourceError extends Error {
  constructor(message = 'Action Queue 数据源暂不可用') {
    super(message);
    this.name = 'ActionQueueSourceError';
    this.code = 'ACTION_QUEUE_SOURCE_UNAVAILABLE';
  }
}

function normalizeLimit(value = DEFAULT_LIMIT) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    const error = new Error('limit 必须是 1 到 50 的整数');
    error.code = 'ACTION_QUEUE_INVALID_LIMIT';
    throw error;
  }
  return value;
}

function normalizeNow(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('now 必须是有效日期');
  return date;
}

function cleanText(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return text.slice(0, max);
}

function safeReasonCode(value, fallback) {
  const reason = cleanText(value, fallback, 64).toLowerCase().replace(/\s+/g, '_');
  return SAFE_REASON.test(reason) ? reason : fallback;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value) {
  const normalized = isoDate(value);
  return normalized ? normalized.slice(0, 10) : '';
}

function startOfDay(value) {
  const date = new Date(value.getTime());
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function daysBetween(dueAt, now) {
  if (!dueAt) return '';
  return Math.round((startOfDay(new Date(dueAt)) - startOfDay(now)) / 86_400_000);
}

function action({ kind, priority, status, actionRequired, project, entityId, titleKey, reasonCode, reasonArgs = {}, dueAt = null, sourceType, sourceId, attemptGroupId, tab = 'qualityTasks', targetView = 'project-detail' }) {
  const projectId = cleanText(project?.id, '', 128);
  const entity = cleanText(entityId, '', 128);
  return {
    id: `${kind}:${projectId}:${entity}`,
    kind,
    priority,
    status,
    actionRequired,
    projectId,
    entityId: entity,
    projectTitle: cleanText(project?.title, '未命名项目', 160),
    titleKey,
    reasonCode: safeReasonCode(reasonCode, 'action_required'),
    reasonArgs: structuredClone(reasonArgs),
    dueAt: isoDate(dueAt),
    source: { type: sourceType, id: sourceId || entity, ...(attemptGroupId ? { attemptGroupId } : {}) },
    target: targetView === 'assistant' ? { view: 'assistant', tab: null, entityId: projectId } : { view: 'project-detail', tab, entityId: entity },
  };
}

function compareHostExecution(left, right) {
  const time = String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''));
  return time || (Number(left.revision || 0) - Number(right.revision || 0)) || String(left.id).localeCompare(String(right.id));
}

function latestHostExecutions(project) {
  const latest = new Map();
  for (const execution of project?.hostExecutions || []) {
    if (!execution?.id || execution.supersededBy) continue;
    const key = execution.attemptGroupId || `execution:${execution.id}`;
    if (!latest.has(key) || compareHostExecution(latest.get(key), execution) < 0) latest.set(key, execution);
  }
  return [...latest.values()];
}

function hostEvidenceReady(project, run, execution) {
  return Boolean(run && (project.evidenceBundles || []).some((bundle) => bundle.testRunId === run.id
    && bundle.state === 'ready'
    && bundle.integrity === 'verified'
    && bundle.provenance?.hostExecutionId === execution.id
    && (!execution.resultDigest || bundle.provenance?.hostResultDigest === execution.resultDigest)));
}

function hostExecutionAction(project, execution, run) {
  const entityId = run?.id || execution.id;
  const sourceType = 'test-run';
  const sourceId = entityId;
  const common = { project, entityId, sourceType, sourceId, attemptGroupId: execution.attemptGroupId };
  if (execution.status === 'passed') {
    if (hostEvidenceReady(project, run, execution)) return null;
    return action({
      ...common,
      kind: 'evidence_incomplete',
      priority: 'critical',
      status: 'blocked',
      actionRequired: true,
      titleKey: 'action.evidenceIncomplete.title',
      reasonCode: 'evidence_incomplete',
      reasonArgs: { provider: cleanText(execution.provider, '', 64) },
      tab: 'qualityTasks',
    });
  }
  if (['queued', 'running'].includes(execution.status)) return action({
    ...common,
    kind: 'run_running',
    priority: 'low',
    status: 'in_progress',
    actionRequired: false,
    titleKey: 'action.runRunning.title',
    reasonCode: 'execution_running',
    reasonArgs: { provider: cleanText(execution.provider, '', 64), capability: cleanText(execution.capability, '', 64) },
  });
  if (execution.status === 'cancelled') return action({
    ...common,
    kind: 'run_cancelled',
    priority: 'high',
    status: 'needs_action',
    actionRequired: true,
    titleKey: 'action.runCancelled.title',
    reasonCode: 'run_cancelled',
    reasonArgs: { provider: cleanText(execution.provider, '', 64) },
  });
  if (execution.status === 'timed_out') return action({
    ...common,
    kind: 'run_timed_out',
    priority: 'high',
    status: 'needs_action',
    actionRequired: true,
    titleKey: 'action.runTimedOut.title',
    reasonCode: 'run_timed_out',
    reasonArgs: { provider: cleanText(execution.provider, '', 64) },
  });
  return action({
    ...common,
    kind: 'run_failed',
    priority: 'high',
    status: 'needs_action',
    actionRequired: true,
    titleKey: 'action.runFailed.title',
    reasonCode: execution.errorCode || run?.errorCode || (execution.status === 'failed' ? 'test_failed' : 'provider_error'),
    reasonArgs: { provider: cleanText(execution.provider, '', 64) },
  });
}

function localRunAction(project, run) {
  const common = { project, entityId: run.id, sourceType: 'test-run', sourceId: run.id, tab: 'qualityTasks' };
  if (run.status === 'failed' || run.status === 'environment-error') return action({
    ...common,
    kind: 'run_failed',
    priority: 'high',
    status: 'needs_action',
    actionRequired: true,
    titleKey: 'action.runFailed.title',
    reasonCode: run.errorCode || (run.status === 'failed' ? 'test_failed' : 'provider_error'),
    reasonArgs: {},
  });
  if (run.status === 'cancelled') return action({
    ...common,
    kind: 'run_cancelled',
    priority: 'high',
    status: 'needs_action',
    actionRequired: true,
    titleKey: 'action.runCancelled.title',
    reasonCode: 'run_cancelled',
    reasonArgs: {},
  });
  if (run.status === 'timed-out') return action({
    ...common,
    kind: 'run_timed_out',
    priority: 'high',
    status: 'needs_action',
    actionRequired: true,
    titleKey: 'action.runTimedOut.title',
    reasonCode: 'run_timed_out',
    reasonArgs: {},
  });
  if (['queued', 'running'].includes(run.status)) return action({
    ...common,
    kind: 'run_running',
    priority: 'low',
    status: 'in_progress',
    actionRequired: false,
    titleKey: 'action.runRunning.title',
    reasonCode: 'execution_running',
    reasonArgs: {},
  });
  return null;
}

function addGateActions(items, project) {
  for (const gate of project.gates || []) {
    if (!gate?.id) continue;
    const common = { project, entityId: gate.id, sourceType: 'gate', sourceId: gate.id, dueAt: gate.requestedAt, tab: 'gates', reasonArgs: { title: cleanText(gate.title, '质量门禁', 160) } };
    if (gate.status === 'pending') items.push(action({ ...common, kind: 'gate_approval', priority: 'medium', status: 'needs_action', actionRequired: true, titleKey: 'action.gateApproval.title', reasonCode: 'gate_approval' }));
    else if (gate.verdict === 'BLOCK') items.push(action({ ...common, kind: 'gate_block', priority: 'critical', status: 'blocked', actionRequired: true, titleKey: 'action.gateBlock.title', reasonCode: 'gate_block' }));
    else if (gate.verdict === 'WARN') items.push(action({ ...common, kind: 'gate_warn', priority: 'medium', status: 'needs_action', actionRequired: true, titleKey: 'action.gateWarn.title', reasonCode: 'gate_warn' }));
  }
}

function taskNeedsConfirmation(task) {
  return task?.stage === 'confirmation'
    || task?.needsConfirmation === true
    || (task?.risks || []).some((risk) => ['high', 'critical'].includes(risk?.severity)
      && risk?.assessmentStatus === 'confirmed'
      && risk?.dispositionStatus === 'open');
}

function addQualityTaskActions(items, project) {
  for (const task of project.qualityTasks || []) {
    if (task?.id && taskNeedsConfirmation(task)) items.push(action({
      project,
      entityId: task.id,
      sourceType: 'quality-task',
      sourceId: task.id,
      tab: 'qualityTasks',
      kind: 'quality_task_confirm',
      priority: 'medium',
      status: 'needs_action',
      actionRequired: true,
      titleKey: 'action.qualityTaskConfirm.title',
      reasonCode: 'quality_task_confirm',
      reasonArgs: { title: cleanText(task.title, '质量任务', 160) },
    }));
  }
}

function addMilestoneAndWorkflowActions(items, project, now) {
  if ((project.assistant?.reminders || 'all') === 'off') return;
  for (const milestone of project.milestones || []) {
    if (!milestone?.id || milestone.done) continue;
    const dueAt = isoDate(milestone.dueDate);
    if (!dueAt) continue;
    const overdue = new Date(dueAt).getTime() < startOfDay(now).getTime();
    items.push(action({
      project,
      entityId: milestone.id,
      sourceType: 'milestone',
      sourceId: milestone.id,
      tab: 'milestones',
      kind: overdue ? 'milestone_overdue' : 'milestone_due',
      priority: overdue ? 'high' : 'medium',
      status: overdue ? 'needs_action' : 'needs_action',
      actionRequired: true,
      titleKey: overdue ? 'action.milestoneOverdue.title' : 'action.milestoneDue.title',
      reasonCode: overdue ? 'milestone_overdue' : 'milestone_due',
      reasonArgs: { title: cleanText(milestone.title, '里程碑', 160) },
      dueAt,
    }));
  }
  if (project.assistant?.reminders !== 'all') return;
  const addWorkflow = (id, reasonCode, reasonArgs = {}) => items.push(action({
    project, entityId: id, sourceType: 'workflow', sourceId: id, tab: 'overview', kind: 'workflow', priority: 'low', status: 'needs_action', actionRequired: true,
    titleKey: 'action.workflow.title', reasonCode, reasonArgs, targetView: 'assistant',
  }));
  if (project.status === 'intake') addWorkflow(`workflow-intake-${project.id}`, 'workflow_intake', { stage: 'intake' });
  const draftCases = (project.testcases || []).filter((item) => item.status === 'draft').length;
  if (draftCases) addWorkflow(`workflow-cases-${project.id}`, 'workflow_cases', { count: draftCases });
  const openDefects = (project.defects || []).filter((item) => !['closed', 'verified'].includes(item.status)).length;
  if (openDefects && project.status === 'execute') addWorkflow(`workflow-defects-${project.id}`, 'workflow_defects', { count: openDefects });
  if (project.status === 'review' && !(project.reports || []).length) addWorkflow(`workflow-report-${project.id}`, 'workflow_report', { stage: 'review' });
}

function sortActions(left, right) {
  return (PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority])
    || (Number(right.actionRequired) - Number(left.actionRequired))
    || (STATUS_RANK[right.status] - STATUS_RANK[left.status])
    || (left.dueAt ? (right.dueAt ? left.dueAt.localeCompare(right.dueAt) : -1) : (right.dueAt ? 1 : 0))
    || left.projectId.localeCompare(right.projectId)
    || left.entityId.localeCompare(right.entityId)
    || left.id.localeCompare(right.id);
}

export function buildActionQueue(projects = [], { now = new Date(), limit = DEFAULT_LIMIT } = {}) {
  const normalizedLimit = normalizeLimit(limit);
  const at = normalizeNow(now);
  if (!Array.isArray(projects)) throw new TypeError('projects 必须是数组');
  const items = [];
  for (const project of projects) {
    if (!project || typeof project !== 'object' || !project.id) continue;
    const runs = project.testruns || [];
    const hostExecutions = latestHostExecutions(project);
    const hostRunIds = new Set();
    for (const execution of hostExecutions) {
      const run = runs.find((item) => item.id === execution.testRunId);
      if (run?.id) hostRunIds.add(run.id);
      const item = hostExecutionAction(project, execution, run);
      if (item) items.push(item);
    }
    for (const run of runs) {
      if (hostRunIds.has(run.id) || run.provenance?.hostExecutionId) continue;
      const item = localRunAction(project, run);
      if (item) items.push(item);
    }
    addGateActions(items, project);
    addQualityTaskActions(items, project);
    addMilestoneAndWorkflowActions(items, project, at);
  }
  items.sort(sortActions);
  return { items: items.slice(0, normalizedLimit), generatedAt: at.toISOString() };
}

export function readActionQueue(storeLike, options = {}) {
  const source = options.listProjects || storeLike?.listProjects;
  if (typeof source !== 'function') throw new ActionQueueSourceError('Action Queue 缺少项目数据源');
  let projects;
  try { projects = source.call(storeLike); }
  catch (error) {
    if (error?.code === 'ACTION_QUEUE_SOURCE_UNAVAILABLE') throw error;
    throw error;
  }
  return buildActionQueue(projects, options);
}

function legacyTitle(item) {
  const args = item.reasonArgs || {};
  if (item.kind.startsWith('milestone_')) return cleanText(args.title, '里程碑', 160);
  if (item.kind.startsWith('gate_')) return cleanText(args.title, '质量门禁', 160);
  if (item.kind === 'workflow') {
    if (item.reasonCode === 'workflow_intake') return '完成需求梳理与测试范围确认';
    if (item.reasonCode === 'workflow_cases') return `仍有 ${Number(args.count) || 0} 条用例处于草稿，建议组织用例评审`;
    if (item.reasonCode === 'workflow_defects') return `跟踪 ${Number(args.count) || 0} 个未关闭缺陷（严重级别优先）`;
    if (item.reasonCode === 'workflow_report') return '用例评审通过后请起草测试计划/执行报告';
  }
  if (item.kind === 'run_running') return '测试正在执行中';
  if (item.kind === 'run_cancelled') return '测试运行已取消，请确认后续动作';
  if (item.kind === 'run_timed_out') return '测试运行超时，请检查执行环境';
  if (item.kind === 'evidence_incomplete') return '测试已完成，但证据尚未完成校验';
  if (item.kind === 'quality_task_confirm') return cleanText(args.title, '质量任务待确认', 160);
  return '测试运行失败，请检查结果与执行环境';
}

function legacySeverity(item) {
  if (item.kind === 'gate_approval') return 'review';
  if (item.priority === 'critical' || item.priority === 'high') return 'danger';
  if (item.priority === 'medium') return 'warning';
  return 'normal';
}

export function toLegacyReminders(items = [], { now = new Date() } = {}) {
  const at = normalizeNow(now);
  return (Array.isArray(items) ? items : []).map((item) => {
    const type = item.kind.startsWith('milestone_') ? 'milestone' : item.kind.startsWith('gate_') ? 'gate' : 'workflow';
    const reminder = {
      id: item.source?.id || item.entityId,
      type,
      title: legacyTitle(item),
      date: dateOnly(item.dueAt),
      severity: legacySeverity(item),
      projectId: item.projectId,
      projectTitle: item.projectTitle,
    };
    if (type === 'milestone') reminder.days = daysBetween(item.dueAt, at);
    return reminder;
  });
}

export const actionQueueLimits = Object.freeze({ default: DEFAULT_LIMIT, max: MAX_LIMIT });
