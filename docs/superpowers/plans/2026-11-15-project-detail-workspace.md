# 项目详情工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Keep the checkboxes current and run each task's verification before moving on.

**Goal:** 将项目详情改成占据应用主内容区的项目工作区，并用需求—用例追溯、质量任务、交付和动态排期组织现有能力。

**Architecture:** 继续沿用原生前端与现有项目数据模型。服务端只为已有 Action Queue 查询增加项目过滤；前端用一个可单元测试的纯函数汇总需求覆盖，其他页面状态、实体操作和 SSE 刷新沿用现有项目详情数据流。

**Tech Stack:** Node.js 18+ ESM、Node `node:test`、原生 HTML/CSS/浏览器 JavaScript、Playwright Chromium。

**Spec:** `docs/superpowers/specs/2026-11-15-project-detail-workspace-design.md`

## Global Constraints

- 保持 ESM、Node 18+、无生产依赖、无生产构建步骤。
- 页面继续使用 `public/` 下的原生 HTML、CSS 和浏览器端 JavaScript。
- 不新增项目/需求/用例/运行/证据/门禁数据模型或行动项判定规则；Action Queue 只增加可选 `projectId` 查询过滤。
- 逐用例运行结果只有在现有记录提供来源时才能显示；不从项目级 TestRun 摘要推断 PASS/FAIL。
- 保留 Host 执行预览确认、服务端证据校验、门禁人工审批和现有审计语义。
- API 测试使用临时 `QA_DATA_DIR` 和随机端口；服务模块导入前设置数据目录，涉及服务启动的测试串行运行。
- E2E 使用真实本地服务与 Chromium，不用测试专用 DOM 分支替代真实页面。

## Review Focus

1. 项目 Action Queue 必须先按 `projectId` 过滤再应用 `limit`；加载错误不能显示成空状态。由 Task 1 的单元/API 测试覆盖。
2. 重复用例链接、失效用例 ID、缺失/未知状态和草稿混合时，覆盖主状态及异常计数必须遵守 spec 的优先级。由 Task 2 的纯函数单元测试覆盖。
3. 旧 Action Queue 目标 `overview`、`qualityTasks`、`milestones`、`gates` 必须落到新分区并定位实体；工作流目标仍打开 DSH 对话。由 Task 3 的浏览器流程覆盖。
4. 长验收标准、长步骤、空列表及窄屏追溯卡片不能横向溢出或隐藏关键内容。由 Task 4 和 Task 7 的浏览器验证覆盖。
5. 从看板打开详情、从抽屉进入完整详情、关闭预览和返回来源视图时，入口和滚动上下文保持正确。由 Task 3 和 Task 7 的浏览器流程覆盖。

---

## File Map

- `server/action-queue.js` — 给 `readActionQueue` 增加可选项目过滤，沿用现有事项构造与排序。
- `server/routes.js` — 解析并校验现有 `/api/action-queue` 的 `projectId` 查询参数。
- `test/unit/action-queue.test.js`、`test/unit/http-api.test.js` — 覆盖项目过滤、先过滤后限量和 API 参数边界。
- `public/project-detail-model.js` — 新增无 DOM 依赖的需求覆盖汇总函数，供页面和单元测试共用。
- `test/unit/project-detail-model.test.js` — 覆盖覆盖状态优先级、未知状态、失效链接和重复链接。
- `public/index.html` — 调整项目详情页头部、六分区导航、主内容区和快速预览入口结构。
- `public/app.js` — 管理详情分区、任务选择、Action Queue 加载、旧目标映射、表格/列表渲染和既有操作。
- `public/i18n.js` — 为六个分区、覆盖状态、异常计数、空/错误状态添加中英文文案。
- `public/style.css` — 移除详情主内容区的浮层卡片感，设置桌面工作区、矩阵和窄屏布局。
- `test/e2e/project-detail.spec.js` — 新增完整详情、项目 Action Queue、矩阵展开与响应式主路径测试。
- `test/e2e/board.spec.js` — 将滚动回归改为验证页面级滚动，并继续验证预览与返回。
- `test/e2e/quality-task.spec.js`、`test/e2e/quality-gate.spec.js` — 更新质量门禁/证据内容迁移后的导航断言。
- `test/e2e/native-execution-action-desk.spec.js`、`test/e2e/test-execution.spec.js`、`test/e2e/regression.spec.js` — 保持执行、Action Queue、回归流程在新质量任务分区可用。

## Task 1: 为 Action Queue 增加项目范围查询

