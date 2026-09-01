# DSH QA Workbench `0.2.0`—`0.5.0` 技术文档

## 1. 代码落点

```text
server/quality/task.js
server/quality/risk.js
server/quality/strategy.js
server/quality/decision.js
server/routes.js
public/index.html
public/app.js
test/unit/quality-task.test.js
test/unit/quality-risk.test.js
test/e2e/quality-task.spec.js
```

具体文件以实施时对现有 `store.js`、`routes.js` 和页面渲染边界的复核为准；不在本迭代提前重构无关模块。

## 2. 数据契约

```js
{
  id: "qt_<id>",
  projectId: "project_<id>",
  title: "string",
  sources: [{ type: "requirement|workspace-file|git-diff", ref: "string", digest: "string", byteSize: 1234, snapshot: "UTF-8 text", capturedAt: "ISO-8601" }],
  stage: "intake|analysis|confirmation|ready",
  analysisRuns: [{ id, status: "queued|completed|failed|stale", sourceDigests, analysisVersion, origin: "agent|manual", requestedAt, finishedAt, errorCode }],
  acceptanceCriteria: [{ id, condition, expectedBehavior, sourceRefs: ["sourceDigest"] }],
  risks: [{ id, title, severity: "low|medium|high|critical", assessmentStatus: "candidate|confirmed|dismissed", dispositionStatus: "open|mitigated|accepted|closed", rationale, evidence }],
  testScope: [{ area, priority: "smoke|regression|focused", reason }],
  decisions: [{ action, riskId, actorLabel, dshSessionId, reason, createdAt }],
  createdAt: "ISO-8601",
  updatedAt: "ISO-8601"
}
```

保存前校验：`projectId`、`title`、`stage` 必填；风险严重度和状态必须是枚举值；`ready` 只能由确认规则产生。

## 3. API 行为

- `POST /api/projects/:projectId/quality-tasks`：创建 `intake` 任务。
- `GET /api/projects/:projectId/quality-tasks`：返回项目内任务。
- `GET /api/projects/:projectId/quality-tasks/:id`：返回任务及决策历史。
- `POST /api/projects/:projectId/quality-tasks/:id/analysis-requests`：创建待 DSH 处理的分析请求并返回 202。
- `POST /api/projects/:projectId/quality-tasks/:id/manual-analyses`：独立模式保存明确标记为 manual 的结构化分析。
- `POST /api/projects/:projectId/quality-tasks/:id/decisions`：接收风险判断或处置决定，追加记录并重算阶段。

成功和失败均沿用现有 `{ ok: true, ... }` / `{ ok: false, error: string, code?: string }`。所有新增质量 API 和工具 schema 使用字段白名单/`additionalProperties:false`；未知字段、客户端提交的派生状态或宿主字段返回 400，不静默忽略。项目或任务不存在返回 404，参数错误返回 400，修订冲突返回 409，分析结果不合法返回 422。当前本地架构没有认证身份，因此不定义 403 权限响应。

保留现有 `ok(res, payload)` 固定返回 200；新增 `created(res, payload)` 调用 `json(res, 201, { ok:true, ...payload })`，新增 `accepted(res, payload)` 调用 `json(res, 202, { ok:true, ...payload })`。只在资源已同步创建时使用 201，只在分析请求或 TestRun 已入队但尚未结束时使用 202，不全局修改 `ok()`。

## 4. 测试策略

### 单元/API

- 创建和读取任务。
- 项目过滤与不存在资源。
- 验收标准来源引用、风险状态迁移和高风险阻断。
- 决策追加而非覆盖。
- 未执行测试时不产生 `PASS`。
- 需求文件/Git diff 来源校验。

### E2E

使用真实本地服务和临时 `QA_DATA_DIR`：创建项目 → 创建质量任务 → 绑定来源 → 查看验收标准和风险 → 切换角色视角 → 确认风险 → 验证阶段和页面文案。测试不得使用专用 DOM 分支。

## 5. 交付顺序

1. 先写模型和状态规则单元测试。
2. 增加存储适配与 API 测试。
3. 接入结构化分析服务和来源校验。
4. 增加项目详情页质量区域。
5. 增加完整 E2E 和现有回归。
6. 运行 `npm run test:unit`、`npm run test:e2e`、`npm test`、`git diff --check`。

