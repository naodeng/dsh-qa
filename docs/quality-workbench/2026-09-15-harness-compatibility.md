# Harness 兼容性矩阵：`dsh-qa 0.4.1`

本文是 0.4.1 的证据记录，不是兼容性宣传页。除非“真实 Harness 宿主冒烟”一列有当前可检查的结果，否则不能在 README 写成 `dsh-v0.1.6-alpha.1 compatible` 或 `tested`。

## 1. 目标版本

| 项目 | 值 |
| --- | --- |
| dsh-qa 版本 | `0.4.1` / implementation branch `codex/0.4.1` |
| Harness 目标 | `dsh-v0.1.6-alpha.1` |
| 0.4.1 状态 | `VERIFIED_PENDING_PUBLICATION` |
| 真实宿主冒烟 | `PASS`：使用完整启动 token 针对 `dsh-v0.1.6-alpha.1` 完成 4/4，耗时 `10.7s` |
| 兼容徽章 | README 已更新为 `dsh-v0.1.6-alpha.1 tested`；npm/tag/GitHub Release 仍未发布 |

## 2. 核心兼容矩阵

| 能力 | 当前源代码/契约检查 | 真实 Harness 宿主冒烟 | 当前结论 |
| --- | --- | --- | --- |
| `agentPresets/list` | slash endpoint + compatibility/unit tests | `PASS`：真实运行发现 `qa` preset | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `agentPresets/select` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/list` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/create`、`session/rename` | slash endpoint + compatibility test | `PASS`：最新真实运行已发现 `qa` preset、创建并重命名 Session | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `session/modelCatalog` | slash endpoint + compatibility test | `PASS`：最新真实运行读取到默认模型目录 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `skills/list`、`commands/list` | slash endpoint + local error propagation + browser regression | `PASS`：最新真实运行读取 Skills 和 Commands | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `session/follow` | locked open envelope, `snapshot.records` parser, wrong-stream/error/close/timeout cleanup tests | `PASS`：最新真实运行通过 `/api/remote.mux` 建连并读取 snapshot | `VERIFIED_LOCAL / VERIFIED_HOST` |
| `session/prompt` | slash endpoint + existing error UI path | `PASS`：最新真实运行成功排队 harmless prompt | `VERIFIED_LOCAL / VERIFIED_HOST` |
| model select / cancel | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| Workbench load | standalone Chromium E2E | `PASS`：插件入口和 `/api/dsh-qa/workbench` iframe 可见 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| refresh / reconnect | standalone Chromium reconnect regression | `PASS`：最新真实运行刷新后保持同一 Session 且无重复入口 | `VERIFIED_LOCAL / VERIFIED_HOST` |
| Remote Pair | 当前核心路径不再依赖 | 未运行 | `NOT_APPLICABLE` |
| `agent/created` | 当前核心路径无直接依赖 | 未运行 | `FUTURE_CONCERN` |

## 3. 0.4.1 真实冒烟清单

在明确运行的是 `dsh-v0.1.6-alpha.1` 后，按用户可观察路径记录：

1. 插件加载并显示 QA Workbench 入口。
2. `agentPresets/list` 能发现 `qa` preset。
3. 创建并重命名一个测试 Session。
4. 打开 Session follow，读取 snapshot 和 `snapshot.records`。
5. 发送一条无破坏性的 QA prompt，并记录成功或可解释错误。
6. 读取 model catalog、skills 和 commands。
7. 打开 Workbench iframe，刷新后保持可用。
8. 关闭或短暂断开连接后 reconnect，不产生重复流或卡死状态。

每项都记录时间、Harness commit/tag、dsh-qa commit、结果、截图/日志路径和失败原因。未执行项保持 `NOT_RUN`，依赖或权限问题保持 `BLOCKED`，不能折算为通过。

## 4. 当前实施证据

| 检查 | 结果 |
| --- | --- |
| `node --test test/unit/dsh-rpc-contract.test.js test/unit/dsh-compatibility.test.js` | `13 passed` |
| `npm run test:unit`（当前实现） | `137 passed` |
| `QA_E2E_PORT=8900 npm test`（当前重跑） | `137` 个单元/API + `22` 个本地 Chromium E2E 通过；host smoke 被默认配置排除 |
| `npm run test:e2e -- test/e2e/skills.spec.js test/e2e/workbench-reconnect.spec.js` | 默认端口被已有进程占用；使用隔离数据目录和 8900 端口重跑后 `4 passed` |
| 标准本地 E2E（同一 Playwright 项目配置，排除 opt-in host smoke） | `22 passed` |
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
| 最新真实 `dsh-v0.1.6-alpha.1` host smoke（带启动 token） | `PASS`：dsh-qa `a067c18` 上运行 4/4；插件入口、preset/Session、follow、model catalog、Skills、Commands、prompt、refresh/reconnect 全部通过，耗时 `10.7s`；无失败 trace |

## 5. 与 0.5 的边界

0.4.1 只验证现有挂载方式在目标 Harness 上能工作；它不把 DOM selector 注入升级为正式架构。`sidebar.panellist`、root-scoped `main` keyed slot、移除 MutationObserver 和 `dsh-panel-activate` 属于 0.5.0。
