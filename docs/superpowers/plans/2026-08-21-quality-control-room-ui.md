# Quality Control Room UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the dsh-qa workbench with the approved Quality Control Room visual direction while preserving its four theme modes and existing business flows.

**Architecture:** Add a root `DESIGN.md` as the normative visual identity, then refine the existing native HTML/CSS/JS in place. Keep theme selection on `body[data-theme]`, but make shared semantic tokens explicit so components do not depend on hard-coded theme colors.

**Tech Stack:** Node.js ESM, native HTML/CSS/JavaScript, Node `node:test`, Playwright.

**Spec:** `DESIGN.md`

## Global Constraints

- Keep ESM, Node 18+ and zero production dependencies.
- Do not change backend APIs or data models.
- Preserve `dashboard`, `terminal`, `minimal`, and `cyber` theme selection.
- Keep bilingual UI behavior and existing DSH embedded/standalone boundaries.
- Run relevant tests, `npm test`, and `git diff --check` before delivery.

### Task 1: Publish the visual system

**Files:**
- Create: `DESIGN.md`

- [x] Write Google Labs-compatible YAML tokens for shared semantics, theme variants, typography, spacing, shapes, and core components.
- [x] Add the required rationale sections in canonical order and document theme invariants and accessibility rules.
- [x] Check the document for placeholders, broken token references, and section-order violations.

### Task 2: Refine the UI token layer and hierarchy

**Files:**
- Modify: `public/style.css`

- [x] Add semantic CSS variables for page, panel, text, action, and status roles.
- [x] Preserve each existing theme while mapping its surface, accent, radius, and depth values to the semantic roles.
- [x] Improve dashboard hierarchy, focus states, status contrast, and responsive layout without changing DOM contracts used by `public/app.js`.

### Task 3: Improve high-frequency interaction feedback

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/i18n.js`

- [x] Make the dashboard primary actions and risk items expose clearer action affordances.
- [x] Improve assistant empty, connection, sending, and error states using existing state and toast mechanisms.
- [x] Keep theme picker behavior intact and make its copy explain that themes change appearance only.

### Task 4: Verify the delivered experience

**Files:**
- Test: existing `test/unit/**` and `test/e2e/**`

- [x] Run unit tests.
- [x] Run Playwright E2E tests.
- [x] Run aggregate unit/API + browser checks and `git diff --check` (browser check used free port 8900 because 8899 was occupied).
- [x] Scan changed docs and source for unfinished placeholder text.