**Files:**
- Modify: `server/action-queue.js`
- Modify: `server/routes.js`
- Test: `test/unit/action-queue.test.js`
- Test: `test/unit/http-api.test.js`

**Interface:**
- Add optional `projectId` to `readActionQueue(storeLike, { limit, projectId, listProjects })`.
- Support `GET /api/action-queue?projectId=<id>&limit=<1..50>` with the existing `{ ok, items, generatedAt }` response shape.
- Filter projects before `buildActionQueue` sorts and applies `limit`; leave the unfiltered endpoint behavior unchanged.

- [x] **Step 1: Add failing unit and HTTP API cases**

  Add `readActionQueue filters by project before applying the limit` with one higher-priority foreign-project action and one lower-priority target-project action at `limit: 1`; add `GET /api/action-queue scopes results by projectId` with two projects; add `GET /api/action-queue rejects malformed projectId` for an empty and over-128-character value; retain the existing no-filter response assertion.

- [x] **Step 2: Run the targeted existing unit/API suite and confirm the new cases fail**

  Run: `npm run test:unit`
  Expected: only the newly added project-filter assertions fail; current global Action Queue assertions still pass.

- [x] **Step 3: Implement the optional filter**

  Validate the query parameter in `server/routes.js`. Pass it into `readActionQueue`; filter `listProjects()` by exact project ID before calling `buildActionQueue` so existing priority and tie-break sorting stays authoritative.

- [x] **Step 4: Run unit/API tests**

  Run: `npm run test:unit`
  Expected: PASS, including existing global ordering, legacy reminders, and Action Queue source error tests.

## Task 2: Add a testable requirement coverage projection

**Files:**
- Create: `public/project-detail-model.js`
- Create: `test/unit/project-detail-model.test.js`

**Interface:**
- Export `summarizeRequirementCoverage(requirement, testcases)` returning `{ state, cases, counts }`.
- `state` is one of `uncovered`, `needs-check`, `review-pending`, or `reviewed`.
- `cases` is `Array<{ testcase, purposes: string[] }>` with unique resolved testcases and all associated `purpose` values preserved.
- `counts` is `{ valid, draft, reviewed, executed, unknown, brokenLinks }`; case-state counts and `valid` count unique testcase IDs, while `brokenLinks` counts each unresolved link record.

- [x] **Step 1: Write failing tests for the coverage projection**

  Add `reports uncovered and dangling links`, `deduplicates testcase IDs and keeps all purposes`, `needs-check takes precedence over draft and reviewed cases`, and `reports review-pending or reviewed for valid statuses`. Assert the full `{ state, cases, counts }` result for no links, duplicate links, dangling IDs, missing/unknown status, one draft among reviewed cases, all reviewed, and all executed.

- [x] **Step 2: Run the new test file and confirm the expected failures**

  Run: `node --test test/unit/project-detail-model.test.js`
  Expected: FAIL because `public/project-detail-model.js` does not exist yet.

- [x] **Step 3: Implement `summarizeRequirementCoverage`**

  Resolve valid links against testcase IDs; count each testcase ID once while retaining every non-empty verification purpose. Apply this precedence: any dangling relation or unknown/missing status → `needs-check`; else no valid cases → `uncovered`; else any draft → `review-pending`; else → `reviewed`.

- [x] **Step 4: Run the new unit tests**

  Run: `node --test test/unit/project-detail-model.test.js`
  Expected: PASS for all states, count rules, and mixed anomaly cases.

## Task 3: Replace the detail shell with the six-section project workspace

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/style.css`
- Test: `test/e2e/project-detail.spec.js`
- Test: `test/e2e/board.spec.js`

**Interfaces:**
- Use section keys `overview`, `traceability`, `qualityTasks`, `defectsRisks`, `delivery`, and `activity`.
- Map existing action target tabs: `overview → overview`, `qualityTasks → qualityTasks`, `milestones → activity`, `gates → delivery`.
- Keep `#view-project-detail`, `#project-detail-tabs`, `#project-detail-body`, `data-detail-tab="qualityTasks"`, and drawer CTA selectors stable where practical so existing feature tests keep targeting real user UI.

- [x] **Step 1: Add failing browser flows for full-page entry, scoped overview, and context return**

  In `test/e2e/project-detail.spec.js`, add `quick preview opens the full workspace and return restores the board`, `overview displays only project-scoped Action Queue items`, and `legacy action targets map to the corresponding workspace sections`. Use the seeded project that has Action Queue items and assert its overview IDs match `GET /api/action-queue?projectId=<id>&limit=50`, with no other project's items. Cover `qualityTasks`, `milestones`, `gates`, and assistant workflow target mapping. Task 1's API test covers cross-project priority and filter-before-limit behavior.

