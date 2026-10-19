# dsh-qa User Guide

This guide takes you from installation through first use and daily workflows, then into advanced quality controls. It is based on the repository's `v0.7.2` interface and server code. See the [GitHub project](https://github.com/naodeng/dsh-qa) for the source; later versions may differ.

## Contents

1. [Product Overview and Operating Modes](#1-product-overview-and-operating-modes)
2. [Prerequisites](#2-prerequisites)
3. [Installation and Launch](#3-installation-and-launch)
4. [First Use](#4-first-use)
5. [Daily Workflows](#5-daily-workflows)
6. [Feature Guide](#6-feature-guide)
7. [Advanced: Quality Tasks, Execution, and Gates](#7-advanced-quality-tasks-execution-and-gates)
8. [Data Location and Collaboration Boundaries](#8-data-location-and-collaboration-boundaries)
9. [FAQ](#9-faq)
10. [Related Documentation](#10-related-documentation)

## 1. Product Overview and Operating Modes

dsh-qa is a local QA workbench for DeepSeek Harness (DSH). It brings projects, requirements, test cases, defects, execution records, evidence, and delivery decisions together in one project workspace. Project data stays on the machine running dsh-qa. In plugin mode, DSH provides chat, models, skills, and commands.

| Mode | Best for | Available features | Not provided |
| --- | --- | --- | --- |
| DSH plugin mode (recommended) | Day-to-day testing collaboration | Workbench, project data, DSH test chat, models, skills, commands, and Host execution integration | Team or cloud sync |
| Standalone mode | Trying the workbench or maintaining local project materials | Test dashboard, projects, kanban, calendar, and project materials | DSH chat, model switching, skills, and commands |

For regular use, start with DSH plugin mode. To explore the interface first, you can launch standalone mode.

## 2. Prerequisites

- Both DSH plugin mode and standalone mode require Node.js 18 or later.
- Before using DSH plugin mode, install DeepSeek Harness and make sure it starts successfully.
- For DSH Web, install and update the plugin through the same method you use to launch DSH: use `npx` for an instance launched with `npx`, or `pnpm dsh` for one launched from the Harness source repository.
- The official macOS client manages its own `desktop` profile. Do not use the CLI command `--profile desktop` to install the plugin.

Check your Node.js version:

```bash
node --version
```

## 3. Installation and Launch

### 3.1 DSH Web: Launch with npx

```bash
# Install the plugin
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-qa

# Start or restart DSH Web to load the plugin
npx --yes @deepseek-ai/dsh web
```

To update the plugin:

```bash
npx --yes @deepseek-ai/dsh plugin --profile web update dsh-qa
npx --yes @deepseek-ai/dsh web
```

After restarting DSH, open **QA Workbench** from the sidebar. The main plugin bundle includes both the `qa` (Test Mode) and `quality-control` (R&D quality control) presets.

### 3.2 DSH Web: Start from the Harness Source Repository

Run these commands from the Harness repository root after installing dependencies and building the project:

```bash
# Install the plugin
pnpm dsh plugin --profile web add dsh-qa

# Start or restart DSH Web
pnpm dsh web
```

To update the plugin, replace the `add` subcommand with `update`:

```bash
pnpm dsh plugin --profile web update dsh-qa
pnpm dsh web
```

To install from a local checkout or a specific GitHub repository, use `add link:/path/to/repository` or `add github:naodeng/dsh-qa` in place of `add dsh-qa`.

### 3.3 Official macOS DSH Client

1. In the DSH client, open the **Plugins** page and choose the option to add a plugin or Git repository.
2. Enter `https://github.com/naodeng/dsh-qa` and install it.
3. After installation or an update, quit DSH completely with `⌘Q`, then reopen it.
4. Open **QA Workbench** from the sidebar.

The client manages its own `desktop` profile. Do not use `dsh plugin --profile desktop` to install or update the plugin.

### 3.4 Standalone Mode via npm

```bash
npm install -g dsh-qa
qabench
```

The workbench opens at `http://127.0.0.1:8899` by default. To stop it, press `Ctrl+C` in the terminal where it is running. After updating, restart it:

```bash
npm update -g dsh-qa
qabench
```

Standalone mode does not require a DSH login, model API key, or production dependencies. It does not provide DSH chat, models, skills, or commands.

### 3.5 Clone from GitHub for Evaluation or Development

```bash
git clone https://github.com/naodeng/dsh-qa.git
cd dsh-qa
npm start
```

The service uses `http://127.0.0.1:8899` by default. On first launch it creates a sample project and iteration; explore the dashboard, kanban, and calendar to get familiar with the interface.

## 4. First Use

### 4.1 Create a Test Project or Iteration

Click **+** in the Projects sidebar, choose an object type, and enter a project name. Add a project key, product under test, owner, and a short test-scope summary as well. If you select **Create local project folder**, the workbench creates folders for requirements, plans, test cases, data and scripts, execution, defects, reports, and archives.

For a short cycle within an existing test project, create an **Iteration** and link it to the parent project. To maintain a separate test conversation and workspace, create a **Test Project**.

### 4.2 Explore the Main Pages

- **Dashboard**: Review pending actions, active projects, upcoming events, overdue milestones, gates awaiting approval, and recent activity. Select a project card to open its details.
- **DSH Test Chat**: Available only in plugin mode. Each project has its own DSH session and automatically uses the `qa` Test Mode preset.
- **Kanban**: Track projects across six stages: Requirements, Test Design, Case Review, In Execution, Defect Regression, and Released. Drag a card to change its stage. Release still requires owner approval.
- **Calendar**: View milestones and events, jump by year, month, or date, and add an event on the selected date.
- **QA Skill Installer**: In DSH plugin mode, browse, search, and install companion QA Skills.
- **Project Details**: View and maintain the overview, quality tasks, requirements, test cases, defects, milestones, reports, knowledge, meeting notes, and gates in one place.

### 4.3 Configure DSH Models and Chat

In plugin mode, the workbench does not store model settings or API keys. Configure a model and credentials in DSH settings, then select an available model at the top of **DSH Test Chat**. The first time you open a project, the workbench binds a DSH test session to it and uses the project folder as that session's working directory.

The standalone address (default `127.0.0.1:8899`) opens only the workbench. To use DSH sessions and Skills, open the plugin from the DSH sidebar.

## 5. Daily Workflows

### 5.1 Turn Requirements into Test Cases

In the project conversation, provide the requirements, acceptance criteria, and confirmed code or document context. For example:

> First separate the confirmed facts, open questions, and risks in this requirement. Then design executable test cases with clear expected results for positive, negative, and boundary scenarios. Link the cases to the requirement, show me the results first, and then register them in the current project.

DSH chat tools can register requirements, test cases, and traceability links in the current project. When finished, review coverage in the **Requirements** and **Test Cases** sections of Project Details, then update each case from **Draft** to **Reviewed** or **Executed**.

### 5.2 Record and Track Defects

When reporting a defect, include the environment or version, reproduction steps, expected and actual results, how often it reproduces, and business impact where possible. Ask DSH to record observed facts and label uncertain causes as hypotheses. In Project Details, set the status to **Open**, **Fixing**, **Ready to verify**, or **Closed**.

### 5.3 Schedule Milestones and Events

Select a date in the calendar to add an event, or ask DSH to record a review, code freeze, or release date. Milestones, meetings, and work events from Project Details also appear on the calendar. The dashboard highlights upcoming and overdue milestones.

### 5.4 Request a Review and Get Owner Approval

You can ask DSH to submit a requirements, strategy, test case, or report review, or a release or closure gate. Requests appear in the project's **Gates** section and in the dashboard's pending actions. An owner reviews the materials and approves or rejects the request manually. AI cannot approve a gate or authorize a release.

### 5.5 Draft and Save Reports

Provide the test scope, execution facts, failures, and anything not run. Then ask DSH to draft a test plan, test report, defect report, release note, or test summary. Check that execution status and evidence are accurate before saving the report as a project draft. A plan, code reading, or successful build does not count as an executed test.

## 6. Feature Guide

### Projects, Iterations, and Workspaces

- Projects and iterations can each be viewed and maintained independently; an iteration can link to a parent project.
- The project overview records the project key, product, owner, summary, stage, members, and DSH collaboration policy.
- The workbench can create a local project directory for testing materials.
- Deleting a project record does not delete its associated folder. Check that you selected the correct record before deleting it.

### Dashboard, Kanban, and Calendar

- The dashboard brings project status, pending actions, events, and recent materials together.
- The kanban visualizes project stages and updates other workbench windows on the same machine in real time.
- The calendar combines project events and milestones, with date filtering, navigation, and event creation.

### Requirements, Test Cases, Defects, and Knowledge

- Requirements can record functional scope, non-functional requirements, risks, and acceptance criteria.
- Test cases can record type, priority, preconditions, steps, expected results, requirement traceability, and risk tags.
- Defects can record severity, environment, reproduction steps, expected and actual results, frequency, and impact.
- Projects can also store testing knowledge, meeting notes, and multiple versions of report drafts.

### DSH Collaboration and QA Skills

- DSH provides chat, models, commands, Skills, and permission policies.
- Each project uses its own DSH session. Materials registered through AI appear in Project Details and recent activity.
- The **QA Skill Installer** reads the local `awesome-qa-skills` repository. Its default location is `~/awsomeCode/awesome-qa-skills`. If the repository is elsewhere, set `QA_SKILLS_ROOT` to its root before starting the workbench.
- Search for and install a Skill from that page. Skills are copied to the DSH Skills directory (default `~/.dsh/skills/`). Restart DSH and use the Skill in a new session. You can also type `/` in chat to search installed Skills and commands.
- DSH can help analyze and register materials, but owners remain responsible for project stage changes, risk acceptance, defect confirmation, gate approvals, and release decisions.

### Interface Preferences

In Settings, choose English or Chinese and select Light, Dark, or System appearance. The main navigation, project sidebar, and project radar can be collapsed or resized by dragging their dividers. Double-click a divider to restore its default width.

## 7. Advanced: Quality Tasks, Execution, and Gates

Use these features when you need to retain the source, acceptance criteria, risks, test scope, run results, and evidence for a change or release. They are in the **Quality Tasks** section of Project Details.

### 7.1 Create a Quality Task and Complete Its Analysis

Select **New Quality Task** and enter a name, such as “Payment callback change acceptance.” The creation dialog currently records only the name. A DSH quality-analysis workflow or a supported server API must add the source snapshot, acceptance criteria, risks, and test scope. The analysis should match the captured source snapshot and current task revision.

Before analysis, specify the requirements, workspace files, or Git revision to inspect, and define the acceptance scope. Review the analysis; then an owner decides whether each risk is confirmed, mitigated, closed, or accepted. An AI risk recommendation is not an owner decision.

### 7.2 Execution Profiles and Controlled Runs

Project Details supports local execution profiles with **Node Test** or **Playwright** as the runner. Enter the exact path to a test file in the project workspace; wildcards are not supported. The server-side quality workflow requires a reviewed test plan at the current revision before it can create a run preview and start testing.

The workbench also supports Host execution profiles of type `browser-use`, `computer-use`, and `mcp`. You can restrict allowed origins or MCP tools and select artifacts such as logs, screenshots, and traces. Review the preview and explicitly confirm before starting. A run can be cancelled while in progress and retried after it ends.

Host execution depends on the corresponding provider or adapter being available in the current DSH host. If the adapter is unavailable, the run is recorded as not run. Saving a profile or sending a request does not prove that a test ran.

> The UI supports execution-profile configuration and Host execution. The server API also defines test-plan creation, plan-version reviews, and local run previews; some of these steps do not yet have a UI.

### 7.3 Review Evidence, Failures, and Regression

- A run can produce an evidence bundle when it reaches a terminal state. Check the bundle's status and integrity; use only verified evidence to support a delivery decision.
- You can record a failure analysis for a controlled run. Before promoting it to a defect, an owner must enter the confirmer's name and confirm the promotion.
- You can create a deterministic regression set and record who excluded a case and why.
- Compare two completed runs from the same test plan to review case-status changes and the effect of fixes.

### 7.4 Evaluate the Quality Gate

Select **Evaluate Quality Gate** in the Quality Tasks section. The workbench calculates a delivery result from sources, runs, verified evidence, critical test results, and risk status:

- `PASS`: All blocking checks in the current rules are satisfied.
- `WARN`: There are warnings or unmet non-blocking checks for an owner to review.
- `BLOCK`: A delivery blocker remains. Review the checks in the delivery report and address the run, evidence, or risk gaps.

A gate result is calculated from current workbench data. An owner must still approve release. Only warning checks allowed by the rules can receive an exception; each one needs an owner, reason, and expiry date. An exception cannot change `BLOCK` to `PASS`.

## 8. Data Location and Collaboration Boundaries

- In DSH plugin mode, project records and workbench data are stored in `~/.dsh/dsh-qa/` by default. In standalone mode, the default is the `data/` directory associated with the repository or global installation location.
- DSH stores its conversations separately from the workbench's JSON data.
- Project data and live kanban updates stay on the local machine, and workbench windows on that machine receive the updates. The workbench does not sync project records with other team members, watch GitHub for remote changes, or pull code automatically.
- Quality tasks can create local snapshots from supported sources. dsh-qa does not provide shared team services for Git, issue trackers, WPS, or ZenTao.
- Back up local project data and workspace files according to your organization's data-management requirements.

In standalone mode, environment variables can change the default data directory or listening port. For example:

```bash
QA_DATA_DIR=/path/to/qa-data QA_PORT=8900 npm start
```

## 9. FAQ

**QA Workbench is missing from the sidebar**

Make sure the plugin is installed in the DSH profile you are using, then restart DSH completely. On the official macOS client, quit with `⌘Q` before reopening it.

**DSH chat, models, Skills, or commands are unavailable**

Make sure you opened the plugin from the DSH sidebar instead of visiting the standalone page at `127.0.0.1:8899`. Then check the model, credentials, and Skill settings in DSH.

**Model authentication fails**

Check the provider, model, and credentials in DSH settings. dsh-qa does not store API keys separately.

**The quality gate returns `BLOCK`**

Open the project's **Quality Tasks** section and review the delivery report and blocking checks. Address missing controlled runs, verified evidence, or risk decisions, then evaluate the gate again.

**A local test did not run or has no evidence bundle**

Check that the test plan is at the current revision and reviewed, that the execution profile points to a test file in the project workspace, and that the required runner or Host adapter is available. If the run status is not `passed`, do not describe the test as passed.

**Port 8899 is already in use**

Check whether another workbench process is running. In standalone mode, set `QA_PORT` to use a different port.

## 10. Related Documentation

- [English project README](../../README_EN.md)
- [中文项目 README](../../README.md)
- [Chinese user guide](./user-guide-zh-CN.md)
- [Quality Workbench documentation index](./README.md)
- [GitHub repository](https://github.com/naodeng/dsh-qa)
- [License](../../LICENSE): PolyForm Noncommercial 1.0.0
