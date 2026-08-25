# DSH QA Workbench `0.2.0`—`0.5.0` 方案文档

## 1. 推荐方案

在现有 `dsh-qa` 内增加独立的 `server/quality/` 领域模块，由现有 `server/routes.js` 做薄路由适配；前端沿用 `public/` 的原生 HTML/CSS/JavaScript；数据继续通过现有 `store.js` 持久化。这样可以保留插件入口、preset、现有数据和用户工作流。

## 2. 领域模型

```text
Project
├── qualityTasks[]
├── qualityAudit[]       # 仅追加的最小质量变更元数据
├── testcases[]          # 复用并演进
├── testruns[]           # 0.3.0 新建的统一运行事实
├── gates[]              # 复用并演进
└── QualityTask
    ├── sources[]       # requirement-file | git-diff
    ├── risks[]         # severity, assessmentStatus, dispositionStatus
    ├── acceptanceCriteria[]
    ├── testScope[]
    ├── stage            # intake | analysis | confirmation | ready
    └── decisions[]     # actorLabel, action, reason, timestamp
```

所有质量数据归属于现有 Project，使用 `store.uid(prefix)` 和 ISO 时间戳。`normalizeProject()` 为老项目补空数组和默认字段；不增加顶层质量数据库，不复制现有 testcases 和 gates。`project.testruns` 由 `0.3.0` 创建一次，之后作为唯一运行事实集合。

## 3. 状态与规则

```text
intake → analysis → confirmation → ready
```

- 分析失败停留在 `analysis`，不得自动进入 `ready`。
- 存在未处理的高风险项时，任务不得进入 `ready`，除非有明确的人工接受决定。
- `PASS` 不属于 `0.2.0` 的状态；后续由测试执行和质量门禁产生。
- 确认操作必须追加不可变决策记录，不覆盖原始分析结果。

## 4. 模块边界

```text
server/quality/task.js       # 创建、读取、阶段状态
server/quality/risk.js       # 风险结构、状态迁移、严重度
server/quality/strategy.js   # 测试范围建议结构
server/quality/decision.js   # 人工决策记录
server/routes.js             # HTTP 参数解析和响应映射
public/app.js                # 页面状态与交互
public/index.html            # 质量区域骨架
```

`routes.js` 不承载风险判断；分析器先接受结构化输入，AI/Agent 输出必须经过 schema 校验后才写入存储。

## 5. 交互流程

```text
项目详情 → 新建质量任务 → 选择需求或 diff
        → 运行分析 → 查看风险/测试范围
        → 人工确认 → 进入 ready 或保留待处理
```

页面明确区分“未分析”“分析中”“有风险”“已确认”，不使用模糊的成功绿灯。

## 6. 兼容与安全

- 保持 Node ESM、Node 18+、零生产依赖。
- 只读来源文件和 Git diff，不修改用户项目文件。
- 限制来源大小，拒绝不存在或越权的项目路径。
- 分析结果保存来源摘要和校验信息，避免只保存无法追溯的结论。
- API、SSE 和现有页面行为保持兼容。

## 7. 方案取舍

不推荐新建 `dsh-qa-workbench` 仓库：会引入插件安装、数据迁移、路由和 preset 分裂。也不推荐第一阶段直接实现完整质量门禁：缺少真实测试执行与证据，容易产生不可信的通过结论。

## 8. 详细组件设计

### Task 服务

负责创建、查询、版本检查和阶段迁移，不负责判断风险内容。输入是项目 ID、标题和来源，输出是带稳定 ID 的任务实体。

### Source Adapter

将需求记录、工作区文件和 Git diff 统一为：`type`、`ref`、`digest`、`byteSize`、`snapshot`、`capturedAt`。分析只使用校验后的 UTF-8 文本快照，避免分析期间源文件变化导致结果无法复现。读取采用有上限的流或先检查 stat，不得先把超大文件完整载入内存；发现 NUL、非法 UTF-8、单项超过 1 MiB 或任务总量超过 5 MiB时整体拒绝。敏感内容不进入日志。

### Analysis Adapter

分析不由独立 HTTP 服务直接调用模型。DSH 项目会话读取来源后生成结构化结果，并调用 `qa_quality_analysis_save` 工具；独立模式通过单独的 manual-analysis API 保存 `origin=manual` 结果，不能提交 `dshSessionId` 或声称由 AI 分析。两条入口调用同一个 `saveQualityAnalysis` 领域函数，仅在可信的宿主适配层注入 DSH session 上下文。工具和 HTTP 输出都必须通过相同的枚举、长度、来源引用、版本和必填字段校验；不合法结果整体拒绝。

### Decision Service

只追加决策事件，不编辑历史事件。它读取当前风险状态，执行状态迁移，并重新计算任务阶段；阶段计算不能由浏览器直接传入。HTTP、DSH 工具和内部 worker 都通过同一个 mutation wrapper 完成“校验 expectedRevision → 修改内存 → 追加审计 → 持久化 → 广播”，路由和工具适配层不直接改数组。

## 9. 状态机

| 当前阶段 | 触发 | 条件 | 下一阶段 |
| --- | --- | --- | --- |
| `intake` | analyze | 来源合法 | `analysis` |
| `analysis` | analysis completed | 结果通过 schema | `confirmation` |
| `analysis` | analysis failed | 任意失败 | `analysis` |
| `confirmation` | decide | 仍有 confirmed + open 的 high/critical 风险 | `confirmation` |
| `confirmation` | decide | 高风险已处置、验收标准和测试范围均存在 | `ready` |
| `ready` | source changed | digest 变化 | `intake` |

