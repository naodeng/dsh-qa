# dsh-qa 版本语义与路线边界

本文用于解决两套路线中版本号含义不同的问题。它是路线索引和边界说明，不替代各版本的需求、方案、技术设计或实施计划。

## 1. 两层路线

`dsh-qa` 后续文档使用两层路线：

```text
质量域能力基线：0.2–0.5
        ↓
工作台产品化：0.6–1.0
        ↓
长期能力演进：Post-1.0 Capability Roadmap
```

质量域解决“如何形成可信的质量事实和交付决定”；工作台产品化解决“如何让 QA 更快、更清楚地使用这条闭环”；Post-1.0 才进入附件提出的 Quality Intelligence、Quality Obligation、Graph、Agent、Adapter 和 Policy 等平台能力。

## 2. 当前发布状态与文档状态

当前仓库的 package/tag 基线是 `v0.3.1`。仓库中的质量域代码、计划和实现状态文档已经覆盖 `0.2–0.5` 的能力范围，但“代码存在”“实现状态文档记录”和“某个正式 Release 已发布”是三种不同事实。

因此：

- `0.2–0.5` 在本文中表示质量域能力阶段，不自动等同于当前 npm/Git 发布版本。
- `2026-08-27-implementation-status.md` 是历史实现状态记录；每次准备发布仍需重新运行测试、检查工作区和确认远程交付状态。
- `0.6–1.0` 文档描述后续产品化范围，不表示这些能力已经实现。
- 附件中的 `v0.4`、`v0.5` 属于另一套长期能力路线，不能覆盖本文对质量域 `0.4`、`0.5` 的定义。

## 3. 质量域基线 `0.2–0.5`

| 阶段 | 主题 | 核心问题 | 主要输入 | 主要输出 |
| --- | --- | --- | --- | --- |
| `0.2` | 质量任务与风险分析 | 需求或变更有什么风险？ | Requirement、workspace 文件、受控 Git diff | QualityTask、Acceptance Criteria、Risk、Test Scope、Human Decision |
| `0.3` | 测试计划与受控执行 | 如何把测试范围变成可重复执行？ | QualityTask、TestCase、Execution Profile | TestPlan、TestRun、执行状态、日志和运行 provenance |
| `0.4` | 证据与回归 | 测试结果是否可信、可追溯、可比较？ | 终态 TestRun、日志、截图、trace、commit、历史缺陷 | EvidenceBundle、Failure Analysis、RegressionSet、Run Comparison |
| `0.5` | 门禁与交付 | 基于可信事实能否交付？ | 风险、TestRun、EvidenceBundle、RegressionSet、缺陷和 provenance | QualityGate、`PASS/WARN/BLOCK`、例外、Delivery Report、Trend |

### `0.4`：证据与回归

`0.4` 的边界是把运行结果转成可审查的证据，不是主动理解全部项目质量，也不是让 AI 直接给出放行结论。

必须保持的事实边界：

- 证据必须来源于终态测试运行，不能脱离 TestRun 单独存在。
- EvidenceBundle 需要经过 staging、finalize、manifest 和完整性校验。
- 证据包必须能检测篡改、支持幂等 finalize、恢复和安全下载。
- 失败分析先形成候选结论；升级为缺陷仍需要人工确认。
- RegressionSet 必须能说明其来源是风险、变更、测试计划或历史缺陷。
- 运行对比只能比较同一项目、同一测试计划约束下的终态运行。
- 未就绪、完整性失败、孤立或 provenance 不一致的证据不能进入门禁。

`0.4` 不负责：

- 自动发现所有 Requirement Gap。
- 从 Git Diff 推导完整 Quality Obligation。
- 引入 Quality Graph 或 Graph Database。
- 让 AI 绕过证据直接判断 `PASS`。

### `0.5`：门禁与交付

`0.5` 的边界是读取质量事实并计算交付建议，不是重新执行测试，也不是把人工例外改写成原始事实。

必须保持的事实边界：

- 旧人工审批门禁继续兼容，计算型门禁使用独立的 `kind=computed` 语义。
- 门禁结果保存规则版本、输入摘要和 provenance 快照。
- `PASS` 需要受控执行结果、有效证据和匹配当前来源、commit、计划、回归集及执行配置版本。
- 未处置的 critical 风险、关键测试失败、缺少必需证据、证据完整性失败或 provenance stale 必须阻断或禁止通过。
- 可豁免检查只能通过带责任人、理由和期限的人工例外进入 `WARN`，不能把不可豁免的阻断变成 `PASS`。
- Delivery Report 只投影已经保存的 Gate 结果，不重新实现第二套 verdict 计算。

`0.5` 不负责：

- 通用的 `policy.yaml` 层级策略引擎。
- AI 覆盖确定性门禁规则。
- 自动发布或替代外部审批。
- 质量图谱、Agent Runtime 或多 Agent 编排。

## 4. `0.6–1.0` 产品化路线

这条路线建立在 `0.2–0.5` 之上，不复制质量任务、TestRun、证据或 Gate 模型：

| 版本 | 主题 | 主要目标 |
| --- | --- | --- |
| `0.6` | 行动台 | 首屏统一展示待处理事项，支持质量事件实时刷新和关键跳转 |
| `0.7` | 对话工作台 | 提供下一步建议、材料回填、QA 快捷操作和会话状态 |
| `0.8` | 变更与回归 | 生成变更影响和测试范围草稿，人工确认后更新回归集 |
| `0.9` | 证据与交付体验 | 将门禁、证据、追溯、失败分类和报告放到同一交付视图 |
| `1.0` | 稳定工作台 | 打磨主路径、空状态、错误恢复、向导、迁移和文档 |

## 5. Post-1.0 能力路线

附件中的长期设想放入独立文档 `post-1.0-capability-roadmap.md`。其中的阶段名称不覆盖质量域 `0.4/0.5`，也不自动承诺新的 npm/Git 版本。

```text
C1 Quality Intelligence
→ C2 Change Intelligence & Quality Obligation
→ C3 Quality Evidence Graph
→ C4 QA Agent Loop
→ C5 Adapter Ecosystem
→ C6 Quality Policy Engine
→ C7 Multi-Agent QA
→ C8 Autonomous Quality Engineering
```

下一阶段只有在 `1.0` 的工作台主路径、测试和文档验收完成后，才进入独立的需求、方案、技术设计和实施计划。
