const VALID_TESTCASE_STATUSES = new Set(['draft', 'reviewed', 'executed']);

export function summarizeRequirementCoverage(requirement, testcases) {
  const testcaseById = new Map();
  for (const testcase of Array.isArray(testcases) ? testcases : []) {
    if (testcase && typeof testcase.id === 'string' && testcase.id && !testcaseById.has(testcase.id)) {
      testcaseById.set(testcase.id, testcase);
    }
  }

  const casesById = new Map();
  let brokenLinks = 0;
  for (const link of Array.isArray(requirement?.links) ? requirement.links : []) {
    const testcaseId = typeof link?.testcaseId === 'string' ? link.testcaseId : '';
    const testcase = testcaseById.get(testcaseId);
    if (!testcase) {
      brokenLinks += 1;
      continue;
    }

    let entry = casesById.get(testcaseId);
    if (!entry) {
      entry = { testcase, purposes: [] };
      casesById.set(testcaseId, entry);
    }
    const purpose = typeof link.purpose === 'string' ? link.purpose.trim() : '';
    if (purpose) entry.purposes.push(purpose);
  }

  const counts = { valid: 0, draft: 0, reviewed: 0, executed: 0, unknown: 0, brokenLinks };
  for (const { testcase } of casesById.values()) {
    counts.valid += 1;
    const status = testcase.status;
    if (!VALID_TESTCASE_STATUSES.has(status)) {
      counts.unknown += 1;
      continue;
    }
    counts[status] += 1;
  }

  let state = 'reviewed';
  if (counts.brokenLinks || counts.unknown) state = 'needs-check';
  else if (!counts.valid) state = 'uncovered';
  else if (counts.draft) state = 'review-pending';

  return { state, cases: [...casesById.values()], counts };
}