任何阶段都不得由客户端直接指定为 `ready`；删除任务也不作为本阶段能力，避免破坏审计链。

## 10. 前端信息架构

项目详情增加五个稳定区域：任务摘要、验收标准、风险列表、测试范围、决策时间线。提供 QA、开发、产品/项目三种展示视角，它们只是同一数据的筛选和排序，不是权限或身份系统。每个区域都要有加载、空、错误和只读状态。颜色只表达严重度和状态，文字必须同时提供含义；“未执行测试”显示为明确警示。

## 11. 数据一致性与并发

写入采用读取-校验-更新-原子保存流程；更新携带 `updatedAt` 或版本号。确认请求若版本过期返回 409，并要求刷新后重试。分析结果使用分析运行 ID，重复请求不能生成重复决策；若允许重跑，保留每次分析快照并标记当前版本。

## 12. 失败降级

DSH 会话不可用时允许用户保存任务和来源，或手工录入候选风险，但任务不能标记为“AI 已分析”。历史任务仍可查看；前端 API 局部失败不应清空现有项目数据。

## 13. 分版本方案

### `0.2.0`：质量任务层

建立质量域的根实体和审计链。它只负责“识别和确认”，输出结构化风险与测试范围，不触发测试命令。所有后续实体通过 `qualityTaskId` 关联。

### `0.3.0`：执行层

将建议范围映射到现有 `project.testcases`，再由执行器适配层调用 Node/Playwright。`0.3.0` 新建 `project.testruns` 作为统一运行事实；当前 `testrun_import` 只写入 materials 摘要，因此改造后写入 `status=unknown`、`resultTrust=imported-summary` 的 TestRun 和兼容材料动态，不能作为 PASS 证据。历史 materials 不反向伪造为 TestRun。执行配置通过项目嵌套 API 和双语 UI 创建；浏览器只提交受控字段，服务端生成不可变 profile 版本，TestRun 引用具体版本。运行开始前创建受控 artifact staging，并把日志、Node 测试输出和 Playwright output 定向到该目录，为 `0.4.0` 的 finalize 提供唯一输入。

### `0.4.0`：证据层

以 `TestRun` 为证据根，挂载日志、截图、trace、commit 和失败分析。运行器只写 `.staging`；finalize 将其原子改名为带 bundle ID 的 `.finalizing-*`，完成稳定排序、哈希和 manifest 后再原子改名为最终目录并保存 ready EvidenceBundle。服务重启会恢复可验证的 finalizing/final 目录，绝不把半成品交给门禁。同一 TestRun 的重复 finalize 返回同一 ready bundle。候选失败分析必须经人工确认后才能复用现有 `project.defects` 创建 open 缺陷，并保存 `failureAnalysisId/testRunId/evidenceRefs`，不能建立第二套缺陷集合。删除 Project 时，在同一次内存事务中把 artifact 路径复制到顶层 `artifactCleanupJobs` 并移除 Project，随后调用同步 `flush()` 通过临时文件 rename 原子落盘；禁止依赖延迟 `persist()` 制造两个磁盘状态。清理成功或失败都不依赖已删除的项目数据。清理 worker 在服务启动后先恢复未完成 job，再以固定周期处理到期 retention 和孤立 staging，单次执行有数量上限，避免阻塞 HTTP。回归计算器只消费变更、风险、历史缺陷和测试映射，输出可解释的回归集合；它不修改测试计划原文。修复前后对比只比较两个已保存 TestRun/EvidenceBundle，不重新解释原始日志。

### `0.5.0`：决策层

在现有 `project.gates` 上增加 `kind=approval|computed`。旧 gate 保持人工审批语义；计算门禁保存规则版本、输入摘要和逐项结果。门禁先比较当前来源 digest、commit、TestPlan、RegressionSet 和 profile 版本，任一不一致即把证据标记为 stale，不能 PASS。例外是对可豁免检查的追加审计事件，不改写 check；不可豁免检查仍保持 BLOCK，可豁免检查被接受后最终结论最高为 WARN。报告只是现有 gate 结果的可读投影，不新建第二套 QualityGate 集合；趋势同样从已保存 computed gate 快照按时间投影，不单独保存可漂移的统计副本。

## 14. 来源与 DSH 接入

`0.2.0` 支持三类来源：`requirement` 引用 `project.requirements[].id`；`workspace-file` 只能读取 `project.workspacePath` 内通过 realpath 校验的文件；`git-diff` 只能在该 workspace 是 Git 仓库时使用受限 revision 语法，并通过固定参数的 `git diff --no-ext-diff --unified=3 <validated-ref> -- <validated-paths>` 生成。revision 只接受 `HEAD`、`HEAD~N`、完整 40 位 commit，或两者组成的 `A..B/A...B`，拒绝空白、reflog、冒号和任何 `-` 开头值；path 必须是 realpath 校验后的项目相对路径并放在 `--` 后。浏览器不能提交绝对路径。

分析流程为：工作台创建任务并生成分析请求摘要 → DSH 项目会话读取任务 → 模型生成结构化结果 → DSH 调用 `qa_quality_analysis_save` → 服务端验证并广播 `quality.task.updated`。独立模式不调用模型，只展示任务或接受明确标记为 `manual` 的结果。

## 15. 跨版本不变量

1. 原始需求、diff、测试输出和证据不可被后续版本静默覆盖。
2. 后续版本只能追加关联实体和决策，不改变上游实体语义。
3. 所有自动结论必须带来源、生成时间和规则/分析版本。
4. 任何“通过”都必须来自真实执行事实，不能来自默认值、空集合或前端状态。
5. 上游服务不可用时保留已保存事实，禁止降级为虚假的低风险或通过。
