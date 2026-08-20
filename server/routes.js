// HTTP 路由：静态前端 + REST API + SSE
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './config.js';
import * as store from './store.js';
import { sseHandler, broadcast } from './sse.js';
import { getBoard, projectCard, computeStats, KANBAN_COLUMNS } from './board.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function json(res, code, obj) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function ok(res, obj) { json(res, 200, { ok: true, ...obj }); }
function fail(res, code, error) { json(res, code, { ok: false, error }); }

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function emitProject(projectId) {
  const p = store.getProject(projectId);
  if (!p) return;
  broadcast('project.updated', { project: projectCard(p) });
  broadcast('stats', computeStats(store.listProjects().map(projectCard)));
}

function feedAndBroadcast(entry) {
  const e = store.addFeed(entry);
  broadcast('feed', { entry: e });
  return e;
}

// ---------- API 处理器（body 已由外层读取） ----------
async function api(req, res, url, body) {
  const p = url.pathname;
  const m = (method) => req.method === method;
  const parts = p.split('/').filter(Boolean); // [api, ...]

  if (p === '/api/events') { sseHandler(req, res); return true; }

  if (p === '/api/board' && m('GET')) { ok(res, getBoard(store)); return true; }

  if (p === '/api/stats' && m('GET')) { ok(res, computeStats(store.listProjects().map(projectCard))); return true; }

  if (p === '/api/projects' && m('GET')) {
    ok(res, { projects: store.listProjects().map((c) => ({ id: c.id, title: c.title, kind: c.kind, projectKey: c.projectKey, status: c.status, updatedAt: c.updatedAt, memberNames: c.members.map((x) => x.name).join('、') })) });
    return true;
  }
  if (p === '/api/projects' && m('POST')) {
    if (!body.title?.trim()) return fail(res, 400, '项目标题不能为空');
    const c = store.createProject(body);
    if (body.createWorkspace !== false) store.ensureProjectWorkspace(c);
    feedAndBroadcast({ type: 'case', projectId: c.id, projectTitle: c.title, label: `新建${c.kind === 'iteration' ? '迭代' : '项目'}：${c.title}` });
    broadcast('project.created', { project: projectCard(c) });
    broadcast('stats', computeStats(store.listProjects().map(projectCard)));
    ok(res, { project: projectCard(c) });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && !parts[3]) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (m('GET')) { ok(res, { project: c }); return true; }
    if (m('DELETE')) {
      store.deleteProject(c.id);
      broadcast('project.deleted', { projectId: c.id });
      feedAndBroadcast({ type: 'case', label: `删除${c.kind === 'iteration' ? '迭代' : '项目'}：${c.title}` });
      broadcast('stats', computeStats(store.listProjects().map(projectCard)));
      ok(res, {});
      return true;
    }
    if (m('PATCH')) {
      const updated = store.updateProject(c.id, body);
      emitProject(c.id);
      ok(res, { project: projectCard(updated) });
      return true;
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'transition' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (!KANBAN_COLUMNS.some((k) => k.id === body.to)) return fail(res, 400, '无效目标列');
    const from = c.status;
    store.transitionProject(c, body.to, 'human');
    feedAndBroadcast({ type: 'transition', projectId: c.id, projectTitle: c.title, label: `阶段变更：${KANBAN_COLUMNS.find((k) => k.id === from)?.title} → ${KANBAN_COLUMNS.find((k) => k.id === body.to)?.title}` });
    emitProject(c.id);
    ok(res, { project: projectCard(c) });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'chat' && !parts[4] && m('POST')) {
    fail(res, 410, '工作台对话已统一由 DSH 测试模式处理，请从 DSH 侧边栏进入本项目对话');
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'chat' && parts[4] === 'stop' && m('POST')) {
    fail(res, 410, '请通过 DSH 原生会话停止当前任务');
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'conv' && m('DELETE')) {
    fail(res, 410, '工作台不再维护独立对话记录；请在本项目 DSH 会话中管理历史');
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'workspace' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const workspacePath = store.ensureProjectWorkspace(c);
    emitProject(c.id);
    ok(res, { path: workspacePath });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'workspace' && parts[4] === 'open' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const workspacePath = store.ensureProjectWorkspace(c);
    if (process.platform !== 'darwin') return fail(res, 400, '当前系统暂不支持直接打开文件夹');
    const child = spawn('open', [workspacePath], { detached: true, stdio: 'ignore' });
    child.unref();
    ok(res, { path: workspacePath });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'schedule' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const title = String(body.title || '').trim();
    const date = String(body.date || '').trim();
    if (!title) return fail(res, 400, '事项名称不能为空');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + 'T00:00:00').getTime())) return fail(res, 400, '日期格式无效');
    const type = body.type === 'milestone' ? 'milestone' : 'event';
    let item;
    if (type === 'milestone') {
      item = { id: store.uid('ms'), title, kind: String(body.kind || 'other'), startDate: null, days: null, businessDays: false, dueDate: date, basis: String(body.note || '').trim(), done: false, at: store.now() };
      c.milestones.push(item);
    } else {
      item = { id: store.uid('evt'), title, date, kind: String(body.kind || 'other'), note: String(body.note || '').trim(), at: store.now() };
      c.events.push(item);
    }
    store.touch(c); store.persist();
    feedAndBroadcast({ type, projectId: c.id, projectTitle: c.title, label: `手动登记${type === 'milestone' ? '里程碑' : '日程'}：${title}（${date}）` });
    emitProject(c.id);
    ok(res, { item, type });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'schedule' && parts[4] && m('DELETE')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const eventIndex = c.events.findIndex((item) => item.id === parts[4]);
    const milestoneIndex = c.milestones.findIndex((item) => item.id === parts[4]);
    let removed;
    let type;
    if (eventIndex >= 0) { [removed] = c.events.splice(eventIndex, 1); type = 'event'; }
    else if (milestoneIndex >= 0) { [removed] = c.milestones.splice(milestoneIndex, 1); type = 'milestone'; }
    else return fail(res, 404, '日程或里程碑不存在');
    store.touch(c); store.persist();
    feedAndBroadcast({ type, projectId: c.id, projectTitle: c.title, label: `删除${type === 'milestone' ? '里程碑' : '日程'}：${removed.title}` });
    emitProject(c.id);
    ok(res, { removedId: removed.id });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'testcases' && parts[4] && parts[5] === 'status' && m('POST')) {
    const c = store.getProject(parts[2]);
    const t = c?.testcases.find((x) => x.id === parts[4]);
    if (!t) return fail(res, 404, '用例不存在');
    t.status = body.status; t.at = store.now();
    store.touch(c); store.persist();
    emitProject(c.id);
    ok(res, { testcase: t });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'defects' && parts[4] && parts[5] === 'status' && m('POST')) {
    const c = store.getProject(parts[2]);
    const d = c?.defects.find((x) => x.id === parts[4]);
    if (!d) return fail(res, 404, '缺陷不存在');
    d.status = body.status; d.at = store.now();
    store.touch(c); store.persist();
    emitProject(c.id);
    ok(res, { defect: d });
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'gates' && parts[4] && parts[5] === 'decide' && m('POST')) {
    const c = store.getProject(parts[2]);
    const g = c?.gates.find((x) => x.id === parts[4]);
    if (!g) return fail(res, 404, '门禁不存在');
    if (!['approve', 'reject'].includes(body.decision)) return fail(res, 400, 'decision 必须是 approve 或 reject');
    if (g.status !== 'pending') return fail(res, 400, '该门禁已处理');
    g.status = body.decision === 'approve' ? 'approved' : 'rejected';
    g.decidedAt = store.now();
    g.decision = body.decision;
    store.touch(c); store.persist();
    feedAndBroadcast({ type: 'gate', projectId: c.id, projectTitle: c.title, label: `负责人${body.decision === 'approve' ? '通过' : '驳回'}门禁：${g.title}` });
    emitProject(c.id);
    ok(res, { gate: g });
    return true;
  }

  if (p.startsWith('/api/settings')) { fail(res, 410, '模型、服务商和凭据统一在 DSH 设置中管理'); return true; }

  return false;
}

// ---------- 静态文件 ----------
function staticFile(req, res, url) {
  let p = url.pathname;
  if (p === '/' || p === '/app' || p === '/index.html') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^([.][.][/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

export function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    (req.method === 'POST' || req.method === 'PATCH' ? readBody(req) : Promise.resolve({}))
      .then((body) => api(req, res, url, body))
      .then((handled) => { if (!handled) fail(res, 404, '接口不存在'); })
      .catch((e) => fail(res, 400, String(e?.message || e)));
    return;
  }
  staticFile(req, res, url);
}
