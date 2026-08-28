import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { now, persist, uid } from '../store.js';
import { broadcast } from '../sse.js';
import { createTestRun, normalizeTestRunProject } from './test-run.js';
import { currentExecutionProfileVersion, resolveExecutionCommand } from './execution-profile.js';

const MAX_LOG = 1024 * 1024;
const previews = new WeakMap();
const activeProcesses = new Map();
const deferredStarts = new Map();
const TERMINAL_STATUSES = new Set(['passed', 'failed', 'cancelled', 'timed-out', 'environment-error']);
const ALLOWED_ENV = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'];

const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function authorizationSnapshot(project, planId, profileId) {
  const plan = project.testPlans?.find((item) => item.id === planId);
  const profile = project.executionProfiles?.find((item) => item.id === profileId);
  if (!plan) throw new Error('测试计划不存在');
  if (plan.status !== 'reviewed') throw new Error('只有当前已评审测试计划可以生成运行预览');
  if (!profile || profile.disabled) throw new Error('执行配置不存在或已停用');
  const profileVersion = currentExecutionProfileVersion(profile);
  const argv = resolveExecutionCommand(project, profileVersion, plan.testcaseIds || []);
  const cwd = path.resolve(project.workspacePath || '.', profileVersion.cwdRelative);
  const effects = { declaredWrites: ['artifact-root'], networkIntent: profileVersion.networkIntent, filesystemEnforced: false, networkEnforced: false };
  const task = project.qualityTasks?.find((item) => item.id === plan.qualityTaskId);
  const sourceDigest = digest((task?.sources || []).map((source) => source.digest).sort());
  const authorization = { planId, planVersion: plan.version, profileId, profileVersion: profileVersion.version, sourceDigest, cwd, argv, effects };
  return { ...authorization, testcaseIds: [...(plan.testcaseIds || [])], timeoutMs: profileVersion.timeoutMs, authorizationDigest: digest(authorization) };
}

export function createRunPreview(project, planId, profileId) {
  normalizeTestRunProject(project);
  const authorization = authorizationSnapshot(project, planId, profileId);
  const previewToken = `${uid('preview')}_${Date.now()}`;
  const preview = { previewToken, ...authorization, command: authorization.argv, expiresAt: Date.now() + 5 * 60 * 1000 };
  previews.set(project, [...(previews.get(project) || []), structuredClone(preview)]);
  return structuredClone(preview);
}

function consumePreview(project, token) {
  const list = previews.get(project) || [];
  const index = list.findIndex((item) => item.previewToken === token);
  if (index < 0) throw new Error('预览已失效');
  const [preview] = list.splice(index, 1);
  previews.set(project, list);
  if (preview.expiresAt <= Date.now()) throw new Error('预览已失效');
  try {
    const current = authorizationSnapshot(project, preview.planId, preview.profileId);
    if (current.authorizationDigest !== preview.authorizationDigest) throw new Error('changed');
  } catch {
    throw new Error('预览授权已变化，请重新生成');
  }
  return preview;
}

export async function prepareArtifactStaging(projectOrId, runId) {
  const projectId = typeof projectOrId === 'object' ? projectOrId.id : projectOrId;
  const root = typeof projectOrId === 'object' && projectOrId.artifactRoot ? projectOrId.artifactRoot : path.join(process.env.QA_DATA_DIR || path.resolve('data'), 'artifacts', projectId);
  const artifactDir = path.join(root, `${runId}.staging`);
  await fs.mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

function minimalEnvironment() {
  return Object.fromEntries(ALLOWED_ENV.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
}

function updateRun(run, status, error) {
  run.status = status;
  run.revision = (run.revision || 1) + 1;
  run.updatedAt = now();
  if (error) run.error = error;
}

function terminateProcess(child) {
  if (!child) return;
  if (process.platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); return; } catch { /* process may already be closing */ }
  }
  try { child.kill('SIGTERM'); } catch { /* process may already be closing */ }
}

function execute(project, run, command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, shell: false, env: minimalEnvironment(), detached: process.platform !== 'win32' });
    activeProcesses.set(run.id, child);
    let output = '';
    let settled = false;
    const append = (chunk) => { if (output.length < MAX_LOG) output += chunk.toString('utf8').slice(0, MAX_LOG - output.length); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timer = setTimeout(() => {
      if (!TERMINAL_STATUSES.has(run.status)) updateRun(run, 'timed-out', '执行超时');
      terminateProcess(child);
    }, timeoutMs);
    const finish = async (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeProcesses.delete(run.id);
      if (!TERMINAL_STATUSES.has(run.status)) updateRun(run, error ? 'environment-error' : code === 0 ? 'passed' : 'failed', error?.message);
      run.exitCode = code;
      run.updatedAt = now();
      try { await fs.writeFile(path.join(run.artifactDir, 'process.log'), output); }
      catch (writeError) { if (!run.error) run.error = `无法写入运行日志：${writeError.message}`; }
      persist();
      broadcast('quality.test-run.updated', { projectId: project.id, runId: run.id, status: run.status });
      resolve(run);
    };
    child.on('error', (error) => { finish(null, error); });
    child.on('close', (code) => { finish(code); });
  });
}

export function cancelRun(project, runId, expectedRevision) {
  const run = project.testruns?.find((item) => item.id === runId);
  if (!run || !['queued', 'running'].includes(run.status)) throw new Error('运行无法取消');
  if (expectedRevision !== (run.revision || 1)) {
    const error = new Error('测试运行版本已变化，请重新加载');
    error.code = 'QUALITY_REVISION_CONFLICT';
    throw error;
  }
  const deferred = deferredStarts.get(runId);
  if (deferred) clearTimeout(deferred);
  deferredStarts.delete(runId);
  terminateProcess(activeProcesses.get(runId));
  updateRun(run, 'cancelled');
  persist();
  broadcast('quality.test-run.updated', { projectId: project.id, runId, status: run.status });
  return run;
}

export async function startRun(project, previewToken, { defer = false } = {}) {
  const preview = consumePreview(project, previewToken);
  const profile = project.executionProfiles.find((item) => item.id === preview.profileId);
  const run = createTestRun(project, { mode: 'local', executor: currentExecutionProfileVersion(profile).executor, summary: '', provenance: { planId: preview.planId, testPlanVersion: preview.planVersion, profileId: profile.id, profileVersion: preview.profileVersion, sourceDigest: preview.sourceDigest } });
  run.command = [...preview.argv];
  run.artifactDir = await prepareArtifactStaging(project, run.id);
  persist();
  if (defer) {
    const deferred = setTimeout(async () => {
      deferredStarts.delete(run.id);
      if (run.status !== 'queued') return;
      updateRun(run, 'running');
      persist();
      await execute(project, run, preview.argv, preview.cwd, preview.timeoutMs);
    }, 0);
    deferredStarts.set(run.id, deferred);
    return run;
  }
  updateRun(run, 'running');
  persist();
  return execute(project, run, preview.argv, preview.cwd, preview.timeoutMs);
}

export function recoverInterruptedRuns(projects) {
  for (const project of projects) for (const run of (project.testruns || [])) if (run.status === 'queued' || run.status === 'running') updateRun(run, 'environment-error', '进程在服务重启时中断');
  return projects;
}
