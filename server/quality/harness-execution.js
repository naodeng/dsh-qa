import path from 'node:path';
import { now, uid } from '../store.js';
import {
  currentExecutionProfileVersion,
  isHostCapabilitySupported,
  isHostProvider,
  normalizeHostExecutionProfile,
} from './execution-profile.js';

const HOST_STATUSES = new Set(['queued', 'running', 'passed', 'failed', 'cancelled', 'timed_out', 'provider_error', 'blocked', 'not_run']);
const REQUEST_FIELDS = ['profileId', 'provider', 'capability', 'target', 'timeoutMs', 'artifactPolicy', 'expectedRevision', 'attemptGroupId'];
const RESULT_FIELDS = ['status', 'artifacts', 'errorCode', 'errorSummary', 'summary', 'providerExecutionId'];
const ARTIFACT_FIELDS = ['relativePath', 'type', 'mimeType', 'size', 'sha256'];
const ARTIFACT_TYPES = new Set(['log', 'screenshot', 'trace']);
const MAX_TARGET_LENGTH = 4096;
const MAX_SUMMARY_LENGTH = 512;
const MAX_ID_LENGTH = 256;
const MIN_TIMEOUT_MS = 1000;
const PROVENANCE_FIELDS = new Set(['projectId', 'qualityTaskId', 'profileId', 'profileVersion', 'provider', 'capability', 'sourceDigests', 'testPlanVersion', 'commit']);

const TEST_RUN_STATUS = Object.freeze({
  queued: 'queued',
  running: 'running',
  passed: 'passed',
  failed: 'failed',
  cancelled: 'cancelled',
  timed_out: 'timed-out',
  provider_error: 'environment-error',
  blocked: 'environment-error',
  not_run: 'environment-error',
});

function hostError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw hostError(code, message);
}

function rejectUnknownFields(value, allowed, code, label) {
  assertObject(value, code, `${label} 必须是对象`);
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw hostError(`${code}_UNKNOWN_FIELD`, `${label} 包含未知字段：${unknown}`);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function boundedText(value, max = MAX_SUMMARY_LENGTH) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

function boundedId(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_ID_LENGTH) throw hostError('HOST_EXECUTION_INVALID', `${label} 无效`);
  return value.trim();
}

function normalizeErrorCode(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const code = String(value).trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(code)) throw hostError('HOST_EXECUTION_INVALID', 'errorCode 无效');
  return code;
}

function normalizeSourceDigests(task) {
  return [...new Set((task?.sources || []).map((source) => source?.digest).filter((digest) => typeof digest === 'string' && digest.length <= 256))].sort();
}

function findQualityTask(project, qualityTaskId) {
  const task = project?.qualityTasks?.find((item) => item.id === qualityTaskId);
  if (!task) throw hostError('QUALITY_TASK_NOT_FOUND', '质量任务不存在');
  return task;
}

function findHostProfile(project, profileId) {
  const profile = project?.executionProfiles?.find((item) => item.id === profileId);
  if (!profile) throw hostError('HOST_PROFILE_NOT_FOUND', '执行配置不存在');
  if (profile.kind !== 'host') throw hostError('HOST_PROFILE_REQUIRED', '执行配置不是 host profile');
  if (profile.disabled) throw hostError('HOST_PROFILE_DISABLED', 'host profile 已停用');
  return profile;
}

function normalizeStoredHostProfile(project, profile) {
  const current = currentExecutionProfileVersion(profile);
  return {
    ...normalizeHostExecutionProfile(project, {
    name: current.name,
    kind: 'host',
    provider: current.provider,
    capabilities: current.capabilities,
    targetPolicy: current.targetPolicy,
    artifactPolicy: current.artifactPolicy,
    timeoutMs: current.timeoutMs,
    }),
    version: current.version,
  };
}

function normalizeRequestArtifactPolicy(value, profilePolicy) {
  if (value === undefined) return clone(profilePolicy);
  rejectUnknownFields(value, ['logs', 'screenshots', 'trace'], 'HOST_EXECUTION_REQUEST', 'artifactPolicy');
  const policy = { ...profilePolicy };
  for (const field of Object.keys(value)) {
    if (typeof value[field] !== 'boolean') throw hostError('HOST_EXECUTION_INVALID', `artifactPolicy.${field} 必须是布尔值`);
    if (value[field] && !profilePolicy[field]) throw hostError('HOST_ARTIFACT_POLICY_DENIED', `artifactPolicy.${field} 未被 profile 允许`);
    policy[field] = value[field];
  }
  return policy;
}

