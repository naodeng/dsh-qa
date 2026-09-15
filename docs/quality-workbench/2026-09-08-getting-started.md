# 如何开始：`0.6.0`—`1.0.0` 工作台体验迭代（历史草案）

> **已被替代：** 当前从 `0.4.1` 开始，请阅读 `2026-09-15-getting-started.md`。

本文说明 **从哪里读文档、怎么开分支、先做哪一版、如何验证与交付**。面向执行实施计划的开发者 / Agent。

## 1. 先读什么（顺序）

1. `AGENTS.md` — 仓库约束、测试与交付习惯
2. `docs/quality-workbench/2026-08-27-implementation-status.md` — 0.2–0.5 历史实现状态基线（正式发布前需复验）
3. `docs/quality-workbench/2026-09-08-requirements.md` — 本路线需求
4. `docs/quality-workbench/2026-09-08-solution-design.md` — 方案
5. `docs/quality-workbench/2026-09-08-technical-design.md` — 技术契约
6. `docs/superpowers/plans/2026-09-08-workbench-iterations.md` — 总计划与全局约束
7. **当前版本**分计划，例如 `docs/superpowers/plans/2026-09-08-workbench-0.6.0.md`

可选：`docs/ui-critique-zh.md`（0.6 首屏依据）。

## 2. 环境准备

```sh
cd /path/to/dsh-qa
node -v          # >= 18
npm start        # 独立模式 http://127.0.0.1:8899
```

E2E 首次：

```sh
npx playwright install chromium
```

Skills 相关开发建议显式设置：

```sh
export QA_SKILLS_ROOT=/absolute/path/to/awesome-qa-skills
export DSH_SKILLS_DIR=$HOME/.dsh/skills
```

质量/API 测试必须使用临时 `QA_DATA_DIR` 与随机端口；**在动态导入服务模块之前**设置 `QA_DATA_DIR`。

完整能力（DSH 对话）需在 DSH 中以插件方式加载本仓库；独立模式用于面板与质量 API 验证。

## 3. 推荐执行方式

1. **一次只做一个小版本**（先 `0.6.0`），该版 `npm test` 与浏览器验收通过后再开下一版。
2. 按分计划 checkbox 推进；优先 **TDD**：先写失败测试 → 实现 → 回归。
3. Agent 执行时：使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`（见各 plan 文首）。
4. 不要顺手重构无关模块；不要引入生产依赖。

### 分支建议

```text
feat/workbench-0.6-action-queue
feat/workbench-0.7-assistant-ux
feat/workbench-0.8-change-impact
feat/workbench-0.9-delivery-ux
feat/workbench-1.0-stabilize
```

是否合入 `master` / 发版由维护者决定；文档不强制 git 工作流。

## 4. 验证清单（每版结束）

```sh
npm run test:unit
npm run test:e2e
# 或
npm test
git diff --check
```

手工冒烟（独立模式至少）：

- [ ] 首页能看到行动队列（0.6+）
- [ ] 点进项目详情相关 Tab
- [ ] 质量相关操作后列表/门禁有更新（有 SSE 时）

DSH 插件模式额外：

- [ ] 测试对话可打开，快捷条/建议可见（0.7+）
- [ ] 独立模式降级文案仍正确

## 5. 版本依赖关系

```text
0.6 行动台  ──►  0.7 对话工作台  ──►  0.8 变更与回归
                                      │
                                      ▼
                                 0.9 证据与交付  ──►  1.0 稳定工作台
```

- `0.7` 依赖 `0.6` 的队列与跳转约定（可降级用本地拼装，但计划按串行）。
- `0.8` / `0.9` 在 `0.7` 后开始；若资源紧，可在 `0.7` 后先做 `0.9` 门禁同屏，但不得跳过 `0.6`。
- `1.0` 必须在 0.6–0.9 范围验收完成后做收口。

## 6. 明确不要做的开工动作

- 不要同时开启 0.6–1.0 平行大改同一批文件。
- 不要把 MCP 平台化、CI Evidence Gate、RBAC 塞进本路线必达。
- 不要在无受控证据时改出门禁 PASS。
- 不要提交 `data/`、Playwright report/trace/截图产物。

## 7. 文档维护

- 分计划 checkbox 随实施勾选。
- 某版完成后，在 `2026-08-27-implementation-status.md` 同级新增或追加 `2026-09-*-implementation-status.md` 亦可（可选）。
- API / SSE 变更同步改 `2026-09-08-technical-design.md`。

## 8. 从 0.6 开工的最小第一步

打开并执行：`docs/superpowers/plans/2026-09-08-workbench-0.6.0.md` 的 **Task 1**（行动队列单元测试）。

有疑问时回到需求文档第 6 节「明确不做」与技术文档第 2 节「全局技术约束」。
