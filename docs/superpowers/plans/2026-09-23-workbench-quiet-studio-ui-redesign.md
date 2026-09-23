# Quiet Studio UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 dsh-qa QA 工作台实现为已确认的 Quiet Studio / Focus Canvas 视觉系统，同时修复版本元数据双语、排序、失败状态和弹窗可访问性契约，不改变 DSH 业务能力。

**Architecture:** 保持原生 HTML/CSS/ESM 前端和 Node 原生 HTTP 服务。服务端负责生成规范化、可排序的 release 元数据；前端复用现有 DOM id、`/api/board`、`/api/app-info` 和 DSH 事件/会话入口，集中改造 modal、版本状态、固定视觉 token 和响应式布局。

**Tech Stack:** Node.js ESM、原生 HTML、CSS custom properties、浏览器端原生 JavaScript、Node `node:test`、Playwright Chromium。

**Spec:** `docs/superpowers/specs/2026-09-23-workbench-quiet-studio-ui-redesign-design.md`

## Global Constraints

- 保持 ESM、Node 18+ 和现有零生产依赖约束。
- 指标严格映射 `GET /api/board` 响应中的 `stats.activeProjects`、`dueSoonMilestones`、`overdueMilestones` 和 `openDefects`。
- 中文只显示 `summaryZh`，英文只显示 `summaryEn`；缺失语言显示本地化提示，不跨语言 fallback。
- release 按 `publishedAt` 降序排序，同时间按 semver 降序；前端不重新排序。
- 设置弹窗只保留语言和关于；删除主题选择、`data-theme` 和工作区宽度预设，但保留直接拖拽/收起面板。
- 保留现有 DOM id、项目/对话/看板/日历/Skill/项目详情和 DSH 会话行为。
- 不提交 `.superpowers/` 预览产物、临时数据、Playwright report、trace 或 screenshot 产物。
- 每个行为变更先写失败测试并观察 RED，再写最小实现；任务完成前运行相关测试、`npm test` 和 `git diff --check`。

## Review Focus

- 缺少中文或英文摘要：用户看到当前语言的缺失提示，而不是另一语言文本；由 Task 1 和 Task 2 固定。
- 发布时间与版本号顺序不一致：版本历史仍按发布时间稳定倒序；由 Task 1 固定。
- `api/app-info` 请求失败：版本弹窗显示 error 和重试，不停留在 loading；由 Task 2 固定。
- 小屏和图标导航：关键入口、最近项目、设置和版本入口仍可达且无横向滚动；由 Task 4 固定。
- 旧主题/布局 localStorage：旧主题不影响 Quiet Studio，直接拖拽/收起布局状态仍保留；由 Task 3/4 固定。

## File Map

- `server/app-info.js`：规范化 release 字段、生成 `publishedAt`、按发布时间排序、保持双语摘要独立。
- `test/unit/app-info.test.js`：纯 release 合并和排序契约测试。
- `test/unit/http-api.test.js`：`/api/app-info` 对外字段和排序回归测试。
- `public/app.js`：版本加载状态、双语摘要选择、可访问 modal、固定布局默认值和导航辅助文案。
- `public/i18n.js`：设置、版本状态、缺失摘要、重试和 modal aria 文案。
- `public/index.html`：移除 `data-theme`，保留稳定 DOM id，补充图标导航可访问名称。
- `public/style.css`：Quiet Studio token、Focus Canvas、modal/drawer、导航、核心页面和响应式规则；删除主题变体 CSS。
- `test/e2e/dashboard.spec.js`：设置、版本、双语、错误重试、焦点和响应式首页验收。
- `test/e2e/assistant.spec.js`：语言切换、窄导航和对话页布局回归。

## Task 1: Release metadata contract

**Files:**
- Modify: `server/app-info.js`
- Create: `test/unit/app-info.test.js`
- Modify: `test/unit/http-api.test.js`

**Interfaces:**
- Produces `mergeRelease(map, release)` that never fills one language from the other.
- Produces `sortReleases(releases)` using `publishedAt` descending, then semver descending.
- Every release returned by `getAppInfo()` has `version`, `date`, `publishedAt`, `summaryZh`, `summaryEn`, and `detailUrl` keys.

