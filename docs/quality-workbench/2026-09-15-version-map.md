# dsh-qa 版本语义与路线边界

本文是当前版本路线的唯一索引。它区分已发布事实、历史质量域计划和当前实施中的 Harness 集成路线；不把计划、代码存在或局部测试结果写成正式 Release。

## 1. 当前发布基线

当前 `master` 和最新 Git tag 基线是 `v0.5.2`。该版本在 0.5.1 的 Harness 0.1.7 兼容性修订之上，增加双语设置、项目版本信息和分页版本迭代记录；对应事实记录见 [2026-08-27-implementation-status.md](./2026-08-27-implementation-status.md)、[2026-09-22-harness-0.1.7-impact-assessment.md](./2026-09-22-harness-0.1.7-impact-assessment.md) 和 [CHANGELOG.md](../../CHANGELOG.md)。npm、Git tag 和 GitHub Release 仍作为独立交付事实记录。

下面这些事实不能混为一谈：

- 代码或历史实现状态文档记录了什么。
- 本轮针对改动重新运行了哪些测试。
- npm、Git tag、GitHub Release 或宿主兼容性是否已经交付。

`0.5.0 Native Harness Panel Integration` 已完成并发布；`0.5.1` 作为兼容性修订版完成 Harness 0.1.7 preset bundle 迁移、Panel popout/frame readiness 修复，并在 `qa` bundle 上完成真实 Host Smoke `6 passed`。`quality-control` 独立 bundle 的真实宿主运行仍不在本次验证范围内。

`0.5.2` 作为工作台体验修订版增加设置弹窗、双语项目元信息、版本更新提示和分页版本迭代，并移除不再需要的主题与工作区宽度预设；`quality-control` 独立 bundle 的真实宿主运行仍不在本次验证范围内。

## 2. 当前有效路线

```text
v0.4.0 已发布：Quality Evidence + Quality Gate
        ↓
v0.4.1 Harness 0.1.6 Compatibility（历史基线）
        ↓
0.5.0 Native Harness Panel Integration（已发布，宿主 `5/6` 通过；插件卸载与恢复已人工验证）
        ↓
0.6.0 Native QA Execution & Action Desk
        ↓
0.7.0 AI Quality Intelligence
        ↓
1.0.0 AI-Native QA Workbench
        ↓
Post-1.0：Quality Obligation、Evidence Graph、Adapter、Policy、Multi-Agent、Autonomous QE
```

`0.8.0` 和 `0.9.0` 暂不作为当前发布节点。此前独立的行动台、对话工作台、变更与回归、证据与交付体验计划仍保留为历史草案；Action Desk 只以本路线中定义的受控 Action Queue 子集进入 `0.6.0`，不从旧文件直接开工。

## 3. 版本边界

| 版本 | 状态 | 主题 | 本版核心问题 | 不提前承诺 |
| --- | --- | --- | --- | --- |
| `0.4.0` | Released | 质量证据与门禁 | 结果能否形成可信证据并支持交付判断？ | Harness 0.1.6 宿主兼容、官方 Panel API |
| `0.4.1` | Verified historical baseline | Harness 0.1.6 兼容性加固 | 当前 RPC、Session、Workbench 主路径能否在真实宿主跑通？ | 官方 Panel API 迁移 |
| `0.5.0` | Released: host `PASS_WITH_LIMITATION` | Native Harness Panel Integration | 如何通过官方 Slot/Panel 进入工作台，而不是寻找宿主 DOM？ | 测试执行智能化、AI 自动结论 |
| `0.5.2` | Released | Bilingual settings and release history | 如何让项目元信息、版本提醒和迭代记录在工作台内可见且可追踪？ | 主题与工作区宽度预设、测试执行智能化、AI 自动结论 |
| `0.6.0` | Planned | Native QA Execution & Action Desk | 如何把 Execution Profile 接到 Browser Use、Computer Use 或 MCP，留下 TestRun/Evidence，并让用户立即看到需要处理的执行状态？ | 任意工具调用、无证据 PASS、AI 自动分析 |
| `0.7.0` | Planned | AI Quality Intelligence | 如何从 Evidence、Failure、Regression 和 Gate 事实给出可解释建议？ | AI 直接改 Gate 或替代人工审批 |
| `1.0.0` | Planned | AI-Native QA Workbench | 如何把 Panel、执行、智能分析和受控 Agent Loop 收束成可依赖主路径？ | 自动生产发布、无限权限自治 |

### 3.1 `0.4.1` 的验收边界

必须分别记录以下证据：

- 静态/契约检查：RPC 使用 slash endpoint 和当前 envelope，不重新引入已移除的 Remote Pair 或旧 API Proxy。
- 本地 Workbench 测试：preset、Session、model catalog、skills、commands、follow、prompt 的调用与错误处理。
- 真实 Harness 宿主冒烟：插件加载、QA preset 发现、Session create/rename/follow/prompt、模型、Skills、Commands、Workbench 加载、刷新和 reconnect。
- 文档事实：真实宿主矩阵已通过，因此 README 可以写入 `dsh-v0.1.6-alpha.1 tested`；这不等同于 npm、Git tag 或 GitHub Release 已公开发布。

`agent/created` 当前没有被 dsh-qa 核心路径直接使用，记录为后续自动创建质量任务时的兼容性关注点，不作为 0.4.1 的阻断项。

### 3.2 `0.5.0` 的架构边界

迁移目标是官方 Panel/Slot API：

```text
sidebar.panellist entry: id = dsh-qa
              ↓
root-scoped main keyed slot: key = dsh-qa
              ↓
QA Workbench iframe
```

必须移除或停止依赖：

- `sidebarCol`、`centerCol`、`logoRow`、`newSession` 等宿主 DOM selector。
- `MutationObserver` 自愈注入。
- `data-dsh-qa-active` 等自建激活状态和 `dsh-panel-activate` 互斥协议。

iframe、`/api/dsh-qa/workbench/`、返回 DSH 消息和独立模式仍可保留；迁移的是“如何被宿主挂载”，不是重写 Workbench 本身。

## 4. 历史质量域文档的解释

`docs/quality-workbench/2026-08-25-*` 记录的是早期质量域拆分：`0.2` 质量任务、`0.3` 受控执行、`0.4` 证据与回归、`0.5` 门禁与交付。它们是 v0.4.0 之前的设计/实施历史，不能覆盖本表的当前 Release 顺序。

尤其是 [2026-08-25-quality-workbench-0.5.0.md](../superpowers/plans/2026-08-25-quality-workbench-0.5.0.md) 已作为质量门禁历史计划完成并进入 v0.4.0 基线；当前 `0.5.0` 指 Native Harness Panel Integration，活动计划见 [2026-09-15-workbench-0.5.0.md](../superpowers/plans/2026-09-15-workbench-0.5.0.md)。

## 5. Post-1.0 边界

`Quality Intelligence` 已从原来的 Post-1.0 候选前移到 `0.7.0`。`1.0.0` 只建立受控、可审计的 AI-Native QA Workbench 主路径；完整的 Quality Obligation、Evidence Graph、Adapter Ecosystem、Policy Engine、Multi-Agent QA 和 Autonomous QE 仍进入 [Post-1.0 Capability Roadmap](./post-1.0-capability-roadmap.md)。

这些能力必须继续遵守：

- Evidence First：结论回到事实、规则和证据。
- Deterministic Before AI：确定性门禁不由模型覆盖。
- Draft Is Not Effective State：草稿经过人工确认、revision 和 digest 校验后才能生效。
- External Content Is Untrusted Data：需求、日志、测试输出和模型返回都不是系统指令。