## 6. 后续技术演进

`0.3.0` 在本模型上增加 `TestPlan`、`TestCase`、`TestRun`；`0.4.0` 增加 `EvidenceBundle`、`RegressionSet`；`0.5.0` 增加 `QualityGate`。这些实体通过 `QualityTask` 关联，不复制项目和需求主数据。

## 7. API 契约详表

### 创建任务

`POST /api/projects/:projectId/quality-tasks`

请求：

```json
{
  "title": "支付回调变更质量分析",
  "description": "确认回调签名和重试行为的测试范围",
  "sources": [{ "type": "git-diff", "ref": "HEAD~1..HEAD", "paths": ["server/"] }]
}
```

成功返回 `201` 和完整任务；缺少 `title` 返回 `400`；项目不存在返回 `404`。服务端从路径中的 projectId 确定归属，不接受 body 覆盖。

### 运行分析

`POST /api/projects/:projectId/quality-tasks/:id/analysis-requests`

请求创建 `AnalysisRequest` 并返回 `202`、`analysisRequestId` 和供 DSH 会话读取的摘要。真正结果由 `qa_quality_analysis_save` 工具写回；重复请求生成新 ID，不删除旧快照。

### 手工分析

`POST /api/projects/:projectId/quality-tasks/:id/manual-analyses` 请求必须包含 `expectedRevision`、`actorLabel`、当前 `sourceDigests`、验收标准、风险和测试范围。服务端强制写入 `origin=manual`，拒绝 body 中的 `origin/dshSessionId/stage`，复用与 Agent 结果相同的 schema 和来源新鲜度校验；成功返回 201 和更新后的任务，修订冲突返回 409。

### 确认风险

`POST /api/projects/:projectId/quality-tasks/:id/decisions`

请求：

```json
{
  "riskId": "risk_123",
  "action": "confirm|dismiss|mitigate|accept|close",
  "reason": "已补充接口契约测试",
  "actorLabel": "张测试",
  "expectedRevision": 3
}
```

`reason` 在 `dismiss`、`mitigate`、`accept`、`close` 时必填；revision 不一致返回 `409 QUALITY_REVISION_CONFLICT`。`actorLabel` 是本地显示标签，不是认证身份。

## 8. 错误码

| HTTP | 错误码 | 场景 |
| --- | --- | --- |
| 400 | `QUALITY_TASK_INVALID_INPUT` | 字段缺失、枚举值非法 |
| 400 | `QUALITY_GIT_REF_INVALID` | Git revision 不符合允许语法或以选项形式出现 |
| 404 | `QUALITY_TASK_NOT_FOUND` | 任务或项目不存在 |
| 409 | `QUALITY_REVISION_CONFLICT` | 并发更新的 expectedRevision 过期 |
| 409 | `QUALITY_TASK_INVALID_TRANSITION` | 不允许的阶段/风险迁移 |
| 413 | `QUALITY_SOURCE_TOO_LARGE` | 单来源超过 1 MiB 或任务来源合计超过 5 MiB |
| 415 | `QUALITY_SOURCE_UNSUPPORTED_MEDIA` | 来源含 NUL、二进制或非法 UTF-8 |
| 422 | `QUALITY_ANALYSIS_INVALID` | Agent 输出不符合 schema |
| 503 | `QUALITY_ANALYSIS_UNAVAILABLE` | 分析服务不可用 |

后续迭代沿用同一错误结构，并至少固定以下代码：

