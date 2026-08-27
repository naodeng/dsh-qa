# Quality Workbench 迭代实现状态

## 目的

本文档记录 0.2.0–0.4.0 的实际实现边界、验证结果和未完成项。它是当前代码状态说明，不替代原始需求、方案和技术设计文档。

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

- 已实现终态运行证据 finalize、逐文件 SHA-256、篡改检测和安全下载。
- 已实现证据保留任务，默认截止时间为当前时间前 30 天；被引用证据不会清理。
- 已实现失败分析、人工确认后升级缺陷、回归集稳定排序和排除理由。
- 已实现同一测试计划下的终态运行对比。
- 已实现质量门禁计算及项目质量任务页展示。

## 关键 API

| 能力 | API |
|---|---|
| 证据 finalize | `POST /api/projects/:projectId/test-runs/:runId/evidence/finalize` |
| 证据列表 | `GET /api/projects/:projectId/evidence` |
| 证据下载 | `GET /api/projects/:projectId/evidence/:evidenceId/download?path=...` |
| 运行对比 | `POST /api/projects/:projectId/test-runs/:runId/compare` |
| 失败分析 | `POST /api/projects/:projectId/test-runs/:runId/failure-analysis` |
| 缺陷升级 | `POST /api/projects/:projectId/failure-analyses/:analysisId/promote-defect` |
| 回归集 | `GET/POST /api/projects/:projectId/regression-sets` |
| 质量门禁 | `GET /api/projects/:projectId/quality-gate` |
| 清理任务 | `POST /api/projects/:projectId/artifact-cleanup` |

## 当前验证

- 证据、保留、故障分析、回归集、运行对比和质量门禁专项测试通过。
- 受控 node-test 执行器回归测试通过。
- `node --check` 和 `git diff --check` 通过。
- HTTP 全量测试在当前沙箱中受 `listen EPERM` 限制，尚未获得完整监听验证。
- Chromium E2E 在当前沙箱中受 Mach 服务权限限制，不能据此判定页面功能失败。

## 后续工作

1. 为新增 API 补完整 HTTP 测试并在可监听环境执行。
2. 补证据、失败分析、回归集的前端展示与交互。
3. 将质量门禁接入发布/阶段推进阻断，而不仅是页面展示。
4. 完成全量 `npm test`、浏览器验收、提交和远端推送。
