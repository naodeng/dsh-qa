# 质量工作台文档索引

版本边界说明：[版本语义与路线边界](./2026-09-15-version-map.md)

## 质量域基线（0.2–0.5）

| 文档 | 说明 |
| --- | --- |
| [2026-08-25-requirements.md](./2026-08-25-requirements.md) | 质量任务→门禁需求 |
| [2026-08-25-solution-design.md](./2026-08-25-solution-design.md) | 方案 |
| [2026-08-25-technical-design.md](./2026-08-25-technical-design.md) | 技术契约 |
| [2026-08-27-implementation-status.md](./2026-08-27-implementation-status.md) | 实现状态 |

相关计划：`docs/superpowers/plans/2026-08-25-quality-workbench-*.md`

`0.4` 专注证据包、失败分析、回归和运行对比；`0.5` 专注基于可信证据的 `PASS/WARN/BLOCK`、例外、交付报告和趋势。它们不是附件中同名的 Quality Intelligence 或 Quality Obligation 阶段。

## 体验迭代（0.6–1.0 QA 工作面板）

定位：**DSH Agent 的 QA 工作面板**（界面便捷 + 测试闭环，非通用 TMS/MCP 平台）。

| 文档 | 说明 |
| --- | --- |
| [2026-09-08-requirements.md](./2026-09-08-requirements.md) | 需求与分版范围 |
| [2026-09-08-solution-design.md](./2026-09-08-solution-design.md) | 方案与交互 |
| [2026-09-08-technical-design.md](./2026-09-08-technical-design.md) | 技术方案与 API 增量 |
| [2026-09-08-getting-started.md](./2026-09-08-getting-started.md) | **如何开始实施** |

### 实施计划

| 计划 | 主题 |
| --- | --- |
| [../superpowers/plans/2026-09-08-workbench-iterations.md](../superpowers/plans/2026-09-08-workbench-iterations.md) | 迭代总计划 |
| [../superpowers/plans/2026-09-08-workbench-0.6.0.md](../superpowers/plans/2026-09-08-workbench-0.6.0.md) | 0.6 行动台 |
| [../superpowers/plans/2026-09-08-workbench-0.7.0.md](../superpowers/plans/2026-09-08-workbench-0.7.0.md) | 0.7 对话工作台 |
| [../superpowers/plans/2026-09-08-workbench-0.8.0.md](../superpowers/plans/2026-09-08-workbench-0.8.0.md) | 0.8 变更与回归 |
| [../superpowers/plans/2026-09-08-workbench-0.9.0.md](../superpowers/plans/2026-09-08-workbench-0.9.0.md) | 0.9 证据与交付 |
| [../superpowers/plans/2026-09-08-workbench-1.0.0.md](../superpowers/plans/2026-09-08-workbench-1.0.0.md) | 1.0 稳定工作台 |

### 建议阅读顺序

1. [如何开始](./2026-09-08-getting-started.md)
2. 需求 → 方案 → 技术
3. 总计划 → **只打开当前版本**分计划（从 0.6 起）

## Post-1.0 Capability Roadmap

附件中的长期能力统一放在 [Post-1.0 Capability Roadmap](./post-1.0-capability-roadmap.md)，按 `C1–C8` 能力阶段记录：

```text
Quality Intelligence → Quality Obligation → Evidence Graph
→ QA Agent → Adapter → Policy → Multi-Agent → Autonomous QE
```

这些内容是 `1.0` 之后的候选方向，不代表当前已实现能力或当前 Release 承诺。
