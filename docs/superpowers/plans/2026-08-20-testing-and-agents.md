# dsh-qa Testing and Agent Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository guidance, isolated unit coverage, and a Playwright E2E smoke flow for dsh-qa.

**Architecture:** Keep production code unchanged where possible. Unit tests use Node's built-in test runner against pure board projections and the store; an HTTP harness imports `startQaBench` with a temporary `QA_DATA_DIR` for API coverage. Playwright starts the CLI against another temporary data directory and exercises the real browser UI.

**Tech Stack:** Node.js 18+, ESM, `node:test`, `node:assert/strict`, `@playwright/test`.

---

### Task 1: Add project guidance and test scripts

**Files:**
- Create: `AGENTS.md`
- Modify: `package.json`
- Create: `playwright.config.js`
- Create: `.gitignore` entries for test output and local test data if missing

- [ ] **Step 1: Add `AGENTS.md`**

Document the actual directories, `npm start`, `npm run dev`, `npm run test:unit`, `npm run test:e2e`, `npm test`, temporary data/port isolation, and the requirement to run `git diff --check` plus focused tests before delivery.

- [ ] **Step 2: Add scripts and Playwright dependency**

Add `test:unit: node --test "test/unit/**/*.test.js"`, `test:e2e: playwright test`, and `test: node --test "test/unit/**/*.test.js" && playwright test`; add `@playwright/test` as a dev dependency without adding a runtime dependency.

- [ ] **Step 3: Add Playwright configuration**

Configure Chromium, `testDir: './test/e2e'`, a concise reporter, `baseURL: 'http://127.0.0.1:8899'`, and `webServer.command: 'QA_DATA_DIR=... node server/cli.js'` using a repository-local test data path that the E2E fixture removes before startup. Disable browser opening through an environment flag or add a small CLI-compatible launch option if needed.

- [ ] **Step 4: Run package metadata checks**

Run `node -e "const p=require('./package.json'); console.log(p.scripts)"` and `git diff --check`; expected output includes all three test scripts and no whitespace errors.

### Task 2: Add unit tests for board projections and store behavior

**Files:**
- Create: `test/unit/board.test.js`
- Create: `test/unit/store.test.js`

- [ ] **Step 1: Write board behavior tests**

Cover `projectCard` counts and labels, `computeStats` column totals and open-risk totals, `getSchedule` chronological ordering, and `getReminders` severity ordering for overdue milestones, pending gates, and draft test cases.

- [ ] **Step 2: Write store behavior tests**

Set `QA_DATA_DIR` before importing store modules in a child test process or use a test module that dynamically imports after setting the environment. Verify `createProject` defaults to `intake`, `transitionProject` records history, `updateProject` changes allowed fields, `addFeed` updates both global feed and project materials, and `ensureProjectWorkspace` creates the eight standard directories below the test data directory.

- [ ] **Step 3: Run focused unit tests**

Run `npm run test:unit`; expected result is PASS with no writes to the repository's normal `data/` directory.

### Task 3: Add API smoke coverage with an isolated server

**Files:**
- Create: `test/unit/http-api.test.js`
- Modify: `server/index.js` only if a small test-safe lifecycle option is required

- [ ] **Step 1: Build a temporary HTTP harness**

Create a temporary directory, set `QA_DATA_DIR` before dynamically importing `server/index.js`, call `startQaBench({ port: 0, openBrowser: false, log: () => {} })`, and close it with `closeQaBench` in teardown. Resolve the actual port from `server.address().port`.

- [ ] **Step 2: Test API behavior**

Assert `GET /api/projects` returns the seeded/empty project list, `POST /api/projects` with a title returns 200 and an `intake` project, `POST /api/projects` without a title returns 400 with the title validation message, `GET /api/board` includes the created project and stats, and an invalid transition returns 400.

- [ ] **Step 3: Run API tests and inspect isolation**

Run `node --test test/unit/http-api.test.js`; expected result is PASS and the temporary directory is removed in teardown.

### Task 4: Add Playwright E2E smoke test

**Files:**
- Create: `test/e2e/workbench.spec.js`
- Modify: `playwright.config.js` if startup configuration needs adjustment

- [ ] **Step 1: Add the real browser flow**

Open `/`, assert the workbench heading and new-project button are visible, click the new-project action, fill the project name in the modal, submit, and assert the project name appears in the project rail and board/list content.

- [ ] **Step 2: Run the E2E test**

Run `npx playwright install chromium` once when the browser is absent, then `npm run test:e2e`; expected result is one passing Chromium test and no dependency on DSH or a real API key.

- [ ] **Step 3: Validate the aggregate command**

Run `npm test` and `git diff --check`; expected result is all unit and E2E tests passing with no whitespace errors.

### Task 5: Final documentation and verification

**Files:**
- Modify: `README.md` and `README_EN.md` only if the new test commands are not already discoverable

- [ ] **Step 1: Scan for placeholders and accidental artifacts**

Run `rg -n "TBD|TODO|<[^>]+>" AGENTS.md docs/superpowers test package.json playwright.config.js` and inspect `git status --short`; remove only artifacts created by this task.

- [ ] **Step 2: Report evidence**

Record the exact unit, E2E, aggregate, and `git diff --check` commands run, distinguishing static checks from real browser execution.