- [x] **Step 2: Run the focused browser spec and confirm it fails on old navigation/overview behavior**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js`
  Expected: FAIL on the new section and scoped-overview assertions.

- [x] **Step 3: Build the page shell and section navigation**

  Replace the duplicated ten-tab full-detail navigation with six sections. Keep overview project editing, assistant policy, project files, new DSH chat, and confirmed delete actions reachable. Make the page occupy the application content area rather than an inset rounded card with nested scrolling.

- [x] **Step 4: Connect the overview to the project-scoped Action Queue**

  Load `/api/action-queue?projectId=<id>&limit=50`. Show the highest-priority five actionable/blocked items first, expose the rest through expansion, keep `in_progress` executions in a separate monitoring group, and distinguish loading/error from a successful empty result. Reuse existing action item targets and the Task 3 legacy target map.

- [x] **Step 5: Run the focused browser spec**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js`
  Expected: PASS for entry, preview CTA, overview actions, and navigation target mapping.

## Task 4: Implement the requirement–testcase traceability matrix

**Files:**
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/style.css`
- Test: `test/e2e/project-detail.spec.js`
- Uses: `public/project-detail-model.js`

**Interface:**
- Render one requirement row with title/key, full acceptance text, linked testcase count/status distribution, coverage state, and risk/priority.
- Expand a requirement inline to show each unique linked testcase and all verification purposes; expand a testcase to show preconditions, steps, expected result, kind, priority, risks, and testcase status control.
- Keep unlinked testcases in a separate list at the end of the section.

- [x] **Step 1: Add E2E cases for the matrix's sample-data main path and expansion**

  Add `expands linked cases from seeded requirements`, `filters requirements by text and coverage`, and `shows unlinked cases separately`. Use the seeded sample project's linked requirements and cases to cover the rendered main path, search/filter, inline expansion, and preserved expansion state after refresh. The model's no-coverage, pending-review, reviewed, stale-link, unknown-status, and duplicate-link combinations are covered by Task 2 unit tests because the current REST API does not create arbitrary requirement-link fixtures.

- [x] **Step 2: Run the focused browser spec and confirm the new matrix assertions fail**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js`
  Expected: FAIL because the old page renders separate text lists.

- [x] **Step 3: Render the table and inline detail states**

  Consume `summarizeRequirementCoverage`; do not infer per-case execution outcomes from project TestRuns. Show “暂无逐用例执行结果” unless a source already provides a case-level result. Keep all verification purposes and full long-form acceptance/steps readable.

- [x] **Step 4: Add search, coverage filters, and responsive card rendering**

  Filters are `全部`, `无覆盖`, `待评审`, `已评审覆盖`, and `需核对`. At narrow widths render requirement cards with the same content order, and keep empty-filter results distinct from projects with no requirements.

- [x] **Step 5: Run model and focused browser tests**

  Run: `node --test test/unit/project-detail-model.test.js`
  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js`
  Expected: PASS for projection rules, matrix expansion, status controls, and filter behavior.

## Task 5: Move quality tasks, plans, and execution into the task workflow

**Files:**
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/style.css`
- Test: `test/e2e/quality-task.spec.js`
- Test: `test/e2e/native-execution-action-desk.spec.js`
- Test: `test/e2e/test-execution.spec.js`
- Test: `test/e2e/regression.spec.js`

- [x] **Step 1: Update browser assertions for the new task and execution layout**

  Keep existing create-task, Host preview/confirm/cancel/retry, local run, plan, and regression behaviors; assert their new locations and that all legacy project Action Queue items still open the right task context. Move the quality-gate/evidence placement assertions out of `quality-task.spec.js`; Task 6 adds those assertions to the delivery section tests.

- [x] **Step 2: Run the focused quality browser specs and confirm new task-layout assertions fail**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/quality-task.spec.js test/e2e/native-execution-action-desk.spec.js test/e2e/test-execution.spec.js test/e2e/regression.spec.js`
  Expected: new task-list/detail placement assertions fail while existing operations remain bounded to their current API contracts. Gate/evidence placement assertions have already been moved to Task 6's delivery tests.

- [x] **Step 3: Render tasks by real stage and attention signal**

  Put tasks with an Action Queue confirmation item first, then list other tasks by `updatedAt` descending. Show actual `intake`/`confirmation` values; do not invent in-progress or completed task states.

- [x] **Step 4: Add task selection and preserve all execution controls**

  Selecting a task shows its acceptance criteria, risks, scope, sources, decisions, plans, matching execution profiles, Host executions, TestRuns, and related evidence. Keep project-level/unassigned runs or analyses visible in a separate “项目级记录” list. Preserve preview confirmation and existing server mutations.

- [x] **Step 5: Run the focused quality browser specs**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/quality-task.spec.js test/e2e/native-execution-action-desk.spec.js test/e2e/test-execution.spec.js test/e2e/regression.spec.js`
  Expected: PASS for task creation/reload, plan execution, evidence, Host safety, retry/cancel, and regression navigation.