- [ ] **Step 1: Write the failing pure-contract tests.**

Add tests that import the release helpers and assert:

```js
test('release merge keeps missing language summaries empty', () => {
  const map = new Map();
  mergeRelease(map, { version: '0.5.2', summaryZh: '中文摘要', summaryEn: '' });
  assert.equal(map.get('0.5.2').summaryZh, '中文摘要');
  assert.equal(map.get('0.5.2').summaryEn, '');
});

test('release sorting follows publication time before version', () => {
  const sorted = sortReleases([
    { version: '0.5.2', publishedAt: '2026-09-21T00:00:00.000Z' },
    { version: '0.5.1', publishedAt: '2026-09-23T00:00:00.000Z' },
  ]);
  assert.deepEqual(sorted.map((item) => item.version), ['0.5.1', '0.5.2']);
});
```

- [ ] **Step 2: Run the focused test and verify the expected RED.**

Run: `node --test test/unit/app-info.test.js`

Expected: FAIL because the helpers are not exported and the current merge/sort behavior falls back across languages and sorts only by version.

- [ ] **Step 3: Implement the smallest metadata contract.**

In `server/app-info.js`:

1. Export `mergeRelease` and add `sortReleases`.
2. Normalize `publishedAt` from GitHub `published_at`; for a CHANGELOG-only date use `${date}T00:00:00.000Z`.
3. Preserve `summaryZh` and `summaryEn` independently. A GitHub body without a Chinese section may populate `summaryEn`, but must leave `summaryZh` empty.
4. Make `readLocalReleases()` and `buildAppInfo()` call `sortReleases`.
5. Keep `date` as the display-only `YYYY-MM-DD` value and preserve existing metadata URLs.

- [ ] **Step 4: Update the API regression assertions.**

Extend the existing `/api/app-info` test to assert `publishedAt` is an ISO timestamp, both summary keys exist, the first release is newest by publication time, and a later version number does not outrank a newer publication time.

- [ ] **Step 5: Run the focused unit/API tests.**

Run: `node --test test/unit/app-info.test.js test/unit/http-api.test.js`

Expected: all focused tests pass and existing API assertions remain green.

- [ ] **Step 6: Commit the scoped metadata change.**

Stage only `server/app-info.js`, `test/unit/app-info.test.js`, and `test/unit/http-api.test.js`; commit as `fix: make release metadata bilingual and time ordered`.

## Task 2: Settings, version history, and language behavior

**Files:**
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `test/e2e/dashboard.spec.js`

**Interfaces:**
- Consumes the Task 1 release shape.
- `state.appInfoStatus` is one of `idle`, `loading`, `ready`, `empty`, or `error`.
- `renderReleasePage()` renders the API order without client-side sorting.
- `localizedReleaseSummary(release)` returns only the active language field or a localized missing-summary message.

- [ ] **Step 1: Add failing browser assertions for locale isolation and errors.**

Add tests that route `/api/app-info` to deterministic release fixtures and assert:

```js
await page.locator('#app-version').click();
await expect(page.locator('#release-list .release-row').first()).toContainText('中文摘要');
await expect(page.locator('#release-list .release-row').first()).not.toContainText('English summary');

await page.locator('[data-settings-lang="en"]').click();
await expect(page.locator('#release-list .release-row').first()).toContainText('English summary');
await expect(page.locator('#release-list .release-row').first()).not.toContainText('中文摘要');
```

Add a second test that returns HTTP 503 for the first `/api/app-info` request, expects a localized error state and retry button, then returns a valid payload and expects the release list after retry.

- [ ] **Step 2: Run the focused E2E tests and verify RED.**

Run: `npm run test:e2e -- test/e2e/dashboard.spec.js`

Expected: the new assertions fail because the current renderer falls back across languages and has no explicit error/retry state.

- [ ] **Step 3: Add i18n keys and release state handling.**

Add Chinese and English keys for:

