// AI 工具定义与执行器：DeepSeek 函数调用 → 质量工作台域操作 → 实时上板
import crypto from 'node:crypto';
import * as store from './store.js';
import { broadcast } from './sse.js';
import { projectCard, computeStats, KANBAN_COLUMNS } from './board.js';

export const TOOL_CN = {
  project_get: '读取项目信息',
  project_update: '更新项目信息',
  member_add: '登记项目成员',
  requirement_add: '登记需求/范围',
  testcase_add: '登记测试用例',
  testcase_status: '更新用例状态',
  testcase_link: '关联需求与用例',
  defect_add: '登记缺陷',
  defect_status: '更新缺陷状态',
  milestone_add: '登记里程碑',
  event_add: '登记日程',
  knowledge_save: '沉淀测试知识',
  minutes_save: '保存会话纪要',
  report_draft: '起草测试报告',
  report_draft_save: '保存报告草稿',
  project_transition: '推进项目阶段',
  gate_request: '提交门禁',
  testrun_import: '导入测试结果',
};

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

const REPORT_TYPES = {
  'test-plan': '测试计划', 'test-report': '测试报告', 'defect-report': '缺陷报告',
  'release-note': '发布说明', summary: '测试总结',
};
const REPORT_TYPE_IDS = Object.keys(REPORT_TYPES);