## Task 6: Rehome defects, evidence, delivery, and project records

**Files:**
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/style.css`
- Test: `test/e2e/quality-gate.spec.js`
- Test: `test/e2e/project-detail.spec.js`
- Test: `test/e2e/regression.spec.js`

- [x] **Step 1: Update failing browser assertions for gate and evidence placement**

  Assert that gate summary/decisions, reports, evidence bundle state and verified item open/download actions are in `delivery`; defects and quality-task risks are in `defectsRisks`; milestones/events, recent materials, stage history, knowledge and minutes remain accessible in `activity`.

- [x] **Step 2: Run the focused gate and detail specs and confirm the new section assertions fail**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/quality-gate.spec.js test/e2e/project-detail.spec.js`
  Expected: FAIL only on the new section placement and empty/error cases.

- [x] **Step 3: Move existing renderers without changing their mutation contracts**

  Keep defect status updates, gate approval confirmation, report version viewing, evidence verification state and downloads bound to existing API operations. Put future milestones/events in a separate schedule list from past materials/history. Label materials as recent activity (not complete audit history); link an item only when its entity can be resolved.

- [x] **Step 4: Preserve and test all empty/loading/error states**

  Distinguish no defects, no gates, no reports, no evidence, no schedule, no recent activity, and a failed/stale Action Queue response. Do not hide knowledge or minutes because the six-entry materials list is full.

- [x] **Step 5: Run the focused gate and detail specs**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/quality-gate.spec.js test/e2e/project-detail.spec.js`
  Expected: PASS for gate decisions, reports/evidence access, defect status, schedule/history mapping, and empty/error states.

## Task 7: Finish responsive behavior and run the complete verification set

**Files:**
- Modify: `public/style.css`
- Modify: `public/i18n.js`
- Modify: `test/e2e/project-detail.spec.js`
- Modify: `test/e2e/board.spec.js`
- Modify: `test/e2e/quality-task.spec.js`
- Modify: `test/e2e/quality-gate.spec.js`

- [x] **Step 1: Add failing responsive and page-scroll assertions**

  Add `keeps the project detail usable at 1440, 1024, 768, and 390 pixels` and `keeps keyboard focus visible while expanding a requirement`. Assert full-detail page has no nested floating-card shell, nav remains usable, long content wraps, table/cards do not overflow, controls remain reachable, and the complete project page scrolls to overview actions. Update the existing board regression that currently expects an internal detail-body scroll container.

- [x] **Step 2: Run focused browser tests and confirm responsive assertions fail on the old CSS**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js test/e2e/board.spec.js`
  Expected: FAIL on the current inset panel and mobile matrix layout.

- [x] **Step 3: Apply desktop, narrow-screen, and accessibility refinements**

  Make the page shell use the application content area, switch the left nav to a horizontally scrollable section selector at narrow widths, convert matrix rows into expandable cards, preserve visible keyboard focus and named expand/collapse controls, and ensure status does not rely on color alone. Keep Chinese/English section structure aligned.

- [x] **Step 4: Run focused detail and feature specs**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js test/e2e/board.spec.js test/e2e/quality-task.spec.js test/e2e/quality-gate.spec.js test/e2e/native-execution-action-desk.spec.js test/e2e/test-execution.spec.js test/e2e/regression.spec.js`
  Expected: PASS with no horizontal page overflow at 390px and usable content at 1440px, 1024px, 768px, and 390px.

- [x] **Step 5: Run required project verification and inspect the final diff**

  Run: `npm run test:unit`
  Run: `npm run test:e2e`
  Run: `npm test`
  Run: `git diff --check`
  Run: `git status --short`
  Expected: all tests pass, no whitespace errors, and working-tree changes are limited to the design/plan documents plus the planned project-detail implementation and test files.

## Task 8: Resolve final review findings

**Review input:** final whole-branch review of the implementation snapshot found six important gaps and one activity-history behavior requiring an explicit decision. Keep this fix pass bounded to these findings.

**Files:**
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/index.html`
- Modify: `public/style.css`
- Modify: `public/project-detail-model.js`
- Test: `test/unit/project-detail-model.test.js`
- Test: `test/e2e/quality-gate.spec.js`
- Test: `test/e2e/quality-task.spec.js`
- Test: `test/e2e/project-detail.spec.js`
- Test: `test/e2e/regression.spec.js`

