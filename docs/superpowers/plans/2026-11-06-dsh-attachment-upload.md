# DSH 对话附件上传实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 让 DSH 测试对话的「+」按钮选择、发送并在历史记录中展示附件。

**Architecture:** 附件草稿只保存在当前页面内存中；发送时普通文件由 DSH 原生二进制上传路由暂存，图片作为 DSH prompt 图片块发送。前端通过已存在的 `session/prompt` 和 `commands/execute` 发送附件，不增加工作台 API、项目文件或生产依赖。

**Tech Stack:** Node.js ESM 18+、原生 HTML/CSS/JavaScript、Node `node:test`、Playwright Chromium。

**Spec:** `docs/superpowers/specs/2026-11-06-dsh-attachment-upload-design.md`

## Global Constraints

- 每条消息最多 10 个文件；单文件最多 20 MiB；总计最多 50 MiB。
- 图片支持 PNG、JPEG、WebP、GIF；其他文件类型作为普通文件。
- 普通文件上传使用 `POST /api/session/uploadFileBinary?sessionId=<id>&name=<display name>`，请求体为 `application/octet-stream` 裸二进制，响应不是 DSH RPC envelope。
- 普通文件 receipt 绑定到上传时的会话和宿主进程；宿主重启后失效。DSH 接受消息并写入对应会话事件后 receipt 会被消费。
- DSH 普通 `user/message` 历史文件以 `file.attachment` 记录，图片以持久化图片引用记录；UI 不依赖本地文件路径。`command/run` 生命周期事件不保留附件引用，命令附件只在当次页面显示。
- 文件选择与移除阶段不上传；不把附件保存到项目目录、工作台 JSON 或浏览器持久存储。
- 保留当前工作区已有改动；只修改本功能所需代码和测试，不重排或覆盖相邻改动。

## Review Focus

- 文件上传成功但 prompt 失败：草稿仍在；同一会话内未消费的 receipt 可复用，已失效时重新上传；由 Task 2 的失败重试 E2E 覆盖。
- 混合图片/普通文件的顺序和空文本发送：附件顺序不变，图片使用四种受支持媒体类型；由 Task 1 的 helper tests 覆盖。
- slash 命令不声明 `input.attachments`：不得执行，附件草稿仍保留；由 Task 2 的 command E2E 覆盖。
- 文件名包含 HTML 字符、未知文件类型或普通消息历史缺少名称：安全转义并使用通用标签；由 Task 1 和 Task 2 的测试覆盖。
- 401/403/404、损坏响应和网络中断：显示上传失败并保留文本/附件，不把裸上传响应误解析成 RPC 响应；由 Task 1 和 Task 2 的错误测试覆盖。

## Preflight

- [x] 检查分支和脏文件边界；本次在现有 `codex/fix-subagent-list-agents` 非主分支内工作，避免另建 worktree 遗漏同一 `public/app.js` 上的既有本地改动。
- [x] 在代码修改前运行 `npm test` 作为现有工作区基线，并记录单元/API 与 E2E 结果。单元/API 通过 279/279；默认 E2E 端口 8899 被占用。切到 8901 后，Chromium 启动被 macOS 沙箱的 `MachPortRendezvousServer: Permission denied` 阻止；按项目规则不在沙箱内重试，待实现完成后申请单次沙箱外运行。

### Task 1: DSH 附件协议 helpers

**Files:**
- Create: `public/dsh-attachments.js`
- Modify: `public/dsh-rpc-contract.js`
- Test: `test/unit/dsh-attachments.test.js`
- Test: `test/unit/dsh-rpc-contract.test.js`

**Interfaces:**
- `validateDshAttachmentBatch(files)` 检查数量、单文件字节数和总字节数，返回 `true` 或抛出可显示给用户的错误。
- `isDshInlineImage(file)` 只把 `image/png`、`image/jpeg`、`image/webp`、`image/gif` 当作 prompt 图片。
- `encodeDshImage(file)` 返回 `{ type: 'image', mediaType, data, name }`，`data` 为规范 base64。
- `uploadDshFile(fetchImpl, sessionId, file)` 走 DSH 裸 HTTP 上传并返回 `{ receiptId, file }`；保留服务端错误 `code/details`。
- `prepareDshAttachmentParts(drafts, { sessionId, uploadFile, encodeImage })` 保持用户选择顺序，复用当前草稿缓存的有效文件 receipt，并返回可用于 prompt/command 的附件块。
- `extractDshMessageAttachments(content)` 从 DSH 持久化消息块提取安全展示用的 `{ kind, name, bytes, mediaType }[]`。
- `createDshRpc()` 在拒绝响应上继续暴露 DSH error code/details，供失效 receipt 恢复处理。

- [x] **Step 1: 写失败测试**，覆盖 10 个/11 个附件、20 MiB 单项、50 MiB 总量、四种 inline 图片类型、混合附件顺序、base64 编码、文件 receipt 上传参数、裸响应解析和历史 block 提取。
- [x] **Step 2: 运行新增测试确认失败**。新 helper 尚未创建时按预期失败。

