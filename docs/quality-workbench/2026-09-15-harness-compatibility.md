# Harness 兼容性矩阵：`dsh-qa 0.4.1`

本文是 0.4.1 的证据记录，不是兼容性宣传页。除非“真实 Harness 宿主冒烟”一列有当前可检查的结果，否则不能在 README 写成 `dsh-v0.1.6-alpha.1 compatible` 或 `tested`。

## 1. 目标版本

| 项目 | 值 |
| --- | --- |
| dsh-qa 基线 | `v0.4.0` / implementation branch `codex/0.4.1` |
| Harness 目标 | `dsh-v0.1.6-alpha.1` |
| 0.4.1 状态 | `IMPLEMENTED_PENDING_HOST` |
| 真实宿主冒烟 | `NOT_RUN` |
| 兼容徽章 | 保持当前已发布事实，验证后再更新 |

## 2. 核心兼容矩阵

| 能力 | 当前源代码/契约检查 | 真实 Harness 宿主冒烟 | 当前结论 |
| --- | --- | --- | --- |
| `agentPresets/list` | slash endpoint + compatibility/unit tests | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `agentPresets/select` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/list` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/create`、`session/rename` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/modelCatalog` | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `skills/list`、`commands/list` | slash endpoint + local error propagation + browser regression | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/follow` | locked open envelope, `snapshot.records` parser, wrong-stream/error/close/timeout cleanup tests | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| `session/prompt` | slash endpoint + existing error UI path | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| model select / cancel | slash endpoint + compatibility test | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| Workbench load | standalone Chromium E2E | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
| refresh / reconnect | standalone Chromium reconnect regression | 未运行 | `VERIFIED_LOCAL / NOT_RUN_HOST` |
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
| `node --test test/unit/dsh-rpc-contract.test.js test/unit/dsh-compatibility.test.js` | `9 passed` |
| `npm run test:unit`（当前实现） | `131 passed` |
| `npm test` | 单元阶段 `131 passed`；E2E 阶段被已有 `127.0.0.1:8899` 进程阻断 |
| `QA_E2E_PORT=8900 npm test` | `131` 个单元/API + `22` 个本地 Chromium E2E 通过；host smoke 被默认配置排除 |
| `npm run test:e2e -- test/e2e/skills.spec.js test/e2e/workbench-reconnect.spec.js` | 默认端口被已有进程占用；使用隔离数据目录和 8900 端口重跑后 `4 passed` |
| 标准本地 E2E（同一 Playwright 项目配置，排除 opt-in host smoke） | `22 passed` |
| `npm run test:host-smoke` 无环境变量 | 按设计在浏览器启动前失败，提示必须提供 `DSH_WEB_URL` 和 `DSH_HOST_VERSION` |
| 真实 `dsh-v0.1.6-alpha.1` host smoke | `NOT_RUN`：当前没有可审计的登录宿主 URL/运行记录 |

## 5. 与 0.5 的边界

0.4.1 只验证现有挂载方式在目标 Harness 上能工作；它不把 DOM selector 注入升级为正式架构。`sidebar.panellist`、root-scoped `main` keyed slot、移除 MutationObserver 和 `dsh-panel-activate` 属于 0.5.0。
