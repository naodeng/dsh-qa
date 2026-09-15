# Post-1.0 Capability Roadmap

本文承接 `dsh-qa` 的 `0.4.1–1.0` Harness 集成路线，整理仍然属于长期演进的 Quality Obligation、Evidence Graph、Adapter、Policy、Multi-Agent 和 Autonomous QE 方向。本文是能力路线，不是当前 Release 计划、实现状态或已批准的代码任务清单。

## 1. 定位

`0.4.1–1.0` 先解决：

```text
宿主接入、Panel、原生执行、Quality Intelligence 和受控 Agent 主路径能不能稳定完成一次质量闭环？
```

Post-1.0 再解决：

```text
系统能不能理解变化、推导质量义务、组织验证行动，并解释交付决定？
```

目标演进为：

```text
QA Workbench
    ↓
Quality Control Plane
    ↓
Autonomous Quality Engineering
```

能力阶段使用 `C1–C8` 标识。`C1 Quality Intelligence` 已前移为当前 `0.7.0` 的主线，`C4 QA Agent Loop` 在 `1.0.0` 建立受控基础；本文件只保留它们的长期扩展边界。只有在某个能力阶段完成独立需求、技术设计、实现和 Release 验收后，才决定是否映射到正式版本。

## 2. 共同原则

### 2.1 Evidence First

质量结论必须尽量回溯到事实、规则和证据：

```text
Evidence → Rule → Reasoning → Recommendation
```

禁止把“模型说通过”当作质量证据。

### 2.2 Deterministic Before AI

能够由确定性规则判断的事实优先由规则计算，例如关键测试失败、证据缺失、provenance 过期和未处置的 critical 风险。

AI 主要负责理解、关联、解释、排序和建议，不替代确定性门禁。

### 2.3 AI Suggests, Policy Decides

AI 可以提出风险、测试和行动建议；Policy Engine 和领域服务负责计算结果；人工负责发布审批、风险接受和高风险动作确认。

### 2.4 Draft Is Not Effective State

变更影响、测试范围、回归集和 Agent 计划可以先生成草稿。草稿只有经过明确确认、revision 校验和领域规则验证后，才能写入有效状态。

### 2.5 External Content Is Untrusted Data

需求、README、日志、测试输出和缺陷描述都是输入数据，不能通过 Prompt Injection 改变系统指令、权限或审批边界。

### 2.6 Local First, Contract Before Platform

优先保持现有 Node ESM、原生 HTTP/SSE、JSON 存储和零生产依赖。先稳定领域契约和 Adapter Contract，再考虑 Graph Database、云端执行或平台化。

## 3. 能力总览

| 阶段 | 名称 | 核心问题 | 直接依赖 |
| --- | --- | --- | --- |
| C1 | Quality Intelligence | 哪里存在质量缺口和风险？ | `0.7.0`、`0.2–0.5` 质量事实 |
| C2 | Change Intelligence & Quality Obligation | 这次变化必须证明什么？ | C1、Git/Requirement 来源 |
| C3 | Quality Evidence Graph | 为什么这个结论成立？ | C2、Evidence、Gate |
| C4 | QA Agent Loop | 如何组织一次可控的质量行动？ | C1–C3、DSH 工具 |
| C5 | Adapter Ecosystem | 如何接入不同测试工具而不改 Core？ | TestRun、Evidence、C4 |
| C6 | Quality Policy Engine | 不同项目如何声明质量规则？ | Gate、Graph、C5 |
| C7 | Multi-Agent QA | 多个专业 Agent 如何协同？ | C3、C4、C6 |
| C8 | Autonomous Quality Engineering | 如何持续观察软件变化并反馈？ | C1–C7、外部信号 |

## 4. C1：Quality Intelligence（已前移至 0.7.0）

`C1` 不再是本文件的首个 Post-1.0 交付目标。当前实现计划见 [2026-09-15-workbench-0.7.0.md](../superpowers/plans/2026-09-15-workbench-0.7.0.md)，范围是确定性 gap rules、schema-validated Auto Review、证据引用和人工动作边界。

