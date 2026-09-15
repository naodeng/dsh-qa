# 如何开始：`0.4.1`—`1.0.0` Harness 集成路线

本文面向执行当前路线的开发者 / Agent。当前只从 `0.4.1` 开始；未完成当前版本的适用验收，不进入下一版。

## 1. 先读什么

1. `AGENTS.md` — 仓库约束、测试和交付规则。
2. `docs/quality-workbench/2026-09-15-version-map.md` — 当前版本语义和边界。
3. `docs/quality-workbench/2026-09-15-requirements.md` — 分版需求与不做项。
4. `docs/quality-workbench/2026-09-15-solution-design.md` — 方案取舍和宿主边界。
5. `docs/quality-workbench/2026-09-15-technical-design.md` — 契约、接口和测试策略。
6. `docs/quality-workbench/2026-09-15-harness-compatibility.md` — 0.4.1 矩阵。
7. 当前版本计划：`docs/superpowers/plans/2026-09-15-workbench-0.4.1.md`。

质量证据、门禁、provenance 和人工审批仍以 `2026-08-25-*` 及 v0.4.0 实现状态为准。

## 2. 0.4.1 开工步骤

```sh
cd /path/to/dsh-qa
npm ci
npm run test:unit
npm run test:e2e
```

先运行现有基线并记录结果，再修改兼容性契约。真实宿主验证需要一个明确版本的 Harness `dsh-v0.1.6-alpha.1`，不能用 `latest` 或独立 `qabench` 代替。

### 真实宿主证据

为每次冒烟记录：

- Harness tag/commit 和启动方式（npx 或源码 checkout）。
- dsh-qa commit、Node 版本、宿主 URL 和测试时间。
- 插件 load、preset、Session、follow、prompt、model、skills、commands、Workbench、refresh、reconnect 各项结果。
- 必要的截图、日志和失败错误。

宿主不能运行时保留 `BLOCKED`；没有执行只写 `NOT_RUN`。本地 unit/API/E2E 不能替代 host smoke。

## 3. 版本执行顺序

```text
0.4.1 Compatibility
        ↓
0.5 Panel
        ↓
0.6 Native Execution
        ↓
0.7 AI Quality Intelligence
        ↓
1.0 AI-Native Workbench
```

- `0.5` 只有在 0.4.1 的宿主兼容矩阵完成或明确记录排除项后开工。
- `0.6` 依赖 0.5 的 Panel lifecycle 和 0.4.0 的 TestRun/Evidence contract。
- `0.7` 依赖 0.6 的真实 provenance；fake adapter 只用于本地确定性测试。
- `1.0` 依赖 0.4.1–0.7 的适用验收，不重新引入 0.8/0.9 并行大改。

## 4. 每版完成定义

| 证据类型 | 0.4.1 | 0.5+ |
| --- | --- | --- |
| 单元/API | 通过 | 通过 |
| 独立 Chromium E2E | 通过 | 通过 |
| 真实 Harness host smoke | 必须通过 0.1.6 清单 | 按本版新增宿主路径通过 |
| `git diff --check` | 通过 | 通过 |
| 文档/矩阵 | 状态与证据一致 | 需求、技术契约和状态一致 |
| package/Release | 仅在用户明确要求发布时执行 | 同左，不能以测试通过代替发布 |

版本只有在所有适用验收项为 `verified` 后才能称为完成。依赖、权限或宿主不可用时，继续保留 `blocked`，不要通过改文案把它变成兼容。

## 5. 当前版本入口

打开并执行：[0.4.1 Harness 0.1.6 兼容性加固计划](../superpowers/plans/2026-09-15-workbench-0.4.1.md)。

不要从 `2026-09-08-workbench-0.6.0.md`、`0.7.0.md`、`0.8.0.md` 或 `0.9.0.md` 开工；它们属于旧路线历史草案。
