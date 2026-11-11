# Workbench Typography Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align workbench typography with its documented 28/18/16/14px role scale, 400/500/600 weights, and neutral Chinese tracking.

**Architecture:** Keep the existing host/system sans family and CSS role tokens. Replace conflicting end-of-file typography override blocks with one clear role layer, preserving compact code and numeric treatments where they carry meaning.

**Tech Stack:** Native CSS, Playwright E2E, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-11-workbench-typography-refinement-design.md`

## Global Constraints

- Keep `--dsw-font-family` as the host preference and the current platform sans stack as fallback.
- Keep ordinary prose readable at 16px, with 14px supporting copy and a 12px compact role only for dense metadata.
- Prefer shared typography tokens and role selectors over component-specific pixel values.
- Preserve numeric tabular alignment where it exists.
- Keep ESM, Node 18+, and the existing zero production dependency constraint.

## Review Focus

- Chinese page headings must have neutral tracking — Playwright checks computed `letterSpacing`.
- Body, page title, section title, and supporting label sizes must match the role scale — Playwright checks computed sizes.
- Body, controls, and headings must use only 400/500/600 weights — Playwright checks computed weights.
- Typography must remain the same in dark theme — the same Playwright assertions run after switching themes.
- The 390px layout must remain free of horizontal overflow — Playwright checks document width.

---

### Task 1: Normalize workbench typography

**Files:**
- Modify: `test/e2e/dashboard.spec.js`
- Modify: `public/style.css`
- Create: `docs/superpowers/specs/2026-11-11-workbench-typography-refinement-design.md`

**Interfaces:**
- Consumes: existing `--text-page`, `--text-section`, `--text-body`, `--text-label`, and `--font-ui` tokens.
- Produces: one final typography role layer in `public/style.css`, with role weights 400/500/600 and neutral tracking except numeric data.

- [x] **Step 1: Add a failing Playwright assertion** for body, page title, section title, supporting metadata, control, Chinese title tracking, dark theme, and 390px overflow.
- [x] **Step 2: Run the focused dashboard E2E test** and confirm it fails on the current computed typography.
- [x] **Step 3: Consolidate the duplicate typography override blocks** in `public/style.css` into one role layer; keep the DSH/system family and only intentional numeric/code compact treatments.
- [x] **Step 4: Run the focused E2E test and review desktop/mobile light/dark dashboard and assistant renderings**; confirm the type roles remain readable and do not overflow.

### Task 2: Make the Skills API test independent of local repositories

**Files:**
- Modify: `test/unit/http-api.test.js`
- Modify: `test/playwright.config.js`
- Create: `test/fixtures/qa-skills/skills/{zh,en}/testing-types/{requirements-analysis,test-case-writing,api-test-bruno,api-test-pytest}/SKILL.md`

**Interfaces:**
- Consumes: `QA_SKILLS_ROOT`, `QA_SKILLS_SITE_ROOT`, and the existing temporary `DSH_SKILLS_DIR` setup.
- Produces: isolated local catalog fixtures for the Skills API and E2E tests.

- [x] **Step 1: Reproduce the four failing Skills API assertions** in `test/unit/http-api.test.js` and the empty E2E Skill page when the local repositories are absent.
- [x] **Step 2: Set temporary skill and site roots before importing the unit-test server, and configure the Playwright server to use repository-local fixture Skills.**
- [x] **Step 3: Run `node --test --test-concurrency=1 test/unit/http-api.test.js`**; confirm all API assertions pass and temporary roots are removed by teardown.
- [x] **Step 4: Run `npm test` and `git diff --check`**; review the scoped typography and test-fixture diff, leaving unrelated workspace changes untouched.
- [x] **Step 5: Stage only the files listed in Tasks 1–2 and commit them** as `fix: unify workbench typography and isolate skill tests`.
