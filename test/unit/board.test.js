import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, getReminders, getSchedule, projectCard } from '../../server/board.js';

const project = (overrides = {}) => ({
  id: 'p1', kind: 'project', title: '订单测试', projectKey: 'ORD-1', product: '订单', owner: 'QA', type: 'web',
  members: [], summary: '', status: 'intake', assistant: { enabled: true, reminders: 'all' }, workspacePath: '',
  requirements: [{ id: 'r1' }], testcases: [{ id: 't1', status: 'draft' }, { id: 't2', status: 'passed' }],
  defects: [{ id: 'd1', status: 'open' }, { id: 'd2', status: 'closed' }], milestones: [], reports: [], gates: [], events: [], materials: [], ...overrides,
});

test('projectCard projects material counts and labels', () => {
  const card = projectCard(project());
  assert.equal(card.title, '订单测试');
  assert.equal(card.kindLabel, '测试项目');
  assert.deepEqual(card.counts, { requirements: 1, testcases: 2, testcasesTodo: 1, defects: 2, defectsOpen: 1, milestones: 0, milestoneOverdue: 0, milestoneSoon: 0, reports: 0, pendingGates: 0, events: 0 });
});

test('computeStats aggregates columns and open risks', () => {
  const cards = [projectCard(project()), projectCard(project({ id: 'p2', status: 'closed', gates: [{ id: 'g1', status: 'pending' }] }))];
  assert.deepEqual(computeStats(cards), { totalProjects: 2, activeProjects: 1, byColumn: { intake: 1, design: 0, review: 0, execute: 0, regression: 0, closed: 1 }, overdueMilestones: 0, dueSoonMilestones: 0, pendingGates: 1, openDefects: 2 });
});

test('schedule is sorted by date and reminders prioritize severity', () => {
  const cards = project({ events: [{ id: 'e1', date: '2030-03-10', title: '日程' }], milestones: [{ id: 'm1', dueDate: '2000-01-01', title: '逾期', done: false }, { id: 'm2', dueDate: '2030-03-01', title: '未来', done: false }], gates: [{ id: 'g1', title: '评审', status: 'pending', requestedAt: '2030-02-01T00:00:00Z' }] });
  const fakeStore = { listProjects: () => [cards] };
  const schedule = getSchedule(fakeStore);
  assert.deepEqual(schedule.map((item) => item.date), ['2000-01-01', '2030-03-01', '2030-03-10']);
  const reminders = getReminders(fakeStore);
  assert.equal(reminders[0].severity, 'danger');
  assert.equal(reminders.find((item) => item.type === 'gate').severity, 'review');
});
