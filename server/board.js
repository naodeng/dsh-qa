// 看板定义与卡片投影（QA 流水线）
import { buildActionQueue, toLegacyReminders } from './action-queue.js';

export const KANBAN_COLUMNS = [
  { id: 'intake',    title: '需求分析', titleEn: 'Requirements', color: '#64748b', hint: '需求梳理 · 范围确认' },
  { id: 'design',    title: '用例设计', titleEn: 'Test Design',  color: '#3b82f6', hint: '用例编写 · 场景覆盖' },
  { id: 'review',    title: '用例评审', titleEn: 'Case Review',  color: '#8b5cf6', hint: '评审门禁 · 用例定稿' },
  { id: 'execute',   title: '执行中',   titleEn: 'Execution',    color: '#f59e0b', hint: '测试执行 · 缺陷跟踪' },
  { id: 'regression',title: '缺陷回归', titleEn: 'Regression',   color: '#ef4444', hint: '缺陷修复 · 回归验证' },
  { id: 'closed',    title: '已发布',   titleEn: 'Released',     color: '#10b981', hint: '发布 · 归档' },
];

export const TYPE_LABELS = { web: 'Web 应用', app: '移动 App', api: '接口服务', desktop: '桌面端', embedded: '嵌入式', data: '数据平台', other: '其他' };
export const KIND_LABELS = { project: '测试项目', iteration: '迭代' };

export function milestoneState(m) {
  const today = startOfDay(new Date());
  const due = startOfDay(new Date(m.dueDate + 'T00:00:00'));
  const days = Math.round((due - today) / 86400000);
  if (m.done) return { done: true, days };
  return { overdue: days < 0, dueSoon: days >= 0 && days <= 7, days };
}
function startOfDay(d) { d.setHours(0, 0, 0, 0); return d; }

export function projectCard(p) {
  const msStats = p.milestones.map(milestoneState);
  return {
    id: p.id,
    kind: p.kind,
    kindLabel: KIND_LABELS[p.kind] || p.kind,
    parentId: p.parentId,
    title: p.title,
    projectKey: p.projectKey,
    product: p.product,
    owner: p.owner,
    type: p.type,
    typeLabel: TYPE_LABELS[p.type] || p.type,
    members: p.members.map((m) => ({ name: m.name, role: m.role })),
    summary: p.summary,
    status: p.status,
    assistant: p.assistant || { enabled: true, mode: 'full', autoExtract: true, reminders: 'all' },
    workspacePath: p.workspacePath || '',
    counts: {
      requirements: p.requirements.length,
      testcases: p.testcases.length,
      testcasesTodo: p.testcases.filter((t) => t.status === 'draft').length,
      defects: p.defects.length,
      defectsOpen: p.defects.filter((d) => !['closed', 'verified'].includes(d.status)).length,
      milestones: p.milestones.length,
      milestoneOverdue: msStats.filter((s) => s.overdue).length,
      milestoneSoon: msStats.filter((s) => s.dueSoon).length,
      reports: p.reports.length,
      pendingGates: p.gates.filter((g) => g.status === 'pending').length,
      events: p.events.length,
    },
    latestMaterials: p.materials.slice(0, 3),
    aiActive: !!p.aiActive,
    updatedAt: p.updatedAt,
    lastActivityAt: p.lastActivityAt,
  };
}

export function computeStats(cards) {
  return {
    totalProjects: cards.length,
    activeProjects: cards.filter((p) => p.status !== 'closed').length,
    byColumn: Object.fromEntries(KANBAN_COLUMNS.map((k) => [k.id, cards.filter((p) => p.status === k.id).length])),
    overdueMilestones: cards.reduce((n, p) => n + p.counts.milestoneOverdue, 0),
    dueSoonMilestones: cards.reduce((n, p) => n + p.counts.milestoneSoon, 0),
    pendingGates: cards.reduce((n, p) => n + p.counts.pendingGates, 0),
    openDefects: cards.reduce((n, p) => n + p.counts.defectsOpen, 0),
  };
}

export function getSchedule(store) {
  const items = [];
  for (const p of store.listProjects()) {
    for (const event of p.events || []) items.push({
      id: event.id, type: 'event', kind: event.kind || 'other', date: event.date,
      title: event.title, note: event.note || '', projectId: p.id, projectTitle: p.title,
    });
    for (const m of p.milestones || []) items.push({
      id: m.id, type: 'milestone', kind: m.kind || 'other', date: m.dueDate,
      title: m.title, note: m.basis || '', done: !!m.done, projectId: p.id, projectTitle: p.title,
      state: milestoneState(m),
    });
  }
  return items.filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
}

export function getReminders(store) {
  const projects = store.listProjects();
  const now = new Date();
  return toLegacyReminders(buildActionQueue(projects, { now, limit: 50 }).items, { now });
}

export function getBoard(store) {
  const projects = store.listProjects();
  const cards = projects.map(projectCard);
  const now = new Date();
  const actionQueue = buildActionQueue(projects, { now, limit: 50 });
  return {
    columns: KANBAN_COLUMNS,
    projects: cards,
    feed: store.getFeed().slice(0, 100),
    stats: computeStats(cards),
    schedule: getSchedule(store),
    reminders: toLegacyReminders(actionQueue.items, { now }),
  };
}
