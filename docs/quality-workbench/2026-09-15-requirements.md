# DSH QA Workbench `0.4.1`—`1.0.0` 需求文档

## 1. 路线决策

- `v0.4.0` 是当前已发布基线，已有证据、回归和质量门禁能力不重做。
- `0.4.1` 先锁定 Harness `dsh-v0.1.6-alpha.1` 的真实兼容性；不能用本地 Workbench 测试替代真实宿主冒烟。
- `0.5.0` 迁移到 Harness 官方 Panel/Slot API；保留 Workbench iframe，不重写整个前端。
- `0.6.0` 把 Execution Profile 接到 Harness Browser Use、Computer Use 或 MCP，并把结果映射回现有 TestRun/EvidenceBundle。
- `0.7.0` 做 Evidence-first 的 AI Quality Intelligence；AI 只生成可解释建议，不能直接改变 Gate。
- `1.0.0` 收束为可审计、可终止、可人工审批的 AI-Native QA Workbench。
- `0.8.0` 和 `0.9.0` 暂不作为当前 Release 节点；原有计划只保留历史记录。

## 2. 用户和问题

主要用户仍是使用 DeepSeek Harness 完成测试工作的 QA / 测试负责人。当前最优先的问题不是再增加一组业务实体，而是：

1. dsh-qa 的 RPC 和 Session 路径能否在目标 Harness 宿主真实运行。
2. Workbench 是否通过官方 Panel API 接入，而不是依赖宿主 DOM implementation detail。
3. Harness 的浏览器、计算机和 MCP 能力能否进入受控 QA 执行，并留下可信证据。
4. Evidence、失败分析、回归和 Gate 事实能否形成可解释的智能建议。

## 3. 版本范围总览

| 版本 | 主题 | 目标 |
| --- | --- | --- |
| `0.4.1` | Harness 0.1.6 Compatibility | 验证 RPC、Session、Workbench 主路径，并明确未验证边界 |
| `0.5.0` | Native Harness Panel Integration | 用 `sidebar.panellist` 和 root-scoped `main` keyed slot 取代 DOM 注入 |
| `0.6.0` | Native QA Execution | Execution Profile → Harness Browser/Computer/MCP → TestRun → EvidenceBundle |
| `0.7.0` | AI Quality Intelligence | Evidence → Auto Review → Failure Analysis → Regression Recommendation → Gate Recommendation |
| `1.0.0` | AI-Native QA Workbench | 把 Panel、执行、智能分析和受控 Agent Loop 收束成可依赖主路径 |

## 4. 分版必须交付

### 4.1 `0.4.1` Harness 0.1.6 Compatibility

- 自动化契约检查覆盖当前 slash RPC endpoint、`client-request` envelope、`session/follow` WebSocket open frame 和 `snapshot.records`。
- 本地测试覆盖 preset、Session、model catalog、skills、commands、prompt、cancel、model select 的成功和错误处理。
- 真实 Harness 冒烟覆盖插件加载、QA preset discovery、Session create/rename/follow/prompt、model、skills、commands、Workbench load、refresh 和 reconnect。
- 兼容矩阵保存 Harness 版本、dsh-qa commit、结果、日志/截图和 `NOT_RUN`/`BLOCKED` 状态。
- 只有真实宿主清单通过后，README 才能把 `dsh-v0.1.6-alpha.1` 写成 tested；未通过时不能修改兼容性徽章。

### 4.2 `0.5.0` Native Harness Panel Integration

- 在官方 `sidebar.panellist` 注册 `dsh-qa` 入口。
- 使用与入口相同 ID 的 root-scoped `main` keyed slot 渲染 Workbench。
- 删除对 `sidebarCol`、`centerCol`、`logoRow`、`newSession` 等 selector 的依赖。
- 删除 MutationObserver 自愈注入、`data-dsh-qa-active` 和 `dsh-panel-activate` 自建协议。
- 保留 Workbench iframe、独立模式、打开标签页、返回 DSH 和同源 API 边界。
- 真实宿主验证切换 Panel、刷新、重复加载和卸载后不留悬挂 listener/iframe。

### 4.3 `0.6.0` Native QA Execution

- Execution Profile 明确 provider、工具能力、权限、超时、artifact 目录和 provenance。
- 只允许白名单的 Browser Use、Computer Use、MCP 能力进入执行请求。
- Harness 返回的执行状态、日志、截图、trace 和结果映射到现有 TestRun/EvidenceBundle；不能绕过 finalize 和完整性校验。
- 失败、取消、超时、断线和重试都留下可审计状态；没有 Evidence 不能产生 PASS。
- 独立模式使用 fake adapter 做确定性测试，不伪造真实 Harness 执行。

### 4.4 `0.7.0` AI Quality Intelligence

- 从已保存的 Evidence、Failure Analysis、RegressionSet、QualityGate 和 provenance 快照生成 Quality Insight。
- 确定性规则先运行，AI 只补充理解、分类、解释、排序和下一步建议。
- Auto Review 输出必须经过 schema 校验，包含 target、reason、evidenceRefs、confidence 和 recommendation。
- 建议可以是 failure category、regression recommendation 或 gate review recommendation，但不能直接写 Gate、创建缺陷或改变 PASS/WARN/BLOCK。
- 人工确认、revision、审计和中英文空状态完整可见。

### 4.5 `1.0.0` AI-Native QA Workbench

- Panel、Native QA Execution 和 Quality Intelligence 的主路径可从宿主入口完成。
- Agent Run 有明确 goal、phase、工具白名单、maxSteps、timeout、budget、approval_required 和终止状态。
- 发布、Gate exception、风险接受、生产执行和安全敏感动作始终需要人工审批。
- 主路径、空状态、错误恢复、升级/迁移和中英文文档齐套。
- 1.0 不等于自动发布；完整 Multi-Agent 和 Autonomous QE 继续留在 Post-1.0。

## 5. 全路线不做

- 不把 `agent/created`、Browser Use、Computer Use 或 MCP 调用写成当前已经存在的能力。
- 不引入 DOM selector fallback 作为官方 Panel API 的永久后门。
- 不允许 AI 或客户端派生字段绕过 Gate、Evidence、revision、人工审批或 provenance。
- 不引入生产 npm 依赖、第二套前端、第二套项目/质量数据主模型。
- 不做自动生产发布、真实多用户 RBAC、云端分布式执行或外部缺陷系统自动提单。

## 6. 跨版本验收标准

1. 每版有独立的 acceptance matrix；`verified`、`failed`、`not run`、`blocked` 和 `not applicable` 分开记录。
2. 本地 unit/API、浏览器 E2E、真实 Harness host smoke、CI、package 和 Release 证据分别记录，不相互替代。
3. `npm run test:unit`、`npm run test:e2e`、`npm test` 和 `git diff --check` 是本地交付基础门槛。
4. 版本只有在所有适用项 verified 后才能称为 complete；未完成时写清最小下一步，不用“兼容”或“已支持”替代证据。
