# 项目目录说明

本仓库保留 npm 包、DeepSeek Harness 插件和独立工作台共用的运行入口。目录整理以“职责清晰、入口稳定、生成物隔离”为原则，不把源码强行迁移到新的 `src/` 层，避免破坏已有的包导出、preset 安装脚本和测试导入路径。

## 目录职责

```text
.
├── lib/                         # DSH 插件宿主入口、客户端接入和 Panel 契约
├── server/                      # 独立工作台服务、存储、路由、SSE 和质量域
│   └── quality/                 # 质量任务、执行、证据、门禁和报告模块
├── public/                      # 原生 HTML/CSS/JavaScript 前端，无生产构建步骤
├── preset/                      # QA 与 quality-control preset 及其安装元数据
├── scripts/                     # 安装脚本和测试运行器
├── test/                        # 唯一测试工作区：源码、数据、结果和安装说明
│   ├── playwright.config.js     # 独立 E2E 配置
│   ├── playwright.host.config.js # Harness Smoke 配置
│   ├── results/                 # Playwright 报告、trace 和失败附件（本地生成）
│   └── README.md                # 测试依赖安装与执行说明
├── docs/
│   ├── quality-workbench/       # 产品需求、方案、技术文档、路线和评审记录
│   │   └── reviews/             # 历史 UI/可用性评审
│   ├── superpowers/            # specs、plans 和 explorations 等过程文档
│   └── diagram/                # README 使用的项目流程图
└── assets/                      # 仓库级截图和展示素材
```

## 稳定入口

- `npm start` → `server/cli.js`
- npm 主入口 → `lib/index.js`
- 浏览器客户端入口 → `lib/client.js`
- Web 工作台 → `public/index.html`
- QA preset → `preset/qa/cordis.patch.yml`
- 单元测试收集器 → `scripts/run-unit-tests.js`

测试统一收敛在 `test/` 下；`unit/`、`e2e/`、`fixtures/`、`helpers/` 和 `support/` 只是测试职责分类，不再新增其他测试根目录。

这些路径被 `package.json` 的 `exports`、`bin`、`files`，安装脚本以及兼容性测试直接引用，除非同步修改全部契约，否则不要改名或搬迁。

## 本地生成物

以下目录只属于本地运行或工具状态，不是项目源码，也不应提交：

- `data/`：独立工作台运行时数据
- `test/.data/`：测试运行时数据
- `test/results/`：测试报告、trace、截图和失败附件
- `.playwright-cli/`、`output/playwright/`、`playwright-report/`、`test-results/`：浏览器测试产物
- `.superpowers/`、`.impeccable/`：本地工作流和设计审查工具状态

产品文档从 [质量工作台文档索引](./quality-workbench/README.md) 开始；过程计划和规格从 [`docs/superpowers/`](./superpowers/) 查找。
