# Changelog

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
