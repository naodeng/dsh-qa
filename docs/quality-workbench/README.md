# 质量工作台文档索引

当前路线以 [版本语义与路线边界](./2026-09-15-version-map.md) 为准。当前发布基线是 `v0.5.4`；本版本修复 Harness 0.1.7 加载 `quality-control` bundle 时 `dsh-plan-mode` 缺少非空 `section` 配置的问题，`quality-control` 真实宿主运行仍未评估。

## 已发布质量基线

| 文档 | 说明 |
| --- | --- |
| [2026-08-25-requirements.md](./2026-08-25-requirements.md) | `0.2–0.5` 质量域原始需求与事实边界 |
| [2026-08-25-solution-design.md](./2026-08-25-solution-design.md) | 质量域方案 |
| [2026-08-25-technical-design.md](./2026-08-25-technical-design.md) | 质量域技术契约 |
| [2026-08-27-implementation-status.md](./2026-08-27-implementation-status.md) | v0.4.0 基线中的实际实现边界 |
| [2026-08-25-quality-workbench-0.5.0.md](../superpowers/plans/2026-08-25-quality-workbench-0.5.0.md) | 已完成的历史质量门禁计划，不是当前 0.5.0 计划 |

这些文档描述证据、失败分析、回归、运行对比、`PASS/WARN/BLOCK`、例外和交付报告；它们不证明 Harness 0.1.6 宿主兼容性，也不替代本轮验证。

## 当前路线：`0.5.0`—`1.0.0`

### 需求、方案与技术契约

| 文档 | 说明 |
| --- | --- |
| [2026-09-15-requirements.md](./2026-09-15-requirements.md) | 新路线的分版目标与验收范围 |
| [2026-09-15-solution-design.md](./2026-09-15-solution-design.md) | Harness 集成与 Workbench 演进方案 |
| [2026-09-15-technical-design.md](./2026-09-15-technical-design.md) | 兼容契约、Panel、执行、智能分析技术边界 |
| [2026-09-23-workbench-0.6-native-execution-action-desk-design.md](../superpowers/specs/2026-09-23-workbench-0.6-native-execution-action-desk-design.md) | 0.6 Native QA Execution & Action Desk 设计规格 |
| [2026-09-15-getting-started.md](./2026-09-15-getting-started.md) | 从 0.4.1 开始实施和验证 |
| [2026-09-15-harness-compatibility.md](./2026-09-15-harness-compatibility.md) | 0.5.0 Panel/Slot 兼容矩阵与证据记录（含 0.4.1 历史基线） |

### 分版实施计划

| 计划 | 主题 |
| --- | --- |
| [2026-09-15-workbench-iterations.md](../superpowers/plans/2026-09-15-workbench-iterations.md) | 当前路线总计划 |
| [2026-09-15-workbench-0.4.1.md](../superpowers/plans/2026-09-15-workbench-0.4.1.md) | Harness 0.1.6 兼容性加固 |
| [2026-09-15-workbench-0.5.0.md](../superpowers/plans/2026-09-15-workbench-0.5.0.md) | Native Harness Panel Integration |
| [2026-09-15-workbench-0.6.0.md](../superpowers/plans/2026-09-15-workbench-0.6.0.md) | Native QA Execution & Action Desk |
| [2026-09-15-workbench-0.7.0.md](../superpowers/plans/2026-09-15-workbench-0.7.0.md) | AI Quality Intelligence |
| [2026-09-15-workbench-1.0.0.md](../superpowers/plans/2026-09-15-workbench-1.0.0.md) | AI-Native QA Workbench 收口 |

`0.8.0`、`0.9.0` 以及此前 `2026-09-08-workbench-*` 计划保留为历史草案，已不在当前执行顺序中。

## 评审记录

- [界面评审](./reviews/ui-critique-zh.md)：0.6 首屏和信息层级的中文评审记录。
- [Impeccable 评审](./reviews/2026-08-21-ui-critique-impeccable.md)：2026-08-21 的历史静态审查结果。

## Post-1.0 Capability Roadmap

[Post-1.0 Capability Roadmap](./post-1.0-capability-roadmap.md) 记录 `0.7`/`1.0` 之后的 Quality Obligation、Evidence Graph、Adapter、Policy、Multi-Agent 和 Autonomous QE 方向。`Quality Intelligence` 已前移到当前 `0.7.0`，不再作为 Post-1.0 的首个 Release 目标。
