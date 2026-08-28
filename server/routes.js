// HTTP 路由：静态前端 + REST API + SSE
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { ROOT } from './config.js';
import * as store from './store.js';
import { sseHandler, broadcast } from './sse.js';
import { getBoard, projectCard, computeStats, KANBAN_COLUMNS } from './board.js';
import { createQualityTask, getQualityTask, listQualityTasks, normalizeQualityProject } from './quality/task.js';
import { captureSources } from './quality/source.js';
import { createExecutionProfile, createExecutionProfileVersion, disableExecutionProfile } from './quality/execution-profile.js';
import { cancelRun, createRunPreview, startRun } from './quality/test-runner.js';
import { createTestPlanVersion, getTestPlan, reviewTestPlan } from './quality/test-plan.js';
import { finalizeEvidence, resolveEvidence, verifyEvidence } from './quality/evidence.js';
import { compareRuns } from './quality/run-comparison.js';
import { saveFailureAnalysis, promoteConfirmedDefect } from './quality/failure-analysis.js';
import { createRegressionSet, excludeRegressionCase } from './quality/regression.js';
import { enqueueArtifactCleanup, runArtifactCleanup } from './quality/evidence-retention.js';
import { evaluateQualityGate } from './quality/gate.js';

const PUBLIC = path.join(ROOT, 'public');
const SKILLS_ROOT = path.join(process.env.QA_SKILLS_ROOT || path.join(os.homedir(), 'awsomeCode', 'awesome-qa-skills'), 'skills');
const DSH_SKILLS_ROOT = process.env.DSH_SKILLS_DIR || path.join(os.homedir(), '.dsh', 'skills');
const WEBSITE_CONTENT_ROOT = path.join(process.env.QA_SKILLS_SITE_ROOT || path.join(os.homedir(), 'Desktop', 'AwsomeCode', 'naodeng.com.cn'), 'src', 'content', 'qaskills');
const WEBSITE_ORIGIN = 'https://inaodeng.com';
const WEBSITE_INTRO_FALLBACKS = {
  zh: {
    'discover-testing': '输入当前测试任务和项目背景，选择最匹配的主 Skill，并给出下一步执行方式。',
    'requirements-analysis': '输入需求文档或 User Story，输出信息缺口、业务规则、风险和测试范围。',
    'test-case-writing': '输入测试场景和业务约束，输出带优先级的结构化测试用例。',
    'test-strategy': '输入项目目标、范围和风险，输出可执行的测试策略与质量保障重点。',
    'bug-reporting': '输入问题现象、日志和复现信息，输出清晰、可诊断的缺陷报告。',
    'daily-testing-workflow': '输入当天范围、进度和风险，输出可执行的日常测试节奏与交付清单。',
  },
  en: {
    'discover-testing': 'Provide the testing task and project context to select the best primary Skill and the next execution step.',
    'requirements-analysis': 'Provide requirements or a user story to produce gaps, rules, risks, and test scope.',
    'test-case-writing': 'Provide test scenarios and constraints to produce prioritized, structured test cases.',
    'test-strategy': 'Provide project goals, scope, and risks to produce an actionable test strategy and quality priorities.',
    'bug-reporting': 'Provide symptoms, logs, and reproduction details to produce a clear, diagnosable defect report.',
    'daily-testing-workflow': "Provide today's scope, progress, and risks to produce an actionable daily QA flow and delivery checklist.",
  },
};
const SKILLS_INSTALLER = path.join(ROOT, 'scripts', 'install-qa-skills.sh');
const SKILL_CATEGORIES = [
  { id: 'testing-types', zh: '测试类型', en: 'Testing types', order: 0 },
  { id: 'testing-workflows', zh: '测试工作流程', en: 'Testing workflows', order: 1 },
  { id: 'enhanced', zh: '加强版', en: 'Enhanced', order: 2 },
];
const WEBSITE_SKILL_ORDER = [
  'requirements-analysis', 'test-strategy', 'test-case-writing', 'test-case-reviewer',
  'functional-testing', 'manual-testing', 'mobile-testing', 'api-testing', 'api-test-bruno',
  'api-test-pytest', 'api-test-restassure', 'api-test-supertest', 'automation-testing',
  'performance-testing', 'performance-test-gatling', 'performance-test-k6', 'security-testing',
  'accessibility-testing', 'bug-reporting', 'test-reporting', 'ai-assisted-testing',
  'daily-testing-workflow', 'skill-router', 'iteration-testing-workflow', 'release-testing-workflow',
  'requirements-analysis-plus', 'test-case-reviewer-plus', 'test-strategy-plus', 'test-case-writing-plus',
];
const WEBSITE_SKILL_ORDER_INDEX = new Map(WEBSITE_SKILL_ORDER.map((name, index) => [name, index]));
const ENHANCED_SKILLS = new Set(['requirements-analysis-plus', 'test-case-reviewer-plus', 'test-strategy-plus', 'testcase-writer-plus']);
const TYPE_GROUPS = [
  ['requirements-strategy', '需求与策略', 'Requirements & strategy'],
  ['case-review', '用例与评审', 'Cases & review'],
  ['functional-compatibility', '功能与兼容', 'Functional & compatibility'],
  ['api-automation', '接口与自动化', 'API & automation'],
  ['quality-specialization', '质量保障专项', 'Quality specialties'],
  ['defect-reporting-review', '缺陷、报告与审查', 'Defects, reports & review'],
];
const TYPE_GROUP_BY_NAME = new Map([
  ['requirements-analysis', 'requirements-strategy'], ['test-strategy', 'requirements-strategy'],
  ['test-case-writing', 'case-review'], ['test-case-reviewer', 'case-review'],
  ['functional-testing', 'functional-compatibility'], ['manual-testing', 'functional-compatibility'], ['exploratory-testing', 'functional-compatibility'], ['mobile-testing', 'functional-compatibility'],
  ['api-testing', 'api-automation'], ['api-test-bruno', 'api-automation'], ['api-test-pytest', 'api-automation'], ['api-test-restassure', 'api-automation'], ['api-test-supertest', 'api-automation'], ['automation-testing', 'api-automation'],
  ['performance-testing', 'quality-specialization'], ['performance-test-gatling', 'quality-specialization'], ['performance-test-k6', 'quality-specialization'], ['security-testing', 'quality-specialization'], ['accessibility-testing', 'quality-specialization'],
  ['bug-reporting', 'defect-reporting-review'], ['defect-reporting', 'defect-reporting-review'], ['test-reporting', 'defect-reporting-review'], ['ai-assisted-testing', 'defect-reporting-review'],
]);
const TYPE_GROUP_ORDER = new Map(TYPE_GROUPS.map(([id], index) => [id, index]));
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
function created(res, obj) { json(res, 201, { ok: true, ...obj }); }
function publicEvidence(bundle) {
  return { id: bundle.id, projectId: bundle.projectId, testRunId: bundle.testRunId, state: bundle.state, totalSize: bundle.totalSize, manifestSha256: bundle.manifestSha256, createdAt: bundle.createdAt, updatedAt: bundle.updatedAt, items: bundle.items.map(({ id, relativePath, size, sha256 }) => ({ id, relativePath, size, sha256 })) };
}
function publicProject(project) {
  const { artifactRoot, evidenceBundles, ...safe } = project;
  safe.evidenceBundles = (evidenceBundles || []).map(publicEvidence);
  return safe;
}
function accepted(res, obj) { json(res, 202, { ok: true, ...obj }); }
function fail(res, code, error) { json(res, code, { ok: false, error }); }