Post-1.0 只保留 C1 的长期扩展：跨项目质量模式、长期趋势、复杂上下文关联和经过审计的解释排序。扩展仍不能修改 Gate 事实，也不能把缺失证据推断为覆盖。

## 5. C2：Change Intelligence & Quality Obligation

### 目标

把“测试什么”从人工口头判断提升为可追踪的质量义务：

```text
Change → Impact → Risk → Quality Obligation → Test / Evidence
```

### 核心区别

```text
Quality Obligation = 必须被证明的 WHAT
Test              = 证明它的 HOW
```

例如：

```text
代码变化：退款重试逻辑变化
Quality Obligation：超时后的重试必须保持幂等
Test：refund-timeout.spec.ts
```

### 方案

第一阶段支持：

- Git commit / diff
- workspace 文件变化
- Requirement 变化
- Config 变化
- 手工记录的 Change

第一阶段不强制做全语言 AST。先使用文件、目录、关键词、已有 Requirement、TestCase 和历史缺陷做稳定可测的关联。

### 具体实现方向

建议模型：

```json
{
  "id": "qo_001",
  "projectId": "project_001",
  "sourceType": "change",
  "sourceId": "change_001",
  "target": "refund-service",
  "type": "behavior_validation",
  "statement": "Refund timeout retry must remain idempotent",
  "risk": "high",
  "requiredEvidence": ["functional-test", "execution-result"],
  "status": "open",
  "testIds": [],
  "evidenceIds": []
}
```

建议拆出：

```text
server/quality/change.js
server/quality/change-impact.js
server/quality/obligation.js
```

变更分析先返回草稿，并保存 `inputDigest`。只有用户确认且 digest、revision 仍匹配时，才更新 QualityTask 的 test scope 或创建 RegressionSet。

### 完成标准

- 输入变化、关联范围、风险和 Quality Obligation 可分别查看。
- Obligation 与 TestCase、Evidence 的关系可追踪。
- 草稿不会自动落库为有效测试范围或回归集。
- 关联不确定时显示 `unknown` 或 `needs-review`，不强行声称覆盖。
- 变更来源发生变化后，旧草稿不能直接应用。

## 6. C3：Quality Evidence Graph

### 目标

回答：

```text
为什么 Requirement 是 PASS？
为什么 Release 是 BLOCK？
一个 Test 到底证明了什么？
```

### 方案

第一阶段不引入 Graph Database，使用可迁移的 JSON 节点和边投影：

```text
Change
Requirement
AcceptanceCriterion
Risk
QualityObligation
Test
Execution
Evidence
Defect
Decision
```

关系示例：

```text
Change IMPACTS Requirement
Requirement HAS_AC AcceptanceCriterion
AcceptanceCriterion CREATES_OBLIGATION QualityObligation
QualityObligation VERIFIED_BY Test
Test EXECUTED_AS Execution
Execution PRODUCES Evidence
Evidence SUPPORTS QualityObligation
QualityObligation CONTRIBUTES_TO Decision
```

### 具体实现方向

优先做只读投影和路径查询：

```text
GET /api/projects/:id/graph
GET /api/graph/node/:id
GET /api/graph/node/:id/relations
GET /api/graph/path
```

UI 先做 Tree/Trace View，不先做复杂可视化。Gate 的 explain 结果引用已保存的节点、边和证据，不另建一套 verdict 算法。

### 完成标准

- 节点和边类型有稳定 Schema 版本。
- 关系来源可回到原始实体和证据。
- 查询不到完整链路时显示缺失或未知，不补齐推测路径。
- Graph 只是投影时不改变原始事实。
- Graph 版本迁移和旧数据兼容有测试。

## 7. C4：QA Agent Loop

`1.0.0` 只交付受控 AgentRun 基础：状态、白名单动作、审批、预算、超时、redaction 和终止状态。本节描述跨项目编排、长期记忆和更复杂反思循环等 Post-1.0 扩展。

### 目标