function normalizeUrlTarget(target, targetPolicy) {
  if (typeof target !== 'string' || !target.trim() || target.length > MAX_TARGET_LENGTH) throw hostError('HOST_TARGET_INVALID', 'Browser/Computer target 必须是有限长度 URL');
  let url;
  try { url = new URL(target); } catch { throw hostError('HOST_TARGET_INVALID', 'Browser/Computer target 必须是 URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw hostError('HOST_TARGET_INVALID', 'Browser/Computer target 必须是安全 URL');
  if (!(targetPolicy.origins || []).includes(url.origin)) throw hostError('HOST_TARGET_ORIGIN_DENIED', 'target origin 不在 profile allowlist');
  return {
    target: url.href,
    targetMetadata: { kind: 'url', origin: url.origin, url: url.href },
  };
}

function normalizeMcpTarget(target, targetPolicy) {
  rejectUnknownFields(target, ['serverId', 'toolName'], 'HOST_TARGET_INVALID', 'MCP target');
  const serverId = boundedId(target.serverId, 'MCP serverId');
  const toolName = boundedId(target.toolName, 'MCP toolName');
  const registration = (targetPolicy.mcpTargets || []).find((entry) => entry.serverId === serverId && entry.toolNames.includes(toolName));
  if (!registration) throw hostError('HOST_MCP_TARGET_DENIED', 'MCP server/tool 未登记');
  return {
    target: { serverId, toolName },
    targetMetadata: { kind: 'mcp-tool', serverId, toolName },
  };
}

function normalizeTarget(provider, target, targetPolicy) {
  if (provider === 'mcp') return normalizeMcpTarget(target, targetPolicy);
  if (target && typeof target === 'object') throw hostError('HOST_TARGET_INVALID', 'Browser/Computer target 必须是 URL');
  return normalizeUrlTarget(target, targetPolicy);
}

function normalizeAttemptGroupId(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw hostError('HOST_EXECUTION_INVALID', 'attemptGroupId 无效');
  return value;
}

function requestProvenance(project, task, profile, profileVersion, provider, capability) {
  return {
    projectId: project.id,
    qualityTaskId: task.id,
    profileId: profile.id,
    profileVersion: profileVersion.version,
    provider,
    capability,
    sourceDigests: normalizeSourceDigests(task),
  };
}

export function validateHostExecutionRequest(project, qualityTaskId, input = {}) {
  rejectUnknownFields(input, REQUEST_FIELDS, 'HOST_EXECUTION_REQUEST', 'HostExecution request');
  const task = findQualityTask(project, qualityTaskId);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== task.version) throw hostError('QUALITY_REVISION_CONFLICT', '质量任务版本已变化，请重新加载');
  const profile = findHostProfile(project, input.profileId);
  const profileVersion = normalizeStoredHostProfile(project, profile);
  if (!isHostProvider(input.provider) || input.provider !== profileVersion.provider) throw hostError('HOST_PROVIDER_DENIED', 'provider 未被 host profile 允许');
  if (typeof input.capability !== 'string' || !isHostCapabilitySupported(input.provider, input.capability) || !profileVersion.capabilities.includes(input.capability)) throw hostError('HOST_CAPABILITY_DENIED', 'capability 未被 provider/profile 允许');
  const timeoutMs = input.timeoutMs === undefined ? profileVersion.timeoutMs : input.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > profileVersion.timeoutMs) throw hostError('HOST_TIMEOUT_DENIED', 'timeoutMs 超出 profile 范围');
  const artifactPolicy = normalizeRequestArtifactPolicy(input.artifactPolicy, profileVersion.artifactPolicy);
  const { target, targetMetadata } = normalizeTarget(input.provider, input.target, profileVersion.targetPolicy);
  const attemptGroupId = normalizeAttemptGroupId(input.attemptGroupId);
  const adapterId = `${input.provider}:${input.capability}`;
  return {
    projectId: project.id,
    qualityTaskId: task.id,
    profileId: profile.id,
    profileVersion: profileVersion.version,
    provider: input.provider,
    capability: input.capability,
    adapterId,
    adapter: { id: adapterId, provider: input.provider, capability: input.capability },
    target,
    targetMetadata,
    timeoutMs,
    artifactPolicy,
    expectedRevision: input.expectedRevision,
    ...(attemptGroupId ? { attemptGroupId } : {}),
    provenance: requestProvenance(project, task, profile, profileVersion, input.provider, input.capability),
  };
}

