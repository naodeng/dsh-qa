# DSH QA Workbench 0.5.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `project.gates` 上交付确定性 PASS/WARN/BLOCK、人工例外和可追溯交付报告。

**Architecture:** 老 gate 归一化为 `kind=approval`；新门禁为 `kind=computed`。纯函数规则引擎读取事实快照，报告只投影已保存结论；人工例外不修改原始事实。

**Tech Stack:** Node.js ESM、JSON store、SSE、原生前端、`node:test`、Playwright。

**Spec:** `docs/quality-workbench/2026-08-25-technical-design.md`

## Global Constraints

- 保留现有 `gate_request` 和 approve/reject API。
- 无必需证据不能 PASS；未接受 critical 风险必须 BLOCK。
- 每次评估保存 rulesetVersion 和输入摘要。
- provenance 不一致产生 `stale-evidence`，且人工例外不能覆盖任何 provenance stale。
- 所有 provenance stale、证据完整性/缺失、关键测试失败和未处置 critical 风险均不可豁免；其他有效例外最多产生 WARN，不能把失败提升为 PASS。
- 单元测试统一从 `test/helpers/quality-fixtures.js` 导入夹具；API 测试沿用现有 `base` 和原生 `fetch`，E2E 使用 Playwright 的 `test/page` fixture。

### Task 1: Approval gate backward compatibility

**Files:** Create `server/quality/gate.js`, `test/unit/quality-gate.test.js`; Modify `server/store.js`, `server/tools.js`, `server/migrations.js`, `test/unit/migrations.test.js`。

**Interfaces:** Produces `normalizeGate(gate)`, preserving old `status`, `decision`, `requestedAt`, `decidedAt` with `kind: 'approval'`.

- [x] **Step 1: Write failing test**

```js
const gate = normalizeGate({ id: 'gate_1', status: 'approved', decision: 'approve' });
assert.equal(gate.kind, 'approval');
assert.equal(gate.status, 'approved');
```

- [x] **Step 2: Verify failure** — Run `node --test test/unit/quality-gate.test.js`; Expected: missing module failure.
- [x] **Step 3: Implement** the `0.5.0` migration step and gate normalization without rewriting old IDs or timestamps or inventing computed fields; keep `gate_request` output compatible and add migration idempotence/restart coverage.
- [x] **Step 4: Verify pass** — Run the same command; Expected: legacy tests PASS.
- [x] **Step 5: Commit** — Commit `feat: normalize approval gates`.

### Task 2: Deterministic computed gate

**Files:** Modify `server/quality/gate.js`, `test/unit/quality-gate.test.js`。

**Interfaces:** Produces `evaluateGate(facts, ruleset)`, `applyGateExceptions(result, exceptions, now)`.

- [x] **Step 1: Write the failing tests**