| HTTP | 错误码 | 场景 |
| --- | --- | --- |
| 400 | `QUALITY_TEST_PLAN_INVALID` | 用例/风险不属于当前项目或字段非法 |
| 400 | `QUALITY_EXECUTION_PROFILE_INVALID` | executor、精确文件、cwd 或 networkIntent 非法 |
| 400 | `QUALITY_EVIDENCE_ID_INVALID` | bundle/item ID 含非法路径语义 |
| 400 | `QUALITY_GATE_EXCEPTION_INVALID` | 例外缺责任人、理由、期限或 checkKey |
| 404 | `QUALITY_TEST_RUN_NOT_FOUND` | 当前项目中不存在运行 |
| 404 | `QUALITY_EVIDENCE_NOT_FOUND` | 当前项目中不存在 bundle/item |
| 409 | `QUALITY_TEST_PLAN_NOT_REVIEWED` | 计划不是当前 reviewed 版本 |
| 409 | `QUALITY_RUN_PREVIEW_STALE` | 预览过期、已消费或输入版本变化 |
| 409 | `QUALITY_RUN_CAPACITY_EXCEEDED` | 项目或全局并发上限已满 |
| 409 | `QUALITY_DEFECT_ALREADY_PROMOTED` | 同一失败分析已创建缺陷 |
| 413 | `QUALITY_EVIDENCE_QUOTA_EXCEEDED` | 文件、bundle 或项目证据超过配额 |
| 422 | `QUALITY_EVIDENCE_INTEGRITY_FAILED` | manifest 或文件摘要不一致 |
| 503 | `QUALITY_EXECUTOR_NOT_INSTALLED` | 项目本地执行器不可用 |

错误响应为 `{ "ok": false, "error": "可读信息", "code": "稳定错误码" }`，兼容现有前端对字符串 `error` 的读取；日志中不得包含完整来源内容。

## 9. 存储与迁移

不新增独立数据库。顶层增加单调递增的 `schemaVersion`，由纯函数 `migrateDb(rawDb)` 按顺序、幂等地补字段，不删除未知字段，也不把历史摘要猜测成新实体：

| 版本 | 归一化内容 |
| --- | --- |
| `0.2.0` | `qualityTasks[]/qualityAudit[]`；每个任务补 `analysisRuns[]/acceptanceCriteria[]/risks[]/testScope[]/decisions[]` |
| `0.3.0` | `testPlans[]/testruns[]/executionProfiles[]`；现有 testcase 补 `planIds[]/sourceRiskIds[]/automationRef` |
| `0.4.0` | `evidenceBundles[]/failureAnalyses[]/regressionSets[]`；顶层 `artifactCleanupJobs[]` |
| `0.5.0` | 现有 gates 逐项补 `kind=approval`；computed gate 新字段只由评估产生，不伪造历史值 |

当前代码没有持久化 `project.testruns`，`testrun_import` 只写 materials 摘要；改造后新导入同时写 TestRun 和材料动态，历史 materials 原样保留。迁移在加载时进入内存，只有成功完成全部版本才替换当前 db；首次后续业务写入或显式迁移 flush 时，仍通过现有临时文件 rename 原子落盘。迁移失败保留原文件、拒绝启动写服务并输出不含业务正文的错误。每个版本必须有“旧 fixture → 迁移 → 重启 → 再迁移结果不变”的测试。

run-preview token 仅保存在进程内存中，记录 token 的摘要而非明文，TTL 到期即删除；服务重启后全部失效且不会创建 TestRun。项目删除时，质量元数据随 Project 删除；artifact 清理 job 与项目移除必须作为一次内存变更后调用 `flush()` 原子落盘，不能使用延迟 `persist()` 分两步写盘。

## 10. 测试矩阵

| 层级 | 覆盖内容 | 证据 |
| --- | --- | --- |
| 单元 | 枚举校验、状态机、阶段计算、决策追加 | `test/unit/quality-*.test.js` |
| API | 项目归属、嵌套路由边界、错误码、版本冲突、来源校验、持久化 | `test/unit/http-api.test.js` |
| E2E | 创建、分析、确认、刷新、空/错状态 | `test/e2e/quality-task.spec.js` |
| 回归 | 现有项目/看板/用例/缺陷流程 | 原有 E2E 与 `npm test` |

## 11. 可观测性与审计

项目增加 `qualityAudit[]`，条目为 `{ id, entityType, entityId, action, source:'http|dsh-tool|worker', actorLabel, dshSessionId, fromRevision, toRevision, result, errorCode, createdAt }`。每次创建、分析开始/结束/失败、确认和阶段变化写一条最小元数据；不得记录请求 body、需求/验收正文、命令 argv/输出、文件路径、私密 token、diff、异常 stack 或 preview token。失败校验可以记录 `result=denied` 和稳定 errorCode，但不递增实体 revision。审计记录只追加，不提供普通 UI 删除/编辑入口，Project 删除时按现有项目删除语义一并移除。