function controlledRoot(project, hostExecution) {
  const artifactRoot = project?.artifactRoot;
  const stagingRoot = hostExecution?.stagingRoot || hostExecution?.artifactDir;
  if (artifactRoot !== undefined && (typeof artifactRoot !== 'string' || !path.isAbsolute(artifactRoot))) throw hostError('HOST_ARTIFACT_PATH_DENIED', '项目 artifactRoot 必须是绝对受控目录');
  if (stagingRoot === undefined) return null;
  if (typeof stagingRoot !== 'string' || !path.isAbsolute(stagingRoot)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host staging root 必须是绝对路径');
  if (artifactRoot) {
    const root = path.resolve(artifactRoot);
    const staging = path.resolve(stagingRoot);
    const relative = path.relative(root, staging);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host staging root 必须位于项目 artifactRoot');
  }
  return path.resolve(stagingRoot);
}

function normalizeRelativeArtifactPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.length > 1024 || relativePath.includes('\0') || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'artifact relativePath 必须位于受控 staging root');
  return relativePath.replaceAll('\\', '/');
}

function artifactPolicyAllows(policy, type) {
  if (!policy) return true;
  const field = type === 'log' ? 'logs' : type === 'screenshot' ? 'screenshots' : 'trace';
  return policy[field] === true;
}

function normalizeArtifactDescriptors(project, hostExecution, artifacts = []) {
  if (!Array.isArray(artifacts)) throw hostError('HOST_ARTIFACT_INVALID', 'artifacts 必须是数组');
  controlledRoot(project, hostExecution);
  return artifacts.map((artifact) => {
    rejectUnknownFields(artifact, ARTIFACT_FIELDS, 'HOST_ARTIFACT', 'artifact descriptor');
    const relativePath = normalizeRelativeArtifactPath(artifact.relativePath);
    if (!ARTIFACT_TYPES.has(artifact.type)) throw hostError('HOST_ARTIFACT_INVALID', 'artifact type 不在白名单');
    if (!artifactPolicyAllows(hostExecution.artifactPolicy, artifact.type)) throw hostError('HOST_ARTIFACT_POLICY_DENIED', 'artifact type 未被 profile 允许');
    const normalized = { relativePath, type: artifact.type };
    if (artifact.mimeType !== undefined) {
      if (typeof artifact.mimeType !== 'string' || artifact.mimeType.length > 128) throw hostError('HOST_ARTIFACT_INVALID', 'artifact mimeType 无效');
      normalized.mimeType = artifact.mimeType;
    }
    if (artifact.size !== undefined) {
      if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) throw hostError('HOST_ARTIFACT_INVALID', 'artifact size 无效');
      normalized.size = artifact.size;
    }
    if (artifact.sha256 !== undefined) {
      if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) throw hostError('HOST_ARTIFACT_INVALID', 'artifact sha256 无效');
      normalized.sha256 = artifact.sha256.toLowerCase();
    }
    return normalized;
  });
}

function normalizeResult(project, hostExecution, result = {}) {
  rejectUnknownFields(result, RESULT_FIELDS, 'HOST_RESULT', 'Host result');
  if (!HOST_STATUSES.has(result.status)) throw hostError('HOST_RESULT_INVALID', 'Host result status 无效');
  const artifacts = normalizeArtifactDescriptors(project, hostExecution, result.artifacts || []);
  const providerExecutionId = result.providerExecutionId === undefined ? undefined : boundedId(result.providerExecutionId, 'providerExecutionId');
  return {
    status: result.status,
    artifacts,
    ...(providerExecutionId ? { providerExecutionId } : {}),
    ...(result.errorCode !== undefined ? { errorCode: normalizeErrorCode(result.errorCode, undefined) } : {}),
    ...(boundedText(result.errorSummary) ? { errorSummary: boundedText(result.errorSummary) } : {}),
    ...(boundedText(result.summary) ? { summary: boundedText(result.summary) } : {}),
  };
}

function normalizedProvenance(hostExecution) {
  const provenance = {};
  for (const [key, value] of Object.entries(hostExecution?.provenance || {})) {
    if (!PROVENANCE_FIELDS.has(key)) continue;
    provenance[key] = key === 'sourceDigests' && Array.isArray(value) ? [...value].sort() : clone(value);
  }
  if (hostExecution?.projectId !== undefined) provenance.projectId = hostExecution.projectId;
  if (hostExecution?.qualityTaskId !== undefined) provenance.qualityTaskId = hostExecution.qualityTaskId;
  if (hostExecution?.profileId !== undefined) provenance.profileId = hostExecution.profileId;
  if (hostExecution?.profileVersion !== undefined) provenance.profileVersion = hostExecution.profileVersion;
  if (hostExecution?.provider !== undefined) provenance.provider = hostExecution.provider;
  if (hostExecution?.capability !== undefined) provenance.capability = hostExecution.capability;
  provenance.hostExecutionId = boundedId(hostExecution.id, 'hostExecutionId');
  return provenance;
}