export const TOOL_DEFS = [
  { type: 'function', function: { name: 'project_get', description: '读取当前测试项目最新完整信息（成员/需求/用例/缺陷/里程碑/报告/门禁等）', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'project_update', description: '更新测试项目基本信息：标题/项目编号/所属产品/负责人/摘要', parameters: { type: 'object', properties: {
      title: { type: 'string', description: '项目标题' }, projectKey: { type: 'string', description: '项目编号，如 PRJ-2026-001' },
      product: { type: 'string', description: '所属产品/被测系统' }, owner: { type: 'string', description: '测试负责人' },
      summary: { type: 'string', description: '项目摘要/测试范围' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'member_add', description: '登记项目成员', parameters: { type: 'object', required: ['name', 'role'], properties: {
      name: { type: 'string' }, role: { type: 'string', enum: ['owner', 'qa', 'dev', 'pm', 'other'], description: '负责人/测试/开发/产品/其他' },
      contact: { type: 'string' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'requirement_add', description: '登记需求/测试范围（功能需求、非功能需求、风险点）。对话中出现的需求必须登记', parameters: { type: 'object', required: ['title', 'statement'], properties: {
      title: { type: 'string' }, kind: { type: 'string', enum: ['functional', 'nonfunctional', 'risk', 'issue'], description: '功能需求/非功能需求/风险点/问题' },
      statement: { type: 'string', description: '需求描述' }, acceptance: { type: 'string', description: '验收标准' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'testcase_add', description: '登记测试用例（需求/对话中出现的可测场景必须生成用例）', parameters: { type: 'object', required: ['title'], properties: {
      title: { type: 'string', description: '用例标题' },
      kind: { type: 'string', enum: ['functional', 'boundary', 'interface', 'ui', 'performance', 'security', 'compat', 'other'], description: '功能/边界/接口/界面/性能/安全/兼容/其他' },
      priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: '优先级，默认 P2' },
      preconditions: { type: 'string', description: '前置条件' },
      steps: { type: 'string', description: '测试步骤，用换行分隔' },
      expected: { type: 'string', description: '预期结果' },
      status: { type: 'string', enum: ['draft', 'reviewed', 'executed'], description: '草稿/已评审/已执行，默认 draft' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'testcase_status', description: '更新用例状态：draft 草稿 / reviewed 已评审 / executed 已执行', parameters: { type: 'object', required: ['testcaseId', 'status'], properties: {
      testcaseId: { type: 'string' }, status: { type: 'string', enum: ['draft', 'reviewed', 'executed'] } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'testcase_link', description: '把测试用例关联到需求并写明覆盖的验证点', parameters: { type: 'object', required: ['requirementId', 'testcaseId', 'purpose'], properties: {
      requirementId: { type: 'string' }, testcaseId: { type: 'string' }, purpose: { type: 'string', description: '覆盖/验证目的' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'defect_add', description: '登记缺陷（发现的不符合预期的行为必须登记）', parameters: { type: 'object', required: ['title'], properties: {
      title: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'major', 'minor', 'trivial'], description: '致命/严重/一般/轻微，默认 major' },
      environment: { type: 'string', description: '环境/版本' },
      steps: { type: 'string', description: '复现步骤' },
      expected: { type: 'string', description: '预期结果' }, actual: { type: 'string', description: '实际结果' },
      module: { type: 'string', description: '所属模块' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'defect_status', description: '更新缺陷状态：open 待处理 / fixing 修复中 / verify 待验证 / closed 已关闭', parameters: { type: 'object', required: ['defectId', 'status'], properties: {
      defectId: { type: 'string' }, status: { type: 'string', enum: ['open', 'fixing', 'verify', 'closed'] } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'milestone_add', description: '登记里程碑/截止日（发布日/评审日/冻结日等）。给 days 从 startDate 次日算起，或直接给 dueDate', parameters: { type: 'object', required: ['title'], properties: {
      title: { type: 'string' }, kind: { type: 'string', enum: ['release', 'review', 'freeze', 'other'], description: '发布/评审/冻结/其他' },
      startDate: { type: 'string', description: '起算日 YYYY-MM-DD，当天不算' }, days: { type: 'integer', description: '天数' },
      businessDays: { type: 'boolean', description: '是否仅工作日（默认自然日）' }, dueDate: { type: 'string', description: '截止日 YYYY-MM-DD' },
      basis: { type: 'string', description: '依据，如 发布排期' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'event_add', description: '登记日程（会议/发布/评审）', parameters: { type: 'object', required: ['title', 'date'], properties: {
      title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, kind: { type: 'string', enum: ['meeting', 'release', 'review', 'other'] }, note: { type: 'string' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'knowledge_save', description: '沉淀测试知识/经验（历史缺陷模式、测试技巧、规范结论等）', parameters: { type: 'object', required: ['title', 'source', 'summary'], properties: {
      title: { type: 'string' }, source: { type: 'string' }, summary: { type: 'string' }, links: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'minutes_save', description: '把讨论结论整理为会话纪要存档', parameters: { type: 'object', required: ['title', 'content'], properties: {
      title: { type: 'string' }, content: { type: 'string', description: 'Markdown 纪要正文' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'report_draft', description: '起草测试报告：创建报告记录，随后在回复中写出全文并调用 report_draft_save 保存', parameters: { type: 'object', required: ['docType'], properties: {
      docType: { type: 'string', enum: REPORT_TYPE_IDS }, title: { type: 'string' }, instructions: { type: 'string', description: '起草要点' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'report_draft_save', description: '把写好的报告正文保存为草稿版本（每次保存追加不可变版本）', parameters: { type: 'object', required: ['docId', 'content'], properties: {
      docId: { type: 'string' }, content: { type: 'string', description: '报告全文' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'project_transition', description: '推进项目在看板上的阶段（只能推进到非终局列，发布必须由负责人人工操作）', parameters: { type: 'object', required: ['to'], properties: {
      to: { type: 'string', enum: ['intake', 'design', 'review', 'execute', 'regression'], description: '目标列：需求分析/用例设计/用例评审/执行中/缺陷回归' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'gate_request', description: '提交门禁申请（用例评审/发布/结项），由测试负责人在界面人工审批，AI 不能自行通过', parameters: { type: 'object', required: ['type', 'title'], properties: {
      type: { type: 'string', enum: ['testcase-review', 'release', 'closure'] }, title: { type: 'string' }, summary: { type: 'string' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'testrun_import', description: '导入自动化测试结果（Playwright / Pytest 等），把执行汇总登记到项目', parameters: { type: 'object', required: ['framework', 'summary'], properties: {
      framework: { type: 'string', description: '框架名，如 Playwright / Pytest' },
      summary: { type: 'string', description: '执行汇总，如 通过 42 / 失败 3 / 跳过 2，总耗时 4m12s' },
      detail: { type: 'string', description: '可选的失败详情/附件路径' } }, additionalProperties: false } } },
];

// ---------- 事件发射 ----------
function afterChange(projectId, feedEntry) {
  if (feedEntry) store.addFeed({ projectId, projectTitle: store.getProject(projectId)?.title || '', ...feedEntry });
  const cards = store.listProjects().map(projectCard);
  broadcast('project.updated', { project: projectCard(store.getProject(projectId)) });
  broadcast('stats', computeStats(cards));
}

// ---------- 工具执行 ----------
export async function executeTool(projectId, name, args = {}) {
  const p = store.getProject(projectId);
  if (!p) return { ok: false, error: '项目不存在' };
  switch (name) {
    case 'project_get':
      return { ok: true, project: p };

    case 'project_update': {
      const patch = {};
      for (const k of ['title', 'projectKey', 'product', 'owner', 'summary']) if (args[k] != null) patch[k] = str(args[k]);
      const updated = store.updateProject(projectId, patch);
      afterChange(projectId, { type: 'case', label: `AI 更新项目信息` });
      return { ok: true, project: projectCard(updated) };
    }

    case 'member_add': {
      const name_ = str(args.name).trim();
      if (!name_) return { ok: false, error: '缺少成员姓名' };
      const m = { id: store.uid('member'), name: name_, role: args.role || 'other', contact: str(args.contact) };
      p.members.push(m);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'party', label: `AI 登记成员：${m.name}` });
      return { ok: true, member: m };
    }

    case 'requirement_add': {
      const title_ = str(args.title).trim();
      if (!title_) return { ok: false, error: '缺少需求标题' };
      const r = { id: store.uid('req'), title: title_, kind: args.kind || 'functional', statement: str(args.statement), acceptance: str(args.acceptance), links: [], at: store.now() };
      p.requirements.push(r);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'claim', label: `AI 登记需求：${r.title}` });
      return { ok: true, requirement: r };
    }

    case 'testcase_add': {
      const title_ = str(args.title).trim();
      if (!title_) return { ok: false, error: '缺少用例标题' };
      const t = { id: store.uid('tc'), title: title_, kind: args.kind || 'functional', priority: args.priority || 'P2', preconditions: str(args.preconditions), steps: str(args.steps), expected: str(args.expected), status: args.status || 'draft', at: store.now() };
      p.testcases.push(t);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'evidence', label: `AI 登记用例：${t.title}（${t.priority}）` });
      return { ok: true, testcase: t };
    }

    case 'testcase_status': {
      const t = p.testcases.find((x) => x.id === args.testcaseId);
      if (!t) return { ok: false, error: '用例不存在' };
      t.status = args.status; t.at = store.now();
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'evidence', label: `用例「${t.title}」→ ${TC_STATUS_CN[t.status]}` });
      return { ok: true, testcase: t };
    }

    case 'testcase_link': {
      const r = p.requirements.find((x) => x.id === args.requirementId);
      const t = p.testcases.find((x) => x.id === args.testcaseId);
      if (!r || !t) return { ok: false, error: '需求或用例不存在' };
      r.links.push({ testcaseId: t.id, purpose: str(args.purpose), at: store.now() });
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'claim', label: `AI 关联用例「${t.title}」→ 需求「${r.title}」` });
      return { ok: true, links: r.links.length };
    }

    case 'defect_add': {
      const title_ = str(args.title).trim();
      if (!title_) return { ok: false, error: '缺少缺陷标题' };
      const d = { id: store.uid('bug'), title: title_, severity: args.severity || 'major', environment: str(args.environment), steps: str(args.steps), expected: str(args.expected), actual: str(args.actual), module: str(args.module), status: 'open', at: store.now() };
      p.defects.push(d);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'defect', label: `AI 登记缺陷：${d.title}（${SEVERITY_CN[d.severity]}）` });
      return { ok: true, defect: d };
    }

    case 'defect_status': {
      const d = p.defects.find((x) => x.id === args.defectId);
      if (!d) return { ok: false, error: '缺陷不存在' };
      d.status = args.status; d.at = store.now();
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'defect', label: `缺陷「${d.title}」→ ${DEFECT_STATUS_CN[d.status]}` });
      return { ok: true, defect: d };
    }

    case 'milestone_add': {
      const title_ = str(args.title).trim();
      if (!title_) return { ok: false, error: '缺少里程碑名称' };
      const dueDate = args.dueDate
        ? str(args.dueDate)
        : args.days != null
          ? (args.businessDays ? addBusinessDays(str(args.startDate || todayStr()), num(args.days)) : addDays(str(args.startDate || todayStr()), num(args.days)))
          : null;
      if (!dueDate) return { ok: false, error: '请提供 dueDate 或 (startDate + days)' };
      const m = { id: store.uid('ms'), title: title_, kind: args.kind || 'other', startDate: str(args.startDate) || null, days: args.days != null ? num(args.days) : null, businessDays: !!args.businessDays, dueDate, basis: str(args.basis), done: false, at: store.now() };
      p.milestones.push(m);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'deadline', label: `AI 登记里程碑：${m.title}（截止 ${m.dueDate}）` });
      return { ok: true, milestone: m };
    }

    case 'event_add': {
      const ev = { id: store.uid('evt'), title: str(args.title), date: str(args.date), kind: args.kind || 'other', note: str(args.note), at: store.now() };
      p.events.push(ev);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'event', label: `AI 登记日程：${ev.title}（${ev.date}）` });
      return { ok: true, event: ev };
    }

    case 'knowledge_save': {
      const kn = { id: store.uid('kn'), title: str(args.title), source: str(args.source), summary: str(args.summary), links: Array.isArray(args.links) ? args.links.map(str) : [], at: store.now() };
      p.knowledge.push(kn);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'research', label: `AI 沉淀测试知识：${kn.title}` });
      return { ok: true, note: kn };
    }

    case 'minutes_save': {
      const mn = { id: store.uid('min'), title: str(args.title), content: str(args.content), at: store.now() };
      p.minutes.push(mn);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'minute', label: `AI 保存会话纪要：${mn.title}` });
      return { ok: true, minute: mn };
    }

    case 'report_draft': {
      const type_ = REPORT_TYPE_IDS.includes(args.docType) ? args.docType : 'test-report';
      const doc = { id: store.uid('doc'), docType: type_, title: str(args.title) || REPORT_TYPES[type_], instructions: str(args.instructions), status: 'draft', versions: [], at: store.now() };
      p.reports.push(doc);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'doc', label: `AI 起草报告：${doc.title}` });
      return { ok: true, docId: doc.id, docType: type_, title: doc.title, 提示: '请在回复中起草全文，然后用 report_draft_save(docId, content) 保存草稿版本' };
    }

    case 'report_draft_save': {
      const doc = p.reports.find((x) => x.id === args.docId);
      if (!doc) return { ok: false, error: '报告不存在，请先 report_draft 创建' };
      const content = str(args.content);
      if (!content.trim()) return { ok: false, error: '内容为空' };
      const v = { v: doc.versions.length + 1, content, at: store.now(), hash: crypto.createHash('sha1').update(content).digest('hex').slice(0, 8) };
      doc.versions.push(v);
      doc.status = 'draft';
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'doc', label: `报告「${doc.title}」草稿 v${v.v} 已保存` });
      return { ok: true, docId: doc.id, version: v.v, chars: content.length };
    }

    case 'project_transition': {
      const to = str(args.to);
      if (!KANBAN_COLUMNS.some((k) => k.id === to)) return { ok: false, error: `无效目标列: ${to}` };
      if (to === 'closed') return { ok: false, error: '发布必须由测试负责人在界面人工操作' };
      const moved = store.transitionProject(p, to, 'ai');
      if (!moved) return { ok: false, error: '已经在目标列' };
      afterChange(projectId, { type: 'transition', label: `AI 推进阶段：${colTitle(p.history[p.history.length - 1].from)} → ${colTitle(to)}` });
      return { ok: true, status: to };
    }

    case 'gate_request': {
      const g = { id: store.uid('gate'), type: str(args.type), title: str(args.title), summary: str(args.summary), status: 'pending', requestedAt: store.now(), decidedAt: null, decision: null };
      p.gates.push(g);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'gate', label: `AI 提交门禁待审批：${g.title}` });
      broadcast('gate.updated', { projectId });
      return { ok: true, gate: g, 提示: '门禁须由测试负责人在界面人工审批' };
    }

    case 'testrun_import': {
      const tr = { id: store.uid('run'), framework: str(args.framework), summary: str(args.summary), detail: str(args.detail), at: store.now() };
      p.materials.unshift({ id: tr.id, ts: tr.at, type: 'run', label: `导入 ${tr.framework} 测试结果：${tr.summary}` });
      p.materials = p.materials.slice(0, 6);
      store.touch(p); store.persist();
      afterChange(projectId, { type: 'run', label: `AI 导入 ${tr.framework} 测试结果：${tr.summary}` });
      return { ok: true, run: tr };
    }

    default:
      return { ok: false, error: `未知工具: ${name}` };
  }
}

const TC_STATUS_CN = { draft: '草稿', reviewed: '已评审', executed: '已执行' };
const SEVERITY_CN = { critical: '致命', major: '严重', minor: '一般', trivial: '轻微' };
const DEFECT_STATUS_CN = { open: '待处理', fixing: '修复中', verify: '待验证', closed: '已关闭' };
function colTitle(id) { return KANBAN_COLUMNS.find((k) => k.id === id)?.title || id; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
function addBusinessDays(d, n) {
  let x = new Date(d + 'T00:00:00');
  let added = 0;
  while (added < n) { x.setDate(x.getDate() + 1); const dow = x.getDay(); if (dow !== 0 && dow !== 6) added++; }
  return x.toISOString().slice(0, 10);
}
