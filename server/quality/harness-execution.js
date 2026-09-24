import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const ARTIFACT_POLICY_FIELDS = ['logs', 'screenshots', 'trace'];
const ARTIFACT_TYPES = new Set(['log', 'screenshot', 'trace']);
const MAX_TARGET_LENGTH = 4096;
const MAX_SUMMARY_LENGTH = 512;
const MAX_ID_LENGTH = 256;
const MIN_TIMEOUT_MS = 1000;
const PROVENANCE_FIELDS = new Set(['projectId', 'qualityTaskId', 'profileId', 'profileVersion', 'provider', 'capability', 'sourceDigests', 'testPlanVersion', 'commit', 'hostResultDigest']);

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

function isWithinOrSame(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function lstatIfPresent(value, label) {
  try {
    return fs.lstatSync(value);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw hostError('HOST_ARTIFACT_PATH_DENIED', `${label} 不可访问`);
  }
}

function rejectSymlinkEntry(value, label) {
  const stat = lstatIfPresent(path.resolve(value), label);
  if (stat?.isSymbolicLink()) throw hostError('HOST_ARTIFACT_PATH_DENIED', `${label} 不允许是符号链接`);
}

function rejectSymlinkPath(value, label, base) {
  const absolute = path.resolve(value);
  const start = path.resolve(base || path.parse(absolute).root);
  if (!isWithinOrSame(start, absolute)) throw hostError('HOST_ARTIFACT_PATH_DENIED', `${label} artifact path 必须位于受控目录`);
  let current = start;
  const parts = path.relative(start, absolute).split(path.sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = lstatIfPresent(current, label);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw hostError('HOST_ARTIFACT_PATH_DENIED', `${label} artifact path 不允许经过符号链接`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw hostError('HOST_ARTIFACT_PATH_DENIED', `${label} artifact path 必须位于受控目录`);
  }
}

function realPathIfPresent(value, label) {
  try {
    return fs.realpathSync(value);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return path.resolve(value);
    throw hostError('HOST_ARTIFACT_PATH_DENIED', `${label} 不可解析`);
  }
}

function controlledRoot(project, hostExecution) {
  const artifactRoot = project?.artifactRoot;
  const stagingRoot = hostExecution?.stagingRoot || hostExecution?.artifactDir;
  if (artifactRoot !== undefined && (typeof artifactRoot !== 'string' || !path.isAbsolute(artifactRoot))) throw hostError('HOST_ARTIFACT_PATH_DENIED', '项目 artifactRoot 必须是绝对受控目录');
  if (artifactRoot === undefined) {
    if (stagingRoot !== undefined) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host staging root 必须位于项目 artifactRoot');
    return null;
  }
  const root = path.resolve(artifactRoot);
  rejectSymlinkEntry(root, '项目 artifactRoot');
  const realRoot = realPathIfPresent(root, '项目 artifactRoot');
  if (stagingRoot === undefined) return { root, realRoot, staging: null, realStaging: null };
  if (typeof stagingRoot !== 'string' || !path.isAbsolute(stagingRoot)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host staging root 必须是绝对路径');
  const staging = path.resolve(stagingRoot);
  if (!isWithinOrSame(root, staging)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host staging root 必须位于项目 artifactRoot');
  const stagingStat = lstatIfPresent(staging, 'Host staging root');
  rejectSymlinkPath(staging, 'Host staging root', root);
  const realStaging = realPathIfPresent(staging, 'Host staging root');
  if (stagingStat && !isWithinOrSame(realRoot, realStaging)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host staging root 必须位于项目 artifactRoot');
  return { root, realRoot, staging, realStaging };
}

function normalizeRelativeArtifactPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.length > 1024 || relativePath.includes('\0') || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'artifact relativePath 必须位于受控 staging root');
  return relativePath.replaceAll('\\', '/');
}

function artifactBytes(value) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw hostError('HOST_ARTIFACT_INVALID', 'artifact 内容必须是字符串或二进制数据');
}

function createControlledArtifactWriter(project, hostExecution) {
  const initial = controlledRoot(project, hostExecution);
  if (!initial?.staging || !initial.root) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'Host artifact writer 需要受控 staging root');
  fs.mkdirSync(initial.root, { recursive: true });
  fs.mkdirSync(initial.staging, { recursive: true });
  const controlled = controlledRoot(project, hostExecution);
  return (relativePath, content) => {
    const normalized = normalizeRelativeArtifactPath(relativePath);
    const resolved = path.resolve(controlled.staging, normalized);
    if (!isWithinOrSame(controlled.staging, resolved) || !isWithinOrSame(controlled.root, resolved)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'artifact descriptor 必须位于受控 artifactRoot');
    const bytes = artifactBytes(content);
    if (bytes.length > 100 * 1024 * 1024) throw hostError('HOST_ARTIFACT_INVALID', 'artifact 超过 100MiB');
    const parent = path.dirname(resolved);
    rejectSymlinkPath(parent, 'artifact writer', controlled.staging);
    rejectSymlinkPath(resolved, 'artifact writer', controlled.staging);
    fs.mkdirSync(parent, { recursive: true });
    let fd;
    try {
      fd = fs.openSync(resolved, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(fd, bytes);
    } catch (error) {
      throw hostError('HOST_ARTIFACT_WRITE_FAILED', error?.code === 'EEXIST' ? 'artifact 已存在' : 'artifact 写入失败');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    return {
      relativePath: normalized,
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  };
}

function artifactPolicyAllows(policy, type) {
  const field = type === 'log' ? 'logs' : type === 'screenshot' ? 'screenshots' : 'trace';
  return policy[field] === true;
}

function normalizeArtifactPolicy(value) {
  rejectUnknownFields(value, ARTIFACT_POLICY_FIELDS, 'HOST_ARTIFACT_POLICY', 'artifactPolicy');
  const policy = {};
  for (const field of ARTIFACT_POLICY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field) || typeof value[field] !== 'boolean') throw hostError('HOST_ARTIFACT_POLICY_INVALID', 'artifactPolicy 必须是完整规范化白名单');
    policy[field] = value[field];
  }
  return policy;
}

function normalizeArtifactDescriptors(project, hostExecution, artifacts = []) {
  if (!Array.isArray(artifacts)) throw hostError('HOST_ARTIFACT_INVALID', 'artifacts 必须是数组');
  const policy = normalizeArtifactPolicy(hostExecution?.artifactPolicy);
  const controlled = controlledRoot(project, hostExecution);
  if (artifacts.length && (!controlled?.staging || !controlled.root)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'artifact descriptor 必须位于受控 staging root');
  return artifacts.map((artifact) => {
    rejectUnknownFields(artifact, ARTIFACT_FIELDS, 'HOST_ARTIFACT', 'artifact descriptor');
    const relativePath = normalizeRelativeArtifactPath(artifact.relativePath);
    if (!ARTIFACT_TYPES.has(artifact.type)) throw hostError('HOST_ARTIFACT_INVALID', 'artifact type 不在白名单');
    if (!artifactPolicyAllows(policy, artifact.type)) throw hostError('HOST_ARTIFACT_POLICY_DENIED', 'artifact type 未被 profile 允许');
    const resolvedPath = path.resolve(controlled.staging, relativePath);
    if (!isWithinOrSame(controlled.staging, resolvedPath) || !isWithinOrSame(controlled.root, resolvedPath)) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'artifact descriptor 必须位于受控 artifactRoot');
    rejectSymlinkPath(resolvedPath, 'artifact descriptor', controlled.staging);
    const artifactStat = lstatIfPresent(resolvedPath, 'artifact descriptor');
    const realPath = realPathIfPresent(resolvedPath, 'artifact descriptor');
    if (artifactStat && (!isWithinOrSame(controlled.realStaging, realPath) || !isWithinOrSame(controlled.realRoot, realPath))) throw hostError('HOST_ARTIFACT_PATH_DENIED', 'artifact descriptor 必须位于受控 artifactRoot');
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

function hostResultDigest(result) {
  const canonical = {
    status: result.status,
    artifacts: [...(result.artifacts || [])].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    ...(result.providerExecutionId ? { providerExecutionId: result.providerExecutionId } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    ...(result.errorSummary ? { errorSummary: result.errorSummary } : {}),
    ...(result.summary ? { summary: result.summary } : {}),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function normalizedProvenance(hostExecution, resultDigest) {
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
  if (hostExecution?.resultDigest || resultDigest) provenance.hostResultDigest = hostExecution.resultDigest || resultDigest;
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

function adapterStart(adapter) {
  if (typeof adapter?.start === 'function') return adapter.start.bind(adapter);
  if (typeof adapter?.execute === 'function') return adapter.execute.bind(adapter);
  return null;
}

function invokeAdapterCancel(adapter, request, signal) {
  if (typeof adapter?.cancel !== 'function') return;
  try {
    const result = adapter.cancel(clone(request), { signal });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // The persisted HostExecution state remains authoritative when cancellation fails.
  }
}

export async function startHostExecution(project, normalizedRequest, adapter, options = {}) {
  assertObject(normalizedRequest, 'HOST_EXECUTION_INVALID', 'normalizedRequest 必须是对象');
  if (!normalizedRequest.projectId || !normalizedRequest.qualityTaskId || !normalizedRequest.profileId || !normalizedRequest.provider || !normalizedRequest.capability || !normalizedRequest.adapterId || !normalizedRequest.provenance) throw hostError('HOST_EXECUTION_INVALID', 'normalizedRequest 缺少受控字段');
  const start = adapterStart(adapter);
  const adapterId = typeof adapter?.id === 'string' && adapter.id.trim() ? adapter.id.trim() : normalizedRequest.adapterId;
  if (adapter?.provider !== undefined && adapter.provider !== normalizedRequest.provider) throw hostError('HOST_ADAPTER_MISMATCH', 'adapter provider 与 request 不一致');
  if (adapter?.capabilities !== undefined && (!Array.isArray(adapter.capabilities) || !adapter.capabilities.includes(normalizedRequest.capability))) throw hostError('HOST_ADAPTER_MISMATCH', 'adapter capability 与 request 不一致');
  const execution = baseHostExecution(project, normalizedRequest, adapterId);
  const controller = new AbortController();
  let stopRequested = null;
  let resolveStop;
  const stopPromise = new Promise((resolve) => { resolveStop = resolve; });
  const requestStop = (reason) => {
    if (stopRequested) return;
    stopRequested = reason;
    controller.abort();
    invokeAdapterCancel(adapter, normalizedRequest, controller.signal);
    resolveStop(reason);
  };
  if (typeof options.onControl === 'function') options.onControl({ executionId: execution.id, cancel: () => requestStop('cancelled') });
  const notify = async () => {
    if (typeof options.onTransition === 'function') await options.onTransition(execution);
  };
  const shouldStop = () => typeof options.shouldStop === 'function' && options.shouldStop(execution);

  await notify();
  if (!start) {
    if (shouldStop()) return execution;
    execution.status = 'not_run';
    execution.errorCode = 'provider_unavailable';
    execution.errorSummary = '没有可用的受控 Host adapter';
    execution.revision += 1;
    execution.updatedAt = now();
    await notify();
    return execution;
  }

  if (shouldStop()) return execution;
  execution.status = 'running';
  execution.revision += 1;
  execution.updatedAt = now();
  await notify();
  if (shouldStop()) return execution;

  try {
    const timeoutMs = Number.isInteger(normalizedRequest.timeoutMs) && normalizedRequest.timeoutMs > 0 ? normalizedRequest.timeoutMs : null;
    const timeout = timeoutMs === null ? null : setTimeout(() => requestStop('timed_out'), timeoutMs);
    const adapterResultPromise = Promise.resolve()
      .then(() => start(clone(normalizedRequest), {
        hostExecutionId: execution.id,
        signal: controller.signal,
        writeArtifact: createControlledArtifactWriter(project, execution),
      }))
      .then((value) => ({ type: 'result', value }), (error) => ({ type: 'error', error }));
    const outcome = await Promise.race([
      adapterResultPromise,
      stopPromise.then((reason) => ({ type: 'stop', reason })),
    ]);
    if (timeout !== null) clearTimeout(timeout);
    if (outcome.type === 'stop') {
      if (outcome.reason === 'cancelled' || shouldStop()) return execution;
      execution.status = 'timed_out';
      execution.errorCode = 'timeout';
      execution.errorSummary = `Host adapter 在 ${timeoutMs}ms 内未返回结果`;
      execution.revision += 1;
      execution.updatedAt = now();
      await notify();
      return execution;
    }
    if (outcome.type === 'error') throw outcome.error;
    const adapterResult = outcome.value;
    if (shouldStop()) return execution;
    if (adapterResult === null || adapterResult === undefined) throw hostError('HOST_ADAPTER_EMPTY_RESULT', 'Host adapter 必须返回结果');
    const result = normalizeResult(project, execution, adapterResult);
    Object.assign(execution, result, { resultDigest: hostResultDigest(result), revision: execution.revision + 1, updatedAt: now() });
  } catch (error) {
    if (shouldStop()) return execution;
    execution.status = error?.code === 'HOST_ARTIFACT_PATH_DENIED' || error?.code === 'HOST_ARTIFACT_POLICY_DENIED' ? 'blocked' : 'provider_error';
    execution.errorCode = error?.code === 'HOST_ARTIFACT_PATH_DENIED' || error?.code === 'HOST_ARTIFACT_POLICY_DENIED' ? 'artifact_policy_denied' : 'provider_error';
    execution.errorSummary = boundedText(error?.message || 'Host adapter failed');
    execution.revision += 1;
    execution.updatedAt = now();
  }
  await notify();
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
    provenance: normalizedProvenance(hostExecution, hostResultDigest(normalized)),
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
