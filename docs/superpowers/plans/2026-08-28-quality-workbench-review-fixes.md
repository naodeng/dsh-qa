# Quality Workbench Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 CodeReview 确认的 0.2.0–0.4.0 来源安全、受控执行、证据生命周期、并发与持久化问题。

**Architecture:** 保持现有 Project 聚合与零生产依赖，安全校验落在质量域模块，HTTP 路由只负责状态码映射。运行预览保存不可变的 plan/profile 版本摘要；证据清理和恢复同时维护文件系统事实、bundle 索引与累计配额。

**Tech Stack:** Node.js ESM、`node:test`、原生 HTTP、JSON 原子落盘、Playwright Chromium。

**Spec:** `docs/quality-workbench/2026-08-25-requirements.md`、`docs/quality-workbench/2026-08-25-technical-design.md`

## Global Constraints

- Node 18+、ESM、零生产依赖。
- 单项来源最多 1 MiB，单任务来源合计最多 5 MiB；workspace 文件必须 realpath 后仍在项目目录。
- 只有当前 reviewed TestPlan 与当前启用 Profile 版本能授权运行。
- 子进程使用最小环境；取消/超时保持终态并终止进程组；终态必须持久化。
- Evidence 只接受 regular file，防链接竞态；恢复、清理同步维护索引和配额。

---

### Task 1: Source capture and quality-task creation

**Files:**
- Modify: `server/quality/source.js`
- Modify: `server/quality/task.js`
- Modify: `server/routes.js`
- Test: `test/unit/quality-source.test.js`
- Test: `test/unit/http-api.test.js`

**Interfaces:**
- Produces: `captureSources(project, descriptors)`，返回校验后的 `{ type, ref, digest, byteSize, snapshot, capturedAt }[]`。
- Consumes: `createQualityTask(project, { title, sources })` 仅接收已采集来源。

- [ ] 新增失败测试：workspace symlink 越界、目标不存在/非文件、6 个 1 MiB 来源超过 5 MiB、HTTP 创建任务不能保存客户端伪造 digest/snapshot。
- [ ] 运行 `node --test test/unit/quality-source.test.js test/unit/http-api.test.js`，确认失败原因分别是当前跟随 symlink、无总量限制和原样保存来源。
- [ ] 使用 `realpath`/`lstat` 校验 workspace 与目标边界，以有界读取生成服务端摘要；路由先采集来源再创建任务。
- [ ] 重跑上述测试并确认通过。

### Task 2: Immutable execution authorization and run lifecycle

**Files:**
- Modify: `server/quality/execution-profile.js`
- Modify: `server/quality/test-runner.js`
- Modify: `server/quality/test-run.js`
- Modify: `server/routes.js`
- Test: `test/unit/execution-profile.test.js`
- Test: `test/unit/test-runner.test.js`
- Test: `test/unit/http-api.test.js`

**Interfaces:**
- Produces: `currentExecutionProfileVersion(profile)`；preview 保存 plan/profile version、source digest、cwd、argv、effects。
- Consumes: `startRun(project, previewToken)` 在消费前重算并比较授权摘要。

- [ ] 新增失败测试：draft/superseded plan 拒绝预览、Profile v2 真正生效、版本变化后 token 失效、禁用后 token 失效、取消 queued/running 后不再启动或覆盖、终态触发持久化、子进程看不到敏感环境。
- [ ] 运行相关测试确认 RED。
- [ ] 更新 Profile 当前版本读取；为 preview 建立稳定摘要并在入队时复核；记录 plan/profile version provenance。
- [ ] 为 deferred timer 建立取消句柄；close 保留 cancelled/timed-out；以 detached 进程组终止；传递最小允许环境；终态写日志后持久化。
- [ ] 路由要求取消 `expectedRevision` 并把版本冲突映射为 409 稳定 code；重跑相关测试确认 GREEN。

### Task 3: Evidence integrity, recovery, retention, and quota

**Files:**
- Modify: `server/quality/evidence.js`
- Modify: `server/quality/evidence-retention.js`
- Modify: `server/index.js`
- Test: `test/unit/evidence.test.js`
- Test: `test/unit/evidence-retention.test.js`
- Test: `test/unit/http-api.test.js`

**Interfaces:**
- Produces: `recoverEvidenceFinalization(projects)` 恢复有效 finalizing/final 目录并重算配额；`runArtifactCleanup` 原子更新 bundle 索引和配额。
- Consumes: evidence item 通过文件描述符 `O_NOFOLLOW` 读取，并比较 inode/size/mtime。

- [ ] 新增失败测试：有效 finalizing 恢复、无效目录隔离/不发布、恢复后累计配额正确、retention 删除后 bundle 和配额同步、hash 期间链接替换拒绝。
- [ ] 运行相关测试确认 RED。
- [ ] 以 `open(O_NOFOLLOW)` + `fstat` + stream fd 完成摘要；manifest 项排序稳定。
- [ ] 恢复可验证目录并重算 artifactUsageBytes；清理成功后移除 bundle、evidenceRefs 并扣减配额，失败保留一致状态。
- [ ] 重跑相关测试确认 GREEN。

### Task 4: Mutation consistency and route boundary

**Files:**
- Create: `server/quality/http-routes.js`
- Modify: `server/routes.js`
- Modify: `server/quality/analysis.js`
- Test: `test/unit/http-api.test.js`
- Test: `test/unit/quality-analysis.test.js`

**Interfaces:**
- Produces: `handleQualityRoutes(context)`，只处理 `/api/projects/:id` 下 0.2.0–0.4.0 质量 API。
- Consumes: mutation helpers 返回带 `code/status` 的领域错误，路由统一映射。

- [ ] 新增失败测试：缺失/过期 revision 返回 409 与稳定 `QUALITY_REVISION_CONFLICT`，失败 mutation 不改变实体、不广播。
- [ ] 运行相关测试确认 RED。
- [ ] 抽取质量路由，统一 expectedRevision 校验和错误响应；补全质量审计规定字段，不记录正文、路径、argv 或 token。
- [ ] 重跑 API 与领域测试确认 GREEN。

### Task 5: Full verification and delivery

**Files:**
- Modify: `docs/quality-workbench/2026-08-27-implementation-status.md`

- [ ] 运行 `npm run test:unit`。
- [ ] 运行 `npm run test:e2e`，使用真实 Chromium 和 8899 测试服务。
- [ ] 运行 `npm test` 与 `git diff --check`。
- [ ] 对 `origin/master...HEAD` 重新执行 Standards/Spec Review，确认本计划对应问题无残留。
- [ ] 仅暂存本计划涉及文件，提交并推送 `codex/quality-workbench-iterations`。