- [x] **Step 1: Add failing tests for final review findings**

  Cover computed gates separately from human approvals; task-specific run, analysis, and regression actions plus project-level analysis promotion; out-of-order delivery responses after task/project switches; long evidence filenames at 390px; valid linked cases with unknown status; visible project identity and load-error retry/back behavior; and retained past events/completed milestones.

- [x] **Step 2: Run the focused tests and confirm each new assertion fails**

  Run: `node --test test/unit/project-detail-model.test.js`
  Run: `npx playwright test --config=test/playwright.config.js test/e2e/quality-gate.spec.js test/e2e/quality-task.spec.js test/e2e/project-detail.spec.js test/e2e/regression.spec.js`
  Expected: only assertions that expose the reviewed gaps fail.

- [x] **Step 3: Fix the reviewed behavior in one pass**

  Render computed verdicts separately from human decisions; scope task actions and keep project-level actions available; guard async delivery results by project/task/render context; wrap long evidence names; count every unique resolved testcase as valid while tracking unknown status separately; show the project title and a safe loading/error/retry state; retain past schedule records in an activity archive.

- [x] **Step 4: Re-run focused tests**

  Run: `node --test test/unit/project-detail-model.test.js`
  Run: `npx playwright test --config=test/playwright.config.js test/e2e/quality-gate.spec.js test/e2e/quality-task.spec.js test/e2e/project-detail.spec.js test/e2e/regression.spec.js`
  Expected: PASS for all final review regression cases.

- [x] **Step 5: Re-run the complete verification set**

  Run: `npm run test:unit`
  Run: `npm run test:e2e`
  Run: `npm test`
  Run: `git diff --check`
  Run: `git status --short`
  Expected: all tests pass, no whitespace errors, and no unrelated artifacts.

## Task 9: Close remaining project-detail review gaps

**Review input:** whole-change review found overview data/actions incomplete, weak traceability empty recovery, no route from a case to run records, generic loading feedback, open defects not prioritized, missing owner identity, and mobile actions/navigation that do not match the design.

**Files:**
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/index.html`
- Modify: `public/style.css`
- Test: `test/e2e/project-detail.spec.js`

- [x] **Step 1: Add failing browser regressions for the reviewed gaps**

  Cover scoped overview counts and links for requirements, open defects, verified evidence, and pending human gates; latest quality signal and nearest open milestone; defects shown open-first; active query/filter context and a one-click clear action; a per-case route to project runs; project identity plus skeleton while a detail request is delayed; owner in the project header; one mobile operations menu and horizontally scrollable section navigation.

- [x] **Step 2: Run the focused browser spec and confirm the new assertions fail**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js`
  Expected: failures correspond to the new overview, empty-state, navigation, loading, owner, sorting, and mobile assertions.

- [x] **Step 3: Implement overview summaries, scoped jump targets, and open-first defects**

  Derive counts only from existing project data: open defects exclude `closed`; verified evidence requires `state === 'ready' && integrity === 'verified'`; pending approvals exclude computed gates. Add a recent quality signal and next open milestone summary when source records exist. Metrics navigate to the relevant section and set suitable filters. Add a defect status filter and sort open records ahead of closed records.

- [x] **Step 4: Add traceability recovery and project-run navigation**

  Show the active search/filter conditions when there are no matching requirements and provide a clear action. In expanded testcase details, keep the no-per-case-result statement and link to the project run summary in Quality Tasks; do not infer case outcomes.

- [x] **Step 5: Improve loading identity and mobile controls**

  Use the board card to identify a project while its detail request is pending, render skeleton content with `aria-busy`, add the owner to project metadata, collapse chat/folder actions into one mobile menu, and make the section selector horizontally scrollable at narrow widths.

- [x] **Step 6: Run focused and required verification**

  Run: `npx playwright test --config=test/playwright.config.js test/e2e/project-detail.spec.js`
  Run: `npm run test:unit`
  Run: `npm run test:e2e`
  Run: `npm test`
  Run: `git diff --check`
  Run: `git status --short`
  Expected: all browser/unit suites pass, diff has no whitespace errors, and no test artifacts are left in the worktree.

  Result: focused project-detail E2E 18/18; `npm run test:unit` 310/310; `npm run test:e2e` 93/93; `npm test` both suites pass; `git diff --check` clean; generated Playwright results and temporary dependency symlink removed.