从“AI 助手回答问题”进入“可观察、可审批、可终止的 QA Agent 运行”：

```text
Observe → Understand → Plan → Act → Verify → Reflect → Update
```

### 方案

`AgentRun` 保存一次目标明确的运行：

```json
{
  "id": "agent_run_001",
  "projectId": "project_001",
  "goal": "Assess release readiness",
  "status": "running",
  "phase": "verify",
  "observations": [],
  "plan": [],
  "actions": [],
  "decisions": []
}
```

每个 Action 必须声明工具、风险和审批要求：

```json
{
  "type": "run_test",
  "tool": "playwright",
  "risk": "low",
  "requiresApproval": false
}
```

必须人工审批：发布、Gate Exception、风险接受、破坏性执行、生产执行和安全敏感动作。

### 具体实现方向

建议模块：

```text
server/agent/runtime/
server/agent/actions/
server/agent/approvals/
```

Agent 通过领域服务和工具白名单行动，不能直接改 JSON。所有运行必须有 `maxSteps`、`maxRetries`、`timeout`、`budget` 和 `noProgressThreshold`。

### 完成标准

- Agent 状态机、审批、重试、超时、工具失败和预算耗尽都有测试。
- 工具调用和决策可审计，并进行 Secret Redaction。
- Agent 不能把外部文本当作系统指令。
- Agent 不能绕过 Gate、Evidence 或人工审批。
- Agent 运行可以明确结束于 `satisfied`、`blocked`、`approval_required` 或 `budget_exceeded`。

## 8. C5：Adapter Ecosystem

### 目标

把测试工具从 Core 中解耦，使新增执行器不需要修改质量领域模型。

### Adapter Contract

```javascript
export interface TestAdapter {
  detect()
  validate()
  execute()
  parseResult()
  collectEvidence()
}
```

优先顺序：

1. Playwright、Pytest、JUnit、Cypress
2. Postman、Bruno、Allure
3. JMeter、k6、Gatling

统一结果：

```json
{
  "adapter": "playwright",
  "status": "failed",
  "summary": { "total": 100, "passed": 95, "failed": 5, "skipped": 0 },
  "tests": [],
  "artifacts": [],
  "startedAt": "",
  "finishedAt": ""
}
```

### 完成标准

- Adapter Manifest 声明版本、能力和安全要求。
- 每个 Adapter 通过统一 Contract Test。
- Adapter 输出不能跳过 TestRun、EvidenceBundle 和 provenance 校验。
- 第三方 Adapter 不需要修改 Core 的 Gate、Graph 或 Project 模型。
- SDK 是否拆成独立包，要等 Contract 稳定后再决定。

## 9. C6：Quality Policy Engine

### 目标

把项目质量门禁从硬编码规则演进为可版本化的 Policy as Code。

### 方案

初期只支持项目级策略，例如：

```yaml
version: 1
release:
  critical-risk:
    require:
      evidence: verified
  tests:
    critical_failed: 0
  defects:
    blocker: 0
  regression:
    required: true
```

执行链：

```text
Quality State
 → Policy Loader
 → Policy Validator
 → Rule Evaluation
 → Gate Findings
 → Decision
```

### AI 边界

AI 可以解释 Policy、建议 Policy、分析失败和推荐下一步，但不能覆盖 Policy，也不能直接把 `BLOCK` 改成 `PASS`。

### 完成标准

- Policy Schema 和版本迁移可测试。
- 同样输入和同一 Policy 版本得到确定性结果。
- Gate 保存 Policy 版本和输入快照。
- 例外规则明确哪些检查不可豁免。
- Policy 变更不会修改历史 Gate 的原始结果。

## 10. C7：Multi-Agent QA

### 目标

只有单 Agent Loop、Graph、Policy 和 Adapter 契约稳定后，才拆分专业 Agent。

候选角色：

```text
Requirement Agent
Risk Agent
Test Strategy Agent
Test Design Agent
Execution Agent
Failure Analysis Agent
Regression Agent
Evidence Agent
Quality Gate Agent
```

### 方案

使用 Quality Graph 作为共享质量状态：

