<div align="right"><strong><a href="./README.md">🇨🇳 中文</a></strong> | <strong>🇬🇧 English</strong></div>

# dsh-qa · QA Workbench

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.7.3-informational)]()
[![Zero Runtime Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)]()
[![DSH qa Host Smoke](https://img.shields.io/badge/DSH-qa%20Host%20Smoke%206%20passed-0A7EA4)](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)

<p align="center">
  <img src="./assets/dsh-qa-github-social-preview.jpg" alt="dsh-qa: local QA workbench for DeepSeek Harness" width="960">
</p>

**dsh-qa is a local QA workbench for QA engineers and test leads who manage quality work on their own workstation.** It organizes test projects, requirements, cases, execution, evidence, and delivery gates in one workspace while reusing native DeepSeek Harness (DSH) sessions, models, skills, and commands.

## Contents

- [Positioning and boundaries](#positioning-and-boundaries)
- [Workflow and capabilities](#workflow-and-capabilities)
- [Install and get started](#install-and-get-started)
- [Data, integrations, and compatibility](#data-integrations-and-compatibility)
- [Development and documentation](#development-and-documentation)
- [License and FAQ](#license-and-faq)

## Positioning and boundaries

| Workbench | Primary role | How it relates to dsh-qa |
| --- | --- | --- |
| DeepSeek Harness | Provides AI sessions, models, skills, commands, and the plugin runtime | dsh-qa runs as a plugin and uses these native capabilities |
| dsh-qa | Manages local QA projects, test materials, execution evidence, and quality gates | A structured workflow for one QA user’s day-to-day quality work |
| Team project or test management system | Holds shared team workflows and cross-system records | Keep using an existing system when you need team synchronization; dsh-qa has no WPS or ZenTao connector or remote data sync |

dsh-qa is for QA engineers who want to manage test materials, execution records, and delivery evidence alongside DSH project conversations. Project data stays on the local machine. The workbench does not provide team collaboration, remote repository monitoring, or cross-system data synchronization.

## Workflow and capabilities

~~~mermaid
flowchart LR
  A[Requirements and acceptance criteria] --> B[Requirements and test cases]
  B --> C[Quality task and execution setup]
  C --> D[Controlled execution]
  D --> E[Evidence, failure analysis, and regression]
  E --> F{Quality gate}
  E -->|Retest needed| D
  F -->|PASS| G[Delivery report]
  F -->|WARN / BLOCK| H[Owner review]
~~~

| Stage | What it covers |
| --- | --- |
| Projects and plans | Manage test projects or iterations, with progress shown on the dashboard, kanban, and calendar |
| Test materials | Maintain requirements, cases, defects, milestones, knowledge, and reports |
| DSH collaboration | Each project uses its own DSH session and automatically enters qa Test Mode; the plugin bundle also includes quality-control |
| Execution and evidence | Manage quality tasks and profiles, run supported Host jobs, archive evidence, and work through failures and regression |
| Delivery review | Calculate PASS / WARN / BLOCK from run provenance, evidence, test results, and risks; owners review actionable items |

The UI provides execution-profile setup, Host execution, and gate evaluation. Some test-plan creation and review steps, along with local run previews, still require server API calls.

Quality gates check run provenance, verified evidence, critical test results, and risks; an unfinished run is not treated as a final result. Real execution through an external provider requires provider-specific acceptance.

<details>
<summary>View the workbench screenshot</summary>

<img src="./assets/dsh-qa-workbench.png" alt="dsh-qa dashboard and project quality information" width="1200">
</details>

## Install and get started

### Install in DSH Web (recommended)

~~~bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-qa
npx --yes @deepseek-ai/dsh web
~~~

After restarting DSH Web, open **QA Workbench** from the sidebar. The main bundle includes both the qa and quality-control presets. For a Harness source checkout or the official macOS client, follow the corresponding steps in the [English user guide](./docs/quality-workbench/user-guide-en.md).

### Run standalone

Node.js 18 or newer is required. Standalone mode manages local QA projects; DSH sessions, models, skills, and commands are available through the DSH plugin.

~~~bash
npm install -g dsh-qa
qabench
~~~

To get started, create a test project or iteration, add requirements, acceptance criteria, and accessible code context, then maintain cases and risks and create a quality task. See the [English user guide](./docs/quality-workbench/user-guide-en.md) for execution and gate-evaluation steps.

## Data, integrations, and compatibility

- In plugin mode, projects and materials are stored locally in ~/.dsh/dsh-qa/; DSH stores its own conversations.
- Live kanban updates support multiple windows on the same machine. Project data is not synchronized with a team.
- A quality task can capture supported local Git diff snapshots. dsh-qa does not monitor remote repository changes or pull code.
- There is no WPS or ZenTao connector. DSH manages models, credentials, and permissions.
- Plugin loading, Test Mode (qa), and existing-session display were verified in the official macOS client running DeepSeek Harness v0.2.0-rc.2. The authenticated qa Host Smoke passed 6 tests on the same version. This does not establish independent host validation for the quality-control bundle.

## Development and documentation

~~~bash
npm ci
npm start
npm test
~~~

- [Full installation and user guide](./docs/quality-workbench/user-guide-en.md)
- [Quality Workbench design and roadmap docs](./docs/quality-workbench/README.md)
- [Quality delivery workflow diagram](./docs/diagram/quality-workflow/dsh-qa-quality-workflow.svg)
- [Companion QA Skills](https://github.com/naodeng/awesome-qa-skills)
- [Changelog](./CHANGELOG.md)

Issues and pull requests are welcome. Review the [PolyForm Noncommercial License 1.0.0](./LICENSE) before use; this project is for non-commercial use only.

## License and FAQ

**License:** [PolyForm Noncommercial 1.0.0](./LICENSE), for non-commercial use only.

- **No sidebar entry:** Restart DSH Web to load the plugin.
- **Model unavailable or authentication fails:** Check the provider, model, and credentials in DSH settings.
- **Skills or commands are missing:** Open the plugin from the DSH sidebar. Standalone mode does not provide DSH sessions.
- **The quality gate is BLOCK:** Review the delivery report for failed checks, evidence gaps, or risks, then have the owner decide what to address.

[中文 README](./README.md) · [中文使用指南](./docs/quality-workbench/user-guide-zh-CN.md) · [English user guide](./docs/quality-workbench/user-guide-en.md)
