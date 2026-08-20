# dsh-qa 协作与验证规范

## 项目定位

dsh-qa 是一个 Node.js ESM 本地 QA 工作台插件。服务端使用 Node 原生 HTTP、SSE 和 JSON 文件存储，前端位于 `public/`，不需要生产构建步骤。

## 目录职责

- `server/`：独立服务、配置、数据存储、REST API、SSE 和业务工具。
- `public/`：原生 HTML、CSS 和浏览器端 JavaScript。
- `lib/`：DeepSeek Harness 宿主插件入口和浏览器接入层。
- `preset/`、`scripts/`：QA preset 与安装脚本。
- `test/unit/`：Node 内置测试运行器的业务和 API 测试。
- `test/e2e/`：Playwright 真实浏览器测试。
- `docs/superpowers/`：设计文档和实施计划。

## 常用命令

```sh
npm start                 # 独立启动工作台
npm run dev               # 监听重启
npm run test:unit         # 单元与 API 测试
npm run test:e2e          # Playwright Chromium 测试
npm test                  # 单元测试 + E2E 测试
```

首次运行 E2E 测试前执行 `npx playwright install chromium`。测试不需要 DSH 登录、真实模型或 API Key。

## 测试规则

- 单元测试使用 Node 内置 `node:test`，优先验证 `server/store.js` 和 `server/board.js` 的行为。
- API 测试启动真实本地服务，但必须使用临时 `QA_DATA_DIR` 和随机端口。
- Playwright 测试使用真实服务和 Chromium，覆盖用户可观察的主流程，不用测试专用 DOM 分支替代真实页面。
- `QA_DATA_DIR` 在服务模块导入时生效；涉及服务启动的测试必须串行运行，并在动态导入前设置数据目录。
- 不提交 `data/`、临时测试数据、Playwright report、trace 或 screenshot 产物。

## 修改与交付

保持 ESM、Node 18+ 和现有零生产依赖约束。改动应保持小范围，不顺手重构无关模块。交付前至少运行相关测试、`npm test` 和 `git diff --check`；汇报时区分静态检查、单元测试和真实浏览器验证。
