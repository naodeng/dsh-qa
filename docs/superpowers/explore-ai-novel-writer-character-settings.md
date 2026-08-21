# `dsh-ai-novel-writer` 角色设定迁移探索

状态：explore 分支上的探索记录，不是实现方案。

## 结论先行

可以迁移“角色设定的工作方式”，不建议直接迁移小说角色数据模型或整个插件目录。

最值得迁移的是四个机制：

1. 用一个专用 preset persona 定义代理的职责、边界和完成条件。
2. 用结构化、可校验的“角色/上下文资产”承载长期事实，而不是只放在 system prompt 中。
3. 模型先读取当前版本，再提交单个资产的完整替换；通过 SHA-256 revision 做乐观并发控制。
4. 将“模型接受提案”“用户审批”“文件已写入”拆成不同状态，只有收到 `CommitReceipt` 才能声称保存成功。

不应直接迁移的部分包括小说专用的 `characters.json` 字段、章节蓝图、小说工作台 UI，以及 `novel_read` / `novel_apply_change` 的命名和初始化协议。

## 源目录中的角色是如何工作的

### 1. 角色首先由 preset persona 定义

`presets/ai-novel-writer/agent.cordis.yml` 挂载 `@deepseek-ai/dsh-persona`，角色设定明确规定：

- 只能把 Harness novel project 作为可写故事源；
- 修改前必须先调用 `novel_read`；
- 已初始化项目不能再次走 initialize；
- 一次只修改一个资产；
- 使用最近一次读取返回的 `baseRevision`；
- 未收到 `CommitReceipt` 不能说“已保存”；
- revision 过期时重新读取并协调用户意图，而不是重复提交旧提案；
- creative strategy 只改变写作流程，不选择模型、provider 或 reasoning 参数。

这不是“角色名字 + 一段口号”，而是一个可执行的行为协议。

### 2. 角色的工具面被强制收窄

`src/agent.ts` 对组合了 `ai-novel-writer` preset 的 agent 做两层限制：

- 工具 registry 只允许 `novel_read` 和 `novel_apply_change`；
- system prompt 组装时再次断言每次模型请求必须恰好包含这两个工具；
- 其它工具在 `tools/pre-execute` 阶段被拒绝。

因此角色边界不是靠 prompt 自觉遵守，而是由运行时再次兜底。

### 3. 角色通过结构化资产获得长期上下文

`src/novel-project.ts` 将角色设定保存为 `.ai-novel/characters.json`，每个角色要求固定字段：

```json
{
  "id": "stable-id",
  "name": "显示名称",
  "role": "人物角色",
  "summary": "人物摘要",
  "goal": "人物目标",
  "relationships": [
    { "characterId": "other-id", "type": "关系类型", "summary": "关系摘要" }
  ],
  "notes": "补充备注"
}
```

实现会校验精确字段、非空字段、稳定 id 唯一性、关系目标和 JSON canonical 格式。`src/context-window.ts` 再从角色资产、故事蓝图和章节蓝图拼出有大小上限的 working set，避免把整个工作区无界注入模型。

### 4. 修改链路是“读 → 提案 → 审批 → 原子写入”

`novel_read` 返回规范化文本、字节数和 revision；`novel_apply_change` 只接受一个目标资产和完整 replacement。服务端在写入前重新检查 revision，成功后原子替换文件并返回 commit receipt。

前端编辑器（`src/client/asset-editor.ts`）也保留 base revision、dirty 状态、预览、提交中、reconciling 和 applied 等状态。它不会因为 Session 接受了 prompt 就误报文件已经保存。

## 与 dsh-qa 的对应关系

| 小说插件机制 | QA 工作台现有对应物 | 迁移判断 |
| --- | --- | --- |
| `agent.cordis.yml` persona | `preset/qa/agent.cordis.yml` 的 QA persona | 可直接借鉴“行为协议化”写法 |
| 专用工具白名单 | QA preset 当前保留完整 coding/QA 工具面 | 不应照搬；应按 QA 场景增加窄角色 preset 或按阶段限制工具 |
| `characters.json` | `server/store.js` 中项目、成员、测试资产和对话记录 | 需要新的 QA 角色/视角资产，不应伪装成普通成员字段 |
| `working-set` | 项目上下文、需求/用例/缺陷/报告等数据 | 可借鉴有界上下文窗口和显式 omitted sources |
| SHA-256 revision | JSON 文件存储与 REST 更新 | 可迁移，但要先定义资源级 revision 和冲突语义 |
| 原生 approval + commit receipt | 当前 QA 对话和 API 写入链路 | 需要接入 DSH 审批事件，不能只在浏览器按钮层模拟 |
| 小说资产编辑器 | QA 项目详情/抽屉/对话 UI | 可借鉴 dirty、preview、stale reconciliation，不直接复制页面 |

## QA 领域的推荐抽象

如果迁移，建议把“角色设定”拆成两层：

### A. Agent role profile（代理角色配置）

这是面向模型行为的配置，建议包含：

- `roleId`：如 `requirements-analyst`、`test-designer`、`defect-analyst`、`release-gatekeeper`；
- `stage`：明确当前质量阶段，不使用最近阶段兜底；
- `objective`、`allowedActions`、`forbiddenActions`；
- `requiredEvidence` 和 `completionClaimRules`；
- `inputContracts`、`outputContracts`；
- `approvalPolicy` 和 `conflictPolicy`。

它应落在 QA preset/skill 的可版本化 Markdown 或 YAML 中，并能被静态检查。

### B. Project role cards（项目中的参与角色卡）

这是面向项目事实的结构化上下文，例如产品、开发、QA、发布负责人。它可以复用现有成员的 identity，但增加：

- 职责边界；
- 关注的风险；
- 可提供/可批准的证据；
- 当前参与阶段；
- 与需求、用例、缺陷、门禁的关联。

两层不能混为一谈：`qa` 成员是项目事实，`test-designer` agent role 是模型工作方式。

## 建议的最小迁移顺序

1. 先只迁移 persona 的契约：角色、阶段、输入、证据和完成声明规则。
2. 为一个 QA 阶段增加资源级 revision-aware proposal 流程，优先选择测试用例或缺陷报告，而不是全项目事务。
3. 增加静态 schema 校验和单元测试，覆盖 stale revision、无证据声明、非法字段和重复角色 id。
4. 再决定是否需要 QA 专用工具白名单；不要因为小说插件有白名单就默认 QA 也应完全封闭。
5. 最后才考虑 UI 里的角色卡/资产编辑器，并用真实浏览器验证审批、冲突和恢复状态。

## 风险与未决问题

- dsh-qa 当前的 JSON store、REST API 和 DSH 对话写入是否已经有统一 revision，需要进一步核对具体更新路径。
- QA 资产常常需要跨资源事务（例如需求、用例、缺陷和报告联动），而源插件明确只支持单资产变更；直接照搬会造成提交粒度过细。
- QA 角色的“完成”通常依赖证据充分性和人工门禁，不等同于文件写入成功；`CommitReceipt` 只能证明持久化，不证明质量结论正确。
- 如果同一个会话在不同阶段切换角色，必须明确是新 agent/session、角色 profile 切换，还是同一 agent 的阶段状态变化；否则会出现旧 prompt、旧工具权限和旧证据边界残留。

## 本轮范围

本轮只完成了：分支切换、上游指定子目录源码阅读、与 dsh-qa 现状的静态对照和迁移探索文档。未实现 QA 角色资产、revision API、审批接入或 UI 改造。
