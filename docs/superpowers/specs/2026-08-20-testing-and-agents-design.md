# dsh-qa 测试与协作规范设计

## 目标

为 dsh-qa 补充根级 `AGENTS.md`，建立可重复运行的单元测试和 Playwright E2E 测试，覆盖核心业务逻辑和一条真实工作台主流程。

## 范围

- 使用 Node.js 内置 `node:test` 测试 `server/board.js` 和 `server/store.js` 的核心行为。
- 启动真实 HTTP 服务，覆盖关键 API 的成功与校验失败路径。
- 使用 Playwright Test 启动真实服务，验证打开工作台、创建项目、项目显示在工作台中的流程。
- 测试使用独立临时数据目录和随机端口，不污染开发者数据。
- 根级 `AGENTS.md` 记录项目结构、命令、测试分层、隔离规则和交付前验证要求。

## 技术方案

服务端单元测试保持 Node 原生 ESM 和零运行时依赖，使用 `node:test` 与 `node:assert/strict`。E2E 使用 `@playwright/test`，通过 Playwright 的 `webServer` 启动 `node server/cli.js`，测试完成后由 Playwright 管理服务生命周期。

测试脚本提供 `test:unit`、`test:e2e` 和聚合的 `test`。Playwright 配置固定使用本地地址、独立测试数据目录和 Chromium 项目；首次执行 E2E 时需要额外安装 Playwright 浏览器。

## 验证重点

- 项目创建、项目状态流转、看板分组和统计数据的业务结果。
- API 对缺少项目标题等非法输入返回明确的 4xx 响应。
- 浏览器用户可以看到工作台首页，并能创建项目后在列表或看板中看到该项目。
- 测试命令在干净环境下可重复执行，且不依赖真实 DSH 会话、API Key 或开发者本机已有数据。

## 非目标

- 不重构现有业务模块。
- 不覆盖需要真实 DeepSeek API、DSH 宿主或 Remote 隧道的功能。
- 不在本阶段追求全量路由覆盖或视觉回归测试。