```js
const current = { sourceDigests: ['sha256:source-v2'], commit: 'abc123', testPlanVersion: 2, regressionSetVersion: 3, profileId: 'profile_1', profileVersion: 4 };
const passedRun = makeTestRun({ status: 'passed', resultTrust: 'controlled-local', provenance: current });
const evidence = makeEvidenceBundle({ testRunId: passedRun.id, provenance: current, integrity: 'verified' });
const rules = { version: 'gate-rules-v1', requireVerifiedEvidence: true, blockCriticalOpenRisk: true };
const allPassFacts = { latestRun: passedRun, evidence: [evidence], provenance: current, risks: [] };
const missingEvidenceFacts = { ...allPassFacts, evidence: [] };
const criticalOpenRiskFacts = { ...allPassFacts, risks: [{ severity: 'critical', status: 'open' }] };
const staleCommitFacts = { ...allPassFacts, latestRun: { ...passedRun, provenance: { ...current, commit: 'old' } } };
const stalePlanVersionFacts = { ...allPassFacts, latestRun: { ...passedRun, provenance: { ...current, testPlanVersion: 1 } } };
const blocked = evaluateGate(criticalOpenRiskFacts, rules);
const warned = { verdict: 'WARN', checks: [{ key: 'medium-coverage', status: 'failed', waivable: true }] };
const expiredException = { checkKey: 'critical-risk', expiresAt: '2026-08-24T00:00:00.000Z' };
const validWaivableException = { checkKey: 'medium-coverage', reason: '本次范围不包含', actorLabel: 'QA', expiresAt: '2026-08-26T00:00:00.000Z' };
const now = new Date('2026-08-25T00:00:00.000Z');
assert.equal(evaluateGate(allPassFacts, rules).verdict, 'PASS');
assert.notEqual(evaluateGate(missingEvidenceFacts, rules).verdict, 'PASS');
assert.equal(evaluateGate(criticalOpenRiskFacts, rules).verdict, 'BLOCK');
assert.equal(applyGateExceptions(blocked, [expiredException], now).verdict, 'BLOCK');
assert.equal(applyGateExceptions(blocked, [{ checkKey: 'critical-risk', reason: '接受', actorLabel: 'QA', expiresAt: '2026-08-26T00:00:00.000Z' }], now).verdict, 'BLOCK');
assert.equal(applyGateExceptions(warned, [validWaivableException], now).verdict, 'WARN');
assert.equal(evaluateGate(staleCommitFacts, rules).checks.find((c) => c.key === 'stale-evidence').status, 'failed');
assert.notEqual(evaluateGate(stalePlanVersionFacts, rules).verdict, 'PASS');
```
- [x] **Step 2: Verify failure** — Run the focused unit test; Expected: `evaluateGate` missing or assertions fail.
- [x] **Step 3: Implement** pure evaluation returning `{ verdict, checks, rulesetVersion, inputDigest, inputProvenance }`; compare sourceDigests, commit, testPlanVersion, regressionSetVersion and profile version before coverage/result rules; exceptions never mutate facts, all provenance/required-evidence/critical-failure checks are non-waivable, and any valid waivable exception caps the verdict at WARN.
- [x] **Step 4: Verify pass** — Run the focused test; Expected: six rule scenarios PASS.
- [x] **Step 5: Commit** — Commit `feat: evaluate computed quality gates`.

### Task 3: Gate API and exception audit

**Files:** Modify `server/routes.js`, `test/unit/http-api.test.js`。

**Interfaces:** Produces evaluate/get/exceptions API; old decide API accepts only `kind=approval`.

- [x] **Step 1: Write the failing API tests**

```js
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
assert.equal((await post(`${approvalGateUrl}/decide`, { decision: 'approve' })).status, 200);
assert.equal((await post(`${computedGateUrl}/decide`, { decision: 'approve' })).status, 400);
assert.equal((await post(`${computedGateUrl}/exceptions`, { actorLabel: 'QA' })).status, 400);
assert.equal((await post(`${computedGateUrl}/exceptions`, { expectedRevision: 0, actorLabel: 'QA', reason: '范围外', expiresAt: '2026-08-26T00:00:00.000Z', checkKey: 'medium-coverage' })).status, 409);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/http-api.test.js`; Expected: computed endpoints return 404.
- [x] **Step 3: Implement** project-nested routes and append-only exceptions; exception creation requires gate `expectedRevision`, stale revisions return 409 without append/SSE, and responses retain the existing error shape.
- [x] **Step 4: Verify pass** — Re-run API tests; Expected: old approval and new computed tests PASS.
- [x] **Step 5: Commit** — Commit `feat: expose computed quality gate APIs`.

### Task 4: Delivery report projection

**Files:** Create `server/quality/report.js`, `test/unit/quality-report.test.js`。

**Interfaces:** Produces `buildDeliveryReport(project, gateId)` from the saved gate snapshot and referenced facts.

- [x] **Step 1: Write the failing tests**

