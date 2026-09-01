# DSH QA Workbench 0.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TestRun 增加完整性可验证的证据包、失败分析和可解释回归集合。

**Architecture:** artifact 固定在 `QA_DATA_DIR/artifacts/<projectId>/<testRunId>`，manifest 原子写入；下载只接受 bundle ID 和 item ID。回归集合引用现有用例、风险、变更和缺陷。

**Tech Stack:** Node.js ESM、`node:fs`、`node:crypto`、JSON store、SSE、Playwright artifacts。

**Spec:** `docs/quality-workbench/2026-08-25-technical-design.md`

## Global Constraints

- 单文件 100 MiB、bundle 500 MiB、项目 5 GiB、默认保留 30 天。
- 被未关闭缺陷或最新门禁引用的证据不自动清理。
- API 不接受文件系统路径。
- 单元测试统一从 `test/helpers/quality-fixtures.js` 导入夹具；API 测试沿用现有 `base` 和原生 `fetch`，E2E 使用 Playwright 的 `test/page` fixture。

### Task 1: Evidence manifest and integrity

**Files:** Create `server/quality/evidence.js`, `test/unit/evidence.test.js`。

**Interfaces:** Produces `finalizeEvidence(project, runId)`, `recoverEvidenceFinalization(projects)`, `resolveEvidence(project, evidenceId)`, `verifyEvidence(bundle)`.

- [x] **Step 1: Write failing tests**

```js
const project = makeProject({ artifactRoot: controlledArtifactRoot });
const run = makeTestRun({ projectId: project.id, artifactDir: stagingDir });
project.testruns.push(run);
fs.mkdirSync(stagingDir, { recursive: true });
fs.writeFileSync(path.join(stagingDir, 'process.log'), 'passed');
const outsideRun = makeTestRun({ projectId: project.id, artifactDir: outsideDir });
project.testruns.push(outsideRun);
await assert.rejects(() => finalizeEvidence(project, outsideRun.id), /证据路径越界/);
const bundle = await finalizeEvidence(project, run.id);
assert.equal(bundle.items[0].sha256.length, 64);
assert.equal(bundle.state, 'ready');
assert.equal((await finalizeEvidence(project, run.id)).id, bundle.id);
fs.appendFileSync(path.join(bundle.root, bundle.items[0].relativePath), 'tampered');
assert.equal((await verifyEvidence(bundle)).ok, false);
```

- [x] **Step 2: Verify failure** — Run `node --test test/unit/evidence.test.js`; Expected: missing module failure.
- [x] **Step 3: Add lifecycle and recovery tests** — Reject non-terminal runs, symlinks/special files/hard links and files changed during hashing; run two concurrent finalize calls and assert one bundle ID; simulate crashes before manifest rename, before final directory rename and before store flush; assert restart recovery never exposes partial evidence.
- [x] **Step 4: Implement** controlled staging/finalizing/final directory renames, regular-file and race checks, size quotas, item SHA-256, canonical manifest hashing, idempotent/concurrent finalize and startup recovery. Only ready+verified bundles are resolvable.

最低实现结构：manifest 只能枚举稳定的 regular files，规范化后先写 `manifest.json.tmp`，目录和存储记录按状态机提交。

```js
export async function finalizeEvidence(project, runId) {
  const run = requireOwnedRun(project, runId);
  const existing = findReadyEvidence(project, runId);
  if (existing) return existing;
  const finalizing = await claimStaging(project.id, run);
  const items = await hashStableRegularFiles(finalizing, QUOTAS);
  const bundle = buildCanonicalEvidenceBundle(run, items);
  await writeManifestAtomic(finalizing, bundle);
  const finalRoot = await publishFinalDirectory(finalizing, bundle.id);
  return persistReadyEvidenceAndFlush(project, bundle, finalRoot);
}
```
- [x] **Step 5: Verify pass** — Run the same command; Expected: path, quota, hash, idempotence, concurrency, crash recovery and tamper tests PASS.
- [x] **Step 6: Commit** — Commit `feat: add verified evidence bundles`.

### Task 2: Retention and project deletion

**Files:** Create `server/quality/evidence-retention.js`, `test/unit/evidence-retention.test.js`; Modify `server/store.js`, `server/migrations.js`, `test/unit/store.test.js`, `test/unit/migrations.test.js`。

**Interfaces:** Produces `enqueueProjectArtifactCleanup(project)`, `planArtifactCleanup(db, now)`, `executeArtifactCleanup(job, deps = { rm: fs.promises.rm })`, `startArtifactCleanupWorker({ intervalMs, batchSize })`; store adds top-level `artifactCleanupJobs`.

