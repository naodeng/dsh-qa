# 测试工作区

`test/` 是仓库唯一的测试工作区，集中放置测试代码、测试数据、测试结果和测试依赖安装说明。

```text
test/
├── unit/        # Node 内置测试运行器的业务、API 和兼容性测试
├── e2e/         # Playwright 独立工作台和可选 Harness 宿主测试
├── fixtures/    # 可控的测试输入和执行 fixture
├── helpers/     # 测试数据和领域辅助模块
├── support/     # 测试运行支持代码，例如 Harness 鉴权解析
├── .data/       # 本地测试数据（自动生成，不提交）
└── results/     # Playwright 报告、trace 和失败附件（自动生成，不提交）
```

## 安装测试依赖

在仓库根目录执行：

```sh
npm install
npx playwright install chromium
```

E2E 测试只需要本地 Chromium，不需要登录 DSH、真实模型或 API Key。若 Chromium 已安装，可跳过第二条命令。

## 执行测试

```sh
npm run test:unit
QA_E2E_PORT=8913 npm run test:e2e
```

聚合命令：

```sh
npm test
```

需要真实 Harness 宿主时，提供带认证的地址和固定版本：

```sh
DSH_WEB_URL='http://127.0.0.1:3080/?key=...' \
DSH_HOST_VERSION='dsh-v0.1.7-alpha.1' \
npm run test:host-smoke
```

## 结果位置

- 独立工作台 E2E 的 trace 和失败附件：`test/results/e2e/`
- Harness 宿主 Smoke 的 trace 和失败附件：`test/results/host-smoke/`
- 测试服务的 JSON 数据：`test/.data/`

这些内容均由 `.gitignore` 排除。产品运行时的 `data/`、质量执行器的 `output/playwright/` 和正式安装脚本 `scripts/install-*.sh` 不属于测试工作区，继续保持原位置。
