# DSH QA Workbench 0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有项目内交付可追溯的质量任务、来源快照、风险双状态、DSH 分析回写和人工决策。

**Architecture:** `project.qualityTasks` 是唯一质量任务存储；来源限定为现有需求、workspace 文件和受控 Git diff。DSH 会话通过工具写入分析，独立模式只允许手工结果；服务端计算阶段并通过 SSE 通知前端。

**Tech Stack:** Node.js ESM、JSON store、DSH tools、SSE、原生前端、`node:test`、Playwright。

**Spec:** `docs/quality-workbench/2026-08-25-technical-design.md`

## Global Constraints

- 不新增认证系统、生产依赖或顶层质量数据库。
- 不接受浏览器绝对路径，不在日志记录来源正文。
- `confirmed` 不代表已处置；high/critical + open 阻断 ready。
- API 错误保持 `{ ok: false, error: string, code?: string }`。

### Task 0: Shared quality test fixtures

**Files:** Create `test/helpers/quality-fixtures.js`, `test/helpers/quality-fixtures.test.js`, `scripts/run-unit-tests.js`; Modify `package.json`。

**Interfaces:** Produces `makeProject`, `makeQualityTask`, `makeTestCase`, `makeTestRun`, `makeEvidenceBundle`, `makeGate` for all four version plans.

- [x] **Step 1: Write the fixture contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeQualityTask, makeTestRun } from './quality-fixtures.js';

test('quality fixtures return isolated project-owned entities', () => {
  const first = makeProject();
  const second = makeProject();
  first.qualityTasks.push(makeQualityTask({ projectId: first.id }));
  first.testruns.push(makeTestRun({ projectId: first.id }));
  assert.equal(first.qualityTasks.length, 1);
  assert.equal(second.qualityTasks.length, 0);
});
```

- [x] **Step 2: Verify failure** — Run `node --test test/helpers/quality-fixtures.test.js`; Expected: module-not-found.
- [x] **Step 3: Implement the fixture module and test discovery** — Add the fixture module below. Implement `scripts/run-unit-tests.js` to recursively collect and sort only `test/unit/**/*.test.js` and `test/helpers/**/*.test.js`, then invoke `process.execPath` with `['--test', '--test-concurrency=1', ...files]` via `spawnSync` without a shell and propagate its exit status. Change `test:unit` to `node scripts/run-unit-tests.js`. Do not use bare `node --test`, because Node discovery may also traverse `test/e2e` or intentional runner inputs.

```js
let sequence = 0;
const id = (prefix) => `${prefix}_fixture_${++sequence}`;
export const makeProject = (overrides = {}) => ({ id: id('prj'), title: 'Fixture project', workspacePath: '', requirements: [], testcases: [], qualityTasks: [], qualityAudit: [], testPlans: [], testruns: [], executionProfiles: [], evidenceBundles: [], regressionSets: [], gates: [], defects: [], materials: [], ...overrides });
export const makeQualityTask = (overrides = {}) => ({ id: id('qt'), projectId: '', version: 1, stage: 'intake', sources: [], acceptanceCriteria: [], risks: [], testScope: [], decisions: [], ...overrides });
export const makeTestCase = (overrides = {}) => ({ id: id('tc'), title: 'Fixture case', planIds: [], ...overrides });
export const makeTestRun = (overrides = {}) => ({ id: id('run'), projectId: '', mode: 'local', status: 'queued', resultTrust: 'controlled-local', provenance: {}, ...overrides });
export const makeEvidenceBundle = (overrides = {}) => ({ id: id('ev'), testRunId: '', provenance: {}, items: [], ...overrides });
export const makeGate = (overrides = {}) => ({ id: id('gate'), kind: 'computed', checks: [], exceptions: [], ...overrides });
```

`scripts/run-unit-tests.js` 最低实现结构：

```js
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? collect(file) : entry.name.endsWith('.test.js') ? [file] : [];
  });
}

