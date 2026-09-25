# Changelog

## Unreleased

## 0.6.3 - 2026-09-25

## 中文

### 改进

- 安装 `dsh-qa` 主 bundle 时同时提供 `qa` 与 `quality-control` preset，无需再执行单独的 preset 安装命令。

## English

### Improvements

- Include both the `qa` and `quality-control` presets in the main `dsh-qa` bundle so users no longer need a separate preset-install command.

## 0.6.2 - 2026-09-25

## 中文

### 修复

- 修正官方 Electron 客户端中的 `quality-control` 安装指引：不再生成会被拒绝的 `--profile desktop` CLI 命令，改为引导用户通过 DSH「插件」页安装本地 bundle。
- 两个 preset 安装脚本现在会提前拒绝 Electron 独占的 `desktop` profile，并固定 Web 示例使用兼容的 Harness `0.1.7-rc.1` CLI。
- 修正 Web 安装示例未导出自定义 `DSH_HOME` 的问题，确保路径和 DSH CLI 使用同一个 profile。

### 验证

- `QA_E2E_PORT=18999 npm test`：218 个单元/API 测试和 39 个 Chromium E2E 测试通过。
- `npm pack --dry-run`、`preset/quality-control` bundle dry-run、脚本语法检查和 `git diff --check`：通过。

## English

### Fixes

- Fix the `quality-control` installation guide inside the official Electron client: it no longer emits the rejected `--profile desktop` CLI command and instead directs users to install the local bundle from DSH's Plugins page.
- Make both preset installers reject Electron's exclusive `desktop` profile before invoking the CLI, and pin Web examples to the compatible Harness `0.1.7-rc.1` CLI.
- Export a custom `DSH_HOME` in the Web installation examples so the displayed bundle path and the DSH CLI use the same profile.

### Verification

- `QA_E2E_PORT=18999 npm test`: 218 unit/API tests and 39 Chromium E2E tests passed.
- `npm pack --dry-run`, the `preset/quality-control` bundle dry-run, shell syntax checks, and `git diff --check`: passed.

## 0.6.1 - 2026-09-25

## 中文

### 修复

- 修复 DeepSeek Harness 官方桌面客户端 `dsh-app://app` 环境下，DSH 会话 follow WebSocket 使用错误主机导致连接失败的问题。
- 根据官方客户端提供的传输地址构造 `ws/wss://.../api/remote.mux`，并保留独立 Web UI 的 HTTP/HTTPS 运行模式兼容。

### 改进

- 设置弹窗新增明亮、暗黑和跟随系统三种外观主题，默认跟随系统并持久保存选择。
- 设置弹窗展示 `qa` 与可选 `quality-control` 预设；可复制当前 DSH profile 对应的安装命令，安装后重启 Harness 即可使用。

### 验证

- `QA_E2E_PORT=8919 npm test`：216 个单元/API 测试和 38 个 Chromium E2E 测试通过。
- `git diff --check`：通过。

## English

### Fixes

- Fix DSH session follow WebSocket failures in the official DeepSeek Harness desktop client's `dsh-app://app` environment by resolving the official transport origin instead of the iframe location host.
- Preserve HTTP/HTTPS WebSocket compatibility for the standalone Web UI.

### Improvements

- Add Light, Dark, and System appearance choices to Settings, defaulting to System and persisting the selection locally.
- Show the `qa` and optional `quality-control` presets in Settings, with a copyable install command for the active DSH profile and a restart reminder.

### Verification

- `QA_E2E_PORT=8919 npm test`: 216 unit/API tests and 38 Chromium E2E tests passed.
- `git diff --check`: passed.

## 0.6.0 - 2026-09-24

## 中文

### 新功能

- 新增 Native QA Execution：为 Host 执行配置、预览确认、启动、取消、重试、超时和证据归档建立受控链路。
- 新增 Action Desk：从 canonical Action Queue 汇总需要处理的执行状态，保留首页提醒兼容投影，并支持双语状态、稳定排序和 SSE 刷新。
- 新增 Host Execution 证据边界与生命周期持久化，区分宿主执行事件和本地 TestRun，阻止无证据的执行结果进入质量结论。

### 修复

- 修复 DSH `v0.1.7-rc.1` 宿主中可选 `hostAdapters` 上下文的兼容访问，避免未注入属性导致插件初始化失败。
- 强化 Action Desk 的 revision、重复启动、重试抑制、取消和错误路径。

### 验证

