import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { now, persist, uid } from '../store.js';
import { broadcast } from '../sse.js';
import { createTestRun, normalizeTestRunProject } from './test-run.js';
import { resolveExecutionCommand } from './execution-profile.js';

const MAX_LOG = 1024 * 1024;
const previews = new WeakMap();
const activeProcesses = new Map();

export function createRunPreview(project, planId, profileId) {
  normalizeTestRunProject(project);
  const plan = project.testPlans?.find((item) => item.id === planId);
  const profile = project.executionProfiles?.find((item) => item.id === profileId);
  if (!plan) throw new Error('测试计划不存在');
  if (!profile || profile.disabled) throw new Error('执行配置不存在或已停用');
  const previewToken = `${uid('preview')}_${Date.now()}`;
  const preview = { previewToken, planId, profileId, testcaseIds: plan.testcaseIds || [], command: resolveExecutionCommand(project, profile, plan.testcaseIds || []), effects: { declaredWrites: ['artifact-root'], networkIntent: profile.networkIntent, filesystemEnforced: false, networkEnforced: false }, expiresAt: Date.now() + 5 * 60 * 1000 };
  previews.set(project, [...(previews.get(project) || []), preview]);
  return preview;
}

function consumePreview(project, token) {
  const list = previews.get(project) || [];
  const index = list.findIndex((item) => item.previewToken === token && item.expiresAt > Date.now());
  if (index < 0) throw new Error('预览已失效');
  const [preview] = list.splice(index, 1);
  previews.set(project, list);
  return preview;
}

export async function prepareArtifactStaging(projectOrId, runId) {
  const projectId = typeof projectOrId === 'object' ? projectOrId.id : projectOrId;
  const root = typeof projectOrId === 'object' && projectOrId.artifactRoot ? projectOrId.artifactRoot : path.join(process.env.QA_DATA_DIR || path.resolve('data'), 'artifacts', projectId);
  const artifactDir = path.join(root, `${runId}.staging`);
  await fs.mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

function execute(project, run, command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(command[0], command.slice(1), { cwd, shell: false, env });
    activeProcesses.set(run.id, child);
    let output = '';
    const append = (chunk) => { if (output.length < MAX_LOG) output += chunk.toString('utf8').slice(0, MAX_LOG - output.length); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timer = setTimeout(() => { child.kill('SIGTERM'); run.status = 'environment-error'; run.error = '执行超时'; }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); activeProcesses.delete(run.id); run.status = 'environment-error'; run.error = error.message; broadcast('quality.test-run.updated', { projectId: project.id, runId: run.id, status: run.status }); resolve(run); });
    child.on('close', (code) => {
      clearTimeout(timer);
      activeProcesses.delete(run.id);
      if (run.status !== 'environment-error') run.status = code === 0 ? 'passed' : 'failed';
      run.exitCode = code;
      run.updatedAt = now();
      fs.writeFile(path.join(run.artifactDir, 'process.log'), output).catch(() => {});
      broadcast('quality.test-run.updated', { projectId: project.id, runId: run.id, status: run.status });
      resolve(run);
    });
  });
}

export function cancelRun(project, runId) {
  const run = project.testruns?.find((item) => item.id === runId);
  if (!run || !['queued', 'running'].includes(run.status)) throw new Error('运行无法取消');
  activeProcesses.get(runId)?.kill('SIGTERM');
  run.status = 'cancelled';
  run.updatedAt = now();
  persist();
  broadcast('quality.test-run.updated', { projectId: project.id, runId, status: run.status });
  return run;
}

export async function startRun(project, previewToken, { defer = false } = {}) {
  const preview = consumePreview(project, previewToken);
  const profile = project.executionProfiles.find((item) => item.id === preview.profileId);
  const run = createTestRun(project, { mode: 'local', executor: profile.executor, summary: '', provenance: { planId: preview.planId, profileId: profile.id } });
  run.command = preview.command;
  run.artifactDir = await prepareArtifactStaging(project, run.id);
  persist();
  if (defer) {
    setTimeout(async () => { run.status = 'running'; await execute(project, run, preview.command, path.resolve(project.workspacePath || '.'), profile.timeoutMs); }, 0);
    return run;
  }
  run.status = 'running';
  return execute(project, run, preview.command, path.resolve(project.workspacePath || '.'), profile.timeoutMs);
}

export function recoverInterruptedRuns(projects) {
  for (const project of projects) for (const run of (project.testruns || [])) if (run.status === 'queued' || run.status === 'running') { run.status = 'environment-error'; run.error = '进程在服务重启时中断'; run.updatedAt = now(); }
  return projects;
}
