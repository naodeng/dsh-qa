// 数据层：内存态 + 原子落盘（JSON 文件，单用户本地应用足够）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_PATH, CONV_DIR, DATA_DIR } from './config.js';
import { migrateDb } from './migrations.js';
import { normalizeGate } from './quality/gate.js';

const DEFAULT_ASSISTANT = Object.freeze({
  enabled: true,
  mode: 'full',
  autoExtract: true,
  reminders: 'all',
});

export function uid(prefix = '') {
  return (prefix ? prefix + '_' : '') + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}
export const now = () => new Date().toISOString();

let db = migrateDb({ projects: [], feed: [], artifactCleanupJobs: [] });
let saveTimer = null;

export function loadStore() {
  if (fs.existsSync(DATA_PATH)) db = migrateDb(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
  else db = migrateDb({ projects: [], feed: [], artifactCleanupJobs: [] });
  for (const p of db.projects) normalizeProject(p);
  return db;
}

function normalizeProject(p) {
  p.kind ||= 'project';
  delete p.aiModel;
  delete p.chatBackend;
  p.dshSessionId ||= '';
  p.assistant = { ...DEFAULT_ASSISTANT, ...(p.assistant || {}) };
  p.workspacePath ||= '';
  p.artifactRoot ||= path.join(DATA_DIR, 'artifacts', p.id);
  p.events ||= [];
  p.milestones ||= [];
  p.testcases ||= [];
  p.requirements ||= [];
  p.defects ||= [];
  p.reports ||= [];
  p.knowledge ||= [];
  p.minutes ||= [];
  p.gates = (p.gates || []).map(normalizeGate);
  p.materials ||= [];
  p.history ||= [];
  p.members ||= [];
  p.qualityTasks ||= [];
  p.qualityAudit ||= [];
  p.testruns ||= [];
  p.testPlans ||= [];
  p.executionProfiles ||= [];
  p.evidenceBundles ||= [];
  p.failureAnalyses ||= [];
  p.regressionSets ||= [];
  p.artifactCleanupJobs ||= [];
  return p;
}

export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 80);
}
export function flush() {
  clearTimeout(saveTimer);
  writeNow();
}
function writeNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_PATH);
}

// ---------- projects ----------
export function listProjects() { return db.projects; }
export function listArtifactCleanupJobs() { return db.artifactCleanupJobs || []; }
export function getProject(id) { return db.projects.find((p) => p.id === id) || null; }

export function createProject(fields = {}) {
  const t = now();
  const projectId = uid('prj');
  const p = {
    id: projectId,
    kind: fields.kind === 'iteration' ? 'iteration' : 'project',
    parentId: fields.parentId || '',
    title: fields.title || '未命名测试项目',
    projectKey: fields.projectKey || '',
    product: fields.product || '',
    owner: fields.owner || '',
    type: fields.type || 'web',
    members: Array.isArray(fields.members) ? fields.members : [],
    summary: fields.summary || '',
    dshSessionId: '',
    assistant: {
      ...DEFAULT_ASSISTANT,
      ...(fields.assistant && typeof fields.assistant === 'object' ? fields.assistant : {}),
    },
    workspacePath: '',
    artifactRoot: path.join(DATA_DIR, 'artifacts', projectId),
    status: 'intake',
    history: [{ from: null, to: 'intake', at: t, by: 'human' }],
    milestones: [],
    testcases: [],
    requirements: [],
    defects: [],
    reports: [],
    knowledge: [],
    minutes: [],
    events: [],
    gates: [],
    materials: [],
    qualityTasks: [],
    qualityAudit: [],
    testruns: [],
    testPlans: [],
    executionProfiles: [],
    evidenceBundles: [],
    failureAnalyses: [],
    regressionSets: [],
    artifactCleanupJobs: [],
    aiActive: false,
    createdAt: t,
    updatedAt: t,
    lastActivityAt: t,
  };
  db.projects.push(p);
  persist();
  return p;
}

export function updateProject(id, patch) {
  const p = getProject(id);
  if (!p) return null;
  for (const k of ['title', 'projectKey', 'product', 'owner', 'type', 'kind', 'parentId', 'summary', 'dshSessionId']) {
    if (k in patch) p[k] = patch[k];
  }
  if (Array.isArray(patch.members)) p.members = patch.members;
  if (patch.assistant && typeof patch.assistant === 'object') {
    p.assistant = { ...DEFAULT_ASSISTANT, ...(p.assistant || {}), ...patch.assistant };
  }
  touch(p);
  persist();
  return p;
}

export function deleteProject(id) {
  const i = db.projects.findIndex((p) => p.id === id);
  if (i < 0) return false;
  db.artifactCleanupJobs ||= [];
  const project = db.projects[i];
  db.artifactCleanupJobs.push({ id: uid('cleanup'), projectId: project.id, artifactRoot: project.artifactRoot || '', status: 'queued', attempts: 0, createdAt: now() });
  db.projects.splice(i, 1);
  flush();
  return true;
}

export function touch(p) { p.updatedAt = now(); p.lastActivityAt = now(); }

export function mutateProject(id, fn) {
  const p = getProject(id);
  if (!p) return null;
  fn(p);
  touch(p);
  persist();
  return p;
}

export function transitionProject(p, to, by = 'human') {
  const from = p.status;
  if (from === to) return false;
  p.status = to;
  p.history.push({ from, to, at: now(), by });
  touch(p);
  persist();
  return true;
}

// ---------- 每项目本地工作目录 ----------
export function ensureProjectWorkspace(p) {
  if (!p) throw new Error('项目不存在');
  const root = path.join(DATA_DIR, 'project-workspaces');
  fs.mkdirSync(root, { recursive: true });
  let target = p.workspacePath;
  if (!target || !path.resolve(target).startsWith(path.resolve(root) + path.sep)) {
    const safeTitle = String(p.title || '未命名项目')
      .normalize('NFKC')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '未命名项目';
    const suffix = String(p.id).split('_').pop().slice(-6);
    target = path.join(root, `${safeTitle}-${suffix}`);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const name of [
    '01_需求与范围', '02_测试计划', '03_测试用例', '04_测试数据与脚本',
    '05_测试执行', '06_缺陷', '07_测试报告', '08_发布与归档',
  ]) fs.mkdirSync(path.join(target, name), { recursive: true });
  p.workspacePath = target;
  touch(p);
  persist();
  return target;
}

// ---------- feed（实时材料流） ----------
export function getFeed() { return db.feed; }
export function addFeed(entry) {
  entry.id = uid('feed');
  entry.ts = now();
  db.feed.unshift(entry);
  if (db.feed.length > 300) db.feed.length = 300;
  const p = entry.projectId ? getProject(entry.projectId) : null;
  if (p) {
    p.materials.unshift({ id: entry.id, ts: entry.ts, type: entry.type, label: entry.label });
    p.materials = p.materials.slice(0, 6);
    touch(p);
  }
  persist();
  return entry;
}

// ---------- 会话 ----------
export function loadConv(projectId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONV_DIR, projectId + '.json'), 'utf8'));
  } catch { return { messages: [] }; }
}
export function saveConv(projectId, conv) {
  fs.writeFileSync(path.join(CONV_DIR, projectId + '.json'), JSON.stringify(conv, null, 1));
}
export function clearConv(projectId) {
  saveConv(projectId, { messages: [] });
}
