# Changelog

## 0.4.1 - 2026-09-15

## 中文

### 兼容性加固

- 固化当前 Harness `client-request` 与 `session/follow` WebSocket envelope，并统一读取 `snapshot.records` / `cursor`；follow 使用 Remote mux `/api/remote.mux`。
- 为 Session follow 增加错误、关闭、超时和重复 frame 的边界处理；宿主能力列表失败会继续向工作台状态路径报告，不再静默显示为空。
- 对齐 `dsh-v0.1.6-alpha.1` 的 QA preset workflow、persona `prefix` 和 `skills/list` request envelope。
- 增加显式 opt-in 的 `dsh-v0.1.6-alpha.1` Harness host smoke 命令，并完成真实宿主 4/4 验收。

### 当前证据边界

- `137` 个单元/API 测试、`22` 个独立 Chromium E2E 和 `4/4` 个真实 Harness host smoke 均通过；host smoke 针对 `dsh-v0.1.6-alpha.1` 执行。
- 当前提交完成本地 `0.4.1` 版本准备；npm 包、Git tag 和 GitHub Release 尚未在本次变更中发布。

## English

### Compatibility hardening

- Locked the current Harness `client-request` and `session/follow` WebSocket envelopes, standardized reading `snapshot.records` / `cursor`, and used the Remote mux at `/api/remote.mux`.
- Added bounded error, close, timeout, and duplicate-frame handling for Session follow; host capability-list failures now remain visible instead of becoming an empty success.
- Aligned the QA preset workflow, persona `prefix`, and `skills/list` request envelope with `dsh-v0.1.6-alpha.1`.
- Added an explicit opt-in `dsh-v0.1.6-alpha.1` Harness host-smoke command and completed all 4/4 real-host cases.

### Evidence boundary

- `137` unit/API tests, `22` standalone Chromium E2E tests, and `4/4` real Harness host-smoke cases passed against `dsh-v0.1.6-alpha.1`.
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
