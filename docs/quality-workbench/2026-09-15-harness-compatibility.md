# Harness 兼容性矩阵：`dsh-qa 0.5.0`

本文记录 0.5.0 的实现、测试和真实宿主证据，不是兼容性宣传页。0.4.1 的宿主通过记录在第 3 节保留为历史基线，不自动证明 0.5 的原生 Panel 生命周期。

## 1. 目标版本

| 项目 | 值 |
| --- | --- |
| dsh-qa 版本 | `0.5.0` / `master` |
| Harness 目标 | `dsh-v0.1.6-alpha.1` |
| 0.5.0 状态 | `RELEASED / VERIFIED_HOST_WITH_LIMITATION` |
| 原生 Panel 生命周期冒烟 | `PASS_WITH_LIMITATION`：2026-09-21 在 `dsh-v0.1.6-alpha.1` 上运行 `5 passed / 1 skipped`；skip 原因是当前 Harness 组合没有第二个全局 Panel，插件卸载与恢复已由真实宿主人工验证 |
| 0.4.1 历史基线 | `PASS`：2026-09-15 的旧挂载方式在目标 alpha 上完成 4/4；仅作为 RPC/Workbench 基线 |
| 兼容徽章 | README 保留目标 Harness 的历史基线徽章；0.5 原生 Panel 标注为 `PASS_WITH_LIMITATION`，原因仅为宿主没有第二个全局 Panel |

## 2. 0.5.0 原生 Panel 矩阵

| 能力 | 当前源代码/本地证据 | 真实 Harness 宿主冒烟 | 当前结论 |
| --- | --- | --- | --- |
| `sidebar.panellist` 注册 | raw `client.js` runtime test、client source boundary | `PASS`：入口可见 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| root-scoped `main` keyed slot | raw `client.js` runtime test、client source boundary | `PASS`：Workbench iframe 可挂载 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| 统一 `dsh-qa` ID 选择 | contract test 确认 sidebar 与 main key 一致 | `PASS`：Panel 可选择并渲染对应 iframe | `VERIFIED_LOCAL / VERIFIED_HOST` |
| Panel 重复选择不重复创建 iframe | 生命周期测试 | `PASS`：重复选择保持 1 个 iframe | `VERIFIED_LOCAL / VERIFIED_HOST` |
| 选择其他 Panel / 返回 Conversation | 第二 global Panel 不存在时显式 skip；Conversation close/return 另测 | `SKIPPED`：无第二个全局 Panel；close/return `PASS` | `VERIFIED_HOST_WITH_LIMITATION` |
| popout、iframe `postMessage` 返回 | 生命周期测试 | `PASS`：popout、close 和返回消息均通过 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| host reload / plugin disposer | raw `client.js` runtime test 覆盖 disposer；host reload 与人工 unload 另测 | reload `PASS`；plugin unload/restore `PASS` | `VERIFIED_HOST_WITH_LIMITATION` |
| Workbench iframe 产品边界 | standalone Chromium E2E 通过 | `PASS`：Host smoke 可见 iframe | `VERIFIED_LOCAL / VERIFIED_HOST` |

## 3. 0.4.1 RPC 核心兼容矩阵（历史基线）