function parseSkillFile(file, lang, categoryId, groupId) {
  const source = fs.readFileSync(file, 'utf8');
  const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim() || path.basename(path.dirname(file));
  const frontmatterDescription = source.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';
  const siteFile = path.join(WEBSITE_CONTENT_ROOT, lang === 'zh' ? 'zh-cn' : 'en', `${name}.md`);
  const siteSource = fs.existsSync(siteFile) ? fs.readFileSync(siteFile, 'utf8') : '';
  const localizedSource = siteSource || source;
  const localizedHeading = lang === 'zh' ? '何时使用' : 'When to Use';
  const localizedSection = localizedSource.match(new RegExp(`##\\s+${localizedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'))?.[1] || '';
  const bullets = [...localizedSection.matchAll(/^\s*-\s+(.+)$/gm)].map((match) => match[1].trim());
  const genericIntro = lang === 'zh' ? /真实项目里处理|相关任务/ : /real project context|related tasks?/i;
  const intro = WEBSITE_INTRO_FALLBACKS[lang][name] || bullets.find((bullet) => !genericIntro.test(bullet)) || bullets[0] || frontmatterDescription;
  const description = intro;
  const title = localizedSource.match(/^#\s+(.+)$/m)?.[1]?.trim() || name;
  const category = SKILL_CATEGORIES.find((item) => item.id === categoryId);
  const group = TYPE_GROUPS.find((item) => item[0] === groupId);
  return { name, title, description, intro, lang, categoryId, category: category?.[lang] || category?.en, groupId, group: group?.[lang] || group?.[2] || '', siteUrl: `${WEBSITE_ORIGIN}/${lang === 'zh' ? 'zh-cn' : 'en'}/qaskills/${name}/`, installed: fs.existsSync(path.join(DSH_SKILLS_ROOT, name, 'SKILL.md')) };
}

function skillCatalog(lang) {
  const root = path.join(SKILLS_ROOT, lang);
  const skills = [];
  for (const categoryId of ['testing-types', 'testing-workflows', 'skill-engineering']) {
    const category = categoryId === 'skill-engineering' ? 'enhanced' : categoryId;
    const dir = path.join(root, categoryId);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (categoryId === 'skill-engineering' && !ENHANCED_SKILLS.has(entry.name)) continue;
      const file = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      const normalizedCategory = ENHANCED_SKILLS.has(entry.name) ? 'enhanced' : category;
      const groupId = normalizedCategory === 'testing-types' ? (TYPE_GROUP_BY_NAME.get(entry.name) || 'quality-specialization') : '';
      skills.push(parseSkillFile(file, lang, normalizedCategory, groupId));
    }
  }
  skills.sort((a, b) => {
    const categoryOrder = (SKILL_CATEGORIES.find((item) => item.id === a.categoryId)?.order || 0) - (SKILL_CATEGORIES.find((item) => item.id === b.categoryId)?.order || 0);
    return categoryOrder || (TYPE_GROUP_ORDER.get(a.groupId) ?? 999) - (TYPE_GROUP_ORDER.get(b.groupId) ?? 999) || (WEBSITE_SKILL_ORDER_INDEX.get(a.name) ?? 999) - (WEBSITE_SKILL_ORDER_INDEX.get(b.name) ?? 999) || a.title.localeCompare(b.title, lang);
  });
  return skills;
}

function installSkill(lang, name) {
  return new Promise((resolve, reject) => {
    const args = ['--lang', lang, '--skill', name];
    execFile('bash', [SKILLS_INSTALLER, ...args], { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve({ output: stdout.trim() });
    });
  });
}

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

  if (p === '/api/skills' && m('GET')) {
    const lang = new Set(['zh', 'en']).has(url.searchParams.get('lang')) ? url.searchParams.get('lang') : null;
    if (!lang) return fail(res, 400, 'lang 必须是 zh 或 en');
    ok(res, { lang, categories: SKILL_CATEGORIES, groups: TYPE_GROUPS.map(([id, zh, en]) => ({ id, zh, en })), skills: skillCatalog(lang) });
    return true;
  }

  if (p === '/api/skills/install' && m('POST')) {
    const lang = body.lang;
    const name = String(body.name || '').trim();
    if (!new Set(['zh', 'en']).has(lang)) return fail(res, 400, 'lang 必须是 zh 或 en');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return fail(res, 400, 'Skill 名称无效');
    if (!skillCatalog(lang).some((skill) => skill.name === name)) return fail(res, 404, 'Skill 不存在');
    try { ok(res, await installSkill(lang, name)); } catch (error) { fail(res, 500, error.message); }
    return true;
  }

  if (parts[1] === 'skills' && parts[2] && !parts[3] && m('DELETE')) {
    const name = parts[2];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return fail(res, 400, 'Skill 名称无效');
    if (!skillCatalog('zh').some((skill) => skill.name === name) && !skillCatalog('en').some((skill) => skill.name === name)) return fail(res, 404, 'Skill 不存在');
    const target = path.join(DSH_SKILLS_ROOT, name);
    if (!fs.existsSync(target)) return fail(res, 404, 'Skill 尚未安装');
    fs.rmSync(target, { recursive: true, force: true });
    ok(res, { name, uninstalled: true });
    return true;
  }

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

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && !parts[4]) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    normalizeQualityProject(c);
    if (m('GET')) { return ok(res, { tasks: listQualityTasks(c) }); }
    if (m('POST')) {
      if (!String(body.title || '').trim()) return fail(res, 400, '质量任务标题不能为空');
      try {
        const sources = await captureSources(c, body.sources || []);
        const task = createQualityTask(c, { title: body.title, sources });
        store.touch(c); store.persist(); emitProject(c.id);
        return created(res, { task });
      } catch (error) { return fail(res, 400, error.message); }
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'decisions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    if (body.expectedRevision !== task.version) return fail(res, 409, '质量任务版本已变化，请重新加载');
    task.decisions.push({ action: String(body.action || ''), at: store.now(), by: 'human' });
    task.version += 1;
    task.updatedAt = store.now();
    store.touch(c); store.persist(); emitProject(c.id);
    return ok(res, { task });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-tasks' && parts[4] && parts[5] === 'manual-analyses' && m('POST')) {
    const c = store.getProject(parts[2]);
    const task = c && getQualityTask(c, parts[4]);
    if (!task) return fail(res, 404, '质量任务不存在');
    if (body.expectedRevision !== task.version) return fail(res, 409, '质量任务版本已变化，请重新加载');
    if (['origin', 'dshSessionId', 'stage', 'version', 'analysisOrigin', 'analysisRuns'].some((field) => field in body)) return fail(res, 400, '手工分析不允许提交宿主或派生字段');
    task.acceptanceCriteria = Array.isArray(body.acceptanceCriteria) ? body.acceptanceCriteria : [];
    task.risks = Array.isArray(body.risks) ? body.risks : [];
    task.testScope = Array.isArray(body.testScope) ? body.testScope : [];
    task.analysisOrigin = 'manual';
    task.analysisRuns ||= [];
    task.analysisRuns.push({ actorLabel: String(body.actorLabel || ''), dshSessionId: '', at: store.now(), origin: 'manual' });
    task.version += 1;
    task.updatedAt = store.now();
    store.touch(c); store.persist(); emitProject(c.id);
    return created(res, { task });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const profile = createExecutionProfile(c, body); store.touch(c); store.persist(); return created(res, { profile }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && parts[4] && parts[5] === 'versions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const profile = c?.executionProfiles?.find((item) => item.id === parts[4]);
    if (!profile) return fail(res, 404, '执行配置不存在');
    if (body.expectedRevision !== (profile.currentVersion || profile.version)) return fail(res, 409, '执行配置版本已变化，请重新加载');
    try { const version = createExecutionProfileVersion(c, profile.id, body); store.touch(c); store.persist(); return created(res, { profile: version }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'execution-profiles' && parts[4] && parts[5] === 'disable' && m('POST')) {
    const c = store.getProject(parts[2]);
    const profile = c?.executionProfiles?.find((item) => item.id === parts[4]);
    if (!profile) return fail(res, 404, '执行配置不存在');
    if (body.expectedRevision !== (profile.currentVersion || profile.version)) return fail(res, 409, '执行配置版本已变化，请重新加载');
    const disabled = disableExecutionProfile(c, profile.id); store.touch(c); store.persist(); return ok(res, { profile: disabled });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'run-preview' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { return ok(res, { preview: createRunPreview(c, parts[4], body.profileId) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'review' && m('POST')) {
    const c = store.getProject(parts[2]);
    const plan = c && getTestPlan(c, parts[4]);
    if (!plan) return fail(res, 404, '测试计划不存在');
    if (body.expectedRevision !== plan.version) return fail(res, 409, '测试计划版本已变化，请重新加载');
    try { const reviewed = reviewTestPlan(c, plan.id, body.actorLabel); store.touch(c); store.persist(); return ok(res, { plan: reviewed }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'versions' && m('POST')) {
    const c = store.getProject(parts[2]);
    const plan = c && getTestPlan(c, parts[4]);
    if (!plan) return fail(res, 404, '测试计划不存在');
    if (body.expectedRevision !== plan.version) return fail(res, 409, '测试计划版本已变化，请重新加载');
    try { const version = createTestPlanVersion(c, plan.id, body); store.touch(c); store.persist(); return created(res, { plan: version }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-plans' && parts[4] && parts[5] === 'runs' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const run = await startRun(c, body.previewToken, { defer: true }); return accepted(res, { run: { id: run.id, status: run.status, mode: run.mode, resultTrust: run.resultTrust } }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'cancel' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const run = cancelRun(c, parts[4]); return ok(res, { run: { id: run.id, status: run.status } }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'evidence' && parts[6] === 'finalize' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const run = c.testruns?.find((item) => item.id === parts[4]);
    if (!run) return fail(res, 404, '测试运行不存在');
    const existing = c.evidenceBundles?.find((item) => item.testRunId === run.id && item.state === 'ready');
    if (!existing && body.expectedRunRevision !== (run.revision || 1)) return fail(res, 409, '测试运行版本已变化，请重新加载');
    try {
      const bundle = await finalizeEvidence(c, parts[4]);
      if (!existing) {
        run.evidenceRefs = [...new Set([...(run.evidenceRefs || []), bundle.id])];
        store.touch(c); store.persist();
        broadcast('quality.evidence.updated', { projectId: c.id, entityId: bundle.id, revision: 1, updatedAt: bundle.updatedAt });
        return created(res, { evidence: publicEvidence(bundle) });
      }
      return ok(res, { evidence: publicEvidence(bundle) });
    } catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && !parts[4] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    return ok(res, { evidence: (c.evidenceBundles || []).map(publicEvidence) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && parts[4] && parts[5] === 'items' && parts[7] === 'download' && m('GET')) {
    const c = store.getProject(parts[2]);
    const bundle = c && resolveEvidence(c, parts[4]);
    if (!bundle) return fail(res, 404, '证据包不存在');
    const itemId = parts[6];
    const item = bundle.items.find((entry) => entry.id === itemId);
    const resolvedPath = item?.relativePath || '';
    if (!item || path.isAbsolute(resolvedPath) || resolvedPath.split(/[\\/]/).includes('..')) return fail(res, 400, '证据文件路径无效');
    if (!(await verifyEvidence(bundle)).ok) return fail(res, 409, '证据完整性校验失败');
    const file = path.join(bundle.root, resolvedPath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, '证据文件不存在');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(item.size), 'Content-Disposition': `attachment; filename="${path.basename(resolvedPath).replace(/[^a-zA-Z0-9._-]/g, '_')}"` });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'evidence' && parts[4] && parts[5] === 'download') return fail(res, 404, '接口不存在');

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'compare' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { return ok(res, { comparison: compareRuns(c, parts[4], body.otherRunId) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'compare' && parts[6] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { return ok(res, { comparison: compareRuns(c, parts[4], parts[6]) }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'test-runs' && parts[4] && parts[5] === 'failure-analysis' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const analysis = saveFailureAnalysis(c, parts[4], body); store.touch(c); store.persist(); return created(res, { analysis }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'failure-analyses' && parts[4] && parts[5] === 'promote-defect' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    const analysis = c.failureAnalyses?.find((item) => item.id === parts[4]);
    if (!analysis) return fail(res, 404, '故障分析不存在');
    if (body.expectedRevision !== analysis.version) return fail(res, 409, '故障分析版本已变化，请重新加载');
    try { const defect = promoteConfirmedDefect(c, parts[4], body); store.touch(c); store.persist(); return created(res, { defect }); }
    catch (error) { return fail(res, /已升级|已创建/.test(error.message) ? 409 : 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'regression-sets' && !parts[4]) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (m('GET')) return ok(res, { regressionSets: c.regressionSets || [] });
    if (m('POST')) {
      try { const set = createRegressionSet(c, body); store.touch(c); store.persist(); return created(res, { regressionSet: set }); }
      catch (error) { return fail(res, 400, error.message); }
    }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'regression-sets' && parts[4] && parts[5] === 'exclude' && m('POST')) {
    const c = store.getProject(parts[2]);
    const set = c?.regressionSets?.find((item) => item.id === parts[4]);
    if (!set) return fail(res, 404, '回归集不存在');
    if (body.expectedRevision !== set.version) return fail(res, 409, '回归集版本已变化，请重新加载');
    try { const updated = excludeRegressionCase(set, body.testCaseId, body); store.touch(c); store.persist(); return ok(res, { regressionSet: updated }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'quality-gate' && !parts[4] && m('GET')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    return ok(res, { gate: evaluateQualityGate(c) });
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'artifact-cleanup' && !parts[4] && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const job = enqueueArtifactCleanup(c, body); store.touch(c); store.persist(); return accepted(res, { job }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && parts[3] === 'artifact-cleanup' && parts[4] && parts[5] === 'run' && m('POST')) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    try { const job = await runArtifactCleanup(c, parts[4]); store.touch(c); store.persist(); return ok(res, { job }); }
    catch (error) { return fail(res, 400, error.message); }
  }

  if (parts[1] === 'projects' && parts[2] && !parts[3]) {
    const c = store.getProject(parts[2]);
    if (!c) return fail(res, 404, '项目不存在');
    if (m('GET')) { ok(res, { project: publicProject(c) }); return true; }
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
    if (body.to === 'closed') {
      const gate = evaluateQualityGate(c);
      if (gate.status === 'blocked') return fail(res, 409, `质量门禁阻断：${gate.blockers.join('、')}`);
    }
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
