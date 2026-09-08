# DSH QA Workbench `0.6.0`—`1.0.0` 技术文档

## 1. 代码落点（预期）

```text
server/action-queue.js          # 0.6 行动项聚合（新建）
server/routes.js                # action-queue、skills 配置校验
server/quality/change-impact.js # 0.8 变更建议草稿（新建）
server/quality/failure-analysis.js  # 0.9 扩展 category
server/quality/http-routes.js   # 草稿确认、矩阵只读 API（按需）
server/quality/traceability.js  # 0.9 追溯矩阵投影（新建，可选）
server/board.js                 # 看板徽标投影字段（0.8）
public/app.js                   # 队列、SSE、对话建议、矩阵、向导
public/index.html / style.css / i18n.js
test/unit/action-queue.test.js
test/unit/change-impact.test.js
test/unit/traceability.test.js
test/e2e/action-queue.spec.js
test/e2e/assistant-shortcuts.spec.js
test/e2e/change-impact.spec.js
test/e2e/gate-delivery.spec.js
test/e2e/onboarding.spec.js
```

具体文件以实施时对现有边界复核为准；禁止无关大重构。保持 Node ESM、Node 18+、零生产依赖。

## 2. 全局技术约束

- 沿用 `{ ok: true, ... }` / `{ ok: false, error, code? }`。
- 更新既有实体的写操作带 `expectedRevision`；冲突 `409`。
- 字段白名单；拒绝未知字段与客户端提交的派生状态。
- `QA_DATA_DIR` 在导入服务模块前设置；涉及启动的测试串行。
- SSE 事件名保持稳定；新增事件需同步前端与文档。

## 3. `0.6` 行动队列与 SSE

### 3.1 Action item 形状

```js
{
  id: "aq_<stable>",
  kind: "milestone_overdue|milestone_due|gate_pending|gate_block|gate_warn|run_failed|run_interrupted|quality_task_confirm",
  priority: "high|medium|low",
  projectId: "project_<id>",
  projectTitle: "string",
  title: "string",
  subtitle: "string",
  entityType: "milestone|gate|testrun|qualityTask",
  entityId: "string",
  href: { view: "dashboard|board|assistant|project", projectId?: string, tab?: string },
  createdAt: "ISO-8601"
}
```

`id` 由 `kind + projectId + entityId` 稳定派生，便于前端去重。

### 3.2 API

`GET /api/action-queue`

- 成功：`{ ok: true, items: ActionItem[], generatedAt }`
- 排序：`priority` 高→低，同级按时间新→旧；默认最多 50 条。
- 聚合来源：现有 projects 上的 milestones、gates（approval pending + computed WARN/BLOCK）、testruns 终态失败/中断、质量任务停在 `confirmation` 且有 open high/critical 风险。

可选：将精简计数并入 `GET /api/stats`（`actionQueueCount`），首页徽标使用。

### 3.3 SSE（前端必须订阅）

服务端已存在：

| 事件 | 前端动作（0.6） |
| --- | --- |
| `quality.task.updated` | 刷新当前项目质量区；使 action-queue 失效重拉 |
| `quality.test-run.updated` | 同上 |
| `quality.evidence.updated` | 已部分处理则保持；确保证据列表刷新 |
| `quality.gate.updated` / `gate.updated` | 刷新门禁与队列 |

防抖：同一项目 300ms 合并刷新。

### 3.4 Skills 配置

| 环境变量 | 含义 |
| --- | --- |
| `QA_SKILLS_ROOT` | awesome-qa-skills 仓库根（其下 `skills/`） |
| `QA_SKILLS_SITE_ROOT` | 技能站点内容根（可选） |
| `DSH_SKILLS_DIR` | 已安装技能目录，默认 `~/.dsh/skills` |

`GET /api/skills`：若 catalog 根不存在，返回 `200` + 空列表并带 `warning`，或 `503` + 明确 `code`（二选一，计划中锁定一种并测稳）。禁止依赖未文档化的 `~/awsomeCode/...` 作为唯一成功路径——保留为未设置环境变量时的 **legacy fallback**，但 README 必须写「请设置 `QA_SKILLS_ROOT`」。

## 4. `0.7` 对话建议与快捷条

### 4.1 建议引擎（建议放前端纯函数，便于单测）

```js
// 伪契约
function buildNextSteps({ project, queueItems, qualityTasks, mode: 'dsh'|'standalone' }): Array<{
  id: string,
  title: string,
  reason: string,
  action: 'insert_prompt'|'open_view'|'open_tab'|'copy',
  payload: { text?: string, view?: string, tab?: string }
}>
```

