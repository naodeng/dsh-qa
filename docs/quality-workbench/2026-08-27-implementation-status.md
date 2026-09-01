# Quality Workbench 迭代实现状态

## 目的

本文档记录 0.2.0–0.5.0 的实际实现边界和验收结果。它是当前代码状态说明，不替代原始需求、方案和技术设计文档。

## 迭代状态

### 0.2.0：质量任务基础

- 已实现质量任务创建、查询、版本冲突保护。
- 已实现需求、工作区文件和 Git diff 来源采集。
- 已实现人工分析与分析审计。
- 已实现质量任务页和执行配置入口。

### 0.3.0：测试计划与受控执行

- 已实现测试计划评审、版本化和执行配置版本化。
- 已实现 node-test / Playwright 执行器白名单、精确目标文件和超时限制。
- 已实现一次性运行预览 token、异步运行、取消、恢复中断运行和 SSE 状态事件。
- 测试产物统一位于 `QA_DATA_DIR/artifacts/<projectId>/<runId>.staging`。

### 0.4.0：证据与质量判断

- 已实现终态运行的 staging → finalizing → final 原子 finalize、manifest、逐文件 SHA-256、篡改检测、并发幂等、恢复和 ID 安全下载。
- 已实现单文件、单 bundle、项目累计配额；失败 finalize 会把 staging 恢复到可重试状态。
- 已实现顶层项目删除清理任务、30 天保留策略、引用保护、失败重试、启动立即恢复、批量限制、孤立 staging 清理和停机钩子。
- 已实现失败分析、人工确认后升级既有缺陷、重复提升冲突保护、确定性回归集、带操作者与理由的排除审计。
- 已实现同一测试计划终态运行对比，输出 fixed/new-failure 并保留前后证据引用。
- 已实现质量门禁计算和阶段推进阻断，以及质量证据、故障分析、回归集、修复前后对比的双语页面。
- 已实现 `quality.evidence.updated` SSE；浏览器按实体 revision 忽略重复或乱序事件，并刷新已打开的项目详情。

### 0.5.0：质量门禁与交付报告

- 已实现旧审批门禁归一化、计算型 `PASS/WARN/BLOCK` 门禁、规则版本和输入 provenance 快照。
- 已实现门禁评估、详情、例外、报告和趋势 API；例外受 revision、责任人、理由和期限保护，不能覆盖关键阻断。
- 已实现交付报告与趋势投影、质量门禁评估入口、报告/趋势展示和 `quality.gate.updated` SSE 刷新。

## 关键 API

| 能力 | API |
|---|---|
| 证据 finalize | `POST /api/projects/:projectId/test-runs/:runId/evidence/finalize`（首次要求 `expectedRunRevision`） |
| 证据列表 | `GET /api/projects/:projectId/evidence` |
| 证据下载 | `GET /api/projects/:projectId/evidence/:evidenceId/items/:itemId/download` |
| 运行对比 | `POST /api/projects/:projectId/test-runs/:runId/compare` |
| 运行对比（ID 路径） | `GET /api/projects/:projectId/test-runs/:beforeRunId/compare/:afterRunId` |
| 失败分析 | `POST /api/projects/:projectId/test-runs/:runId/failure-analysis` |
| 缺陷升级 | `POST /api/projects/:projectId/failure-analyses/:analysisId/promote-defect` |
| 回归集 | `GET/POST /api/projects/:projectId/regression-sets` |
| 质量门禁 | `GET /api/projects/:projectId/quality-gate` |
| 清理任务 | `POST /api/projects/:projectId/artifact-cleanup` |

## 完成与验证标准

- 单元测试覆盖 0.2.0–0.4.0 领域行为、迁移、存储、受控执行器和质量门禁。
- HTTP 测试使用真实随机本地端口，覆盖新增 API 的成功、冲突、篡改与路径安全场景。
- Chromium E2E 使用 8899 端口和真实服务，覆盖质量任务、受控执行配置、证据/回归空状态、回归集创建与双语页面。
- 发布验收统一执行 `npm test` 与 `git diff --check`；只有两者均成功才可标记 0.4.0 及之前完成。
