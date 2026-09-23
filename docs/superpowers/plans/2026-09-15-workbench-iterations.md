# DSH QA Workbench `0.4.1`—`1.0.0` Iterations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each **version plan** task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已发布的 v0.4.0 质量证据与门禁基线上，先锁定 Harness 0.1.6 兼容性，再完成官方 Panel、原生执行、AI Quality Intelligence 和 AI-Native QA Workbench 主路径。

**Architecture:** 继续复用现有 Project、QualityTask、TestRun、EvidenceBundle、RegressionSet 和 QualityGate。宿主接入通过 Panel/Slot 和 HostExecution adapter 隔离；智能能力通过 evidence-first insight/Agent contract 增量加入，不建立第二套质量事实。

**Tech Stack:** Node.js ESM 18+、原生 HTTP/SSE、JSON store、原生 `public/`、Harness `dsh-v0.1.6-alpha.1`、`node:test`、Playwright。

**Specs:**

- `docs/quality-workbench/2026-09-15-version-map.md`
- `docs/quality-workbench/2026-09-15-requirements.md`
- `docs/quality-workbench/2026-09-15-solution-design.md`
- `docs/quality-workbench/2026-09-15-technical-design.md`
- `docs/quality-workbench/2026-09-15-getting-started.md`

## Global Constraints

- 0.4.1 的静态、独立模式和真实宿主证据分开记录；host smoke 未运行不算兼容。
- 0.5 删除 DOM injection 技术债；iframe Workbench 保留。
- 0.6 的 HostExecution 只能使用 profile 白名单并落到 TestRun/EvidenceBundle；Action Desk 只读投影这些事实，不建立第二套质量模型。
- 0.7 的 AI 只提供建议；确定性 Gate、人工确认和 provenance 不被覆盖。
- 1.0 的 Agent 有工具白名单、审批、预算、超时、重试、redaction 和终止状态。
- `0.8.0`、`0.9.0` 不作为当前执行节点；旧计划仅供历史追溯。
- 每个版本都必须运行 `npm run test:unit`、`npm run test:e2e` 和 `git diff --check`；真实宿主、CI、package 和 Release 另行验证。

## 版本执行顺序

1. [0.4.1 Harness 0.1.6 兼容性加固](./2026-09-15-workbench-0.4.1.md)
2. [0.5.0 Native Harness Panel Integration](./2026-09-15-workbench-0.5.0.md)
3. [0.6.0 Native QA Execution & Action Desk](./2026-09-15-workbench-0.6.0.md)
4. [0.7.0 AI Quality Intelligence](./2026-09-15-workbench-0.7.0.md)
5. [1.0.0 AI-Native QA Workbench](./2026-09-15-workbench-1.0.0.md)

## 每版完成定义（DoD）

- [ ] 分计划所有适用 checkbox 完成，取消项写明原因。
- [ ] unit/API、standalone Chromium、host smoke、CI 和 package/Release 状态分别记录。
- [ ] `verified`、`failed`、`not run`、`blocked` 和 `not applicable` 不互相折算。
- [ ] 需求、方案、技术契约、README 和 implementation status 对同一版本使用同一语义。
- [ ] 没有无证据 PASS、无审批高风险动作或未声明的宿主兼容性。

## 历史计划处理

以下文件不再是当前开工入口，但保留以便追溯此前路线和已完成质量域工作：

- `docs/superpowers/plans/2026-08-25-quality-workbench-0.5.0.md`：历史质量门禁计划，已进入 v0.4.0 基线。
- `docs/superpowers/plans/2026-09-08-workbench-0.6.0.md`：旧行动台草案。
- `docs/superpowers/plans/2026-09-08-workbench-0.7.0.md`：旧对话工作台草案。
- `docs/superpowers/plans/2026-09-08-workbench-0.8.0.md`：旧变更与回归草案。
- `docs/superpowers/plans/2026-09-08-workbench-0.9.0.md`：旧证据与交付草案。
- `docs/superpowers/plans/2026-09-08-workbench-1.0.0.md`：旧稳定工作台草案。

## 路线不做

跨宿主 MCP 平台化、CI Evidence Gate 必达、真实多用户 RBAC、云端分布式执行、自动生产发布、外部缺陷系统自动提单和无证据 PASS。
