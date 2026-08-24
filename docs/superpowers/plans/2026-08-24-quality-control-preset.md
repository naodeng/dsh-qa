# 研发质量控制 Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个可安装的 `quality-control` DSH preset，支持 QA、Dev、BA 及其他研发角色从全流程视角输出结构化质量意见。

**Architecture:** 在现有标准 DSH 工具组合之上新增一个独立 preset 目录。角色不拆成独立 Agent，而由 persona 依据显式 `role`、`stage` 和输入 Artifact 组织视角；所有角色共享统一证据、交接、汇总和人工决策协议。

**Tech Stack:** DSH `agent.cordis.yml`、YAML preset metadata、Bash installer、Markdown design/usage docs。

**Spec:** `docs/superpowers/specs/2026-08-24-quality-control-preset-design.md`

## Global Constraints

- 保留现有 `qa` preset 及其未提交修改。
- 不复制 `awesome-qa-prompt` 或 `awesome-qa-skills` 的完整文件内容。
- 保持现有 DSH 工具组合、Node 18+、零生产依赖和用户 preset 目录结构。
- 不把静态检查、计划、角色意见或部署成功写成测试通过或可发布结论。
- 安装脚本必须支持 `--dest` 和 `--dry-run`。

---

### Task 1: 新增 quality-control preset persona

**Files:**
- Create: `preset/quality-control/agent.cordis.yml`
- Create: `preset/quality-control/preset.yml`

- [ ] **Step 1: Create the preset metadata and DSH composition**

复制现有 `preset/qa/agent.cordis.yml` 的工具组合结构，但将 persona 改为研发质量控制协议；保留 shell、filesystem、skills、goals、plan、compaction、delegation、web 和用户交互工具。

- [ ] **Step 2: Add role and stage contracts**

在 persona 中加入 BA、PM、Product、QA、Developer、Tech Lead、Automation、UX、Security、DevOps/SRE、Data、Release 角色；加入需求、技术、测试、开发、执行、缺陷回归、报告和发布阶段；要求显式角色/阶段、输入审计、来源版本、角色交接和人工决策边界。

- [ ] **Step 3: Check the preset diff**

运行 `git diff --check`，确认新 preset 不修改现有 `qa` 文件。

### Task 2: Add installer and usage documentation

**Files:**
- Create: `scripts/install-quality-control-preset.sh`
- Create: `preset/quality-control/README.md`

- [ ] **Step 1: Implement the installer**

按 `scripts/install-qa-preset.sh` 的参数约定实现默认目标 `~/.dsh/.agent-presets/quality-control`、`--dest`、`--dry-run` 和源文件检查。

- [ ] **Step 2: Document role invocation**

说明 `role`、`stage`、输入材料、全流程评审、角色汇总和证据状态的使用方式；注明该 preset 不复制完整 Skill，需通过 DSH 原生技能按需加载。

### Task 3: Validate the deliverable

**Files:**
- Test: `preset/quality-control/agent.cordis.yml`
- Test: `scripts/install-quality-control-preset.sh`

- [ ] **Step 1: Run shell and installer checks**

运行 `bash -n scripts/install-quality-control-preset.sh` 和 `scripts/install-quality-control-preset.sh --dest /tmp/dsh-quality-control-check --dry-run`。

- [ ] **Step 2: Run repository checks**

运行 `git diff --check`、相关单元测试和 `npm test`；若沙箱继续拒绝本地监听，记录 `listen EPERM`，不把环境失败归因于 preset。

- [ ] **Step 3: Review final scope**

运行 `git status --short --branch` 和 `git diff --stat`，确认只包含本次新增 preset、脚本、README、设计和计划，以及之前已有的 `qa` 修改。
