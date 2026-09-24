import fs from 'node:fs';
import path from 'node:path';
import { now, uid } from '../store.js';

const EXECUTORS = new Set(['node-test', 'playwright']);
const NETWORK_INTENTS = new Set(['none', 'declared']);
const HOST_PROVIDERS = new Set(['browser-use', 'computer-use', 'mcp']);
const HOST_CAPABILITIES = new Set(['navigate', 'interact', 'inspect', 'tool-call']);
const PROVIDER_CAPABILITIES = new Map([
  ['browser-use', new Set(['navigate', 'interact', 'inspect'])],
  ['computer-use', new Set(['navigate', 'interact', 'inspect'])],
  ['mcp', new Set(['tool-call'])],
]);
const LOCAL_VERSION_FIELDS = ['name', 'executor', 'cwdRelative', 'targetFiles', 'networkIntent', 'timeoutMs'];
const HOST_VERSION_FIELDS = ['name', 'kind', 'provider', 'capabilities', 'targetPolicy', 'artifactPolicy', 'timeoutMs'];
const HOST_ARTIFACT_FIELDS = ['logs', 'screenshots', 'trace'];
const MIN_HOST_TIMEOUT_MS = 1000;
const MAX_HOST_TIMEOUT_MS = 1800000;

function cloneHostVersion(value) {
  return structuredClone(value);
}

function assertObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
}

