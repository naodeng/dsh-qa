import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRequirementCoverage } from '../../public/project-detail-model.js';

test('reports uncovered requirements and dangling links', () => {
  assert.deepEqual(summarizeRequirementCoverage({ links: [] }, []), {
    state: 'uncovered',
    cases: [],
    counts: { valid: 0, draft: 0, reviewed: 0, executed: 0, unknown: 0, brokenLinks: 0 },
  });

  assert.deepEqual(summarizeRequirementCoverage({ links: [{ testcaseId: 'missing', purpose: '验收异常分支' }] }, []), {
    state: 'needs-check',
    cases: [],
    counts: { valid: 0, draft: 0, reviewed: 0, executed: 0, unknown: 0, brokenLinks: 1 },
  });
});

test('deduplicates testcase IDs and keeps all purposes', () => {
  const testcase = { id: 'tc-1', title: '下单成功', status: 'reviewed' };
  assert.deepEqual(summarizeRequirementCoverage({ links: [
    { testcaseId: 'tc-1', purpose: '验证正常下单' },
    { testcaseId: 'tc-1', purpose: '验证订单号唯一' },
    { testcaseId: 'tc-1', purpose: '' },
  ] }, [testcase]), {
    state: 'reviewed',
    cases: [{ testcase, purposes: ['验证正常下单', '验证订单号唯一'] }],
    counts: { valid: 1, draft: 0, reviewed: 1, executed: 0, unknown: 0, brokenLinks: 0 },
  });
});

test('needs-check takes precedence over draft and reviewed cases', () => {
  const draft = { id: 'tc-draft', status: 'draft' };
  const reviewed = { id: 'tc-reviewed', status: 'reviewed' };
  const unknown = { id: 'tc-unknown', status: 'blocked' };
  const missingStatus = { id: 'tc-no-status' };

  assert.deepEqual(summarizeRequirementCoverage({ links: [
    { testcaseId: draft.id, purpose: '草稿用例' },
    { testcaseId: reviewed.id, purpose: '已评审用例' },
    { testcaseId: unknown.id, purpose: '未知状态用例' },
    { testcaseId: missingStatus.id, purpose: '缺少状态用例' },
    { testcaseId: 'gone', purpose: '已删除用例' },
  ] }, [draft, reviewed, unknown, missingStatus]), {
    state: 'needs-check',
    cases: [
      { testcase: draft, purposes: ['草稿用例'] },
      { testcase: reviewed, purposes: ['已评审用例'] },
      { testcase: unknown, purposes: ['未知状态用例'] },
      { testcase: missingStatus, purposes: ['缺少状态用例'] },
    ],
    counts: { valid: 4, draft: 1, reviewed: 1, executed: 0, unknown: 2, brokenLinks: 1 },
  });
});

test('counts a linked testcase with an unknown status as valid and unknown', () => {
  const unknown = { id: 'tc-unknown', status: 'blocked' };
  assert.deepEqual(summarizeRequirementCoverage({ links: [{ testcaseId: unknown.id, purpose: '状态需核对' }] }, [unknown]), {
    state: 'needs-check',
    cases: [{ testcase: unknown, purposes: ['状态需核对'] }],
    counts: { valid: 1, draft: 0, reviewed: 0, executed: 0, unknown: 1, brokenLinks: 0 },
  });
});

test('reports review-pending or reviewed for valid statuses', () => {
  const draft = { id: 'tc-draft', status: 'draft' };
  const reviewed = { id: 'tc-reviewed', status: 'reviewed' };
  const executed = { id: 'tc-executed', status: 'executed' };
  const links = [draft, reviewed, executed].map(({ id }) => ({ testcaseId: id, purpose: `覆盖 ${id}` }));

  assert.deepEqual(summarizeRequirementCoverage({ links }, [draft, reviewed, executed]), {
    state: 'review-pending',
    cases: [
      { testcase: draft, purposes: ['覆盖 tc-draft'] },
      { testcase: reviewed, purposes: ['覆盖 tc-reviewed'] },
      { testcase: executed, purposes: ['覆盖 tc-executed'] },
    ],
    counts: { valid: 3, draft: 1, reviewed: 1, executed: 1, unknown: 0, brokenLinks: 0 },
  });

  const reviewedLinks = [reviewed, executed].map(({ id }) => ({ testcaseId: id, purpose: `覆盖 ${id}` }));
  assert.deepEqual(summarizeRequirementCoverage({ links: reviewedLinks }, [reviewed, executed]), {
    state: 'reviewed',
    cases: [
      { testcase: reviewed, purposes: ['覆盖 tc-reviewed'] },
      { testcase: executed, purposes: ['覆盖 tc-executed'] },
    ],
    counts: { valid: 2, draft: 0, reviewed: 1, executed: 1, unknown: 0, brokenLinks: 0 },
  });
});