- release loading, empty, error, retry, missing Chinese summary, missing English summary, close, previous, and next;
- modal close aria labels;
- compact navigation tooltips where the current text is not already covered by `data-i18n`.

Update `loadAppInfo()` and `openReleaseHistory()` so failures set `state.appInfoStatus = 'error'`, preserve the modal, and expose retry without treating the response as empty. `renderReleasePage()` must render `ready`, `empty`, and `error` separately and use `release.publishedAt` order from the server.

- [ ] **Step 4: Remove cross-language frontend fallbacks.**

Replace `(release.summaryEn || release.summaryZh)` and its Chinese equivalent with `localizedReleaseSummary(release)`. The function must never return the other language field.

- [ ] **Step 5: Verify the version reminder contract.**

Keep `dsh-qa-release-seen` keyed by `latestVersion`; clicking the version marks only the loaded latest version as seen, hides the red `*`, and still opens the modal. Add an E2E assertion that a newer `latestVersion` makes the indicator visible again.

- [ ] **Step 6: Run the focused dashboard E2E suite.**

Run: `npm run test:e2e -- test/e2e/dashboard.spec.js`

Expected: settings, direct website URL, version indicator, bilingual release rows, pagination, empty/error/retry states all pass.

- [ ] **Step 7: Commit the scoped settings/version behavior.**

Stage only `public/app.js`, `public/i18n.js`, and `test/e2e/dashboard.spec.js`; commit as `feat: harden bilingual settings and release history`.

## Task 3: Accessible modal shell and fixed Quiet Studio shell

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/style.css`
- Modify: `test/e2e/dashboard.spec.js`

**Interfaces:**
- `modalShell(title, subtitle, body, wide)` produces a dialog with stable title id, close button, `aria-modal`, and focus lifecycle.
- `closeModal()` restores the previously focused trigger and removes the modal-open body state.
- `body` has no `data-theme` attribute after initialization.

- [ ] **Step 1: Add failing accessibility assertions.**

Extend dashboard E2E with:

```js
await page.locator('#btn-settings').focus();
await page.locator('#btn-settings').click();
await expect(page.locator('#settings-modal')).toHaveAttribute('role', 'dialog');
await expect(page.locator('#settings-modal')).toHaveAttribute('aria-modal', 'true');
await expect(page.locator('#settings-modal')).toContainText('关于');
await page.keyboard.press('Escape');
await expect(page.locator('#btn-settings')).toBeFocused();
```

Also assert that the document body has no `data-theme` attribute and that the existing splitter buttons still exist.

- [ ] **Step 2: Run the focused E2E test and verify RED.**

Run: `npm run test:e2e -- test/e2e/dashboard.spec.js`

Expected: the current modal has no dialog semantics/focus restoration and `body` still declares `data-theme="dashboard"`.

- [ ] **Step 3: Implement the shared modal lifecycle.**

Track the trigger before opening; generate a unique title id; add a close button with localized aria text; set dialog attributes; focus the first eligible control; close on Escape; restore focus; lock body scroll; and make backdrop clicks an auxiliary close path. Keep existing ids such as `#st-close`, `#release-close`, `#nc-cancel`, and other modal-specific buttons.

- [ ] **Step 4: Remove theme runtime state without removing direct layout controls.**

Remove `data-theme="dashboard"` from `public/index.html`, keep `DEFAULT_LAYOUT`, `LAYOUT_RANGES`, splitter ids, and collapse buttons, and make old theme localStorage values inert. Add accessible labels/titles to icon-only navigation and collapse controls.

- [ ] **Step 5: Run the focused accessibility suite.**

Run: `npm run test:e2e -- test/e2e/dashboard.spec.js`

Expected: modal semantics, focus restoration, Escape behavior, theme removal, and splitter preservation pass.

- [ ] **Step 6: Commit the scoped modal/shell behavior.**

Stage only `public/app.js`, `public/index.html`, `public/style.css`, and the test changes; commit as `feat: add accessible quiet studio shell`.

## Task 4: Focus Canvas visual system and responsive pages