- `QA_E2E_PORT=8917 npm test`：213 个单元/API 测试和 37 个 Chromium E2E 测试通过。
- `npm pack --dry-run`：通过。
- 真实 `dsh-v0.1.7-rc.1` 宿主兼容验收：用户本地操作无异常。

## English

### Features

- Add Native QA Execution with controlled Host execution profiles, preview/confirmation, start, cancel, retry, timeout, and evidence archiving.
- Add Action Desk backed by the canonical Action Queue, with a legacy dashboard-reminder projection, bilingual states, stable ordering, and SSE refresh.
- Persist Host Execution evidence boundaries and lifecycle transitions separately from local TestRun events, preventing evidence-free execution results from becoming quality conclusions.

### Fixes

- Fix optional `hostAdapters` context access in the DSH `v0.1.7-rc.1` host so plugin initialization does not fail on an undeclared context property.
- Harden Action Desk revision checks, duplicate-start suppression, retry suppression, cancellation, and error paths.

### Verification

- `QA_E2E_PORT=8917 npm test`: 213 unit/API tests and 37 Chromium E2E tests passed.
- `npm pack --dry-run`: passed.
- Real `dsh-v0.1.7-rc.1` host compatibility acceptance: no issues found in the user's local validation.

## 0.5.4 - 2026-09-24

## 中文

### 修复

- 修复 Harness 0.1.7 加载 `quality-control` bundle 时，`dsh-plan-mode` 缺少非空 `section` 配置而导致 Agent 预设加载失败的问题。

### 验证

- `npm test`：162 个单元/API 测试和 32 个 Chromium E2E 测试通过。
- `git diff --check`：通过。
- `scripts/install-quality-control-preset.sh --profile web --dry-run`：通过。

## English

### Fixes

- Fix `quality-control` bundle loading in Harness 0.1.7 by supplying the required non-empty `section` configuration for `dsh-plan-mode`.

### Verification

- `npm test`: 162 unit/API tests and 32 Chromium E2E tests passed.
- `git diff --check`: passed.
- `scripts/install-quality-control-preset.sh --profile web --dry-run`: passed.

## 0.5.3 - 2026-09-23

## 中文

### 改进

- 完成 Quiet Studio「安静工作室」视觉整理，优化工作台的信息层级与浅色界面可读性。
- 整理项目目录，将测试配置、测试说明和结果入口统一到 `test/`，并同步文档与流程图目录。

### 修复

- 修复应用初始化请求覆盖用户已选择页面的问题。
- 移除 README 中过时的展示图片。

### 验证

- `npm run test:unit`：162 个单元/API 测试通过。
- `QA_E2E_PORT=8916 npm run test:e2e`：32 个 Chromium E2E 测试通过。
- `npm pack --dry-run`：通过。

## English

### Improvements

- Polish the workbench as the Quiet Studio visual system and improve information hierarchy and light-surface readability.
- Consolidate test configuration, test guidance, and result entry points under `test/`, while organizing the project documentation and workflow diagrams.

### Fixes

- Preserve the page selected by the user while the application initialization request is in flight.
- Remove the obsolete showcase image from the README files.

### Verification

- `npm run test:unit`: 162 unit/API tests passed.
- `QA_E2E_PORT=8916 npm run test:e2e`: 32 Chromium E2E tests passed.
- `npm pack --dry-run`: passed.

## 0.5.2 - 2026-09-23

## 中文

### 新功能

- 在设置弹窗中集中提供中英文切换、当前/最新版本、兼容 DSH 版本、GitHub 仓库和项目官网链接。
- 在品牌区域展示当前版本和更新提示；打开版本号查看按发布时间倒序排列、支持分页的版本迭代记录。
- 版本迭代记录按当前语言展示中文或英文更新描述，并提供 GitHub 详细更新链接。

### 修复

- 提升设置按钮在浅色背景下的对比度，并移除不再需要的主题和工作区宽度预设。

### 验证

- `npm test`：160 个单元/API 测试和 25 个 Chromium E2E 测试通过。

## English

### Features

- Add a settings dialog with bilingual language switching, installed/latest versions, compatible DSH version, GitHub repository, and project website links.
- Show the installed version and update indicator beside the brand; open it to browse paginated release history sorted newest first.
- Localize release summaries to the active language and provide a GitHub link for detailed updates.

### Fixes

- Improve settings-button contrast on light backgrounds and remove the unused theme and workspace-width presets.

### Verification

- `npm test`: 160 unit/API tests and 25 Chromium E2E tests passed.

## 0.5.1 - 2026-09-22

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