const files = [...collect('test/unit'), ...collect('test/helpers')].sort();
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
```

- [x] **Step 4: Verify pass** — Run the focused command and `npm run test:unit`; Expected: fixture contract and all existing unit/API tests PASS, output includes `quality-fixtures.test.js`, and excludes `test/e2e` plus `test/fixtures/runner`.
- [x] **Step 5: Commit** — Commit `test: add quality domain fixtures` with only the two helper files.

### Task 0A: Versioned store migration foundation

**Files:** Create `server/migrations.js`, `test/unit/migrations.test.js`; Modify `server/store.js`。

**Interfaces:** Produces `CURRENT_SCHEMA_VERSION`, `migrateDb(rawDb)` and load-time all-or-nothing migration; later iterations append one ordered migration step rather than adding scattered load-time mutations.

- [x] **Step 1: Write failing tests** — Load a copy of a real pre-0.2 fixture, assert unknown fields survive and `qualityTasks/qualityAudit` are initialized, a second migration is deep-equal to the first, malformed non-object roots fail without changing the source fixture, and migrated data survives `flush()` plus module reload. Later version plans extend this same fixture matrix with their own arrays.
- [x] **Step 2: Verify failure** — Run `node --test test/unit/migrations.test.js`; Expected: module missing.
- [x] **Step 3: Implement** ordered pure migrations on a cloned object, update `schemaVersion` only after each successful step, replace in-memory db only after the full chain succeeds, and preserve the original JSON file on failure.
- [x] **Step 4: Verify pass** — Re-run the focused test; Expected: migration, idempotence, unknown-field preservation and restart scenarios PASS.
- [x] **Step 5: Commit** — Commit `feat: add versioned store migrations`.

### Task 1: 项目归一化与质量任务模型

**Files:** Create `server/quality/task.js`, `test/unit/quality-task.test.js`; Modify `server/store.js`。

**Interfaces:** Produces `normalizeQualityProject(project)`, `createQualityTask(project, fields)`, `getQualityTask(project, id)`, `listQualityTasks(project)`, `recomputeStage(task)`; QualityTask includes `acceptanceCriteria[]`.

- [x] **Step 1: Write the failing tests**

```js
const legacy = makeProject(); delete legacy.qualityTasks;
assert.deepEqual(normalizeQualityProject(legacy).qualityTasks, []);
const project = makeProject();
const task = createQualityTask(project, { title: '支付回调风险' });
assert.match(task.id, /^qt_/);
assert.deepEqual(task.acceptanceCriteria, []);
task.risks = [{ severity: 'high', assessmentStatus: 'confirmed', dispositionStatus: 'open' }];
assert.equal(recomputeStage(task), 'confirmation');
```
- [x] 运行 `node --test test/unit/quality-task.test.js`；预期因模块不存在失败。
- [x] 在 `normalizeProject()` 增加 `qualityTasks ||= []`，实现四个导出函数和风险双状态校验。
- [x] 重跑同一命令；预期全部通过。
- [x] 运行 `git diff --check`，仅暂存本任务文件，提交 `feat: add project quality task model`。

### Task 2: 受控来源快照

**Files:** Create `server/quality/source.js`, `test/unit/quality-source.test.js`。

**Interfaces:** Consumes `project.requirements`, `project.workspacePath`; Produces `captureSource(project, descriptor)`。

- [x] **Step 1: Write the failing tests**

```js
const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-source-'));
const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-nongit-'));
const gitWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-'));
execFileSync('git', ['init'], { cwd: gitWorkspaceDir });
execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: gitWorkspaceDir });
execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: gitWorkspaceDir });
fs.writeFileSync(path.join(gitWorkspaceDir, 'requirement.md'), '# v1');
execFileSync('git', ['add', 'requirement.md'], { cwd: gitWorkspaceDir });
execFileSync('git', ['commit', '-m', 'fixture v1'], { cwd: gitWorkspaceDir });
fs.writeFileSync(path.join(gitWorkspaceDir, 'requirement.md'), '# v2');
execFileSync('git', ['commit', '-am', 'fixture v2'], { cwd: gitWorkspaceDir });
const requirement = { id: 'req_fixture', title: '支付回调' };
const project = makeProject({ requirements: [requirement], workspacePath: workspaceDir });
assert.equal((await captureSource(project, { type: 'requirement', ref: requirement.id })).type, 'requirement');
await assert.rejects(() => captureSource(project, { type: 'workspace-file', ref: '../secret' }), /越界/);
fs.writeFileSync(path.join(workspaceDir, 'binary.bin'), Buffer.from([0x61, 0x00, 0x62]));
await assert.rejects(() => captureSource(project, { type: 'workspace-file', ref: 'binary.bin' }), /UTF-8|二进制/);
fs.writeFileSync(path.join(workspaceDir, 'large.md'), Buffer.alloc(1024 * 1024 + 1, 0x61));
await assert.rejects(() => captureSource(project, { type: 'workspace-file', ref: 'large.md' }), /1 MiB/);
await assert.rejects(() => captureSource(makeProject({ workspacePath: nonGitDir }), { type: 'git-diff', ref: 'HEAD' }), /Git/);
await assert.rejects(() => captureSource(makeProject({ workspacePath: gitWorkspaceDir }), { type: 'git-diff', ref: '--output=/tmp/leak' }), /revision/);
await assert.rejects(() => captureSource(makeProject({ workspacePath: gitWorkspaceDir }), { type: 'git-diff', ref: 'HEAD@{1}' }), /revision/);
assert.equal((await captureSource(makeProject({ workspacePath: gitWorkspaceDir }), { type: 'git-diff', ref: 'HEAD~1..HEAD' })).digest.length, 64);
```
- [x] 运行 `node --test test/unit/quality-source.test.js`；预期因函数缺失失败。
- [x] 使用 realpath 边界校验和 `execFile('git', fixedArgs)` 实现来源捕获，不使用 shell 字符串；revision 只接受 `HEAD`、`HEAD~N`、40 位 commit 及受限双点/三点组合，明确拒绝 `-` 开头值、reflog/colon/whitespace，并把所有路径放在 `--` 后。文件和 Git stdout 都以 1 MiB 硬上限读取，校验 UTF-8/NUL，并在追加任务来源前检查 5 MiB 总量；超限不保存截断快照。
- [x] 重跑测试；预期全部通过且越界返回稳定错误码。
- [x] 仅提交本任务文件，提交信息 `feat: capture controlled quality sources`。

### Task 3: 项目嵌套 API 与修订冲突

**Files:** Modify `server/routes.js`, `test/unit/http-api.test.js`。

**Interfaces:** Produces quality-tasks 列表/创建/详情、analysis-requests、manual-analyses、decisions API。

- [x] **Step 1: Write the failing API tests**

```js
const created = await fetch(`${base}/api/projects/${project.id}/quality-tasks`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '任务' }),
});
assert.equal(created.status, 201);
assert.equal((await fetch(`${base}/api/projects/missing/quality-tasks`)).status, 404);
const conflict = await fetch(`${base}${decisionUrl}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 0, action: 'confirm' }),
});
assert.equal(conflict.status, 409);
assert.equal(typeof (await conflict.json()).error, 'string');
const forgedManual = await fetch(`${base}/api/projects/${project.id}/quality-tasks/${taskId}/manual-analyses`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ expectedRevision: 1, actorLabel: '张测试', sourceDigests, acceptanceCriteria: [], risks: [], testScope: [], origin: 'agent', dshSessionId: 'forged' }),
});
assert.equal(forgedManual.status, 400);
const manual = await fetch(`${base}/api/projects/${project.id}/quality-tasks/${taskId}/manual-analyses`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ expectedRevision: 1, actorLabel: '张测试', sourceDigests, acceptanceCriteria: [], risks: [], testScope: [] }),
});
assert.equal(manual.status, 201);
const manualTask = (await manual.json()).task;
assert.equal(manualTask.analysisOrigin, 'manual');
assert.equal(manualTask.analysisRuns.at(-1).dshSessionId ?? '', '');
```
- [x] 运行 `node --test test/unit/http-api.test.js`；预期新路由 404。
- [x] 添加 `created()`/`accepted()` 响应助手和嵌套路由，保持 `ok()` 为 200；body 不能覆盖 path projectId；manual analysis 强制 origin=manual，出现 origin、dshSessionId、stage 等派生/宿主字段时返回 400；decision 和所有其他修改使用 `expectedRevision` 并追加记录。
- [x] 重跑 HTTP 测试；预期新旧 API 全部通过。
- [x] 提交 `feat: add quality task APIs`。

### Task 4: DSH 分析工具与 SSE

**Files:** Create `server/quality/analysis.js`, `test/unit/quality-analysis.test.js`; Modify `server/tools.js`, `server/sse.js`, `test/unit/http-api.test.js`。

**Interfaces:** Produces `commitQualityMutation`, `appendDeniedAudit`, 四个 `qa_quality_*` 工具和 revisioned `quality.task.updated`。

- [x] **Step 1: Write the failing tool tests**

```js
const store = await import('../../server/store.js');
const project = store.createProject({ title: '分析项目' });
const other = store.createProject({ title: '其他项目' });
const task = makeQualityTask({ projectId: project.id, sources: [{ digest: 'digest_current' }] });
project.qualityTasks.push(task);
store.persist();
const analysisRequestId = createAnalysisRequest(project, task.id).id;
const validResult = { analysisRequestId, expectedRevision: task.version, sourceDigests: ['digest_current'], analysisVersion: 'quality-analysis-v1', risks: [], testScope: [] };
assert.equal((await executeTool(project.id, 'qa_quality_task_get', { taskId: task.id })).ok, true);
assert.equal((await executeTool(other.id, 'qa_quality_task_get', { taskId: task.id })).ok, false);
assert.equal((await saveAnalysis({ analysisRequestId, expectedRevision: task.version, sourceDigests: ['stale'] })).code, 'QUALITY_SOURCE_CHANGED');
assert.equal((await saveAnalysis({ ...validResult, expectedRevision: task.version, acceptanceCriteria: [{ condition: '签名有效', expectedBehavior: '接收回调', sourceRefs: validResult.sourceDigests }], origin: 'agent' })).task.analysisOrigin, 'agent');
assert.equal(events.at(-1).revision, task.version);
assert.equal('sourceSnapshot' in events.at(-1), false);
assert.equal(project.qualityAudit.at(-1).toRevision, task.version);
assert.equal(JSON.stringify(project.qualityAudit).includes('签名有效'), false);
```
- [x] 运行相关 unit 测试；预期工具未定义失败。
- [x] 实现共享 mutation wrapper、工具 schema、expectedRevision/分析结果校验、稳定错误码、审计保存和最小 SSE 广播；HTTP 和工具适配层不得直接修改质量数组。由宿主注入 projectId/dshSessionId，工具 schema 不接受这两个字段。
- [x] 运行 `node --test test/unit/quality-analysis.test.js test/unit/http-api.test.js`；预期通过。
- [x] 提交 `feat: connect DSH quality analysis tools`。

### Task 5: 双语项目详情 UI

**Files:** Modify `public/index.html`, `public/app.js`, `public/style.css`, `public/i18n.js`; Create `test/e2e/quality-task.spec.js`。

**Interfaces:** Consumes Task 3 API、Task 4 SSE。

- [x] **Step 1: Write the failing E2E**

```js
await page.getByRole('button', { name: '新建质量任务' }).click();
await page.getByLabel('任务名称').fill('支付回调风险');
await page.getByRole('button', { name: '创建任务' }).click();
await expect(page.getByText('独立模式不会直接调用模型')).toBeVisible();
await page.getByRole('button', { name: '手工录入分析' }).click();
await expect(page.getByText('结果来源：人工录入')).toBeVisible();
await expect(page.getByRole('heading', { name: '验收标准' })).toBeVisible();
await page.getByRole('tab', { name: '开发视角' }).click();
await expect(page.getByText('实现关注项')).toBeVisible();
await page.reload();
await expect(page.getByText('支付回调风险')).toBeVisible();
```
- [x] 运行 `npm run test:e2e -- test/e2e/quality-task.spec.js`；预期找不到质量任务 UI。
- [x] 在项目详情增加任务、验收标准、风险、测试范围和决策时间线，以及 QA/开发/产品项目展示视角和加载、空、错误、只读状态；视角仅筛选同一任务数据。
- [x] 重跑该 E2E；预期通过。
- [x] 运行 `npm test` 和 `git diff --check`；预期全量通过，提交 `feat: add quality task workbench UI`。
