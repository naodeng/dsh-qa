<div align="right"><strong>🇨🇳 中文</strong> | <strong><a href="./README_EN.md">🇬🇧 English</a></strong></div>

# dsh-qa · 质量工作台
<img width="2135" height="736" alt="image" src="https://github.com/user-attachments/assets/45d9f541-808e-46c0-993a-e1e9824464b5" />

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.6-informational)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-0A7EA4)]()

**dsh-qa** 是 DeepSeek Harness 的本地软件测试工作台插件：把测试项目的待办提醒、日历排期、项目概览和最近动态放在同一屏；测试项目/迭代的对话统一交给 DSH 原生会话，并自动使用你预设的「测试模式」（preset id: `qa`）。零 npm 依赖，数据完全本机。

```
测试首页 → DSH 测试对话 → 项目看板 → 日历排期
```
<img width="3926" height="2403" alt="image" src="https://github.com/user-attachments/assets/8f5f32ea-3f6d-4ba2-b632-7d39bd7ba102" />

## 目录

- [功能特性](#功能特性)
- [安装（DSH 插件）](#安装dsh-插件)
- [快速开始（不装插件体验）](#快速开始不装插件体验)
- [独立运行模式](#独立运行模式)
- [架构](#架构)
- [AI 工具集](#ai-工具集)
- [配套 QA 技能库](#配套-qa-技能库)
- [开发与贡献](#开发与贡献)
- [许可证](#许可证)
- [常见问题](#常见问题)

## 功能特性

### 测试项目管理

- **项目与迭代双形态**：顶层对象可选「测试项目」或「迭代」（迭代可挂靠父项目），两者均绑定独立 DSH 会话，筛选栏可分别查看
- **测试首页与日历排期**：在办项目、临期/逾期里程碑、待审批门禁、未关闭缺陷、最近动态同屏呈现；日历支持年/月/日跳转、点击日期新增、按项目登记里程碑或日程并直接删除
- **实时看板**：六列流水线（需求分析 → 用例设计 → 用例评审 → 执行中 → 缺陷回归 → 已发布），拖拽换列，SSE 实时推送，多窗口同步
- **项目档案工作区**：宽屏项目详情，集中编辑名称、编号、产品、负责人、摘要和阶段；概览/需求/用例/缺陷/里程碑/报告/知识/纪要/门禁九个分区，并展示进度、AI 策略、成员、文件目录与阶段时间线
- **本地项目目录**：创建项目时可自动生成 `01_需求与范围 / 02_测试计划 / 03_测试用例 / 04_测试数据与脚本 / 05_测试执行 / 06_缺陷 / 07_测试报告 / 08_发布与归档` 八级工作目录；删除项目记录不会删除文件夹
- **门禁治理**：需求评审/策略评审/用例评审/报告评审/发布/结项由 AI 提交申请，测试负责人人工审批（对齐 AI 研发质量分析 8 阶段工作流）

### AI 协作能力

- **可控 AI 模式**：每项目可选全流程辅助、按需协作，或完全关闭自动辅助；自动提取与首页提醒也可分别关闭
- **AI 材料上板**：AI 从对话自动登记需求（可关联用例与验证目的）、测试用例（含优先级、需求追踪 `trace`、风险标签与三态）、缺陷（严重级别基于业务影响，含复现频率与影响范围）、里程碑（自动算截止日，逾期/临期徽章）、日程、测试知识、会话纪要、测试报告（版本链），并支持登记 Playwright/Pytest 等自动化结果；每次登记实时出现在看板卡片与材料流
- **DSH 技能与命令**：每项目独立绑定 DSH 会话；“技能与命令”面板支持分类、搜索和点击插入，输入 `/` 出现即时建议，执行结果直接回显在工作台
- **QA Skill 安装页面**：左侧 `QA Skill安装` Tab 按「测试类型 / 测试工作流程 / 加强版」展示 Skill；测试类型继续按「需求与策略、用例与评审、功能与兼容、接口与自动化、质量保障专项、缺陷、报告与审查」分组，支持中英文切换、搜索、官网详情和一键安装到 DSH
- **DSH 单一对话与模型切换**：只使用本项目 DSH 测试模式会话，模型切换器动态读取 DSH 原生模型目录，不存在插件内第二套模型

### 界面与连接

- **中英文语言切换**：顶栏「中 / EN」按钮一键切换，默认中文，选择在本机浏览器中持久保存；导航、首页、看板、列表、日历、雷达与抽屉/模态框标题均双语化
- **可调工作区**：主导航、项目栏与项目雷达均可拖动边缘改变宽度，可分别收起；双击边缘恢复默认，提供紧凑、标准与专注对话预设，选择在本机浏览器中持久保存
- **四套 QA 主题**：质量仪表、终端、极简与赛博四套完整皮肤；赛博主题可随时触发“BUILD PASSED”场景
- **DSH Remote**：复用当前 DSH 已安装的 Remote 插件，显示入口与设备状态，生成一次性配对链接，并可直接打开 `/m` 手机端
- 逾期里程碑红标、7 日内临期黄标、待批门禁紫标，顶栏实时统计

## 安装（DSH 插件）

```bash
# GitHub（推荐）
dsh plugin --profile web add github:naodeng/dsh-qa
# 或 npm 发布后
dsh plugin --profile web add dsh-qa
# 本地开发
dsh plugin --profile web add link:/path/to/dsh-qa
```

安装后重启 `dsh web`（插件在宿主启动时加载），GUI 侧边栏会出现「质量工作台」入口：点击在会话区打开工作台，工具栏可「在标签页打开」。

> **模型与 API**：工作台不维护第二套 API Key 或模型配置。每个测试项目绑定一个以项目文件夹为工作目录的 DSH 原生会话，并自动使用「测试模式」（preset id: `qa`）。模型列表、模型切换、技能、命令、工具和权限策略全部来自 DSH；新增服务商或模型请在 DSH 设置中配置。
>
> 旧项目如果绑定的是空白标准模式会话，工作台会直接切换为测试模式；如果旧会话已有对话，则保留原会话历史，自动新建并改绑一个测试模式会话。

## 快速开始（不装插件体验）

```bash
git clone https://github.com/naodeng/dsh-qa.git
cd dsh-qa
npm start        # → http://127.0.0.1:8899
```

首次启动会自动创建两个示例（一个测试项目 + 一个迭代），含需求、用例、缺陷、里程碑、报告和待审批门禁，可直接在首页/看板/日历里查看操作。项目管理功能完整可用；DSH 对话、模型、技能与命令需从 DSH 侧边栏打开插件后使用。

## 独立运行模式

```bash
npm start          # 或双击 start.command
# → http://127.0.0.1:8899 （数据目录：<项目>/data）
```

独立地址可查看和管理测试项目、看板与日历；DSH 对话、模型、技能和命令必须从 DSH 侧边栏打开插件后使用。

## 架构

```
lib/index.js      宿主半（cordis 插件）：进程内拉起工作台 + /api/dsh-qa 路由 + 系统提示播报
lib/client.js     浏览器半：侧边栏入口（自愈 MutationObserver）+ 会话区 iframe（同源镜像）
cordis.patch.yml  profile bundle 补丁（插入插件行）
server/           工作台服务（零依赖：原生 http + SSE；项目、看板、日历与材料数据）
public/           四视图前端（原生 JS，无构建步骤；相对路径，可挂任意前缀）
```

**路由**：`/api/dsh-qa/info`（状态）、`/api/dsh-qa/workbench/`（同源镜像代理，SSE 透传）。同源 iframe 还通过 DSH 官方 `session.*`、`skill.list` 与 `commands/*` 接口连接原生会话；全部带 loopback 护栏。

**数据目录**：插件模式 `~/.dsh/dsh-qa/`（项目与本地材料）；独立模式 `<项目>/data/`。DSH 对话由 DSH 自身持久化。工作台与 DSH 都保持监听 `127.0.0.1`；只有用户明确启用 DSH Remote 的官方自动隧道或自备隧道后，手机端才可通过一次性令牌配对。

## AI 工具集

工作台内置 18 个 QA 域工具，供 DSH 会话通过函数调用实时登记数据并上板：

| 分组 | 工具 |
| --- | --- |
| 项目管理 | `project_get` `project_update` `member_add` `project_transition` |
| 需求与用例 | `requirement_add` `testcase_add` `testcase_status` `testcase_link` |
| 缺陷与里程碑 | `defect_add` `defect_status` `milestone_add` `event_add` |
| 沉淀与报告 | `knowledge_save` `minutes_save` `report_draft` `report_draft_save` |
| 门禁与导入 | `gate_request` `testrun_import` |

## 测试模式 preset（必需）

质量工作台的对话自动使用 DSH 的「测试模式」（preset id: `qa`）。首次使用前需要安装该 preset（与 dsh-law 需要「法律模式」同理）：

```bash
# 一键安装 qa preset 到 ~/.dsh/.agent-presets/qa
scripts/install-qa-preset.sh
# 或预览：scripts/install-qa-preset.sh --dry-run
```

preset 基于 DSH 官方 `standard`（完整编码能力），persona 定制为 QA 测试助手，并内置 QA 质量原则（用例可执行可判定、覆盖正向/异常/边界、缺陷区分事实与猜测、不编造数据）。安装后无需重启，DSH 的 `agentPreset.list` 即可发现 id=`qa`。

## 配套 QA 技能库


工作台对话复用 DSH 原生技能与命令（输入 `/` 检索），可直接安装 [awesome-qa-skills](https://github.com/naodeng/awesome-qa-skills) 的测试技能作为配套能力，并参考 [awesome-qa-prompt](https://github.com/naodeng/awesome-qa-prompt) 的多角色工作流。

在 DSH 侧边栏打开工作台后，进入左侧 `QA Skill安装` Tab 即可浏览和安装技能。页面按当前界面语言展示 `skills/zh` 或 `skills/en`，目录卡片的名称、描述、适用场景和详情链接同步自 [软件测试技能库](https://inaodeng.com/zh-cn/qaskills/)，实际安装来源仍是本地 `awesome-qa-skills` 仓库。

安装页的分类顺序与网站保持一致：测试类型（需求与策略、用例与评审、功能与兼容、接口与自动化、质量保障专项、缺陷、报告与审查）、测试工作流程、加强版。安装目标为 DeepSeek Harness 的 `~/.dsh/skills/`；安装完成后重启 `dsh web`，再在新的 DSH 会话中使用。

```bash
# 一键安装 awesome-qa-skills（92 个中英技能）到 DSH 技能目录
scripts/install-qa-skills.sh                     # 默认中文全部技能
scripts/install-qa-skills.sh --lang en           # 英文技能
scripts/install-qa-skills.sh --skill test-case-writing   # 只装单个技能
scripts/install-qa-skills.sh --src /path/to/awesome-qa-skills   # 自定义仓库路径
scripts/install-qa-skills.sh --dry-run           # 预览不写入
```

安装后重启 `dsh web`，在质量工作台对话中输入 `/` 即可看到技能（如 `/test-case-writing`、`/bug-reporting`、`/requirements-analysis`、`/test-strategy`、`/test-reporting`）。工作台内置的 QA 系统提示已吸收这些库的质量原则：用例按需求追踪 `trace` 与风险标签组织、覆盖正向/异常/边界场景；缺陷区分「观察到的事实」与「原因猜测」、严重级别基于业务影响并记录复现频率与影响范围；报告区分已执行事实、未执行范围与证据缺口。

> **许可证说明**：本插件与 awesome-qa-skills / awesome-qa-prompt 均采用 PolyForm Noncommercial 1.0.0 许可证，仅限非商业用途；本插件仅提供安装指引与质量原则参考，不复制其内容。

## 开发与贡献

- 运行：`npm start` 独立启动；`npm run dev` 监听重启
- 测试：`npm test` 运行单元测试（node:test）与端到端测试（Playwright）；`npm run test:unit` / `npm run test:e2e` 可单独执行
- 发布：`npm publish` → `dsh plugin add dsh-qa`；模型与密钥均由使用者自己的 DSH 配置管理
- 欢迎提交 Issue 与 PR（Conventional Commits）

## 许可证

[PolyForm Noncommercial License 1.0.0](./LICENSE) — 仅限非商业用途，详见 [LICENSE](./LICENSE)。

## 常见问题

- **侧边栏没有入口**：重启 `dsh web` 后生效（插件在宿主启动时加载）
- **模型不可用或鉴权失败**：在 DSH 设置中检查对应服务商、模型和凭据；工作台不单独保存密钥
- **看不到技能或命令**：确认是从 DSH 侧边栏打开，而不是直接访问 8899 独立地址；首次进入某项目时会自动创建并绑定 DSH 会话
- **Remote 显示“需要设置安全的远程入口”**：当前 DSH 版本明确禁止 `--host 0.0.0.0`；请在 DSH 设置的 Remote 插件项开启“自动公网隧道”，或配置自己的 `publicBaseUrl`，用完后在 Remote 面板停止配对
- **端口冲突**：自动顺延 8899→8909；插件行可配置 `port`
- **与 DSH 测试模式的关系**：测试业务数据仍由本插件保存；每个项目会话自动使用 `qa` preset，并可调用其中安装的测试工具和技能
