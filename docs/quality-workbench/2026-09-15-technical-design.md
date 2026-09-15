# DSH QA Workbench `0.4.1`—`1.0.0` 技术文档

## 1. 代码落点

```text
public/app.js                         # RPC、Session follow、Workbench 状态
public/index.html                     # 契约 helper 的加载顺序
lib/client.js                         # 0.5 官方 Panel/Slot 注册与 iframe 生命周期
test/unit/dsh-compatibility.test.js   # 当前 endpoint 和旧 API 防回归
test/unit/dsh-rpc-contract.test.js    # request/follow envelope
test/e2e/dsh-host-compatibility.spec.js # opt-in 真实 Harness 宿主冒烟
server/quality/harness-execution.js   # 0.6 HostExecution adapter 边界
server/quality/insights/               # 0.7 确定性洞察和 AI 候选建议
server/agent/                          # 1.0 受控 Agent Run（不直接改 store）
```

保持 Node ESM、Node 18+、原生 HTTP/SSE、JSON store 和零生产依赖。宿主专用 API 不扩散到 `server/quality/*` 的核心领域模型。

## 2. 全局技术约束

- 现有 `{ ok: true, ... }` / `{ ok: false, error, code? }` 响应形状继续有效。
- 更新质量实体继续使用 `expectedRevision`；冲突为 `409`。
- Host execution、AI suggestion 和 Agent action 都使用字段白名单；客户端或模型不能提交 `verdict`、`resultTrust`、`integrity` 等派生事实。
- `QA_DATA_DIR` 在服务模块动态导入前设置；API/服务测试串行运行。
- unit/API、独立 Workbench E2E、真实 Harness host smoke、CI 和 package/Release 状态分别记录。
- 目标 Harness 的运行版本必须精确记录为 `dsh-v0.1.6-alpha.1` 或实际 commit；不能用 “latest” 作为兼容证据。

## 3. `0.4.1` RPC compatibility contract

### 3.1 Client request envelope

发送 unary request 的最小结构固定为：

```js
{
  type: 'client-request',
  rpcId: 'unique-request-id',
  method: 'agentPresets/list',
  payload: { args: {} }
}
```

当前调用清单至少包括：

```text
agentPresets/list
agentPresets/select
session/list
session/create
session/rename
session/modelCatalog
session/selectModel
session/prompt
session/cancel
skills/list
commands/list
commands/execute
```

契约测试必须拒绝点号旧路由，例如 `agentPreset.list`、`session.history`、`skill.list`，也必须确认 Remote Pair UI/HTTP 不回归。

### 3.2 Follow stream envelope

`session/follow` 继续通过 `/api` WebSocket mux 打开 stream：

```js
{
  type: 'open',
  streamId,
  endpoint: 'session/follow',
  payload: {
    args: {
      request: {
        address: { kind: 'session', sessionId },
        maxMessages
      }
    }
  }
}
```

解析器读取 snapshot 的 `records` 和 `cursor`，不重新使用已弃用的 `snapshotEvents`、`eventAt` 或 `ownEvents`。

### 3.3 Compatibility status

`docs/quality-workbench/2026-09-15-harness-compatibility.md` 维护每个项目的状态。静态契约通过不等于 host smoke 通过；真实宿主不能运行时，状态只能是 `NOT_RUN` 或 `BLOCKED`。

## 4. `0.5.0` Panel/Slot contract

`lib/client.js` 提供一个唯一的宿主注册适配层：

```text
registerDshQaPanel(ctx)
  → sidebar.panellist entry { id: 'dsh-qa', label, icon, selection }
  → main keyed slot entry { key: 'dsh-qa', render, dispose }
```

实际调用名以锁定的 `dsh-v0.1.6-alpha.1` 官方类型/实现为准，但适配层对本仓库暴露的语义固定为上面两项。实现必须：

- 使用相同 `dsh-qa` ID 建立 sidebar entry 和 main keyed slot 的关联。
- 通过官方 selection 状态显示/隐藏 Workbench，不写 `data-dsh-qa-active`。
- iframe 创建、加载、卸载、popout 和 `postMessage` 返回 DSH 都有 disposer。
- 源码中不再出现 `MutationObserver`、`sidebarCol`、`centerCol`、`logoRow`、`newSession` 和 `dsh-panel-activate`。

## 5. `0.6.0` Host execution contract

### 5.1 Request

```js
{
  projectId,
  qualityTaskId,
  profileId,
  provider: 'browser-use' | 'computer-use' | 'mcp',
  capability: 'navigate' | 'interact' | 'inspect' | 'tool-call',
  target,
  timeoutMs,
  artifactPolicy: { screenshots: true, trace: true, logs: true },
  expectedRevision
}
```

服务端只接受已登记 Execution Profile 允许的 provider/capability；未列入白名单、超时或目标越界直接拒绝。

### 5.2 Result mapping

```text
HostExecutionResult
  → TestRun { status, resultTrust, provenance, hostExecutionRef }
  → staging artifacts
  → finalizeEvidence()
  → verified EvidenceBundle
```

Host 错误、取消、断线、重试和部分产物都保存状态。`imported-summary` 或未经验证的 host summary 不能满足 Gate 的 required evidence。

## 6. `0.7.0` Quality Intelligence contract

### 6.1 Deterministic insight

```js
analyzeQualityFacts(snapshot) → {
  insights: [{ id, kind, target, reason, evidenceRefs, severity, status }],
  inputDigest,
  generatedAt
}
```

首批规则读取已保存的 requirement/test/evidence/failure/regression/gate facts，重复分析同一 `inputDigest` 不创建重复洞察。规则结果可 `resolve`/`ignore`，写入需要操作者和 revision。

### 6.2 AI candidate

```js
reviewQualitySnapshot(snapshot) → {
  recommendations: [{ type, target, reason, evidenceRefs, confidence, nextAction }]
}
```

AI 返回被视为不可信输入，必须经过 schema、长度、引用存在性和状态校验。它不能直接写 Store、创建缺陷、修改 RegressionSet 或修改 Gate verdict。

## 7. `1.0.0` Agent Run contract

```js
{
  id,
  projectId,
  goal,
  status: 'running' | 'satisfied' | 'blocked' | 'approval_required' | 'budget_exceeded',
  phase: 'observe' | 'plan' | 'act' | 'verify' | 'reflect',
  maxSteps,
  maxRetries,
  timeoutMs,
  budget,
  actions: [{ type, tool, risk, requiresApproval, status }],
  decisionRefs: []
}
```

Agent 只能调用白名单领域服务和已批准工具；发布、例外、风险接受、生产执行和安全敏感操作始终进入 `approval_required`。Agent 不能把外部文本当系统指令，也不能直接编辑 JSON store。

## 8. 测试策略

| 层级 | 必须证明 |
| --- | --- |
| Unit | endpoint/旧路由防回归、request/follow envelope、snapshot.records 解析、adapter allowlist、insight digest、Agent 状态机 |
| Local API | host execution preview/start/status 的 revision、白名单、超时和错误；insight resolve/ignore 的审计 |
| Standalone E2E | Workbench 独立打开、质量任务/本地 fake execution、Evidence、Insight 空/有数据状态 |
| Host smoke | 0.4.1 的真实宿主清单；0.5 Panel selection；0.6 host execution；1.0 主链路 |
| Delivery | `npm test`、`git diff --check`、package dry-run、CI 和 Release/tag 状态分别验证 |
