# Changelog

## Unreleased

## 中文

### Harness 0.1.7 兼容性优化

- 将 `qa` preset 从旧目录复制模型迁移为主插件 profile bundle 声明，并将 `quality-control` 提供为可独立安装的 bundle。
- 安装脚本改为调用 `dsh plugin --profile ... add link:...`，支持 profile、DSH executable 和 dry-run 参数，不再写入旧 preset 目录。
- 对齐 `quality-control` 的 persona `prefix` 与 `workflow-ptc`，并允许 Host Smoke 显式接受 `dsh-v0.1.7-alpha.1`。
- 根据真实 0.1.7 Host Smoke 发现并修复 popout 生命周期问题：Chromium 对 `window.open(..., 'noopener')` 返回空句柄，Panel 卸载时无法关闭同源工作台标签页；现在保留可关闭的 `WindowProxy`，并增加回归测试。
- 修复 Host Smoke 在 Panel 重新挂载后过早读取 Workbench frame 的测试时序：先等待目标 iframe URL 出现，再发送 `postMessage` 返回宿主。

### 验证

- 兼容性聚焦测试 `14/14`、全量单元/API 测试 `159/159`、隔离端口上的完整 `QA_E2E_PORT=8900 npm test`（159 单元/API + 23 Chromium E2E）、YAML 解析、bundle dry-run、npm pack dry-run 和脚本语法检查均通过；真实 `dsh-v0.1.7-alpha.1` `qa` bundle Host Smoke 最终为 `6 passed`。

## English

### Harness 0.1.7 compatibility optimization

- Migrated the `qa` preset from legacy directory copying to a main-plugin profile bundle, and made `quality-control` an independently installable bundle.
- Updated installers to call `dsh plugin --profile ... add link:...` with profile, DSH executable, and dry-run options instead of writing legacy preset directories.
- Aligned `quality-control` with the `prefix` persona field and `workflow-ptc`, and let Host Smoke explicitly accept `dsh-v0.1.7-alpha.1`.
- Fixed the popout lifecycle issue found by the real 0.1.7 Host Smoke: Chromium returns a null handle for `window.open(..., 'noopener')`, preventing Panel unmount from closing the same-origin workbench tab; the implementation now retains a closeable `WindowProxy` and has a regression test.
- Fixed the Host Smoke timing race after Panel remount: wait for the target Workbench frame URL before posting the return-to-host message.

### Verification

- Focused compatibility tests `14/14`, the full unit/API suite `159/159`, the complete `QA_E2E_PORT=8900 npm test` gate (159 unit/API + 23 Chromium E2E), YAML parsing, bundle dry-runs, npm pack dry-run, and shell syntax checks pass; the real `dsh-v0.1.7-alpha.1` `qa` bundle Host Smoke finally completed with `6 passed`.

## 0.5.0 - 2026-09-21

## 中文

### 新功能

- 使用 Harness 官方 `sidebar.panellist` 与 root-scoped `main` keyed slot 挂载 QA Workbench，移除对宿主 DOM selector、`MutationObserver` 和自建 Panel 激活协议的依赖。
- 保留 Workbench iframe、独立标签页打开、Panel 关闭和 `postMessage` 返回 DSH 的用户路径，并为 Panel 注册和 iframe listener 提供幂等 disposer。

### 修复

- 修复宿主刷新后恢复项目标题丢失的问题。
- 修复 Panel 关闭或卸载时 popout 窗口未被清理的问题。
- 增加 native Panel contract、raw client runtime 和 Panel lifecycle 回归测试。

### 验证

- `152` 个单元/API 测试和 `23` 个本地 Chromium E2E 测试通过。
- `dsh-v0.1.6-alpha.1` Host smoke 为 `5 passed / 1 skipped`；唯一跳过项是宿主组合没有第二个全局 Panel，插件卸载与恢复已由真实宿主人工验证通过。

## English

### Features

- Mount the QA Workbench through Harness's official `sidebar.panellist` and root-scoped keyed `main` slots, removing dependencies on host DOM selectors, `MutationObserver`, and the custom Panel activation protocol.
- Preserve the Workbench iframe, tab popout, Panel close, and `postMessage` return-to-DSH flows with idempotent Panel registration and iframe-listener disposers.

### Fixes

- Preserve the restored project title after a host refresh.
- Close popout windows when the Panel is closed or unloaded.
- Add native Panel contract, raw client runtime, and Panel lifecycle regression coverage.

