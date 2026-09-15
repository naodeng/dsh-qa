# DSH QA Workbench `0.6.0`—`1.0.0` Iterations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each **version plan** task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有质量域（0.2–0.5）之上，把 dsh-qa 打磨成 DSH Agent 用户可日常依赖的 QA 工作面板（0.6→1.0）。

**Architecture:** 不新建平行测管；面板 UX + 薄聚合/草稿 API + 复用 `server/quality/*` 可信闭环；写路径保持白名单与 revision。

**Tech Stack:** Node.js ESM 18+、原生 HTTP/SSE、JSON store、原生 `public/`、`node:test`、Playwright。

**Specs:**

- `docs/quality-workbench/2026-09-08-requirements.md`
- `docs/quality-workbench/2026-09-08-solution-design.md`
- `docs/quality-workbench/2026-09-08-technical-design.md`
- `docs/quality-workbench/2026-09-08-getting-started.md`

## Global Constraints

- 保持仓库名、插件 ID、npm 包名、零生产依赖。
- 复用 Project 聚合与质量实体；不重做 gate/evidence 可信模型。
- 独立模式无可信身份；`actorLabel` ≠ 认证用户。
- 无受控证据不得 PASS；`imported-summary` 不能作 PASS。
- 草稿与生效分离（变更影响、回归集）。
- 所有 UI 同步中英文、空状态、错误状态。
- API 测试：临时 `QA_DATA_DIR` + 随机端口；动态导入前设数据目录；串行。
- 每版仅在前一版 `npm test`（或 unit+e2e）与 `git diff --check` 通过后开始（`0.8`/`0.9` 顺序见 getting-started；不得跳过 `0.6`）。
- 新增写接口使用字段白名单；拒绝未知字段与客户端派生状态。

## 版本执行顺序

1. [0.6.0 行动台](./2026-09-08-workbench-0.6.0.md)
2. [0.7.0 对话工作台](./2026-09-08-workbench-0.7.0.md)
3. [0.8.0 变更与回归](./2026-09-08-workbench-0.8.0.md)
4. [0.9.0 证据与交付](./2026-09-08-workbench-0.9.0.md)
5. [1.0.0 稳定工作台](./2026-09-08-workbench-1.0.0.md)

## 每版完成定义（DoD）

- [ ] 分计划全部 checkbox 完成（或显式取消并记录原因）
- [ ] `npm run test:unit` 通过
- [ ] `npm run test:e2e` 通过
- [ ] `git diff --check` 通过
- [ ] 需求文档该版「必须交付」可逐条对照演示
- [ ] 技术文档增量与实现一致（若有偏差则改文档）

## 本路线不做（提醒）

跨宿主 MCP 平台化、CI Evidence Gate 必达、RBAC、云端分布式执行、自动发布、无证据 PASS。