所有质量写入通过 `commitQualityMutation({ project, entity, expectedRevision, source, actorContext, mutate })`：先检查项目归属和 revision，执行纯业务变更，递增 entity revision（QualityTask 内部同步其兼容 `version`），追加成功审计，调用 `store.persist()`，最后广播事件。若校验或 mutate 失败，不改变业务实体、不广播；可通过独立的 `appendDeniedAudit()` 只记录最小 denied 元数据和稳定 errorCode。DSH tool result 使用与 HTTP 相同的稳定 `code`，由适配层映射成 `{ ok:false,error,code }`；路由只负责映射 HTTP status。

## 12. `0.3.0` 技术设计：测试策略与执行

### 数据结构

```js
TestPlan { id, qualityTaskId, version, revision, testcaseIds[], status: "draft|reviewed|superseded", reviewedByLabel, reviewedAt, createdAt, updatedAt }
ProjectTestCase { ...existingFields, planIds[], sourceRiskIds[], automationRef }
TestRun { id, projectId, revision, planId, planVersion, mode, executor, status, resultTrust, profileId, profileVersion, provenance, artifactDir, startedAt, finishedAt, exitCode, logRef, summary }
ProvenanceSnapshot { sourceDigests[], commit, testPlanVersion, regressionSetVersion, profileId, profileVersion }
```

`TestPlan` 只引用现有 `project.testcases` 的 ID；不存在或属于其他项目的 ID 返回 400。新建计划用例也写入现有 `project.testcases`：复用抽取后的 testcase 创建 primitive，增加 `qualityTaskId/sourceRiskIds/automationRef/planIds`，不建立 `plannedCases` 等平行集合。新计划默认为 draft；人工提供 `actorLabel` 后才能 reviewed。计划范围或用例集合变化时旧版本变为 superseded，并创建新的 draft version；旧 TestRun 保留执行时引用的版本，run-preview 只接受当前 reviewed version。

`mode` 为 `imported|local`；`status` 为 `unknown|queued|running|passed|failed|cancelled|timed-out|environment-error`；`resultTrust` 为 `imported-summary|controlled-local`。现有 `testrun_import` 只有自然语言摘要，统一写 `mode=imported,status=unknown,resultTrust=imported-summary`；历史 materials 不自动转换。本路线不实现结构化报告导入。只有受控本地执行满足成功规则时才能写 `passed`，且 provenance 与当前门禁输入一致时才可作为 PASS 证据。

### API

```text
POST /api/projects/:projectId/quality-tasks/:id/test-plans
GET  /api/projects/:projectId/quality-tasks/:id/test-plans
POST /api/projects/:projectId/test-plans/:id/review
POST /api/projects/:projectId/execution-profiles
GET  /api/projects/:projectId/execution-profiles
POST /api/projects/:projectId/execution-profiles/:id/versions
POST /api/projects/:projectId/execution-profiles/:id/disable
POST /api/projects/:projectId/test-plans/:id/run-preview
POST /api/projects/:projectId/test-plans/:id/runs
GET  /api/projects/:projectId/test-runs/:id
POST /api/projects/:projectId/test-runs/:id/cancel
```

项目通过 API/UI 保存 `executionProfiles[{ id, version, name, executor, cwdRelative, targetFiles, networkIntent, timeoutMs, maxOutputBytes, disabledAt }]`。服务端根据 executor 生成 command 和参数，不保存用户命令；`cwdRelative` 和每个 `targetFiles` 经 realpath 后必须位于 workspace。修改 profile 创建新版本，旧版本不可覆盖；已有 TestRun 始终引用 `profileId+profileVersion`。禁用阻止新运行但不影响历史读取。`targetFiles` 只接受已存在的相对测试文件，不接受 glob、目录、选项或 `-` 开头值，避免依赖 shell 展开。环境变量不由用户配置，只继承服务端最小允许集合。每个项目最多一个 running 测试，全局最多两个。

