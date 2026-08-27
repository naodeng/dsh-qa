let sequence = 0;

const id = (prefix) => `${prefix}_fixture_${++sequence}`;

export const makeProject = (overrides = {}) => ({
  id: id('prj'),
  title: 'Fixture project',
  workspacePath: '',
  requirements: [],
  testcases: [],
  qualityTasks: [],
  qualityAudit: [],
  testPlans: [],
  testruns: [],
  executionProfiles: [],
  evidenceBundles: [],
  regressionSets: [],
  gates: [],
  defects: [],
  materials: [],
  ...overrides,
});

export const makeQualityTask = (overrides = {}) => ({
  id: id('qt'),
  projectId: '',
  version: 1,
  stage: 'intake',
  sources: [],
  acceptanceCriteria: [],
  risks: [],
  testScope: [],
  decisions: [],
  ...overrides,
});

export const makeTestCase = (overrides = {}) => ({ id: id('tc'), title: 'Fixture case', planIds: [], ...overrides });
export const makeTestRun = (overrides = {}) => ({ id: id('run'), projectId: '', mode: 'local', status: 'queued', resultTrust: 'controlled-local', provenance: {}, ...overrides });
export const makeEvidenceBundle = (overrides = {}) => ({ id: id('ev'), testRunId: '', provenance: {}, items: [], ...overrides });
export const makeGate = (overrides = {}) => ({ id: id('gate'), kind: 'computed', checks: [], exceptions: [], ...overrides });
