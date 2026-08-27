import fs from 'node:fs';
import path from 'node:path';
import { now, uid } from '../store.js';

const EXECUTORS = new Set(['node-test', 'playwright']);
const NETWORK_INTENTS = new Set(['none', 'declared']);
const VERSION_FIELDS = ['name', 'executor', 'cwdRelative', 'targetFiles', 'networkIntent', 'timeoutMs'];

function validate(project, fields) {
  if (!EXECUTORS.has(fields.executor)) throw new Error('不支持的 executor');
  const cwdRelative = String(fields.cwdRelative || '.');
  const cwd = path.resolve(project.workspacePath || '.', cwdRelative);
  const root = path.resolve(project.workspacePath || '.');
  if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error('cwd 必须位于项目工作区');
  if (!Array.isArray(fields.targetFiles) || !fields.targetFiles.length || fields.targetFiles.some((file) => typeof file !== 'string' || /[*?\[\]]/.test(file) || path.isAbsolute(file))) throw new Error('targetFiles 必须是精确文件');
  for (const file of fields.targetFiles) {
    const target = path.resolve(cwd, file);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('目标文件必须位于项目工作区');
  }
  if (!NETWORK_INTENTS.has(fields.networkIntent || 'none')) throw new Error('无效 networkIntent');
  const timeoutMs = fields.timeoutMs ?? 120000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) throw new Error('timeoutMs 超出范围');
  return { name: String(fields.name || '未命名执行配置'), executor: fields.executor, cwdRelative, targetFiles: [...fields.targetFiles], networkIntent: fields.networkIntent || 'none', timeoutMs };
}

export function createExecutionProfile(project, fields = {}) {
  project.executionProfiles ||= [];
  const version = validate(project, fields);
  const profile = { id: uid('profile'), version: 1, ...version, versions: [{ version: 1, ...version, createdAt: now() }], disabled: false, createdAt: now() };
  project.executionProfiles.push(profile);
  return profile;
}

export function createExecutionProfileVersion(project, id, fields = {}) {
  const profile = project.executionProfiles?.find((item) => item.id === id);
  if (!profile) throw new Error('执行配置不存在');
  const next = validate(project, { ...profile, ...fields });
  const version = (profile.currentVersion || profile.version) + 1;
  profile.versions.push({ version, ...next, createdAt: now() });
  profile.currentVersion = version;
  return { id: profile.id, version, ...next, disabled: profile.disabled };
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
  if (profileVersion.executor === 'node-test') return [process.execPath, '--test', ...targets];
  const playwright = path.join(project.workspacePath, 'node_modules', '.bin', 'playwright');
  if (!fs.existsSync(playwright)) throw new Error('项目工作区未找到 Playwright');
  return [playwright, 'test', ...targets];
}
