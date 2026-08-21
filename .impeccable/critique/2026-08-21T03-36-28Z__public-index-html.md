---
target: public/index.html
total_score: 26
p0_count: 0
p1_count: 3
timestamp: 2026-08-21T03-36-28Z
slug: public-index-html
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Good status and activity signals, but DSH/test mode competes with primary work. |
| 2 | Match System / Real World | 3 | QA concepts are familiar; some labels are platform-specific or abstract. |
| 3 | User Control and Freedom | 3 | Collapse and navigation controls are present; destructive/commit actions need stronger confirmation context. |
| 4 | Consistency and Standards | 3 | Strong shared vocabulary, but dense tiny labels and mixed control styles reduce consistency. |
| 5 | Error Prevention | 2 | Risk, overdue, and approval states are visible but not always paired with next action or prevention guidance. |
| 6 | Recognition Rather Than Recall | 3 | Dashboard summarizes work well; multi-pane assistant context still requires orientation. |
| 7 | Flexibility and Efficiency | 3 | Search, keyboard hint, resizable panes, and shortcuts help power users. |
| 8 | Aesthetic and Minimalist Design | 2 | The dashboard is polished but overpacked: five panels, four metrics, multiple status layers. |
| 9 | Error Recovery | 2 | Recovery and failure states are not prominent in the visible dashboard. |
| 10 | Help and Documentation | 2 | Local/test-mode notes exist, but terminology and action consequences are under-explained. |
| **Total** | | **26/40** | Solid foundation; prioritize hierarchy, density, and task clarity. |

## Anti-Patterns Verdict

The interface is not generically AI-looking; it has a credible QA-workbench identity and restrained blue/teal semantics. The main risk is product-dashboard sameness: many white rounded panels, metric tiles, and secondary summaries compete for attention. The deterministic scan found one side-tab accent at `public/style.css:427` and four layout-property transitions at lines 94, 102, 254, and 338. The side-tab finding is valid; the transitions are low-risk at this scale but should be replaced or limited for smoother resizing and reduced-motion behavior.

## Overall Impression

A capable, trustworthy first screen that feels more like an operations overview than a decisive starting point. The biggest opportunity is to make “what needs my attention now?” unmistakable, then let the rest recede.

## What's Working

- The top-level structure is clear: global search, primary navigation, recent projects, and a dashboard start point.
- Semantic colors are restrained and useful: red for overdue, amber for review/deadline, teal for enabled/healthy, blue for action.
- The “今日待办” list is the strongest module because it combines issue, project context, and urgency in one scan.

## Priority Issues

### [P1] Too many competing first-screen priorities

**Why it matters:** Metrics, reminders, calendar, projects, AI control, and activity all have similar visual weight. Users must decide where to look before they can act.

**Fix:** Make the first viewport action-led: elevate overdue/approval items into a single “需要你处理” queue, reduce metrics to supporting context, and move activity/AI status below the fold or behind a secondary view.

**Suggested command:** `$impeccable distill public/index.html`

### [P1] Tiny secondary typography lowers scanability

**Why it matters:** Many captions, metadata, table labels, and notes sit around 8.5–10.5px. This makes the workbench feel dense and weakens the distinction between evidence and decoration, especially for Chinese text and lower-quality displays.

**Fix:** Set a minimum readable UI text size around 11px, reserve 9–10px for timestamps/badges only, and increase contrast for `--faint`. Use weight and spacing—not smaller type—to establish hierarchy.

**Suggested command:** `$impeccable typeset public/style.css`

### [P1] The assistant workspace has high orientation cost

**Why it matters:** The project sidebar, chat pane, reminder strip, composer controls, and project radar create several simultaneous “current context” signals. First-time users may not know which pane owns the next action.

**Fix:** Give the center pane one explicit task title and one primary action; collapse the radar by default on narrower widths; move model/test-mode details into a compact status affordance; keep project context in one canonical location.

**Suggested command:** `$impeccable layout public/index.html`

### [P2] Risk states do not consistently lead to resolution

**Why it matters:** “逾期 15 天”, “待审批”, and “建议处理” identify problems but do not tell users the shortest safe next step.

**Fix:** Pair each attention row with an action verb or destination (“补齐需求”, “打开评审”, “提交审批”), and preserve the risk label as secondary metadata. Make overdue items keyboard- and screen-reader-readable as actionable controls.

**Suggested command:** `$impeccable clarify public/index.html`

### [P2] Several interaction details are technically fragile

**Why it matters:** The 2px colored side border on calendar events is visually over-specific, and transitions on `width`, `padding`, and `height` can make pane resizing feel janky. Focus treatment is also easy to miss because some controls suppress outlines.

**Fix:** Replace the side accent with a full tinted event treatment or a small status marker; animate opacity/transform where possible; preserve a visible `:focus-visible` ring for every button, link, input, and splitter.

**Suggested command:** `$impeccable audit public/index.html`

## Persona Red Flags

**Alex (Power User):** Search and `⌘ K` are promising, but the dashboard still requires scanning several modules before reaching an action. The assistant has multiple panes and controls competing with the composer.

**Jordan (First-Timer):** “DSH 测试模式”, “全流程辅助”, “项目雷达”, and “门禁” are meaningful to the team but not self-explanatory. The welcome screen needs a clearer first task and a short explanation of what happens after clicking “新建项目”.

**Morgan (QA Lead):** Approval and overdue signals are visible, but ownership, due-date consequence, and the safe resolution path are not consistently explicit. The user still has to open items to determine whether a release is blocked.

## Minor Observations

- The serif “质量” wordmark gives the tool personality, but the rest of the UI is system-sans; consider keeping the serif only in branding, not task labels.
- `返回 DSH`, Remote, language, theme, and avatar actions make the top bar visually busy relative to their frequency of use.
- The dashboard’s large empty lower-right/white regions are acceptable at the captured data volume, but empty states should teach users what to add.
- Add explicit reduced-motion rules for the cursor blink and pane transitions.

## Questions to Consider

- Should the dashboard optimize for a QA lead’s daily triage, or for entering the DSH assistant? The current layout gives both equal prominence.
- Would a single “blocked / needs decision / upcoming” queue be more useful than four metric cards?
- Is the radar intended to be continuously visible, or is it mostly a reassurance panel that could be on demand?