Run: `node --test test/unit/dsh-attachments.test.js test/unit/dsh-rpc-contract.test.js`

Expected: 新 helper 缺失时失败；已有 RPC contract tests 通过。

- [x] **Step 3: 实现 helper 与 DSH error 元数据保留**，不引入生产依赖。
- [x] **Step 4: 重跑聚焦测试**。附件 helper、RPC contract 与 DSH compatibility 聚焦测试通过 54/54。

Run: `node --test test/unit/dsh-attachments.test.js test/unit/dsh-rpc-contract.test.js`

Expected: 所有附件 helper 和 RPC contract tests 通过。

### Task 2: 对话 composer、提交和历史附件展示

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Create: `test/e2e/dsh-attachments.spec.js`
- Modify: `test/unit/dsh-compatibility.test.js`

**Interfaces:**
- Composer controls: `#btn-attach` opens hidden multi-file input `#chat-file-input`; selected drafts render inside `#chat-attachments` with per-item remove controls.
- `state.dsh.attachments` owns current in-memory file drafts and staged receipt metadata.
- Drafts carry their owning project ID and are cleared when the user changes projects.
- `sendMessage()` permits an attachment-only message, validates the batch before network work, and leaves text and files in the composer on failure.
- The send token is allocated before session setup; Stop or project switching invalidates it, and the UI checks it after asynchronous pre-dispatch stages.
- Plain prompt content is `[text? , ...attachmentParts]`; slash command execution supplies the same ordered blocks through `submittedAttachments` only when its DSH descriptor declares `input.attachments`.
- `dshRows()` restores attachment display metadata from durable message content; `appendUserMsg(text, scroll, attachments)` renders escaped name/type/size chips.

- [x] **Step 1: Write Playwright coverage first** for standalone-mode unavailable guidance; selecting/removing multiple files; attachment-only submit; no upload before Send; raw binary request and receipt reference; unsupported slash command retention; failed prompt retention/retry; Stop during upload; project-switch isolation; command result retention; command attachment passing; and restored ordinary-message history chips.
- [x] **Step 2: Check the browser-test baseline and run post-implementation coverage**. Baseline Chromium launch was blocked by `MachPortRendezvousServer: Permission denied (1100)` in the macOS sandbox, so browser tests were not retried there. After implementation, the user authorized an external full-suite run on port 8901; the final run passed all 50 E2E tests.

Run: `npm run test:e2e -- test/e2e/dsh-attachments.spec.js`

Expected: the new tests fail because the attachment button/input, request flow, and history chips do not exist yet; existing assistant tests pass.

- [x] **Step 3: Implement the composer and DSH send/history integration** using the approved prototype as the visual reference. Preserve existing Markdown and slash-search code in the same files. Show a clear unavailable reason outside DSH embedded mode, and use the existing language preference for labels and errors.
- [x] **Review repair:** bind drafts to the selected project and allocate/check the send token before and after async setup/upload so Stop or project switching cannot dispatch the pending message. Command errors and missing command responses retain the draft.
- [x] **Step 4: Run attachment E2E and compatibility tests**. Final external `QA_E2E_PORT=8901 npm test` passed unit/API 289/289 and E2E 50/50. Command success shows attachment chips immediately; after reload DSH restores only command lifecycle text because lifecycle events do not persist attachments.

Run: `npm run test:e2e -- test/e2e/assistant.spec.js && node --test test/unit/dsh-compatibility.test.js test/unit/dsh-attachments.test.js test/unit/dsh-rpc-contract.test.js`

Expected: selection, removal, send, failure recovery, history rendering, and DSH compatibility tests pass.

- [x] **Step 5: Perform visual acceptance** in the local browser at 1440px desktop and 390px mobile widths, matching the approved prototype's sample file and message. Chip wrapping, 24px remove target, standalone disabled guidance, and page-width overflow were inspected; `documentElement.scrollWidth` stayed equal to the viewport width. DSH-connected state awaits mocked E2E/real host verification.

Expected: the attachment list aligns with the composer, remains usable on mobile, and preserves existing composer controls.

## Final Verification

- [x] Run `QA_E2E_PORT=8901 npm test` and read the full result; unit/API 289/289 and Playwright 50/50 passed.
- [x] Run `git diff --check`; no whitespace errors.
- [x] Check `git status --short` and confirm pre-existing preset, Markdown, slash-search, and unit-test changes remain unstaged.
- [x] Check real-host smoke availability; `DSH_WEB_URL` and `DSH_HOST_VERSION` are unset, so host smoke is `NOT_RUN`.
- [ ] Stage only attachment feature changes, commit, and push the existing task branch if its configured remote matches the user's earlier “提交到远端” request; do not stage pre-existing unrelated worktree changes.
