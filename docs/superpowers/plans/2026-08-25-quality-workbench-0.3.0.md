# DSH QA Workbench 0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建统一 `project.testruns`，复用现有测试用例，交付受控的 Node/Playwright 本地执行与完整运行历史。

**Architecture:** TestPlan 只引用现有 testcase IDs。当前 `testrun_import` 只写 materials；本版本创建 `project.testruns`，未来 imported/local 运行统一写入该集合，历史 materials 原样保留。执行只能使用项目保存的 execution profile。

**Tech Stack:** Node.js ESM、`node:child_process`、Node test、Playwright、SSE、原生前端。

**Spec:** `docs/quality-workbench/2026-08-25-technical-design.md`

## Global Constraints

- 不创建第二套 TestCase；`project.testruns` 是新集合，不伪造历史运行详情。
- 不接受任意 command、cwd 或环境变量；profile 修改创建新版本。
- `imported-summary` 固定为 `status=unknown`，不能成为 PASS 证据。
- 每项目最多一个 running，全局最多两个；日志上限 1 MiB。
- 单元测试统一从 `test/helpers/quality-fixtures.js` 导入夹具；API 测试沿用现有 `base` 和原生 `fetch`，E2E 使用 Playwright 的 `test/page` fixture。

### Task 1: TestRun 存储和导入兼容

**Files:** Create `server/quality/test-run.js`, `test/unit/test-run.test.js`; Modify `server/store.js`, `server/tools.js`, `server/migrations.js`, `test/unit/migrations.test.js`。

**Interfaces:** Produces `createTestRun(project, fields) -> TestRun`, `normalizeTestRun(run) -> TestRun`, `normalizeTestRunProject(project) -> Project`；`testrun_import` 写 `mode: 'imported'`。

- [x] **Step 1: Write the failing tests**

```js
const legacy = makeProject();
delete legacy.testruns;
assert.deepEqual(normalizeTestRunProject(legacy).testruns, []);
const project = makeProject();
const run = createTestRun(project, { mode: 'imported', executor: 'playwright', summary: '2 passed' });
assert.equal(run.mode, 'imported');
assert.equal(run.status, 'unknown');
assert.equal(run.resultTrust, 'imported-summary');
assert.equal(project.testruns[0].id, run.id);
assert.equal(project.materials[0].type, 'run');
```

- [x] **Step 2: Verify failure** — Run `node --test test/unit/test-run.test.js`; Expected: FAIL with module-not-found or missing `testruns`.
- [x] **Step 3: Implement** — Append the `0.3.0` step to `server/migrations.js` for `testPlans/testruns/executionProfiles` and testcase association defaults; implement enum validation and modify `testrun_import` to create the TestRun before adding its compatibility material entry. Extend migration tests with pre-0.3 restart and idempotence fixtures.
- [x] **Step 4: Verify pass** — Run `node --test test/unit/test-run.test.js`; Expected: all tests PASS.
- [x] **Step 5: Commit** — Stage only the four task files and commit `feat: add persistent test run records`.

### Task 2: TestPlan references existing cases

**Files:** Create `server/quality/test-plan.js`, `test/unit/test-plan.test.js`; Modify `server/store.js`。

**Interfaces:** Consumes `project.testcases`, `project.qualityTasks`; Produces `createPlannedTestCase(project, qualityTaskId, fields)`, `createTestPlan(project, qualityTaskId, testcaseIds)`, `reviewTestPlan(project, planId, actorLabel)`, `createTestPlanVersion(project, planId, fields)` and `getTestPlan(project, id)`.

- [x] **Step 1: Write the failing tests**

```js
const project = makeProject();
const task = makeQualityTask({ projectId: project.id });
task.risks.push({ id: 'risk_1', severity: 'high', assessmentStatus: 'confirmed', dispositionStatus: 'open' });
const testcase = makeTestCase();
project.qualityTasks.push(task);
project.testcases.push(testcase);
const generated = createPlannedTestCase(project, task.id, { title: '支付失败重试', sourceRiskIds: ['risk_1'], automationRef: 'candidate' });
assert.equal(project.testcases.at(-1).id, generated.id);
assert.throws(() => createTestPlan(project, 'missing', []), /质量任务不存在/);
assert.throws(() => createTestPlan(project, task.id, ['foreign-case']), /用例不存在/);
const plan = createTestPlan(project, task.id, [testcase.id]);
assert.deepEqual(plan.testcaseIds, [testcase.id]);
assert.equal(plan.status, 'draft');
assert.throws(() => reviewTestPlan(project, plan.id, ''), /确认人/);
assert.equal(reviewTestPlan(project, plan.id, '张测试').status, 'reviewed');
const next = createTestPlanVersion(project, plan.id, { testcaseIds: [testcase.id, generated.id] });
assert.equal(plan.status, 'superseded');
assert.equal(next.status, 'draft');
```