function rejectUnknownFields(value, allowed, label) {
  assertObject(value, `${label} 必须是对象`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} 包含未知字段：${unknown[0]}`);
}

function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('targetPolicy origin 无效');
  let url;
  try { url = new URL(value); } catch { throw new Error('targetPolicy origin 无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('targetPolicy origin 无效');
  return url.origin;
}

function normalizeMcpTargets(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('targetPolicy.mcpTargets 必须是数组');
  return value.map((entry) => {
    rejectUnknownFields(entry, ['serverId', 'toolNames'], 'MCP target');
    const serverId = typeof entry.serverId === 'string' ? entry.serverId.trim() : '';
    const toolNames = Array.isArray(entry.toolNames) ? entry.toolNames : [];
    if (!serverId || serverId.length > 128 || !toolNames.length || toolNames.some((tool) => typeof tool !== 'string' || !tool.trim() || tool.length > 128)) throw new Error('MCP server/tool 登记无效');
    return { serverId, toolNames: [...new Set(toolNames.map((tool) => tool.trim()))].sort() };
  });
}

function normalizeHostTargetPolicy(value = {}) {
  rejectUnknownFields(value, ['origins', 'mcpTargets'], 'targetPolicy');
  const origins = value.origins === undefined ? [] : value.origins;
  if (!Array.isArray(origins) || origins.some((origin) => typeof origin !== 'string')) throw new Error('targetPolicy.origins 必须是数组');
  return { origins: [...new Set(origins.map(normalizeOrigin))].sort(), mcpTargets: normalizeMcpTargets(value.mcpTargets) };
}

function normalizeHostArtifactPolicy(value = {}) {
  rejectUnknownFields(value, HOST_ARTIFACT_FIELDS, 'artifactPolicy');
  const policy = Object.fromEntries(HOST_ARTIFACT_FIELDS.map((field) => [field, value[field] === undefined ? false : value[field]]));
  if (HOST_ARTIFACT_FIELDS.some((field) => typeof policy[field] !== 'boolean')) throw new Error('artifactPolicy 必须使用布尔白名单');
  return policy;
}

function validateLocal(project, fields) {
  if (!EXECUTORS.has(fields.executor)) throw new Error('不支持的 executor');
  const cwdRelative = String(fields.cwdRelative || '.');
  const cwd = path.resolve(project.workspacePath || '.', cwdRelative);
  const root = path.resolve(project.workspacePath || '.');
  let realRoot = root;
  let realCwd = cwd;
  try { realRoot = fs.realpathSync.native(root); realCwd = fs.realpathSync.native(cwd); }
  catch { if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error('cwd 必须位于项目工作区'); }
  if (realCwd !== realRoot && !realCwd.startsWith(realRoot + path.sep)) throw new Error('cwd 必须位于项目工作区');
  if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error('cwd 必须位于项目工作区');
  if (!Array.isArray(fields.targetFiles) || !fields.targetFiles.length || fields.targetFiles.some((file) => typeof file !== 'string' || /[*?\[\]]/.test(file) || path.isAbsolute(file))) throw new Error('targetFiles 必须是精确文件');
  for (const file of fields.targetFiles) {
    if (file.includes('\0') || path.basename(file).startsWith('-')) throw new Error('目标文件不能是非法路径或选项');
    const target = path.resolve(cwd, file);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('目标文件必须位于项目工作区');
    if (!fs.existsSync(target)) throw new Error('目标文件不存在');
    const stat = fs.statSync(target);
    if (!stat.isFile()) throw new Error('目标文件必须是普通文件');
    const realTarget = fs.realpathSync.native(target);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) throw new Error('目标文件必须位于项目工作区');
  }
  if (!NETWORK_INTENTS.has(fields.networkIntent || 'none')) throw new Error('无效 networkIntent');
  const timeoutMs = fields.timeoutMs ?? 120000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) throw new Error('timeoutMs 超出范围');
  return { name: String(fields.name || '未命名执行配置'), executor: fields.executor, cwdRelative, targetFiles: [...fields.targetFiles], networkIntent: fields.networkIntent || 'none', timeoutMs };
}

export function normalizeHostExecutionProfile(project, fields = {}) {
  void project;
  rejectUnknownFields(fields, HOST_VERSION_FIELDS, 'host profile');
  if (fields.kind !== 'host') throw new Error('host profile 必须声明 kind: host');
  const name = fields.name === undefined ? '未命名宿主执行配置' : fields.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new Error('host profile name 无效');
  if (!HOST_PROVIDERS.has(fields.provider)) throw new Error('不支持的 host provider');
  if (!Array.isArray(fields.capabilities) || !fields.capabilities.length || fields.capabilities.some((capability) => typeof capability !== 'string' || !HOST_CAPABILITIES.has(capability))) throw new Error('host capabilities 无效');
  const capabilities = [...new Set(fields.capabilities)];
  const providerCapabilities = PROVIDER_CAPABILITIES.get(fields.provider);
  if (capabilities.some((capability) => !providerCapabilities.has(capability))) throw new Error('provider 不支持该 capability');
  const timeoutMs = fields.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_HOST_TIMEOUT_MS || timeoutMs > MAX_HOST_TIMEOUT_MS) throw new Error('host timeoutMs 超出范围');
  return {
    name: name.trim(),
    kind: 'host',
    provider: fields.provider,
    capabilities,
    targetPolicy: normalizeHostTargetPolicy(fields.targetPolicy),
    artifactPolicy: normalizeHostArtifactPolicy(fields.artifactPolicy),
    timeoutMs,
  };
}

export function isHostProvider(provider) {
  return HOST_PROVIDERS.has(provider);
}

export function isHostCapabilitySupported(provider, capability) {
  return Boolean(PROVIDER_CAPABILITIES.get(provider)?.has(capability));
}

export function createExecutionProfile(project, fields = {}) {
  project.executionProfiles ||= [];
  const version = fields.kind === 'host' ? normalizeHostExecutionProfile(project, fields) : validateLocal(project, fields);
  const snapshot = fields.kind === 'host' ? cloneHostVersion(version) : version;
  const profile = fields.kind === 'host'
    ? { id: uid('profile'), kind: 'host', version: 1, ...version, versions: [{ version: 1, ...snapshot, createdAt: now() }], disabled: false, createdAt: now() }
    : { id: uid('profile'), version: 1, ...version, versions: [{ version: 1, ...snapshot, createdAt: now() }], disabled: false, createdAt: now() };
  project.executionProfiles.push(profile);
  return profile;
}

export function createExecutionProfileVersion(project, id, fields = {}) {
  const profile = project.executionProfiles?.find((item) => item.id === id);
  if (!profile) throw new Error('执行配置不存在');
  const current = currentExecutionProfileVersion(profile);
  const isHost = profile.kind === 'host' || current.kind === 'host';
  const base = isHost
    ? Object.fromEntries(HOST_VERSION_FIELDS.map((field) => [field, current[field]]))
    : { ...current };
  const next = isHost ? normalizeHostExecutionProfile(project, { ...base, ...fields }) : validateLocal(project, { ...base, ...fields });
  const version = (profile.currentVersion || profile.version) + 1;
  profile.versions.push({ version, ...(isHost ? cloneHostVersion(next) : next), createdAt: now() });
  profile.currentVersion = version;
  return { id: profile.id, version, ...(isHost ? cloneHostVersion(next) : next), disabled: profile.disabled };
}

export function currentExecutionProfileVersion(profile) {
  if (!profile) throw new Error('执行配置不存在');
  const version = profile.currentVersion || profile.version;
  const snapshot = profile.versions?.find((item) => item.version === version);
  if (!snapshot) throw new Error('执行配置当前版本不存在');
  if (profile.kind === 'host' || snapshot.kind === 'host') {
    const hostVersion = Object.fromEntries(HOST_VERSION_FIELDS.map((field) => [field, snapshot[field] ?? (field === 'kind' ? 'host' : undefined)]));
    return { id: profile.id, version, ...cloneHostVersion(hostVersion), disabled: Boolean(profile.disabled) };
  }
  return { id: profile.id, version, ...Object.fromEntries(LOCAL_VERSION_FIELDS.map((field) => [field, snapshot[field]])), disabled: Boolean(profile.disabled) };
}

export function disableExecutionProfile(project, id) {
  const profile = project.executionProfiles?.find((item) => item.id === id);
  if (!profile) throw new Error('执行配置不存在');
  profile.disabled = true;
  return profile;
}

export function resolveExecutionCommand(project, profileVersion, testcaseIds = []) {
  if (!EXECUTORS.has(profileVersion.executor)) throw new Error('不支持的执行器');
  const targets = testcaseIds.length ? project.testcases.filter((testcase) => testcaseIds.includes(testcase.id)).map((testcase) => testcase.target).filter(Boolean) : profileVersion.targetFiles;
  if (!targets.length) throw new Error('没有可执行的目标文件');
  if (targets.some((target) => /[*?\[\]]/.test(target) || path.isAbsolute(target))) throw new Error('目标文件必须是精确相对路径');
  if (targets.some((target) => target.includes('\0') || path.basename(target).startsWith('-'))) throw new Error('目标文件不能是非法路径或选项');
  const root = fs.realpathSync.native(path.resolve(project.workspacePath));
  for (const target of targets) {
    const full = path.resolve(project.workspacePath, target);
    if (!fs.existsSync(full)) throw new Error('目标文件不存在');
    const real = fs.realpathSync.native(full);
    if (real !== root && !real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) throw new Error('目标文件必须位于项目工作区');
  }
  if (profileVersion.executor === 'node-test') return [process.execPath, '--test', ...targets];
  const playwright = path.join(project.workspacePath, 'node_modules', '.bin', 'playwright');
  if (!fs.existsSync(playwright)) throw new Error('项目工作区未找到 Playwright');
  if (!fs.realpathSync.native(playwright).startsWith(root + path.sep)) throw new Error('Playwright 必须位于项目工作区');
  return [playwright, 'test', ...targets];
}