- [x] **Step 1: Write the failing tests**

```js
const projectWithArtifacts = createProject({ title: '待删除项目' });
projectWithArtifacts.artifactRoot = controlledArtifactRoot;
flush();
deleteProject(projectWithArtifacts.id);
assert.equal(getProject(projectWithArtifacts.id), null);
let job = listArtifactCleanupJobs()[0];
assert.equal(job.artifactRoot, controlledArtifactRoot);
loadStore();
assert.equal(getProject(projectWithArtifacts.id), null);
assert.equal(listArtifactCleanupJobs()[0].artifactRoot, controlledArtifactRoot);
job = listArtifactCleanupJobs()[0];
const result = await executeArtifactCleanup(job, { rm: async () => { throw new Error('busy'); } });
assert.equal(result.status, 'retryable');
assert.equal(listArtifactCleanupJobs()[0].attempts, 1);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/evidence-retention.test.js`; Expected: missing exports.
- [x] **Step 3: Implement** the `0.4.0` migration for project evidence/failure/regression arrays and top-level `artifactCleanupJobs`. During deletion, enqueue the explicit controlled artifact root and splice the Project in memory, then call one synchronous `flush()` so both changes land in one atomic JSON rename; never call delayed `persist()` between them or derive targets from request input. The worker ignores jobs whose project still exists, retains failed jobs with attempts/lastError and removes successful jobs. Start one unref'd worker after service initialization, immediately resume pending jobs, then process bounded batches of expired bundles and orphan staging; expose a stop hook for tests and server shutdown.
- [x] **Step 4: Verify pass** — Run the same command; Expected: six scenarios PASS.
- [x] **Step 5: Commit** — Commit `feat: manage evidence retention`.

### Task 3: Failure analysis and regression set

**Files:** Create `server/quality/failure-analysis.js`, `server/quality/regression.js`, `server/quality/run-comparison.js`, `test/unit/regression.test.js`, `test/unit/run-comparison.test.js`; Modify `server/tools.js`。

**Interfaces:** Produces `saveFailureAnalysis(project, runId, input)`, `promoteFailureAnalysisToDefect(project, analysisId, confirmation)`, `compareRuns(project, beforeRunId, afterRunId)`, `calculateRegressionSet(project, qualityTaskId, inputDigest)`, `excludeRegressionCase(set, caseId, reason, actorLabel)`.

- [x] **Step 1: Write the failing tests**

```js
const project = makeProject();
const task = makeQualityTask({ projectId: project.id });
const run = makeTestRun({ projectId: project.id, status: 'failed' });
const testcase = makeTestCase();
project.qualityTasks.push(task);
project.testruns.push(run);
project.testcases.push(testcase);
const analysis = { category: 'product-defect', decision: 'candidate', note: '登录失败' };
const digest = 'sha256:change-risk-defect-v1';
const savedAnalysis = saveFailureAnalysis(project, run.id, analysis);
assert.equal(savedAnalysis.decision, 'candidate');
assert.throws(() => promoteFailureAnalysisToDefect(project, savedAnalysis.id, {}), /人工确认/);
const defect = promoteFailureAnalysisToDefect(project, savedAnalysis.id, { actorLabel: '张测试', confirmed: true });
assert.equal(defect.status, 'open');
assert.equal(defect.failureAnalysisId, savedAnalysis.id);
assert.throws(() => promoteFailureAnalysisToDefect(project, savedAnalysis.id, { actorLabel: '张测试', confirmed: true }), /已创建缺陷/);
assert.deepEqual(calculateRegressionSet(project, task.id, digest), calculateRegressionSet(project, task.id, digest));
const set = calculateRegressionSet(project, task.id, digest);
const caseId = testcase.id;
set.items.push({ testcaseId: caseId, included: true });
assert.throws(() => excludeRegressionCase(set, caseId, '', '张测试'), /理由/);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/regression.test.js`; Expected: missing module failure.
- [x] **Step 3: Add run-comparison tests** — Build two terminal runs for the same TestPlan; assert `failed→passed=fixed`, `passed→failed=new-failure`, cross-project/cross-plan comparisons fail, and both evidence references are retained.
- [x] **Step 4: Implement** stable sorting and digesting of risk/change/defect inputs; extract the existing defect creation primitive so the tool and promotion path both write `project.defects`; require explicit human confirmation, reject duplicate promotion, and compare only persisted terminal runs without reparsing logs.
- [x] **Step 5: Verify pass** — Run `node --test test/unit/regression.test.js test/unit/run-comparison.test.js`; Expected: deterministic, promotion, comparison and audit tests PASS.
- [x] **Step 6: Commit** — Commit `feat: add failure analysis and regression sets`.