- [x] **Step 2: Verify failure** — Run `node --test test/unit/test-plan.test.js`; Expected: FAIL because module is missing.
- [x] **Step 3: Implement** — Add `testPlans ||= []`; extract/reuse the existing testcase creation primitive for generated cases; validate task/risk/case ownership; append `qualityTaskId/sourceRiskIds/automationRef/planIds` to the same `project.testcases` records; require an actor label for review; create a new draft TestPlan version and supersede the old version when scope or cases change.
- [x] **Step 4: Verify pass** — Run the same command; Expected: PASS.
- [x] **Step 5: Commit** — Commit `feat: link quality tasks to test plans` with only task files staged.

### Task 3: Execution profile validation

**Files:** Create `server/quality/execution-profile.js`, `test/unit/execution-profile.test.js`。

**Interfaces:** Produces `createExecutionProfile(project, fields)`, `createExecutionProfileVersion(project, id, fields)`, `disableExecutionProfile(project, id)`, `resolveExecutionCommand(project, profileVersion, testcaseIds)`.

- [x] **Step 1: Write the failing tests**

```js
const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'));
const project = makeProject({ workspacePath: workspaceDir });
assert.throws(() => createExecutionProfile(project, { executor: 'shell', cwdRelative: '.' }), /executor/);
assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '../outside' }), /工作区/);
assert.throws(() => createExecutionProfile(project, { executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/*.test.js'] }), /精确文件/);
const v1 = createExecutionProfile(project, { name: 'unit', executor: 'node-test', cwdRelative: '.', targetFiles: ['test/unit/store.test.js'], networkIntent: 'none' });
const v2 = createExecutionProfileVersion(project, v1.id, { timeoutMs: 120000 });
assert.equal(v2.version, 2);
assert.equal(v1.version, 1);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/execution-profile.test.js`; Expected: FAIL because exports are missing.
- [x] **Step 3: Implement** workspace containment, executor enum, exact target-file validation, network-intent declaration, immutable versions, disable behavior, timeout `1_000..1_800_000`, and server-generated command arrays. Resolve only the workspace-local Playwright binary; never call `npx` or download dependencies.

最低实现结构：profile 记录保存不可变 `versions[]`；`createExecutionProfileVersion` 复制上一版本后只接受白名单字段；`resolveExecutionCommand` 仅从 executor 和已验证 target 生成 argv 数组。

```js
export function resolveExecutionCommand(project, profileVersion, testcaseIds) {
  const targets = resolveOwnedTargets(project, profileVersion, testcaseIds);
  if (profileVersion.executor === 'node-test') return [process.execPath, '--test', ...targets];
  if (profileVersion.executor === 'playwright') return [resolveWorkspacePlaywright(project), 'test', ...targets];
  throw qualityError('QUALITY_EXECUTOR_UNSUPPORTED', '不支持的执行器');
}
```
- [x] **Step 4: Verify pass** — Run the same command; Expected: PASS with six scenarios.
- [x] **Step 5: Commit** — Commit `feat: validate test execution profiles`.

### Task 4: Test runner lifecycle

**Files:** Create `server/quality/test-runner.js`, `test/unit/test-runner.test.js`, `test/fixtures/runner/pass.fixture.mjs`, `test/fixtures/runner/fail.fixture.mjs`, `test/fixtures/runner/large-output.fixture.mjs`。

**Interfaces:** Consumes Task 1 TestRun and Task 3 resolved command; Produces `createRunPreview(project, planId, profileId)`, `startRun(project, previewToken)`, `cancelRun(project, runId)`, `recoverInterruptedRuns(projects)`, `prepareArtifactStaging(projectId, runId)`.

- [x] **Step 1: Write the failing tests**

```js
const project = makeProject();
const passCase = makeTestCase({ target: 'test/fixtures/runner/pass.fixture.mjs' });
const failCase = makeTestCase({ target: 'test/fixtures/runner/fail.fixture.mjs' });
project.testcases.push(passCase, failCase);
const passProfile = createExecutionProfile(project, { name: 'pass', executor: 'node-test', cwdRelative: '.', targetFiles: [passCase.target], networkIntent: 'none' });
const failProfile = createExecutionProfile(project, { name: 'fail', executor: 'node-test', cwdRelative: '.', targetFiles: [failCase.target], networkIntent: 'none' });
const passPlan = { id: 'plan_pass', version: 1, testcaseIds: [passCase.id] };
const failPlan = { id: 'plan_fail', version: 1, testcaseIds: [failCase.id] };
project.testPlans.push(passPlan, failPlan);
const passPreview = createRunPreview(project, passPlan.id, passProfile.id);
assert.deepEqual(passPreview.effects, { declaredWrites: ['artifact-root'], networkIntent: 'none', filesystemEnforced: false, networkEnforced: false });
const passed = await startRun(project, passPreview.previewToken);
const failed = await startRun(project, createRunPreview(project, failPlan.id, failProfile.id).previewToken);
assert.equal(passed.status, 'passed');
assert.equal(failed.status, 'failed');
assert.match(passed.artifactDir, new RegExp(`${project.id}.+${passed.id}.+\\.staging`));
assert.equal(fs.existsSync(path.join(passed.artifactDir, 'process.log')), true);
await assert.rejects(() => startRun(project, passPreview.previewToken), /预览已失效/);
const projectWithRunning = makeProject({ testruns: [makeTestRun({ status: 'running' })] });
assert.equal(recoverInterruptedRuns([projectWithRunning])[0].status, 'environment-error');
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/test-runner.test.js`; Expected: FAIL because runner is missing.
- [x] **Step 3: Implement** artifact staging creation, `process.log`, Node TAP output, Playwright output/report paths, process-group launch, bounded stdout/stderr, persisted provenance/transitions, timeout/cancellation cleanup, and startup conversion of queued/running to environment-error.