`run-preview` 根据当前 TestPlan/profile 版本解析 `{ cwd, argv, testcaseIds, artifactRoot, effects: { declaredWrites:['artifact-root'], networkIntent:'none|loopback|required', filesystemEnforced:false, networkEnforced:false }, sourceDigest, expiresAt, previewToken }`。`previewToken` 是服务端保存的短期随机记录；创建 TestRun 必须提交该 token。服务端在入队前重算摘要并检查 token 未过期、未使用且 project/plan/profile/version 全部匹配，随后原子消费；任何变化返回 `409 QUALITY_RUN_PREVIEW_STALE`。子进程不获得额外凭据，但当前实现只有进程隔离，没有 OS 文件系统/网络沙箱；`declaredWrites` 和 `networkIntent` 是供用户确认与审计的声明，不是阻断证明。用户必须明确确认该限制。

Node executor 使用当前 `process.execPath` 和精确文件列表。Playwright executor 只解析项目工作区内已安装的 `node_modules/.bin/playwright`，realpath 后仍须位于 workspace；不存在则返回 `QUALITY_EXECUTOR_NOT_INSTALLED`，禁止调用 `npx`、自动安装或下载依赖。

新增质量域更新类 API 的并发字段固定如下：任务分析/决策使用 `expectedRevision`；TestPlan review/version 使用 plan revision；Profile version/disable 使用 profile revision；取消运行和 finalize 分别使用 `expectedRevision/expectedRunRevision`；RegressionSet recalculate/exclude、FailureAnalysis promote 和 computed Gate exception 使用各自实体的 expectedRevision。创建任务、创建计划、创建 profile、评估生成新 gate 等纯创建操作不要求 revision。缺失或过期统一返回 `409 QUALITY_REVISION_CONFLICT`，不得使用 last-write-wins。为保持现有客户端兼容，原有 approval gate decide、缺陷状态和用例状态路由暂不强制增加 revision；它们不授权调用新的 computed gate mutation。

启动运行时先创建 `QA_DATA_DIR/artifacts/<projectId>/<testRunId>/.staging/`。服务端逐块读取子进程 stdout/stderr，写入有上限的 `.staging/process.log`；Node test 使用 `--test-reporter=tap`，同一 stdout 流由服务端另存为 `.staging/node-test.tap`，不依赖 shell 重定向或 Node 新版本的 reporter-destination；Playwright 增加受控的绝对 `--output=<staging>/playwright`，并将 `PLAYWRIGHT_HTML_OUTPUT_DIR` 指向 `.staging/playwright-report`。子进程只获得绝对 `DSH_QA_ARTIFACT_DIR` 和最小环境集合。取消和超时终止整个进程组；服务重启时把遗留 `queued|running` 归一化为 `environment-error`，保留 staging 供失败诊断。

### 测试重点

命令注入、Git option/ref 注入、符号链接越界、非法 profile、过期/复用/配置变化的 preview token、超时后的进程组清理、并发上限、空测试集合、测试框架异常退出、1 MiB 日志截断、敏感环境变量屏蔽和服务重启恢复。

## 13. `0.4.0` 技术设计：证据与回归

### 数据结构

```js
EvidenceBundle { id, testRunId, revision, state: "ready|integrity-failed", integrity: "verified|failed", provenance, items[], commit, manifestHash, createdAt, verifiedAt }
EvidenceItem { id, type, relativePath, mimeType, size, sha256, capturedAt }
RegressionSet { id, qualityTaskId, reasonRefs[], cases[], status, createdAt }
FailureAnalysis { id, testRunId, category, summary, suspectedCause, confidence, decision }
RunComparison { beforeRunId, afterRunId, testcaseChanges[], status, evidenceRefs[], createdAt }
```

证据根目录固定为 `QA_DATA_DIR/artifacts/<projectId>/<testRunId>/`。只接受运行器在 `.staging` 生成的 regular files；拒绝 symlink、socket、device 和 hard-link count > 1，realpath 必须仍在根目录内。读取时在支持的平台使用 `O_NOFOLLOW`，并在 hash 前后比较 `fstat` 的 inode/size/mtime，变化则 finalize 失败。单文件上限 100 MiB、每个 bundle 500 MiB、每个项目 5 GiB。默认保留 30 天，但被未关闭缺陷或最新门禁引用的 bundle 不自动清理。

