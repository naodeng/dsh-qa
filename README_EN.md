<div align="right"><strong><a href="./README.md">🇨🇳 中文</a></strong> | <strong>🇬🇧 English</strong></div>

# dsh-qa · QA Workbench
<img width="2135" height="736" alt="image" src="https://github.com/user-attachments/assets/45d9f541-808e-46c0-993a-e1e9824464b5" />

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.6-informational)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-0A7EA4)]()

**dsh-qa** is a local software testing workbench plugin for DeepSeek Harness: to-dos, calendar scheduling, project overviews, and recent activity on one screen. Conversations for each test project / iteration are handled by a native DSH session that automatically uses your configured **Test Mode** (preset id: `qa`). Zero npm dependencies — all data stays on your machine.

```
Test Dashboard → DSH Test Chat → Project Kanban → Calendar Schedule
```
<img width="3926" height="2403" alt="image" src="https://github.com/user-attachments/assets/8f5f32ea-3f6d-4ba2-b632-7d39bd7ba102" />

## Table of Contents

- [Features](#features)
- [Installation (DSH plugin)](#installation-dsh-plugin)
- [Quick Start (try without installing)](#quick-start-try-without-installing)
- [Standalone Mode](#standalone-mode)
- [Architecture](#architecture)
- [AI Toolset](#ai-toolset)
- [Companion QA Skills](#companion-qa-skills)
- [Development & Contributing](#development--contributing)
- [License](#license)
- [FAQ](#faq)

## Features

### Test Project Management

- **Project & iteration duality**: The top-level object can be a **test project** or an **iteration** (iterations can hang off a parent project); both bind their own DSH session, and the filter bar separates them
- **Test dashboard & calendar**: Active projects, due-soon/overdue milestones, pending gates, open defects, and recent activity on one screen; calendar supports year/month/day jumps, click-a-date creation, project-scoped milestones or events, and direct deletion
- **Real-time kanban**: Six-column pipeline (Requirements → Test Design → Case Review → In Execution → Defect Regression → Released), drag-and-drop columns, SSE real-time push, multi-window sync
- **Project archive workspace**: Wide project detail for editing name, key, product, owner, summary, and stage; nine sections — Overview / Requirements / Test Cases / Defects / Milestones / Reports / Knowledge / Minutes / Gates — plus progress, AI strategy, members, file directory, and stage timeline
- **Local project directory**: Creating a project can auto-generate an 8-level workspace: `01_需求与范围 / 02_测试计划 / 03_测试用例 / 04_测试数据与脚本 / 05_测试执行 / 06_缺陷 / 07_测试报告 / 08_发布与归档`; deleting a project record never deletes the folder
- **Gate governance**: Requirements review / strategy review / case review / report review / release / closure are requested by the AI and approved manually by the test owner (aligned with the 8-stage AI quality-analysis workflow)

### AI Collaboration

- **Controllable AI modes**: Per project — full assistance, on-demand collaboration, or fully off; auto-extraction and dashboard reminders can be toggled independently
- **AI material boards**: The AI registers requirements (linkable to test cases with verification purposes), test cases (priority, requirement-trace `trace`, risk tags, three states), defects (business-impact-based severity plus reproduction frequency and impact scope), milestones (auto-computed due dates with overdue/due-soon badges), events, test knowledge, meeting minutes, and test reports (versioned), and can ingest Playwright/Pytest automation results; every registration appears live on kanban cards and the material feed
- **DSH skills & commands**: Each project binds an independent DSH session; the "Skills & Commands" panel supports categories, search, and click-to-insert, with `/` instant suggestions and results echoed back into the workbench
- **QA Skill installer**: The `QA Skill Installer` tab groups skills into Testing Types, Testing Workflows, and Enhanced; Testing Types uses the site-aligned groups Requirements & Strategy, Case Design & Review, Functional & Compatibility, API & Automation, Quality Specialties, and Defects, Reports & Review, with bilingual switching, search, detail links, and one-click DSH installation
- **Single DSH chat & model switching**: Uses only this project's DSH Test Mode session; the model switcher reads DSH's native model catalog — no second model set inside the plugin

### UI & Connectivity

- **Language switching (zh / en)**: the "中 / EN" toggle in the top bar switches the UI language on the fly — Chinese by default, persisted in your local browser; navigation, dashboard, kanban, lists, calendar, radar and drawer/modal titles are all bilingual
- **Adjustable workspace**: Main nav, project rail, and project radar widths are draggable and collapsible; double-click edges to reset; compact / standard / focus-chat presets persist in your local browser
- **Four QA themes**: QA Dashboard, Terminal, Minimal, and Cyber — full skins; the Cyber theme can trigger a "BUILD PASSED" scene at any time
- **DSH Remote**: Reuses the DSH-installed Remote plugin — shows entry & device status, generates one-time pairing links, and opens the `/m` mobile page directly
- Overdue milestones in red, due-within-7-days in yellow, pending gates in purple — live counts in the top bar

## Installation (DSH plugin)

```bash
# From GitHub (recommended)
dsh plugin --profile web add github:naodeng/dsh-qa
# Or after publishing to npm
dsh plugin --profile web add dsh-qa
# Local development
dsh plugin --profile web add link:/path/to/dsh-qa
```

After installing, restart `dsh web` (plugins load when the host starts), and a **「质量工作台 / QA Workbench」** entry appears in the GUI sidebar: click to open the workbench in the conversation area, or use the toolbar to open it in a tab.

> **Models & API**: The workbench does not maintain a second set of API keys or model configs. Each test project binds a native DSH session whose working directory is the project folder, and automatically uses Test Mode (preset id: `qa`). Model list, model switching, skills, commands, tools, and permission policies all come from DSH; to add providers or models, configure them in DSH settings.
>
> If an old project is bound to a blank standard-mode session, the workbench switches it to Test Mode automatically; if the old session already has conversation history, the workbench keeps that history, creates a new Test Mode session, and rebinds.

## Quick Start (try without installing)

```bash
git clone https://github.com/naodeng/dsh-qa.git
cd dsh-qa
npm start        # → http://127.0.0.1:8899
```

On first launch, two sample workspaces are created (one test project + one iteration) with requirements, test cases, defects, milestones, reports, and a pending approval gate — explore them right away on the dashboard/kanban/calendar. Project management is fully functional standalone; DSH chat, models, skills, and commands require opening the plugin from the DSH sidebar.

## Standalone Mode

```bash
npm start          # or double-click start.command
# → http://127.0.0.1:8899 (data directory: <project>/data)
```

The standalone address lets you view and manage test projects, the kanban, and the calendar; DSH chat, models, skills, and commands must be used from the plugin opened in the DSH sidebar.

## Architecture

```
lib/index.js      Host half (cordis plugin): starts the workbench in-process + /api/dsh-qa routes + system-prompt announcement
lib/client.js     Browser half: sidebar entry (self-healing MutationObserver) + conversation-area iframe (same-origin mirror)
cordis.patch.yml  Profile bundle patch (inserts the plugin line)
server/           Workbench service (zero deps: native http + SSE; projects, kanban, calendar, materials)
public/           Four-view frontend (vanilla JS, no build step; relative paths, mountable under any prefix)
```

**Routes**: `/api/dsh-qa/info` (status), `/api/dsh-qa/workbench/` (same-origin mirror proxy, SSE pass-through). The same-origin iframe also connects native sessions through DSH's official `session.*`, `skill.list`, and `commands/*` APIs — all behind a loopback guard.

**Data directory**: plugin mode `~/.dsh/dsh-qa/` (projects & local materials); standalone mode `<project>/data/`. DSH chat is persisted by DSH itself. Both the workbench and DSH listen on `127.0.0.1`; the mobile endpoint is only reachable via one-time token pairing once you enable DSH Remote's official auto tunnel or bring your own tunnel.

## AI Toolset

The workbench ships 18 QA-domain tools that DSH sessions call via function calling to register data and update boards in real time:

| Group | Tools |
| --- | --- |
| Project management | `project_get` `project_update` `member_add` `project_transition` |
| Requirements & cases | `requirement_add` `testcase_add` `testcase_status` `testcase_link` |
| Defects & milestones | `defect_add` `defect_status` `milestone_add` `event_add` |
| Notes & reports | `knowledge_save` `minutes_save` `report_draft` `report_draft_save` |
| Gates & imports | `gate_request` `testrun_import` |

## Test Mode Preset (required)

The workbench chat automatically uses DSH's **Test Mode** (preset id: `qa`). Before first use, install the preset (just as dsh-law requires its Legal Mode):

```bash
# One-click install of the qa preset into ~/.dsh/.agent-presets/qa
scripts/install-qa-preset.sh
# or preview: scripts/install-qa-preset.sh --dry-run
```

The preset is based on DSH's official `standard` (full coding capabilities) with a QA-testing persona and built-in QA quality principles (executable, judgeable test cases covering positive/exception/boundary; defects separating facts from guesses; no fabricated data). No restart needed — `agentPreset.list` picks up id=`qa` immediately.

## Companion QA Skills


The workbench chat reuses DSH-native skills and commands (type `/` to search). You can install [awesome-qa-skills](https://github.com/naodeng/awesome-qa-skills) as companion testing skills and reference the multi-role workflows of [awesome-qa-prompt](https://github.com/naodeng/awesome-qa-prompt).

Open the workbench from the DSH sidebar and select `QA Skill Installer` to browse and install skills. The page shows `skills/zh` or `skills/en` according to the active UI language. Card names, descriptions, use cases, and detail links are synchronized from the [QA Skills Library](https://inaodeng.com/zh-cn/qaskills/); the local `awesome-qa-skills` checkout remains the installation source.

The installer keeps the website's category order: Testing Types (Requirements & Strategy, Case Design & Review, Functional & Compatibility, API & Automation, Quality Specialties, Defects, Reports & Review), Testing Workflows, and Enhanced. Skills are installed into DeepSeek Harness at `~/.dsh/skills/`; restart `dsh web` after installation before using them in a new DSH session.

```bash
# One-click install of awesome-qa-skills (92 zh+en skills) into the DSH skills directory
scripts/install-qa-skills.sh                     # default: all Chinese skills
scripts/install-qa-skills.sh --lang en           # English skills
scripts/install-qa-skills.sh --skill test-case-writing   # install a single skill
scripts/install-qa-skills.sh --src /path/to/awesome-qa-skills   # custom repo path
scripts/install-qa-skills.sh --dry-run           # preview without writing
```

After installing, restart `dsh web` and type `/` in the workbench chat to see the skills (e.g. `/test-case-writing`, `/bug-reporting`, `/requirements-analysis`, `/test-strategy`, `/test-reporting`). The built-in QA system prompt already adopts these libraries' quality principles: test cases organized by requirement-trace `trace` and risk tags covering positive/exception/boundary scenarios; defects separating "observed facts" from "cause guesses" with business-impact-based severity plus reproduction frequency and impact scope; reports distinguishing executed facts, unexecuted scope, and evidence gaps.

> **License note**: This plugin, awesome-qa-skills, and awesome-qa-prompt all use the PolyForm Noncommercial 1.0.0 license (non-commercial use only). This plugin only provides installation guidance and quality-principle references — it does not copy their content.

## Development & Contributing

- Run: `npm start` for standalone; `npm run dev` for watch mode
- Test: `npm test` runs unit tests (node:test) plus Playwright end-to-end tests; `npm run test:unit` / `npm run test:e2e` run each separately
- Publish: `npm publish` → `dsh plugin add dsh-qa`; models and keys are managed by each user's own DSH configuration
- Issues and PRs welcome (Conventional Commits)

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE) — non-commercial use only; see [LICENSE](./LICENSE) for details.

## FAQ

- **No sidebar entry**: restart `dsh web` (plugins load when the host starts)
- **Model unavailable or auth failure**: check the provider, model, and credentials in DSH settings; the workbench does not store keys separately
- **Can't see skills or commands**: make sure you opened the plugin from the DSH sidebar, not the standalone 8899 address; a DSH session is auto-created and bound on first entry into a project
- **Remote says "secure remote entry required"**: current DSH versions forbid `--host 0.0.0.0`; enable the official "auto public tunnel" in DSH settings → Plugins → Remote, or configure your own trusted `publicBaseUrl`, and stop pairing in the Remote panel when done
- **Port conflict**: automatically bumps 8899→8909; the plugin line can configure `port`
- **Relation to DSH Test Mode**: testing business data is stored by this plugin; each project session automatically uses the `qa` preset and can invoke the testing tools and skills installed there