### Verification

- `152` unit/API tests and `23` local Chromium E2E tests passed.
- The `dsh-v0.1.6-alpha.1` Host smoke completed with `5 passed / 1 skipped`; the only skipped case had no second global Panel, and plugin unload/restore was manually verified on the real host.

## 0.4.1 - 2026-09-15

## 中文

### 兼容性加固

- 固化当前 Harness `client-request` 与 `session/follow` WebSocket envelope，并统一读取 `snapshot.records` / `cursor`；follow 使用 Remote mux `/api/remote.mux`。
- 为 Session follow 增加错误、关闭、超时和重复 frame 的边界处理；宿主能力列表失败会继续向工作台状态路径报告，不再静默显示为空。
- 对齐 `dsh-v0.1.6-alpha.1` 的 QA preset workflow、persona `prefix` 和 `skills/list` request envelope。
- 增加显式 opt-in 的 `dsh-v0.1.6-alpha.1` Harness host smoke 命令，并完成真实宿主 4/4 验收。

### 当前证据边界

- `141` 个单元/API 测试、`22` 个独立 Chromium E2E 和 `4/4` 个真实 Harness host smoke 均通过；host smoke 针对 `dsh-v0.1.6-alpha.1` 执行。
- 当前提交完成本地 `0.4.1` 版本准备；npm 包、Git tag 和 GitHub Release 尚未在本次变更中发布。

## English

### Compatibility hardening

- Locked the current Harness `client-request` and `session/follow` WebSocket envelopes, standardized reading `snapshot.records` / `cursor`, and used the Remote mux at `/api/remote.mux`.
- Added bounded error, close, timeout, and duplicate-frame handling for Session follow; host capability-list failures now remain visible instead of becoming an empty success.
- Aligned the QA preset workflow, persona `prefix`, and `skills/list` request envelope with `dsh-v0.1.6-alpha.1`.
- Added an explicit opt-in `dsh-v0.1.6-alpha.1` Harness host-smoke command and completed all 4/4 real-host cases.

### Evidence boundary

- `141` unit/API tests, `22` standalone Chromium E2E tests, and `4/4` real Harness host-smoke cases passed against `dsh-v0.1.6-alpha.1`.
- This commit prepares the local `0.4.1` version; npm, Git tag, and GitHub Release publication were not performed in this change.

## 0.4.0 - 2026-09-15

## 中文

### 新功能

- 增加可校验的质量证据包：支持终态运行 finalize、规范 manifest hash、逐文件 SHA-256、证据类型、MIME、捕获时间和文本/图片预览。
- 增加证据完整性恢复与安全生命周期：检测篡改、隔离无效证据、恢复中断 finalize、保护门禁和未关闭缺陷引用的证据，并执行配额与路径安全检查。
- 增加结构化失败分析、人工确认后的缺陷升级、确定性计算回归集、回归集重新计算和测试运行前后对比。
- 将测试运行绑定到源文件摘要与 Git commit，并补齐证据列表、单次运行证据、下载和质量工作台 UI。

### 修复

- 修复无效或过期证据进入质量门禁、重启后错误恢复为 ready、清理任务误删被引用证据等问题。
- 修复证据下载 MIME、路径越界、符号链接、回归集未知用例和运行对比请求参数校验问题。

### 验证

- 124 个单元/API 测试通过。
- 20 个 Chromium E2E 测试通过。
- GitHub Actions Test 通过。

## English

### Features

- Added verifiable quality evidence bundles with terminal-run finalization, canonical manifest hashes, per-file SHA-256 digests, evidence types, MIME metadata, capture timestamps, and text/image previews.
- Added evidence integrity recovery and safe lifecycle handling: tamper detection, invalid-evidence quarantine, interrupted-finalization recovery, reference protection for gates and open defects, quotas, and path hardening.
- Added structured failure analysis, human-confirmed defect promotion, deterministic calculated regression sets, recalculation, and before/after test-run comparison.
- Bound test runs to source digests and Git commits, and completed evidence list, per-run evidence, download, and quality-workbench UI flows.

### Fixes

- Prevented invalid or stale evidence from entering quality gates, incorrect resurrection as ready after restart, and cleanup of evidence still referenced by delivery decisions or open defects.
- Fixed evidence download MIME handling, traversal and symlink protections, unknown regression cases, and comparison request validation.

### Verification

- 124 unit/API tests passed.
- 20 Chromium E2E tests passed.
- GitHub Actions Test passed.