顶层 store 增加 `artifactCleanupJobs[{ id, projectId, artifactRoot, status, attempts, lastError, createdAt, updatedAt }]`，这是运维队列而不是质量业务集合。`deleteProject(id)` 必须在内存中先加入明确 artifactRoot、再移除 Project，然后调用一次同步 `flush()` 原子保存两项变化；任一步异常都不得启动文件清理。清理器只消费已落盘且 projectId 已不存在的 job 和受控绝对路径。失败保留 job 并递增 attempts，成功后删除 job，因此项目记录移除后仍可重试。

finalize 只接受终态 TestRun，并执行：`.staging → .finalizing-<bundleId>` 原子 rename → 按 `relativePath` 排序并计算每项 SHA-256 → 对不含 `manifestHash` 的规范 JSON（UTF-8、固定键顺序、无空白）计算 manifestHash → 写 `manifest.json.tmp` 并 rename → `.finalizing-* → bundle_<id>` 原子 rename → 保存 ready bundle 并 `flush()`。同一 run 已有 ready bundle 时返回现有记录；并发 finalize 只有一个能获得目录 rename，另一个等待后返回同一记录。

启动恢复规则：保留 `.staging` 供终态运行重试；带有效 manifest 的 `.finalizing-*` 或 `bundle_*` 在验证 run/project 归属和完整性后补齐 ready 记录；无效 manifest 标记 integrity-failed 并隔离，超过恢复窗口后进入清理队列。任何 finalizing/integrity-failed/orphan bundle 均不允许下载、报告或门禁引用。下载 API 只接受 bundle ID 和 item ID，不接受路径。允许预览 text/plain、image/png、image/jpeg；trace 和其他文件仅下载并使用 `attachment`。

`artifactDir`、bundle 根目录和清理 job 路径仅供服务端存储与 worker 使用，不进入普通 TestRun/Evidence API 响应。公共响应只返回 run/bundle/item ID、受控相对文件名、大小、MIME 和摘要；错误响应也不得回显绝对 `QA_DATA_DIR`。

### API

```text
POST /api/projects/:projectId/test-runs/:id/evidence/finalize
GET  /api/projects/:projectId/test-runs/:id/evidence
GET  /api/projects/:projectId/evidence/:bundleId/items/:itemId/download
POST /api/projects/:projectId/test-runs/:id/failure-analyses
POST /api/projects/:projectId/failure-analyses/:id/promote-defect
GET  /api/projects/:projectId/test-runs/:id/compare/:afterRunId
POST /api/projects/:projectId/quality-tasks/:id/regression-sets
POST /api/projects/:projectId/regression-sets/:id/recalculate
```

下载先按 project → bundle → item 逐级查找，最终路径只能来自 manifest 中保存的相对路径，任一级不存在均返回 404，URL 编码的路径片段返回 400。`promote-defect` 必须要求人工提供 `actorLabel` 和确认字段，复用现有 `project.defects` 结构创建 `status=open` 缺陷，并追加 `failureAnalysisId/testRunId/evidenceRefs`；重复提升同一 analysis 返回 409。比较接口只接受同一项目、同一 TestPlan 的终态运行，按 testcase ID 输出 `new-failure|fixed|unchanged`。回归计算输入必须记录摘要和版本；同一输入可重复计算；人工移除回归项必须留下理由。

## 14. `0.5.0` 技术设计：质量门禁

### 数据结构

```js
ProjectGate { ...existingFields, kind, revision, qualityTaskId, rulesetVersion, inputDigest, inputProvenance, verdict, checks[], exceptions[], calculatedAt }
GateCheck { key, status, severity, actual, expected, evidenceRefs[], explanation }
GateException { checkKey, actorLabel, dshSessionId, reason, expiresAt, createdAt }
```

现有 gate 归一化为 `kind=approval` 并保留 `pending|approved|rejected`。新计算门禁为 `kind=computed`，`verdict=PASS|WARN|BLOCK`。规则引擎先执行 freshness checks：TestRun/EvidenceBundle 的 sourceDigests、commit、testPlanVersion、regressionSetVersion、profileId/profileVersion 必须匹配当前输入；不匹配产生 `stale-evidence` 检查并禁止 PASS。人工例外不能覆盖任何 provenance stale。现有 `gate_request` 和 decide API 继续服务 approval gate。

