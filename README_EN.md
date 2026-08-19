<div align="right"><strong><a href="./README.md">🇨🇳 中文</a></strong> | <strong>🇬🇧 English</strong></div>

# dsh-qa · QA Workbench

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-informational)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-0A7EA4)]()

**A local software testing workbench plugin for DeepSeek Harness.** Modeled on the dsh-law workbench layout, it puts to-dos, calendar scheduling, project overviews, and recent activity on one screen. Conversations for each test project / iteration are handled by a native DSH session that automatically uses your configured **Test Mode** (preset id: `qa`). Zero npm dependencies — all data stays on your machine.

```
Test Dashboard → DSH Test Chat → Project Kanban → Calendar Schedule
```

## Installation (DSH plugin)

```bash
# From GitHub (recommended)
dsh plugin --profile web add github:naodeng/dsh-qa
# Or after publishing to npm
dsh plugin --profile web add dsh-qa
# Local development
dsh plugin --profile web add link:/path/to/dsh-qa
```

Then restart `dsh web` (plugins load when the host starts). A **「质量工作台 / QA Workbench」** entry appears in the GUI sidebar: click to open the workbench in the conversation area, or use the toolbar to open it in a tab.

**Models and API**: The workbench does not maintain a second set of API keys or model configs. Each test project binds a native DSH session whose working directory is the project folder, and automatically uses DSH's Test Mode (preset id: `qa`). Model list, model switching, skills, commands, tools, and permission policies all come from DSH; to add providers or models, configure them in DSH settings.

If an old project is bound to a blank standard-mode session, the workbench switches it to Test Mode automatically; if the old session already has conversation history, the workbench keeps that history, creates a new Test Mode session, and rebinds.

## Quick Start (try it without installing the plugin)

```bash
git clone https://github.com/naodeng/dsh-qa.git
cd dsh-qa
npm start        # → http://127.0.0.1:8899
```

On first launch, two sample workspaces are created (one test project + one iteration) with requirements, test cases, defects, milestones, reports, and a pending approval gate — you can explore them right away on the dashboard/kanban/calendar. Project management is fully functional standalone; DSH chat, models, skills, and commands require opening the plugin from the DSH sidebar.

## Standalone Mode (project management only, optional)

```bash
npm start          # or double-click start.command
# → http://127.0.0.1:8899 (data directory: <project>/data)
```

The standalone address lets you view and manage test projects, the kanban, and the calendar; DSH chat, models, skills, and commands must be used from the plugin opened in the DSH sidebar.

## Features

- **Test dashboard & calendar**: Active projects, due-soon/overdue milestones, pending gates, open defects, and recent activity on one screen; calendar supports year/month/day jumps, click-a-date creation, project-scoped milestones or events, and direct deletion
- **Project & iteration duality**: The top-level object can be a **test project** or an **iteration** (iterations can hang off a parent project); both bind their own DSH session; the filter bar separates them
- **Controllable AI modes**: Per project — full assistance, on-demand collaboration, or fully off; auto-extraction and dashboard reminders can be toggled independently
- **DSH skills & commands**: Each project binds an independent DSH session; the "Skills & Commands" panel supports categories, search, and click-to-insert, with `/` instant suggestions and results echoed back into the workbench
- **Single DSH chat & model switching**: Uses only this project's DSH Test Mode session; the model switcher reads DSH's native model catalog — no second model set inside the plugin
- **Adjustable workspace**: Main nav, project rail, and project radar widths are draggable and collapsible; double-click edges to reset; compact / standard / focus-chat presets persist in your local browser
- **Four QA themes**: QA Dashboard, Terminal, Minimal, and Cyber — full skins; the Cyber theme can trigger a "BUILD PASSED" scene at any time
- **DSH Remote**: Reuses the DSH-installed Remote plugin — shows entry & device status, generates one-time pairing links, and opens the `/m` mobile page directly; current DSH versions forbid listening on `0.0.0.0`, so enable the official "auto public tunnel" in DSH settings → Plugins → Remote (recommended) or set a trusted `publicBaseUrl`
- **Local project directory**: Creating a project can auto-generate an 8-level workspace: `01_需求与范围 / 02_测试计划 / 03_测试用例 / 04_测试数据与脚本 / 05_测试执行 / 06_缺陷 / 07_测试报告 / 08_发布与归档`; deleting a project record never deletes the folder
- **Chat main UI**: Each project has an independent native DSH chat with a live project list on the left and a project radar on the right
- **Real-time kanban**: Six-column pipeline (Requirements → Test Design → Case Review → In Execution → Defect Regression → Released), drag-and-drop columns, SSE real-time push, multi-window sync
- **AI material boards**: The AI registers requirements (linkable to test cases with verification purposes), test cases (priority, requirement-trace `trace`, risk tags, three states), defects (business-impact-based severity plus reproduction frequency and impact scope), milestones (auto-computed due dates with overdue/due-soon badges), events, test knowledge, meeting minutes, and test reports (versioned), and can ingest Playwright/Pytest automation results; every registration appears live on kanban cards and the material feed
- **Project archive workspace**: Wide project detail for editing name, key, product, owner, summary, and stage; nine sections — Overview / Requirements / Test Cases / Defects / Milestones / Reports / Knowledge / Minutes / Gates — plus progress, AI strategy, members, file directory, and stage timeline
- **Gate governance**: Requirements review / strategy review / case review / report review / release / closure are requested by the AI and approved manually by the test owner (aligned with the 8-stage AI quality-analysis workflow)
- Overdue milestones in red, due-within-7-days in yellow, pending gates in purple — live counts in the top bar