规则示例（实施计划可细化）：

- 无 `dshSessionId` 且 mode=dsh → 建议绑定会话
- 有 pending approval gate → 建议打开门禁 Tab
- 质量任务 `confirmation` → 建议插入风险确认提示
- 看板 `execute` 且无最近 controlled run → 建议创建/打开质量任务执行

独立模式：仅返回 `open_view` / `open_tab` 类建议，不插入依赖 DSH 的 prompt。

### 4.2 快捷条

前端常量映射到 prompt 模板（中英）；点击写入 `#` 对话输入框。创建质量任务等若已有 UI，优先 `open_tab`。

## 5. `0.8` 变更影响草稿

### 5.1 模块

`server/quality/change-impact.js`

```js
export function buildChangeImpactDraft(project, { ref, paths, qualityTaskId }) {
  // 1) 通过 source adapter 采集 git-diff 快照与 digest
  // 2) 启发式：路径 → 关联 testcases（title/module/路径关键词）与 requirements
  // 3) 返回 draft，不写 store
  return {
    inputDigest: 'sha256:...',
    summary: 'string',
    suggestedTestScope: [{ area, priority, reason }],
    suggestedTestCaseIds: ['tc_...'],
    suggestedRequirementIds: ['req_...'],
    source: { type: 'git-diff', ref, digest, capturedAt }
  };
}
```

启发式保持简单可测；不准也不自动生效。

### 5.2 API

- `POST /api/projects/:projectId/change-impact/preview` → `200` + draft  
- `POST /api/projects/:projectId/quality-tasks/:id/change-impact/apply`  
  Body：`{ expectedRevision, inputDigest, acceptTestScope?: boolean, createRegressionSet?: boolean, name?: string }`  
  - `inputDigest` 必须与最近 preview 一致，否则 `409`/`422`  
  - 写 `testScope` / `createRegressionSet` 走现有校验  

看板卡片投影（`board.js` / `projectCard`）：`badges: { openCriticalRisks, regressionCaseCount }` 等只读字段。

## 6. `0.9` 追溯与失败分类

### 6.1 追溯矩阵

`GET /api/projects/:projectId/traceability-matrix`

```js
{
  rows: [{
    requirementId, requirementTitle,
    testCaseIds: [],
    evidenceIds: [],
    gateIds: [],
    status: 'uncovered|partial|covered|blocked'
  }]
}
```

纯投影，不持久化。用例通过既有 `trace` / 关联字段挂需求；证据经 run → plan → task → sources/需求弱关联时允许 `partial`。

### 6.2 失败分类

扩展 failure analysis 实体：

```js
category: 'regression'|'environment'|'test-bug'|'other'
```

promote 缺陷 API 继续要求显式确认；分类不能自动建缺陷。

### 6.3 门禁同屏

前端 Tab/专区消费：

- `GET` 既有 computed gate 详情  
- report / trend 既有端点  
不新增第二套 evaluate。

## 7. `1.0` 稳定化技术项

- E2E：覆盖「队列 → 项目 → 对话建议可见 → 门禁同屏」最小路径。
- 向导状态：可存 `localStorage`（如 `dsh-qa.onboarding.v1`），不进服务端也可。
- 迁移：若有 schemaVersion bump，必须幂等测试；无必要不升版本。
- 包版本与 README badge、changelog（若仓库惯例需要）对齐 `1.0.0`。

## 8. 测试策略

| 层级 | 重点 |
| --- | --- |
| 单元 | action-queue 聚合排序；change-impact digest；traceability join；nextSteps 纯函数 |
| API | preview/apply revision；skills 缺根警告；矩阵只读 |
| E2E | 首页队列可点；SSE 更新后列表变化（可用 API 触发）；对话快捷条；门禁同屏；向导可跳过 |

## 9. 交付顺序（技术视角）

1. `0.6` 聚合 API + SSE + 首页 + skills 配置  
2. `0.7` 建议引擎 + 快捷条 + 绑定状态  
3. `0.8` change-impact + 回归草稿确认 + 徽标  
4. `0.9` 矩阵 + 门禁专区 + failure category  
5. `1.0` E2E/向导/文档/版本收口  

每版结束：`npm run test:unit`、`npm run test:e2e`（或 `npm test`）、`git diff --check`。

## 10. 前序契约

质量任务、testrun、evidence、gate 的字段与 API 以 `2026-08-25-technical-design.md` 及 `2026-08-27-implementation-status.md` 为准；本文件只描述增量。
