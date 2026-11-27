---
version: alpha
name: DSH QA Quality Control Room
description: Visual identity and interaction system for the local DSH QA workbench.
colors:
  primary: "#004AC6"
  ink: "#191B23"
  muted: "#4B505E"
  muted-strong: "#3D4250"
  faint-strong: "#5D6170"
  page: "#F7F7F5"
  panel: "#FFFFFF"
  panel-soft: "#F3F3F0"
  line: "#E2E4E9"
  line-strong: "#B9BDC8"
  action: "#004AC6"
  action-hover: "#0039A0"
  success: "#15803D"
  success-soft: "#DCFCE7"
  warning: "#B45309"
  warning-soft: "#FEF3C7"
  danger: "#BA1A1A"
  danger-soft: "#FFDAD6"
  dark-page: "#0F1117"
  dark-panel: "#171A23"
  dark-panel-soft: "#1D212C"
  dark-ink: "#F1F3F7"
  dark-muted: "#A7AEBE"
  dark-faint: "#8B93A7"
  dark-success: "#4ADE80"
typography:
  display:
    fontFamily: "var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif)"
    fontSize: 1.75rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: normal
  section:
    fontFamily: "var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif)"
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif)"
    fontSize: 1rem
    lineHeight: 1.6
  label:
    fontFamily: "var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif)"
    fontSize: 0.875rem
    lineHeight: 1.45
  code:
    fontFamily: "SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 0.8125rem
    lineHeight: 1.4
rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  control-lg: 8px
  lg: 12px
  panel: 12px
  panel-large: 12px
  pill: 999px
spacing:
  3xs: 2px
  2xs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: 32px
  status-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
  status-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
  theme-light:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  theme-dark:
    backgroundColor: "{colors.dark-page}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.panel}"
  surface-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  secondary-copy:
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.line}"
  action-primary:
    backgroundColor: "{colors.action}"
    textColor: "#FFFFFF"
---

## Overview

DSH QA is a local quality control room, not a generic project tracker. The interface should help a test lead answer what is risky, what is due, which project is active, and which decisions still require a human. The shell is a top bar with four primary destinations (dashboard, board, calendar, skills), a mobile navigation row, and a scrollable work area. The dashboard keeps a live DSH chat rail on the right; project detail keeps a contextual inspector on wide screens.

## Colors

Use graphite text on a quiet, warm-neutral page with clean white work surfaces. Engineering blue (#004AC6) is the single action and selection accent. The standalone palette is explicit so a host application's unrelated theme cannot change the workbench colors. Blue-gray means healthy or passed, amber means attention is needed, and red is reserved for a real risk, failure, or overdue item. Project workflow stages stay neutral; they do not imply a test result. Never use color alone to communicate a state: pair it with text, an icon, or a position.

The workbench supports light, dark, and system themes. Dark mode uses charcoal surfaces and a lighter engineering-blue accent. Theme changes affect appearance only; the information architecture and QA workflow remain the same.

## Typography

Use the DSH host font token when available, with the platform sans stack for Chinese and English as the standalone fallback. Use the code stack only for code and terminal output. Keep ordinary interface copy at 16px, labels and secondary metadata at 14px, section headings at 18px, and page titles at 28px. Use regular (400) for body copy, medium (500) for controls and secondary emphasis, and semibold (600) for headings and key values. Keep tracking neutral on Chinese text; reserve tight tracking for numeric data. Risk lists, tables, and forms use the same sans family and role-appropriate sizes so long work sessions remain easy to read.

## Layout

The shell is a top bar with four primary destinations, a mobile navigation row, and a scrollable work area. The dashboard prioritizes attention items, then quality summary, then active projects and activity, with a live DSH chat rail on the right. The board shows six stages; filters switch between all records, test projects, and test iterations. Calendar supports month, week, and day views. Project detail uses horizontal section tabs and a right-side context inspector on wide screens; the inspector collapses below 1280px. At narrow widths project lists, chat context, and radar become drawers or full-page views.

Use the spacing scale for consistent rhythm. Page padding is generous enough for scanning, while risk and activity rows stay compact. Primary actions sit near their relevant heading and should not compete with more than one other primary action in the same region.

## Elevation & Depth

Panels use a thin border and a restrained neutral shadow. Depth indicates containment or an active overlay, not importance. Drawers and modals sit above the workbench with a clear backdrop. Focus rings remain distinct from elevation shadows.

## Shapes

Controls use 6–8px radii and panels use 12px radii. Status labels are pills. Focus rings remain visible in every theme.

## Components

Primary buttons are reserved for the main action of a region. Secondary and subtle buttons handle navigation and supporting actions. Status badges use the semantic success, warning, danger, and neutral roles. Toasts must state what happened and what the user can do next when an action fails.

The assistant distinguishes user messages, DSH analysis, DSH recommendations, and pending human confirmation. The dashboard chat rail supports expand, new conversation, skills/commands, attachments, stop, and project context. The command palette is the global search and jump surface (⌘K / Ctrl K), including pages, actions, and projects. A model suggestion must never look like a final release decision. Empty states explain why the region is empty and provide one next action. Disabled controls explain why they are unavailable.

Use the existing inline SVG icon family with a consistent 18px size and 1.8px stroke. Buttons, inputs, tabs, and theme choices use short transitions for hover, active, and selected states; reduced-motion preferences are respected.

The theme picker provides light, dark, and system options and states that themes change appearance only; project data, DSH models, skills, and testing mode are unchanged.

## Do's and Don'ts

- Do put overdue work, high-risk defects, and pending approvals above decorative summaries.
- Do keep action labels explicit and pair status color with text.
- Do preserve the current project and testing stage in the assistant header.
- Do support keyboard focus, reduced motion, and narrow screens.
- Don't introduce a new color for every feature.
- Don't present DSH suggestions as approved test conclusions.
- Don't change navigation or workflow semantics when switching themes.
- Don't use large decorative gradients, oversized icons, or dense unexplained metric grids.

## Implementation Layer

`public/style.css` remains the legacy component stylesheet. `public/v6.css` is loaded after it and is the v6 visual layer; the cascade order is intentional. Keep critical shell, dashboard, board, calendar, assistant and form contracts covered by `test/e2e/visual-contract.spec.js` when changing this layer. Pixel snapshots are not committed because sample data, dates and host fonts differ between local and CI runs; the contract assertions pin computed type, layout, visibility and overflow behavior instead.
