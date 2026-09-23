# DSH QA Workbench `0.4.1`—`1.0.0` 方案文档

## 1. 推荐方案

以“先稳定宿主边界，再扩展执行和智能”为主线：

```text
Harness RPC contract
        ↓
Official Panel/Slot integration
        ↓
Native QA execution adapters
        ↓
Evidence-first quality intelligence
        ↓
Auditable AI-native QA workbench
```

继续复用 `server/store.js`、`server/quality/*`、原生 HTTP/SSE、JSON 存储和现有 iframe Workbench。迁移的重点是宿主接入边界，不是把 Workbench 重写成 React 或新建第二套产品。

## 2. 目标主链路

```text
Harness sidebar.panellist
  → dsh-qa main keyed slot
  → Workbench iframe
  → Quality Task / Execution Profile
  → Harness Browser Use / Computer Use / MCP
  → TestRun
  → EvidenceBundle
  → Failure Analysis / Regression Recommendation
  → Quality Gate Recommendation
  → 人工审批或继续执行
```

独立模式继续支持项目、质量 API 和本地确定性测试；没有 DSH 宿主时，Browser/Computer/MCP 和 prompt 能力显示降级状态，不伪造 session 或 host evidence。

## 3. 分版方案

### 3.1 `0.4.1`：Compatibility Hardening

保留当前 RPC 方向：`agentPresets/list`、`session/list`、`session/modelCatalog`、`skills/list`、`commands/list`、`session/follow` 和 `session/prompt`。通过契约测试锁定：

- `client-request` 的 `type`、`rpcId`、slash `method` 和 `payload.args`。
- `session/follow` 的 WebSocket open frame、session address、`maxMessages`、snapshot 和 `snapshot.records`。
- 旧 dot-style API Proxy、Remote Pair 和 deprecated history API 不重新引入。
- 真实宿主的 plugin load、preset、Session、model、skills、commands、iframe、refresh 和 reconnect。

0.4.1 只加固兼容性和证据记录，不在宿主 DOM 之上继续扩展 UI 注入。

### 3.2 `0.5.0`：Native Harness Panel Integration

官方 Panel API 负责“入口 + 主内容”的选择关系：

```text
sidebar.panellist: { id: "dsh-qa", ... }
                         │
                         └── main keyed slot: key "dsh-qa"
                                      │
                                      └── iframe /api/dsh-qa/workbench/
```

`lib/client.js` 只负责注册 Panel、渲染/卸载 iframe 和桥接返回消息，不再查询 Harness 具体 DOM。面板激活状态由宿主选择状态负责，不能由多个插件通过自定义 document event 互相清理。

### 3.3 `0.6.0`：Native QA Execution & Action Desk

Execution Profile 增加 host provider 维度，但仍归属于现有 Quality Task：

```text
QualityTask
  → ExecutionProfile(provider, capabilities, policy)
  → HostExecutionRequest
  → Browser Use / Computer Use / MCP
  → HostExecutionResult
  → TestRun provenance
  → EvidenceBundle finalize + verify
  → Action Queue
  → Workbench 首页“需要你处理”
```

每个 provider 都通过统一 adapter contract。工具名、目标、读写范围、超时和 artifact 能力在请求中显式声明；不允许从模型文本直接拼任意 host command。

Action Queue 只读聚合 HostExecution、TestRun、EvidenceBundle、Gate 和现有提醒，
通过稳定的 ActionItem、reason code 和受控 target 提供首页行动入口；它不写入
质量事实，也不替代 Gate 或人工审批。

### 3.4 `0.7.0`：AI Quality Intelligence

把现有质量事实变成候选洞察：

```text
Evidence + Failure + Regression + Gate
        ↓
Deterministic Insight Rules
        ↓
Auto Review（可选）
        ↓
Explanation / Recommendation
        ↓
Human Action
```

确定性规则负责可计算缺口；AI 只处理结构化上下文，返回带证据引用的候选结果。建议不得直接写入 Gate 或将 `BLOCK` 改成 `PASS`。

### 3.5 `1.0.0`：AI-Native QA Workbench

1.0 把 Panel、执行、洞察和受控 Agent Run 串成一条可观察流程。Agent 通过领域服务和工具白名单工作，有预算、超时、重试、审批和终止状态；发布和安全动作仍由人工决定。

## 4. 方案取舍

| 选项 | 结论 |
| --- | --- |
| 继续 querySelector + MutationObserver | 拒绝；宿主 implementation detail 不作为 0.5 架构 |
| 重写 Workbench 前端 | 拒绝；iframe 和原生前端边界继续保留 |
| 0.4.1 直接做 RPC compatibility facade | 拒绝；当前核心 RPC 已是正确方向，先做真实验证 |
| 让 AI 直接评估/修改 Gate | 拒绝；Evidence 和确定性 Policy 仍是事实边界 |
| 一次性接入全部 MCP/浏览器工具 | 拒绝；按 provider contract 和最小白名单逐步接入 |
| 0.8/0.9 继续作为并行版本 | 暂停；先完成 0.4.1→0.7→1.0 主线 |

## 5. 风险和缓解

| 风险 | 缓解 |
| --- | --- |
| 0.1.6 alpha API 仍变化 | 记录精确 Harness tag/commit；宿主冒烟作为独立验收项 |
| Panel API 形状不清 | 先锁定官方 slot contract，再实现单一注册适配层；不留 selector fallback |
| Host execution 结果无法追溯 | 所有结果先进入 TestRun provenance，再 finalize EvidenceBundle |
| AI 建议被误读成结论 | UI 显示 suggestion/draft 状态、evidenceRefs 和人工动作，不改变 Gate |
| 真实宿主不可用 | 保留 `NOT_RUN`/`BLOCKED`，本地 contract/fake adapter 只能证明局部行为 |

## 6. 与前序文档关系

- 质量事实和 `PASS/WARN/BLOCK` 规则以 `2026-08-25-*` 质量域文档及 v0.4.0 实现状态为准。
- 当前分版目标和验收以 `2026-09-15-requirements.md` 为准。
- Post-1.0 的 Quality Obligation、Graph、Adapter、Policy、Multi-Agent 和 Autonomous QE 仍在 [post-1.0-capability-roadmap.md](./post-1.0-capability-roadmap.md)。