```js
const gate = makeGate({ verdict: 'BLOCK', checks: [{ key: 'critical-risk', evidenceRefs: ['ev_1'] }] });
const project = makeProject({ gates: [gate], evidenceBundles: [makeEvidenceBundle({ id: 'ev_1' })] });
const report = buildDeliveryReport(project, gate.id);
assert.equal(report.verdict, gate.verdict);
assert.deepEqual(report.evidenceRefs, gate.checks.flatMap((check) => check.evidenceRefs));
const projectWithMissingRef = makeProject({ gates: [gate], evidenceBundles: [] });
assert.match(buildDeliveryReport(projectWithMissingRef, gate.id).warnings[0], /引用不存在/);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/quality-report.test.js`; Expected: missing module failure.
- [x] **Step 3: Implement** deterministic report sections without recalculating a second verdict.
- [x] **Step 4: Verify pass** — Run the same command; Expected: all projection tests PASS.
- [x] **Step 5: Commit** — Commit `feat: build traceable delivery reports`.

### Task 5: Gate trend projection

**Files:** Create `server/quality/gate-trend.js`, `test/unit/gate-trend.test.js`; Modify `server/routes.js`, `test/unit/http-api.test.js`。

**Interfaces:** Produces `buildGateTrend(project, qualityTaskId)` and `GET /api/projects/:projectId/quality-tasks/:id/gate-trends` from saved computed gates only.

- [x] **Step 1: Write failing tests**

```js
const project = makeProject({ gates: [
  makeGate({ id: 'gate_b', qualityTaskId: 'qt_1', kind: 'computed', verdict: 'BLOCK', calculatedAt: '2026-08-25T10:00:00Z' }),
  makeGate({ id: 'approval_1', qualityTaskId: 'qt_1', kind: 'approval', status: 'approved', calculatedAt: '2026-08-25T09:00:00Z' }),
  makeGate({ id: 'gate_a', qualityTaskId: 'qt_1', kind: 'computed', verdict: 'WARN', calculatedAt: '2026-08-25T10:00:00Z' }),
] });
const trend = buildGateTrend(project, 'qt_1');
assert.deepEqual(trend.series.map((point) => point.id), ['gate_a', 'gate_b']);
assert.deepEqual(trend.counts, { PASS: 0, WARN: 1, BLOCK: 1 });
assert.equal(trend.consecutiveBlock, 1);
assert.deepEqual(buildGateTrend(project, 'missing').series, []);
```
- [x] **Step 2: Verify failure** — Run `node --test test/unit/gate-trend.test.js test/unit/http-api.test.js`; Expected: module missing and route 404.
- [x] **Step 3: Implement** a read-only projection over saved computed gates; do not persist aggregates or recalculate historical verdicts.
- [x] **Step 4: Verify pass** — Re-run the focused tests; Expected: trend and API scenarios PASS.
- [x] **Step 5: Commit** — Commit `feat: add quality gate trends`.

### Task 6: Bilingual gate UI and release verification

**Files:** Modify `server/sse.js`, `public/index.html`, `public/app.js`, `public/style.css`, `public/i18n.js`; Create `test/e2e/quality-gate.spec.js`。

- [x] **Step 1: Write the failing E2E**

```js
await expect(page.getByText('BLOCK')).toBeVisible();
await page.getByRole('button', { name: '查看依据' }).click();
await expect(page.getByText('未接受的严重风险')).toBeVisible();
await expect(page.getByRole('button', { name: 'Add exception' })).toHaveAttribute('aria-label', 'Add gate exception');
await expect(page.getByRole('heading', { name: '门禁趋势' })).toBeVisible();
```
- [x] **Step 2: Verify failure** — Run `npm run test:e2e -- test/e2e/quality-gate.spec.js`; Expected: computed gate UI absent.
- [x] **Step 3: Implement** checks, explanations, exception form, report view, empty/populated trend states and `quality.gate.updated`.
- [x] **Step 4: Verify release** — Run focused E2E, `npm test`, rendered browser inspection and `git diff --check`; Expected: all automated commands exit 0 and no untranslated system copy is found.
- [x] **Step 5: Commit** — Commit `feat: add quality gate and delivery report UI`.
