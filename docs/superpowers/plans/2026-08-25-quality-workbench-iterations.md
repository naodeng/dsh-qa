# DSH QA Workbench Iterations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按四个可独立发布版本演进现有 `dsh-qa`，不建立平行的项目、用例、测试结果或门禁模型。

**Architecture:** 质量数据归属于现有 Project；`0.2.0` 建立质量任务和风险，`0.3.0` 演进现有用例与测试结果，`0.4.0` 增加受控证据和回归，`0.5.0` 演进现有 gates。每个版本由独立计划驱动并通过完整回归后再开始下一个版本。

**Tech Stack:** Node.js ESM 18+、原生 HTTP/SSE、JSON store、原生 HTML/CSS/JavaScript、`node:test`、Playwright。

**Spec:** `docs/quality-workbench/2026-08-25-requirements.md`、`docs/quality-workbench/2026-08-25-solution-design.md`、`docs/quality-workbench/2026-08-25-technical-design.md`

## Global Constraints

- 保持 `dsh-qa` 仓库、插件 ID、npm 包名和零生产依赖。
- 复用 `project.requirements`、`project.testcases`、`project.gates`；`0.3.0` 新建统一 `project.testruns`，不把历史 materials 摘要伪造为 TestRun。
- 独立模式没有可信身份；`actorLabel` 不得描述为认证用户。
- 没有真实执行证据时不得产生 `PASS`。
- `imported-summary` 运行固定为 `status=unknown`，不能作为 PASS 证据；本路线不实现 `structured-report`。
- 门禁只接受 provenance 与当前来源、commit、计划、回归集和 profile 版本一致的受控本地证据。
- 所有 UI 改动同步处理中英文、空状态、错误状态和控制属性。
- API 测试使用临时 `QA_DATA_DIR` 和随机端口，E2E 使用真实服务和 Chromium。
- 所有新增质量域中更新既有实体的 HTTP/DSH 写入都携带 `expectedRevision`（finalize 使用 `expectedRunRevision`）；计划/Profile 的业务 version 不替代 revision，冲突统一返回 409 `QUALITY_REVISION_CONFLICT`。为兼容保留的旧 approval-gate decide 和既有缺陷/用例状态路由不在本路线中强制改变请求体，但新 computed gate 接口必须使用 revision。
- 新增质量 API 与 DSH 工具均采用字段白名单并拒绝未知字段；客户端不能提交 projectId、dshSessionId、stage、verdict、status、resultTrust 等服务端派生或宿主上下文字段。

## 可执行测试约定

- 所有代码块都是对应 `test('...', async () => { ... })` 的完整测试主体，不把产品函数伪装成测试 helper。
- 单元测试显式导入 `node:test`、`node:assert/strict`、被测模块和 `test/helpers/quality-fixtures.js`；文件系统测试在 `afterEach` 删除自己创建的 `mkdtemp` 目录。
- API 测试复用现有 `test/unit/http-api.test.js` 的临时服务生命周期、`base`、项目创建接口和原生 `fetch`。测试先通过接口创建所引用的 project、task、plan、run、evidence 和 gate，并从响应体读取 ID。
- E2E 测试使用 `import { test, expect } from '@playwright/test'` 和真实页面 fixture，不引入测试专用 DOM 分支。
- `package.json#test:unit` 通过 `scripts/run-unit-tests.js` 排序并执行 `test/unit`、`test/helpers` 下全部 `*.test.js`；不使用裸 `node --test`。会故意失败、超时或输出超限的 runner 输入统一命名为 `*.fixture.mjs`，且发现脚本必须排除 `test/e2e` 和 `test/fixtures`。
- 计划中的每个 “Implement” 步骤至少落地该任务 `Interfaces` 列出的导出函数、输入校验、持久化变更和稳定错误；不得只增加空模块或返回固定值来让测试通过。

## 版本执行顺序

1. [0.2.0 质量任务与风险分析计划](./2026-08-25-quality-workbench-0.2.0.md)
2. [0.3.0 测试策略与执行计划](./2026-08-25-quality-workbench-0.3.0.md)
3. [0.4.0 证据与回归计划](./2026-08-25-quality-workbench-0.4.0.md)
4. [0.5.0 质量门禁与报告计划](./2026-08-25-quality-workbench-0.5.0.md)

每个版本只在前一版本的 `npm test`、真实浏览器验收和 `git diff --check` 全部通过后开始。版本计划中的提交命令是建议边界；执行前仍须检查工作区，只暂存当前任务文件。