**Files:**
- Modify: `public/style.css`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `test/e2e/dashboard.spec.js`
- Modify: `test/e2e/assistant.spec.js`

**Interfaces:**
- Use the fixed token values from the spec: `--page #e9eded`, `--surface #ffffff`, `--ink #17212b`, `--teal #167b70`, `--amber-ink #8f4c13`, `--danger #b4232e`, and the documented radius/shadow scale.
- Preserve existing view ids and dynamic render targets: `#metric-cards`, `#dashboard-reminders`, `#mini-calendar`, `#dashboard-cases`, `#dashboard-feed`, `#chat-pane`, `#board`, and `#full-calendar`.

- [ ] **Step 1: Add failing responsive/visual smoke assertions.**

Add Playwright checks at `1280×800`, `768×900`, and `390×844` that:

1. find the four existing metric labels;
2. confirm the dashboard has no horizontal overflow;
3. confirm the settings button has a non-white foreground on a white background;
4. confirm the narrow navigation retains aria labels and the DSH chat entry remains reachable;
5. confirm the assistant page has a visible chat pane at mobile width.

- [ ] **Step 2: Run the focused responsive tests and verify RED.**

Run: `npm run test:e2e -- test/e2e/dashboard.spec.js test/e2e/assistant.spec.js`

Expected: the current dashboard geometry and theme layers do not satisfy the new narrow-rail/mobile assertions.

- [ ] **Step 3: Replace the theme layers with Quiet Studio base styles.**

In `public/style.css`:

1. define the fixed token set;
2. remove `body[data-theme="..."]` theme blocks and stale theme-only rules;
3. style the top bar, logo/version block, settings button, icon rail, surfaces, buttons, status badges, modal and drawer with thin borders and restrained shadows;
4. keep direct pane splitter/collapse behavior and visible focus rings;
5. use `prefers-reduced-motion` for all transitions.

- [ ] **Step 4: Apply Focus Canvas layout.**

Keep the existing render targets but set the visual order to title/actions → four board-backed metrics → primary attention queue → seven-day schedule → active project rows → lower-priority DSH/activity panels. Use CSS grid for desktop and explicit single-column fallbacks for tablet/mobile. Do not add a new data field for completion percentage.

- [ ] **Step 5: Apply shared styles to assistant, kanban, calendar, detail, and forms.**

Use the same surface, border, typography, status, input and button tokens. At `<768px`, the assistant project list and radar become explicit drawers/overlays; at `<480px`, release rows stack version/date, summary, and link without horizontal scrolling.

- [ ] **Step 6: Run the focused responsive tests.**

Run: `npm run test:e2e -- test/e2e/dashboard.spec.js test/e2e/assistant.spec.js`

Expected: all desktop/tablet/mobile smoke checks pass and existing page behavior remains green.

- [ ] **Step 7: Commit the scoped visual redesign.**

Stage only `public/style.css`, `public/app.js`, `public/index.html`, and the focused test files; commit as `feat: redesign workbench with quiet studio canvas`.

## Task 5: Full verification and delivery gate

**Files:**
- Modify only files identified by failing verification, if any.
- Do not stage `.superpowers/` or unrelated workspace files.

- [ ] **Step 1: Run all unit/API tests.**

Run: `npm run test:unit`

Expected: all unit/API tests pass, including release metadata, board, DSH compatibility, quality, and existing HTTP contracts.

- [ ] **Step 2: Run the full Chromium E2E suite.**

Run: `npm run test:e2e`

Expected: all existing and new browser tests pass without report/trace artifacts being staged.

- [ ] **Step 3: Run the project gate and diff checks.**

Run: `npm test` and `git diff --check`

Expected: the complete project gate passes and no whitespace errors are reported.

- [ ] **Step 4: Review the scoped diff and status.**

Run: `git diff --stat`, `git diff -- public/index.html public/style.css public/app.js public/i18n.js server/app-info.js`, and `git status --short`.

Confirm that existing user documentation changes are untouched, `.superpowers/` is not staged, and the final code matches the spec acceptance checklist.