最低实现结构：先持久化 queued TestRun，再建立受控 staging，最后启动进程；任何启动错误都写入终态，不能遗留 running。

```js
export async function startRun(project, previewToken) {
  assertRunCapacity(project);
  const preview = consumeFreshRunPreview(project, previewToken);
  const run = createQueuedRun(project, preview);
  run.artifactDir = await prepareArtifactStaging(project.id, run.id);
  persist();
  return executeAndFinalize(project, run);
}
```
- [x] **Step 4: Verify pass** — Run the same command; Expected: all lifecycle tests PASS and no child process remains.
- [x] **Step 5: Commit** — Commit `feat: execute controlled local test runs`.

### Task 5: API, SSE and bilingual UI

**Files:** Modify `server/routes.js`, `server/sse.js`, `public/index.html`, `public/app.js`, `public/style.css`, `public/i18n.js`, `test/unit/http-api.test.js`; Create `test/e2e/test-execution.spec.js`。

**Interfaces:** Produces execution-profile CRUD/version/disable API, planned-testcase/test-plan review/version/runs/cancel API and `quality.test-run.updated`.

- [x] **Step 1: Write the failing API tests**

```js
const profileResponse = await fetch(`${base}/api/projects/${projectId}/execution-profiles`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validProfile),
});
assert.equal(profileResponse.status, 201);
const previewResponse = await fetch(`${base}/api/projects/${projectId}/test-plans/${planId}/run-preview`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId }),
});
assert.equal(previewResponse.status, 200);
const { preview } = await previewResponse.json();
const runResponse = await fetch(`${base}/api/projects/${projectId}/test-plans/${planId}/runs`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewToken: preview.previewToken }),
});
assert.equal(runResponse.status, 202);
```
- [x] **Step 2: Verify API failure** — Run `node --test test/unit/http-api.test.js`; Expected: new routes return 404.
- [x] **Step 3: Implement API and SSE** using existing `ok()` for 200, `created()` for 201 and `accepted()` for 202, retaining `{ ok, error, code? }` responses. Plan review/version, profile version/disable and run cancel require the target entity's `expectedRevision`; stale values return 409 without mutation or SSE. TestRun serialization must omit internal `artifactDir`, raw preview-token records and absolute `QA_DATA_DIR` paths.
- [x] **Step 4: Verify API pass** — Re-run the API suite; Expected: old and new tests PASS.
- [x] **Step 5: Write the failing E2E**

```js
await page.getByRole('button', { name: '新建执行配置' }).click();
await page.getByLabel('执行器').selectOption('node-test');
await page.getByRole('button', { name: '保存配置' }).click();
await expect(page.getByText('unit · v1')).toBeVisible();
await page.getByRole('button', { name: '确认计划版本' }).click();
await expect(page.getByText('计划 v1 · 已确认')).toBeVisible();
await page.getByRole('button', { name: '预览并执行' }).click();
await expect(page.getByText('网络意图：不需要')).toBeVisible();
await expect(page.getByText('未启用操作系统级文件与网络隔离')).toBeVisible();
await page.getByRole('button', { name: '确认执行' }).click();
await expect(page.getByText('仅摘要导入 · 不作为通过证据')).toBeVisible();
```
- [x] **Step 6: Verify E2E failure** — Run `npm run test:e2e -- test/e2e/test-execution.spec.js`; Expected: execution UI is absent.
- [x] **Step 7: Implement UI** for profile create/version/disable, server-generated run preview and explicit confirmation, plus run loading, empty, unknown, running, failed, cancelled and environment-error states. Preview becomes invalid after profile/plan changes or expiry and must be refreshed.
- [x] **Step 8: Verify release** — Run the focused E2E, `npm test`, and `git diff --check`; Expected: all exit 0.
- [x] **Step 9: Commit** — Commit `feat: add test execution workbench` with scoped files.
