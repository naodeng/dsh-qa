# DSH QA Workbench `0.6.0`—`1.0.0` 方案文档

## 1. 推荐方案

在现有 `dsh-qa` 内做 **QA 工作面板体验与 DSH 协作增强**，不新建平行产品：

- **数据与质量可信边界**：继续复用 `server/store.js`、`server/quality/*` 与 0.2–0.5 契约；门禁、证据、revision、人审规则不变。
- **面板体验**：在 `public/` 原生前端增强首页行动队列、对话工作台、追溯与向导。
- **服务端增量**：仅增加「行动项聚合」「变更影响建议（草稿）」「失败分类字段」等薄 API；复杂判断仍以服务端事实为准，浏览器不提交派生状态。
- **DSH 协作**：优先改善跳转、建议文案、快捷插入与会话绑定可视化；新能力尽量复用现有 `server/tools.js`，必要时追加只读或草稿类工具，写路径仍走白名单。

## 2. 产品主链路（1.0 目标形态）

```text
测试首页「需要你处理」
  → 进入项目 / 打开 DSH 测试对话
  → 快捷条或下一步建议驱动分析、登记、质量任务
  → 变更建议 →（人确认）测试范围 / 回归集
  → 受控执行 → 证据
  → 门禁同屏结论（PASS / WARN / BLOCK）
  → 人工审批或 WARN 例外 → 交付报告
```

独立模式：可完成看板、质量 API 与门禁阅读；对话相关能力显示降级提示，不伪造 DSH session。

## 3. 分版方案摘要

### 3.1 `0.6` 行动台

**问题：** 首屏信息过载；质量更新靠刷新；详情与对话/门禁割裂；Skills 路径绑死个人机器。

**方案：**

1. 服务端增加 `GET /api/action-queue`（或扩展现有 `stats`/`board` 响应），聚合可操作项并带 `projectId`、`kind`、`severity`、`hrefHint`。
2. 首页以行动队列为唯一主焦点；指标与动态降权。
3. 前端补齐质量 SSE 监听，局部刷新项目详情与队列。
4. Skills 根目录完全依赖环境变量 + 文档化默认值；启动或 `/api/skills` 在根不存在时返回可读错误，不静默空列表伪装成功。

### 3.2 `0.7` 对话工作台

**问题：** QA 知道「该测」但不知道在对话里下一步说什么；材料流只读；绑定状态弱。

**方案：**

1. 纯前端「下一步建议」引擎：输入为当前项目卡片、action-queue、质量任务 stage；输出建议列表（文案模板 + 动作类型）。
2. 材料流 `data-*` 携带可回填文本；点击写入对话输入框（或复制提示）。
3. 快捷条映射到稳定提示词模板或打开已有模态（创建质量任务等），危险写操作仍需用户确认。
4. 会话绑定 UI：读取项目 `dshSessionId` 与宿主能力；独立模式固定展示「请在 DSH 中打开」。

### 3.3 `0.8` 变更与回归

**问题：** 「测什么」依赖口头描述；回归集创建路径长。

**方案：**

1. 复用 `server/quality/source.js` 的 git-diff 采集；新增 `server/quality/change-impact.js`（或同级模块）生成 **建议草稿**：`suggestedTestScope[]`、`suggestedTestCaseIds[]`、`summary`、`inputDigest`。
2. API 只返回草稿；确认 API 才写入 `testScope` 或 `createRegressionSet`。
3. UI：质量任务页「根据变更建议」→ 预览 → 确认；看板徽标只读投影回归集/风险计数。

### 3.4 `0.9` 证据与交付

**问题：** 放行决策要在多处拼信息。

**方案：**

1. 门禁专区：投影已保存 gate 快照 + 链接证据/例外表单（不重算第二套 verdict）。
2. 追溯矩阵：从 `requirements`、`testcases`（含 `trace`）、`evidenceBundles`、gate `evidenceRefs` 做只读 join。
3. 失败分析增加 `category` 枚举；promote 缺陷保持人工确认路径。
4. 报告/趋势嵌入详情 Tab，调用既有 report/trend API。

### 3.5 `1.0` 稳定工作台

**问题：** 能用但不够「日常依赖」。

**方案：** 以产品化收口为主——主路径 E2E 补强、空状态与向导、文档与版本元数据、迁移幂等回归；原则上少加新领域实体。

## 4. 模块边界

```text
server/board.js / routes.js     # stats、action-queue 聚合入口
server/quality/*                # 变更建议、失败分类、既有闭环
server/routes.js                # Skills 路径与配置校验
public/app.js                   # 首页队列、SSE、对话建议、矩阵与向导
public/index.html / style.css   # 结构与层级（行动优先）
public/i18n.js                  # 中英文
server/tools.js                 # 可选：只读建议 / 草稿确认类工具
```

`routes.js` 不承载门禁重算；浏览器不提交 `verdict`、`stage`、`resultTrust` 等派生字段。

## 5. 交互原则

1. **一次首屏一个主任务**：需要你处理。
2. **建议可点、不可偷跑**：建议默认插入文案或打开确认框。
3. **草稿与生效分离**：变更影响、回归集必须人确认。
4. **独立模式诚实**：没有 DSH 就说没有，不假装对话可用。
5. **中英同步**：新文案进 `i18n.js`。

## 6. 方案取舍

| 备选 | 结论 |
| --- | --- |
| 做成跨 IDE 的 MCP QA 平台 | 后置；本路线先把 DSH 面板做透 |
| 新建 React 前端 | 拒绝；保持零生产依赖与现有 `public/` |
| 自动根据 diff 创建回归集并执行 | 拒绝；只允许草稿 + 人确认 |
| CI Evidence Gate 深度集成 | 1.0 后可选，非必达 |
| 重写质量域模型 | 拒绝；复用 0.2–0.5 |

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 行动队列噪声过多 | 分级 `priority`、上限条数、按项目折叠 |
| 变更建议不准 | 明确「建议」语义；展示 inputDigest；人确认 |
| `public/app.js` 过大 | 分版改动局部化；必要时抽 `public/action-queue.js` 等纯函数模块（仍无构建步骤，用原生 ESM 或 IIFE 片段，以仓库惯例为准） |
| SSE 风暴 | 队列/详情防抖刷新；按 `projectId` 过滤 |

## 8. 与前序文档关系

- 质量可信规则以 `2026-08-25-requirements.md` / technical-design 为准。
- 实施状态以 `2026-08-27-implementation-status.md` 为 0.2–0.5 基线。
- UI 层级以 `docs/ui-critique-zh.md` 为 0.6 首屏依据。