### Task 4: Evidence API and download safety

**Files:** Modify `server/routes.js`, `test/unit/http-api.test.js`。

**Interfaces:** Produces finalize/list/download/failure-analysis/promote-defect/run-comparison/regression APIs from the technical design.

- [x] **Step 1: Write the failing API tests**

```js
const evidenceBase = `${base}/api/projects/${projectId}/evidence`;
const firstFinalize = await fetch(`${base}/api/projects/${projectId}/test-runs/${runId}/evidence/finalize`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRunRevision: runRevision }),
});
assert.equal(firstFinalize.status, 201);
const firstBundle = (await firstFinalize.json()).evidence;
const repeatedFinalize = await fetch(`${base}/api/projects/${projectId}/test-runs/${runId}/evidence/finalize`, { method: 'POST' });
assert.equal(repeatedFinalize.status, 200);
assert.equal((await repeatedFinalize.json()).evidence.id, firstBundle.id);
assert.equal((await fetch(`${evidenceBase}/ev_missing/items/item_1/download`)).status, 404);
assert.equal((await fetch(`${evidenceBase}/${bundleId}/items/%2e%2e%2fsecret/download`)).status, 400);
const download = await fetch(`${evidenceBase}/${bundleId}/items/${traceItemId}/download`);
assert.match(download.headers.get('content-disposition'), /^attachment/);
const promoted = await fetch(`${base}/api/projects/${projectId}/failure-analyses/${analysisId}/promote-defect`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: analysisRevision, actorLabel: '张测试', confirmed: true }),
});
assert.equal(promoted.status, 201);
assert.equal((await fetch(`${base}/api/projects/${projectId}/failure-analyses/${analysisId}/promote-defect`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: analysisRevision, actorLabel: '张测试', confirmed: true }),
})).status, 409);
assert.equal((await fetch(`${base}/api/projects/${projectId}/test-runs/${beforeRunId}/compare/${afterRunId}`)).status, 200);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/http-api.test.js`; Expected: new endpoints return 404.
- [x] **Step 3: Implement** first successful finalize as 201 and idempotent repeat as 200; require `expectedRunRevision` when claiming new staging, while an already-ready idempotent lookup may return 200 without reclaiming it. Finalizing/integrity-failed evidence returns 409 and is never downloadable. Use ID lookup only; return attachment for trace and unapproved MIME types; serialize only IDs, relative filenames, MIME, size and digests—never absolute artifact roots. Promotion and RegressionSet mutations require target `expectedRevision`; promotion also requires `{ actorLabel, confirmed: true }`, duplicate promotion returns 409, and comparison rejects foreign or non-terminal runs.
- [x] **Step 4: Verify pass** — Re-run API tests; Expected: old and new tests PASS.
- [x] **Step 5: Commit** — Commit `feat: expose safe evidence APIs`.

### Task 5: Bilingual evidence and regression UI

**Files:** Modify `server/sse.js`, `public/index.html`, `public/app.js`, `public/style.css`, `public/i18n.js`; Create `test/e2e/regression.spec.js`。

- [x] **Step 1: Write the failing E2E**

```js
await expect(page.getByRole('heading', { name: '质量证据' })).toBeVisible();
await expect(page.getByAltText('失败步骤截图')).toBeVisible();
await page.getByRole('button', { name: '确认并创建缺陷' }).click();
await expect(page.getByText('已登记为待处理缺陷')).toBeVisible();
await expect(page.getByText('修复前后对比')).toBeVisible();
await page.getByRole('button', { name: '排除回归项' }).click();
await expect(page.getByText('请填写排除理由')).toBeVisible();
```
- [x] **Step 2: Verify failure** — Run `npm run test:e2e -- test/e2e/regression.spec.js`; Expected: evidence UI absent.
- [x] **Step 3: Implement UI and `quality.evidence.updated`** with loading, empty, expired, integrity-failed and download states.
- [x] **Step 4: Verify release** — Run focused E2E, `npm test`, and `git diff --check`; Expected: all exit 0.
- [x] **Step 5: Commit** — Commit `feat: add evidence and regression workbench`.