function baseHostExecution(project, normalizedRequest, adapterId) {
  const id = uid('host');
  const createdAt = now();
  const stagingRoot = typeof project?.artifactRoot === 'string' && path.isAbsolute(project.artifactRoot)
    ? path.join(project.artifactRoot, `${id}.staging`)
    : undefined;
  return {
    id,
    projectId: normalizedRequest.projectId,
    qualityTaskId: normalizedRequest.qualityTaskId,
    profileId: normalizedRequest.profileId,
    profileVersion: normalizedRequest.profileVersion,
    attemptGroupId: normalizedRequest.attemptGroupId || uid('attempt'),
    provider: normalizedRequest.provider,
    capability: normalizedRequest.capability,
    adapterId,
    target: clone(normalizedRequest.target),
    targetMetadata: clone(normalizedRequest.targetMetadata),
    timeoutMs: normalizedRequest.timeoutMs,
    artifactPolicy: clone(normalizedRequest.artifactPolicy),
    provenance: clone(normalizedRequest.provenance),
    request: clone(normalizedRequest),
    status: 'queued',
    revision: 1,
    ...(stagingRoot ? { stagingRoot } : {}),
    createdAt,
    updatedAt: createdAt,
  };
}

function unavailableHostExecution(project, normalizedRequest, adapterId) {
  const execution = baseHostExecution(project, normalizedRequest, adapterId);
  execution.status = 'not_run';
  execution.errorCode = 'provider_unavailable';
  execution.errorSummary = '没有可用的受控 Host adapter';
  return execution;
}

function adapterStart(adapter) {
  if (typeof adapter?.start === 'function') return adapter.start.bind(adapter);
  if (typeof adapter?.execute === 'function') return adapter.execute.bind(adapter);
  return null;
}

export async function startHostExecution(project, normalizedRequest, adapter) {
  assertObject(normalizedRequest, 'HOST_EXECUTION_INVALID', 'normalizedRequest 必须是对象');
  if (!normalizedRequest.projectId || !normalizedRequest.qualityTaskId || !normalizedRequest.profileId || !normalizedRequest.provider || !normalizedRequest.capability || !normalizedRequest.adapterId || !normalizedRequest.provenance) throw hostError('HOST_EXECUTION_INVALID', 'normalizedRequest 缺少受控字段');
  const start = adapterStart(adapter);
  const adapterId = typeof adapter?.id === 'string' && adapter.id.trim() ? adapter.id.trim() : normalizedRequest.adapterId;
  if (adapter?.provider !== undefined && adapter.provider !== normalizedRequest.provider) throw hostError('HOST_ADAPTER_MISMATCH', 'adapter provider 与 request 不一致');
  if (adapter?.capabilities !== undefined && (!Array.isArray(adapter.capabilities) || !adapter.capabilities.includes(normalizedRequest.capability))) throw hostError('HOST_ADAPTER_MISMATCH', 'adapter capability 与 request 不一致');
  if (!start) return unavailableHostExecution(project, normalizedRequest, adapterId);

  const execution = baseHostExecution(project, normalizedRequest, adapterId);
  try {
    const adapterResult = await start(clone(normalizedRequest));
    const result = normalizeResult(project, execution, adapterResult || { status: 'queued', artifacts: [] });
    Object.assign(execution, result, { updatedAt: now() });
  } catch (error) {
    execution.status = error?.code === 'HOST_ARTIFACT_PATH_DENIED' || error?.code === 'HOST_ARTIFACT_POLICY_DENIED' ? 'blocked' : 'provider_error';
    execution.errorCode = error?.code === 'HOST_ARTIFACT_PATH_DENIED' || error?.code === 'HOST_ARTIFACT_POLICY_DENIED' ? 'artifact_policy_denied' : 'provider_error';
    execution.errorSummary = boundedText(error?.message || 'Host adapter failed');
    execution.updatedAt = now();
  }
  return execution;
}

export function mapHostExecutionResult(project, hostExecution, result) {
  assertObject(hostExecution, 'HOST_EXECUTION_INVALID', 'hostExecution 必须是对象');
  const normalized = normalizeResult(project, hostExecution, result);
  const status = TEST_RUN_STATUS[normalized.status];
  if (!status) throw hostError('HOST_RESULT_INVALID', 'Host result 无法映射到 TestRun');
  const patch = {
    mode: 'local',
    status,
    resultTrust: 'controlled-host',
    provenance: normalizedProvenance(hostExecution),
    hostExecutionRef: { id: hostExecution.id, provider: hostExecution.provider, profileVersion: hostExecution.profileVersion },
    artifacts: normalized.artifacts,
  };
  if (normalized.errorCode) patch.errorCode = normalized.errorCode;
  if (normalized.status === 'provider_error') patch.errorCode = 'provider_error';
  if (normalized.status === 'blocked' || normalized.status === 'not_run') patch.errorCode = 'provider_unavailable';
  if (normalized.errorSummary) patch.errorSummary = normalized.errorSummary;
  if (normalized.summary) patch.summary = normalized.summary;
  return patch;
}
