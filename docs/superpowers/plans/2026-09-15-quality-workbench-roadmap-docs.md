# QA Workbench Roadmap Documentation Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有 `0.2–0.5` 质量域之上整理并落地 `0.6–1.0` QA 工作台产品化路线，同时把附件中的长期能力收束为不改变当前版本语义的 `Post-1.0 Capability Roadmap`。

**Architecture:** 只新增和整理 Markdown 文档，不改业务代码、数据模型、API 或发布版本。前序质量域文档继续作为事实和可信边界；`0.6–1.0` 作为当前产品路线；附件内容作为后续能力路线，使用能力阶段名称而不是新的 `0.4/0.5` 发布编号。

**Tech Stack:** Markdown、现有 `docs/quality-workbench/` 文档结构、现有 `docs/superpowers/plans/` 计划结构。

**Spec:** 用户确认的范围：`0.6–1.0` 继续完成现有 QA 工作台的产品化和稳定化；附件中的 Quality Intelligence、Obligation、Graph、Agent、Adapter 和 Policy 进入 `Post-1.0 Capability Roadmap`。

## Global Constraints

- 不修改 `server/`、`public/`、`lib/`、`preset/` 或测试代码。
- 不把附件的 `v0.4–v1.0` 直接当作当前 npm/Git 发布版本。
- 不宣称 `0.6–1.0` 已实现；文档只描述范围、方案、计划和验收标准。
- 保留现有 `0.2–0.5` 质量域文档及其 `PASS/WARN/BLOCK`、证据、revision 和人工审批边界。
- 所有路线文档必须说明明确不做项、依赖、验证方式和证据边界。
- 中英文 README 只增加文档入口，不降低当前仓库版本号或覆盖现有安装说明。

### Task 0: Clarify the 0.2–0.5 quality-domain version map

**Files:**
- Create: `docs/quality-workbench/2026-09-15-version-map.md`
- Modify: `docs/quality-workbench/README.md`

- [x] 明确 `0.2–0.5` 是质量域能力基线，`0.6–1.0` 是其上的工作台产品化路线。
- [x] 明确 `0.4` 只负责证据包、失败分析、缺陷候选、回归集和运行对比，不负责 Quality Intelligence。
- [x] 明确 `0.5` 只负责基于可信证据的质量门禁、例外、交付报告和趋势，不负责 Quality Policy Engine。
- [x] 写清 `0.4` 的核心问题是“测试结果是否可信、可追溯、可比较”，`0.5` 的核心问题是“基于这些事实能否交付”。
- [x] 说明当前 package/tag `v0.3.1` 与质量域实现状态文档之间的版本差异；历史实现记录不能替代本轮测试或正式 Release 证明。

### Task 1: Add the 0.6–1.0 roadmap document set

**Files:**
- Create: `docs/quality-workbench/README.md`
- Create: `docs/quality-workbench/2026-09-08-getting-started.md`
- Create: `docs/quality-workbench/2026-09-08-requirements.md`
- Create: `docs/quality-workbench/2026-09-08-solution-design.md`
- Create: `docs/quality-workbench/2026-09-08-technical-design.md`
- Create: `docs/superpowers/plans/2026-09-08-workbench-iterations.md`
- Create: `docs/superpowers/plans/2026-09-08-workbench-0.6.0.md`
- Create: `docs/superpowers/plans/2026-09-08-workbench-0.7.0.md`
- Create: `docs/superpowers/plans/2026-09-08-workbench-0.8.0.md`
- Create: `docs/superpowers/plans/2026-09-08-workbench-0.9.0.md`
- Create: `docs/superpowers/plans/2026-09-08-workbench-1.0.0.md`

- [x] 从已有 `docs/workbench-roadmap-0.6-1.0` 文档分支复用路线内容，只提取文档文件，不合入该分支的源代码、版本变更或测试删除。
- [x] 核对所有文档均指向当前仓库中的 `2026-08-25-*` 质量域文档和 `2026-08-27-implementation-status.md`。
- [x] 删除或修正文档中把历史展示版本写成当前发布版本的歧义。

### Task 2: Add the Post-1.0 capability roadmap

**Files:**
- Create: `docs/quality-workbench/post-1.0-capability-roadmap.md`
- Modify: `docs/quality-workbench/README.md`

- [x] 将附件内容拆成 `C1 Quality Intelligence`、`C2 Change Intelligence & Quality Obligation`、`C3 Quality Evidence Graph`、`C4 QA Agent Loop`、`C5 Adapter Ecosystem`、`C6 Quality Policy Engine`、`C7 Multi-Agent QA` 和 `C8 Autonomous Quality Engineering`。
- [x] 对每个能力阶段写明目标、依赖、候选实现、人工边界、验证要求和明确不做项。
- [x] 明确该文档是长期方向，不代表当前版本承诺、实现状态或 Release Gate。

### Task 3: Link the roadmap from the bilingual README files

**Files:**
- Modify: `README.md`
- Modify: `README_EN.md`

- [x] 添加 `0.6–1.0` 路线索引和 `Post-1.0` 能力路线入口。
- [x] 保留当前 `0.3.1` 版本徽章、安装方式、Harness 兼容性和质量边界原文。
- [x] 中英文入口结构保持一致。

### Task 4: Self-review the documentation set

- [x] 检查文档链接、锚点和文件路径是否存在。
- [x] 检查 `0.4/0.5` 是否只用于前序质量域，避免与附件的能力阶段混淆。
- [x] 检查是否出现把“建议/计划/历史记录”写成“已验证实现”的表述。
- [x] 运行 `git diff --check`。
- [x] 检查 Git 状态，确认只有本计划和路线文档发生变化。

## Verification record

- `npm test`：单元/API 阶段 100 passed；E2E 未进入页面断言，首次因 `127.0.0.1:8899` 被占用，改用临时 8900 服务后又因 Chromium `bootstrap_check_in ... Permission denied` 阻断。
- Markdown relative-link check：20 files passed。
- Markdown whitespace/EOF check：20 files passed。
- `git diff --check`：passed for tracked changes。