| 能力 | 当前源代码/契约检查 | 真实 Harness 宿主冒烟 | 当前结论 |
| --- | --- | --- | --- |
| `agentPresets/list` | slash endpoint + compatibility/unit tests | `PASS`：真实运行发现 `qa` preset | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `agentPresets/select` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/list` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/create`、`session/rename` | slash endpoint + compatibility test | `PASS`：最新真实运行已发现 `qa` preset、创建并重命名 Session | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `session/modelCatalog` | slash endpoint + compatibility test | `PASS`：最新真实运行读取到默认模型目录 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `skills/list`、`commands/list` | slash endpoint + local error propagation + browser regression | `PASS`：最新真实运行读取 Skills 和 Commands | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `commands/execute` | strict `submittedAttachments` contract + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/follow` | locked open envelope, `snapshot.records` parser, wrong-stream/error/close/timeout cleanup tests | `PASS`：最新真实运行通过 `/api/remote.mux` 建连并读取 snapshot | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `session/prompt` | slash endpoint + existing error UI path | `PASS`：最新真实运行成功排队 harmless prompt | `VERIFIED_LOCAL / VERIFIED_HOST` |
| model select / cancel | RPC client success/error contract tests | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| Workbench load | standalone Chromium E2E | `PASS`：插件入口和 `/api/dsh-qa/workbench` iframe 可见 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| refresh / reconnect | standalone Chromium reconnect regression | `PASS`：最新真实运行刷新后保持同一 Session 且无重复入口 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| Remote Pair | 当前核心路径不再依赖 | 未运行 | `NOT_APPLICABLE` |
| `agent/created` | 当前核心路径无直接依赖 | 未运行 | `FUTURE_CONCERN` |

## 4. 0.4.1 真实冒烟清单（历史记录）

在明确运行的是 `dsh-v0.1.6-alpha.1` 后，按用户可观察路径记录：

1. 插件加载并显示 QA Workbench 入口。
2. `agentPresets/list` 能发现 `qa` preset。
3. 创建并重命名一个测试 Session。
4. 打开 Session follow，读取 snapshot 和 `snapshot.records`。
5. 发送一条无破坏性的 QA prompt，并记录成功或可解释错误。
6. 读取 model catalog、skills 和 commands。
7. 打开 Workbench iframe，刷新后保持可用。
8. 刷新宿主页面后 reconnect 嵌入式 Workbench client，不产生重复入口或重复 follow 流。

每项都记录时间、Harness commit/tag、dsh-qa commit、结果、截图/日志路径和失败原因。未执行项保持 `NOT_RUN`，依赖或权限问题保持 `BLOCKED`，不能折算为通过。

## 5. 当前 0.5 实施证据

| 检查 | 结果 |
| --- | --- |
| `node --test test/unit/dsh-rpc-contract.test.js test/unit/dsh-compatibility.test.js` | `17 passed` |
| `node --test test/unit/client-panel-boundary.test.js test/unit/panel-contract.test.js test/unit/client-runtime.test.js` | `11 passed` |
| `npm run test:unit`（0.5 release commit） | `152 passed` |
| `QA_E2E_PORT=8900 npm run test:e2e` | `23 passed` 个本地 Chromium E2E；host smoke 被默认配置排除 |
| `npm pack --dry-run` | 通过；包仍包含 `lib/client.js`、`lib/index.js`、`public/` 与 `cordis.patch.yml`，没有新增生产依赖 |
| 0.5 Panel lifecycle host smoke | `PASS_WITH_LIMITATION`：2026-09-21，`dsh-v0.1.6-alpha.1`，`5 passed / 1 skipped`；第二个全局 Panel 缺失导致 skip，插件 unload/restore 已由用户在真实宿主人工验证 |
| `QA_E2E_PORT=8903 npm run test:e2e -- test/e2e/skills.spec.js test/e2e/workbench-reconnect.spec.js` | `4 passed` |
| 标准本地 E2E（同一 Playwright 项目配置，排除 opt-in host smoke） | `23 passed` |
| `npm run test:host-smoke` 无环境变量 | 按设计在浏览器启动前失败，提示必须提供 `DSH_WEB_URL` 和 `DSH_HOST_VERSION` |
| 用户运行 `DSH_WEB_URL=http://127.0.0.1:3080/ ... npm run test:host-smoke` | `BLOCKED`：Harness 返回 `401 dsh web authentication required`; 第 1 项找不到入口，后 3 项因 serial suite 未运行；trace 位于 `test-results/dsh-host-compatibility-Dee-aeaac--entry-and-Workbench-iframe/trace.zip` |
| 裸 origin 防误用保护（修复后） | `VERIFIED`：配置在浏览器启动前提示必须使用带 `?token=...` 的 `dsh web` 完整 URL |
| 真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `FAILED`：第 1 项通过；第 2 项在 `session/create` 失败，错误为 `preset "qa" failed to mount: row "workflow-worker-thread" names a plugin that cannot be resolved: @deepseek-ai/dsh-workflow-worker-thread`；第 3、4 项因 serial suite 未运行。trace 位于 `test-results/dsh-host-compatibility-Dee-9173a-eates-and-renames-a-Session/trace.zip` |
| `qa` preset workflow 依赖修复 | `VERIFIED_LOCAL`：切换为 Harness 0.1.6 当前的 `@deepseek-ai/dsh-workflow-ptc`；兼容性回归测试 `4 passed`，当前 web profile 可解析 preset 中的 23 个 Harness 包；尚未重新执行真实宿主 |
| 最新真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `FAILED`：第 1 项通过；第 2 项在 `session/create` 失败，错误为 `persona (@deepseek-ai/dsh-persona): invalid config: $.prefix missing required value`；第 3、4 项因 serial suite 未运行。trace 仍位于 `test-results/dsh-host-compatibility-Dee-9173a-eates-and-renames-a-Session/trace.zip` |
| `qa` preset persona schema 修复 | `VERIFIED_LOCAL`：将 Harness 0.1.6 要求的 `config.prefix` 替换旧的 `config.text`；兼容性回归测试 `5 passed`，已重新安装到当前 web profile；真实宿主待重跑 |
| 当前真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `FAILED`：第 1、2 项通过；第 3 项在 `session/follow` WebSocket 建连时失败，第 4 项因 serial suite 未运行。错误为 `session/follow WebSocket failed`；trace 位于 `test-results/dsh-host-compatibility-Dee-625f1-nd-queues-a-harmless-prompt/trace.zip` |
| `session/follow` Remote mux 路径修复 | `VERIFIED_LOCAL`：工作台和 Host smoke helper 均改为 `/api/remote.mux`，新增路径回归测试；真实宿主待重跑 |
| 最新真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `FAILED`：第 1、2 项通过；第 3 项已通过 follow snapshot 和 model catalog，但在 `skills/list` 失败，错误为 `missing "request"; unexpected "agentId"`；第 4 项因 serial suite 未运行。trace 位于 `test-results/dsh-host-compatibility-Dee-625f1-nd-queues-a-harmless-prompt/trace.zip` |
| `skills/list` request envelope 修复 | `VERIFIED_LOCAL`：工作台和 Host smoke helper 均改为 `{ request: { sessionId } }`，新增兼容性回归测试；真实宿主待重跑 |
| 提交版真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `PASS`：dsh-qa `a067c18` 上运行 4/4；插件入口、preset/Session、follow、model catalog、Skills、Commands、prompt、refresh/reconnect 全部通过，耗时 `10.7s`；无失败 trace |
| 复审后真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `PASS`：Harness source commit `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`；dsh-qa 当前工作树基于 `103f204`；4/4、`12.9s`。除低层 RPC 检查外，实际嵌入式 Workbench client 观察到 `client-request` 和至少两条 `/api/remote.mux` follow 连接；测试结束会取消已排队 prompt 并删除临时 Workbench project。 |

## 6. 与 0.4.1 的边界

0.4.1 只证明旧挂载方式在目标 Harness 上能工作；它不证明 0.5 的官方 Panel/Slot 生命周期。0.5 已移除 DOM selector 注入、`MutationObserver`、自定义 active attribute 和 `dsh-panel-activate`，改由 `sidebar.panellist` 与 root-scoped `main` keyed slot 承担面板选择；Workbench 仍保留为 iframe 产品边界。