规则优先级和例外语义固定如下；ruleset 变更必须更新 `rulesetVersion`：

| 检查 | 失败结论 | 可添加门禁例外 | 例外后的最高结论 |
| --- | --- | --- | --- |
| 任一 provenance stale | BLOCK | 否 | BLOCK |
| Evidence 完整性失败/缺失必需证据 | BLOCK | 否 | BLOCK |
| P0/P1 或规则标记的关键测试失败 | BLOCK | 否 | BLOCK |
| 未处置 critical 风险 | BLOCK | 否；必须先在风险处置模型中处理 | BLOCK |
| 未覆盖的 medium/high 非关键范围 | WARN | 是，需责任人、理由、期限 | WARN |
| 非关键 flaky/环境限制 | WARN | 是，需责任人、理由、期限 | WARN |

`applyGateExceptions` 只返回带 `waived` 展示状态的新结果，不修改原始 checks/facts；过期、缺理由、未知 checkKey 或作用于不可豁免检查的例外均无效并留下说明。只有所有必需检查原始通过且无有效例外参与时才能 PASS。

### API

```text
POST /api/projects/:projectId/quality-tasks/:id/gates/evaluate
GET  /api/projects/:projectId/gates/:id
POST /api/projects/:projectId/gates/:id/exceptions
GET  /api/projects/:projectId/quality-tasks/:id/reports
GET  /api/projects/:projectId/quality-tasks/:id/gate-trends
```

门禁评估保存输入快照和规则版本；报告读取门禁结果和引用，不自行计算第二套结论。趋势接口按 `calculatedAt,id` 稳定排序已保存的 computed gates，返回 verdict 数量、连续 BLOCK 次数和逐次检查结果，不保存第二份聚合状态，也不混入 approval gates。

## 15. 版本依赖矩阵

| 能力 | `0.2.0` | `0.3.0` | `0.4.0` | `0.5.0` |
| --- | --- | --- | --- | --- |
| 质量任务/风险 | 建立 | 读取 | 读取 | 读取 |
| 测试计划/执行 | 输出建议 | 建立 | 读取 | 读取 |
| 证据/回归 | 不存在 | 产生运行事实 | 建立 | 读取 |
| 门禁/报告 | 不存在 | 不存在 | 提供输入 | 建立 |

## 16. 前端、国际化与 SSE 文件边界

所有迭代都需同步修改 `public/index.html`、`public/app.js`、`public/style.css` 和 `public/i18n.js`。系统文案进入 i18n 字典或现有动态映射；用户输入、来源快照、命令、路径和错误原文不翻译。新增 SSE 事件固定为 `quality.task.updated`、`quality.test-run.updated`、`quality.evidence.updated`、`quality.gate.updated`，payload 仅含 `{ projectId, entityId, revision, updatedAt }`，不包含来源正文、日志、绝对路径或 token。`revision` 是每个可变实体从 1 开始递增的乐观并发计数，不等于 TestPlan/Profile 的业务 `version`；QualityTask 现有 `version` 在事件适配时作为 revision。广播必须发生在成功 mutation/persist 调用之后；前端仅在事件 revision 高于本地 revision 时重新读取对应项目详情，重复/乱序事件不得回退页面状态，重连后仍以 GET 快照为准。

## 17. DSH 工具契约

`server/tools.js` 增加：

```text
qa_quality_task_get             # 读取任务和分析请求
qa_quality_analysis_save        # 保存结构化风险与测试范围
qa_quality_risk_decide          # 追加风险判断/处置决定
qa_quality_test_scope_suggest   # 更新建议测试范围
```

工具只作用于宿主传入的当前 projectId，schema 不提供 projectId；`dshSessionId` 也只能由宿主适配层注入，不能接受模型参数。所有修改工具必须携带 `expectedRevision`。`qa_quality_analysis_save` 还必须携带 `analysisRequestId`、`sourceDigests` 和 `analysisVersion`；digest 不匹配时把该 analysis run 标记 stale 并拒绝覆盖当前分析。四个工具与 HTTP 入口复用相同领域函数、错误码、revision 递增和审计追加逻辑。