```text
QA Orchestrator
      ↓
任务分解、依赖、重试、审批、预算、终止
      ↓
Specialist Agents
      ↓
Quality Graph + Evidence + Decision
```

禁止每个 Agent 私自维护一份互不一致的项目事实。消息必须包含任务、输入引用、输出、证据引用和置信度；置信度只能用于排序，不能代替证据。

### 完成标准

- 每个 Agent 的输入、输出和权限可审计。
- Orchestrator 能处理依赖、失败、重试、超时和无进展。
- Agent 之间不能绕过统一审批和 Policy。
- 共享状态冲突有明确的 revision/reconciliation 规则。

## 11. C8：Autonomous Quality Engineering

### 目标

形成持续质量循环：

```text
Observe → Analyze → Risk → Obligation → Test Plan
→ Execute → Evidence → Evaluate → Decision → Feedback
```

输入可以逐步扩展为：

- Requirement Change
- Git Commit / Pull Request
- Test Result
- Defect
- Production Incident
- Observability Signal
- Dependency Update
- Configuration Change

输出包括：

- Risk
- Quality Obligation
- Test Strategy
- Test / Execution
- Evidence
- Insight
- Release Recommendation

### 前置条件

C8 不是单纯增加一个自动化按钮，必须先具备：

- 稳定的 Domain、Graph、Adapter、Agent 和 Policy Contract。
- 完整的 Agent Run Log、Tool Call Log、Decision Log 和 Policy Evaluation Log。
- Secret Redaction、权限分级、Prompt Injection 防护和人工审批。
- 明确的外部系统失败、延迟、重复事件和数据冲突处理。

### 完成标准

- 系统可以解释每个 Release Recommendation 的完整路径。
- 任何未知、冲突、未执行或证据过期状态都不会被隐藏成通过。
- 自动化动作拥有可撤销、可终止和可审计边界。
- “Autonomous” 不等同于自动发布，生产发布仍由外部审批体系决定。

## 12. 阶段依赖与实施顺序

```text
0.4.1 Compatibility → 0.5 Panel → 0.6 Native Execution
          ↓
0.7 C1 Quality Intelligence → 1.0 bounded Agent foundation
          ↓
C2 Obligation → C3 Evidence Graph
          ↓
C5 Adapter + C6 Policy → C7 Multi-Agent → C8 Autonomous QE
```

C5 和 C6 在 C4 后可以并行设计，但都必须复用既有 TestRun、Evidence 和 Gate 契约。C7 不应在 C4、C5、C6 未稳定前提前开始。

每个能力阶段都需要独立产出：

```text
requirements.md
solution-design.md
technical-design.md
implementation-plan.md
implementation-status.md
release-notes.md
```

## 13. 长期不做项

在 `1.0` 稳定工作台完成前，不把以下事项列入当前路线必达：

- Graph Database、Neo4j 或 Vector Database
- 云端 SaaS、多用户 RBAC 和复杂组织权限
- CI 云端调度和跨机器分布式执行
- 自动创建外部 Jira/缺陷单
- 自动生产发布
- 大量 LLM Provider Adapter
- 没有可验证证据的自动 `PASS`

## 14. 文档状态标记

本文件中的措辞应区分：

| 标记 | 含义 |
| --- | --- |
| `Current` | 当前仓库已经存在并经过当前版本验证的事实 |
| `Baseline` | 前序文档记录的能力，需重新验证后才能用于 Release 声明 |
| `Proposed` | 候选设计，尚未批准实施 |
| `Planned` | 已批准进入某个版本的计划 |
| `Verified` | 有当前回合可检查的测试或交付证据 |
| `Blocked` | 因依赖、权限、环境或外部系统未能验证 |

Post-1.0 的 C2/C3/C5/C6/C7/C8 以及 C1/C4 的长期扩展目前属于 `Proposed`，不应在 README、Release 或产品页面中描述为已具备能力。当前 `0.7.0` 和 `1.0.0` 的计划必须分别依据本轮实现和验证证据判断。