## Architecture

```
lib/index.js      Host half (cordis plugin): starts the workbench in-process + /api/dsh-qa routes + system-prompt announcement
lib/client.js     Browser half: sidebar entry (self-healing MutationObserver) + conversation-area iframe (same-origin mirror)
cordis.patch.yml  Profile bundle patch (inserts the plugin line)
server/           Workbench service (zero deps: native http + SSE; projects, kanban, calendar, materials)
public/           Four-view frontend (vanilla JS, no build step; relative paths, mountable under any prefix)
```

Routes: `/api/dsh-qa/info` (status), `/api/dsh-qa/workbench/` (same-origin mirror proxy, SSE pass-through). The same-origin iframe also connects native sessions through DSH's official `session.*`, `skill.list`, and `commands/*` APIs — all behind a loopback guard.

Data directory: plugin mode `~/.dsh/dsh-qa/` (projects & local materials); standalone mode `<project>/data/`. DSH chat is persisted by DSH itself. Both the workbench and DSH listen on `127.0.0.1`; the mobile endpoint is only reachable via one-time token pairing once you enable DSH Remote's official auto tunnel or bring your own tunnel.

### AI Toolset (18 tools)

`project_get / project_update / member_add / requirement_add / testcase_add / testcase_status / testcase_link / defect_add / defect_status / milestone_add / event_add / knowledge_save / minutes_save / report_draft / report_draft_save / project_transition / gate_request / testrun_import`

## Companion QA Skills

The workbench chat reuses DSH-native skills and commands (type `/` to search). You can install [awesome-qa-skills](https://github.com/naodeng/awesome-qa-skills) as companion testing skills and reference the multi-role workflows of [awesome-qa-prompt](https://github.com/naodeng/awesome-qa-prompt).

```bash
# One-click install of awesome-qa-skills (92 zh+en skills) into the DSH skills directory
scripts/install-qa-skills.sh                     # default: all Chinese skills
scripts/install-qa-skills.sh --lang en           # English skills
scripts/install-qa-skills.sh --skill test-case-writing   # install a single skill
scripts/install-qa-skills.sh --src /path/to/awesome-qa-skills   # custom repo path
scripts/install-qa-skills.sh --dry-run           # preview without writing
```

After installing, restart `dsh web` and type `/` in the workbench chat to see the skills (e.g. `/test-case-writing`, `/bug-reporting`, `/requirements-analysis`, `/test-strategy`, `/test-reporting`). The built-in QA system prompt already adopts these libraries' quality principles: test cases organized by requirement-trace `trace` and risk tags covering positive/exception/boundary scenarios; defects separating "observed facts" from "cause guesses" with business-impact-based severity plus reproduction frequency and impact scope; reports distinguishing executed facts, unexecuted scope, and evidence gaps.

> Note: This plugin, awesome-qa-skills, and awesome-qa-prompt all use the PolyForm Noncommercial 1.0.0 license (non-commercial use only). This plugin only provides installation guidance and quality-principle references — it does not copy their content.

## Share & Publish

1. The GitHub repo is [`naodeng/dsh-qa`](https://github.com/naodeng/dsh-qa); others can install directly:
   `dsh plugin --profile web add github:naodeng/dsh-qa`
2. Or publish to npm: `npm publish` → `dsh plugin add dsh-qa`
3. Models and keys are managed by each user's own DSH configuration

## FAQ

- **No sidebar entry**: restart `dsh web` (plugins load when the host starts)
- **Model unavailable or auth failure**: check the provider, model, and credentials in DSH settings; the workbench does not store keys separately
- **Can't see skills or commands**: make sure you opened the plugin from the DSH sidebar, not the standalone 8899 address; a DSH session is auto-created and bound on first entry into a project
- **Remote says "secure remote entry required"**: current DSH versions forbid `--host 0.0.0.0`; enable the official "auto public tunnel" in DSH settings → Plugins → Remote, or configure your own trusted `publicBaseUrl`, and stop pairing in the Remote panel when done
- **Port conflict**: automatically bumps 8899→8909; the plugin line can configure `port`
- **Relation to DSH Test Mode**: testing business data is stored by this plugin; each project session automatically uses the `qa` preset and can invoke the testing tools and skills installed there
