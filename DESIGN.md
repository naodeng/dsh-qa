---
version: alpha
name: DSH QA Quality Control Room
description: Visual identity and interaction system for the local DSH QA workbench.
colors:
  primary: "#345970"
  ink: "#22282B"
  muted: "#4E5A60"
  muted-strong: "#4E5A60"
  faint-strong: "#58636A"
  page: "#F1F2EF"
  panel: "#FBFBF9"
  line: "#D7DCDA"
  line-strong: "#C1CAC6"
  action: "#345970"
  action-hover: "#2A4C62"
  success: "#52665A"
  success-soft: "#EAF0EC"
  warning: "#8B5D19"
  warning-soft: "#F6EFDF"
  danger: "#A43E42"
  danger-soft: "#F6E9E9"
  dark-page: "#191E21"
  dark-panel: "#232A2E"
  dark-ink: "#EFF1EE"
  dark-muted: "#C4CBC7"
  dark-faint: "#B1B9B5"
  dark-success: "#A7B3A8"
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
    fontSize: 0.9375rem
    lineHeight: 1.6
  code:
    fontFamily: "SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 0.75rem
    lineHeight: 1.4
rounded:
  none: 0px
  xs: 6px
  sm: 8px
  md: 10px
  control-lg: 12px
  lg: 14px
  panel: 16px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  page: 30px
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: 38px
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

DSH QA is a local quality control room, not a generic project tracker. The interface should help a test lead answer what is risky, what is due, which project is active, and which decisions still require a human. Keep the existing dashboard, board, calendar, and assistant layout stable while applying the shared visual system.

## Colors

Use charcoal text on a soft neutral gray page with white work surfaces. Steel blue is the single action and selection accent. The standalone palette is explicit so a host application's unrelated theme cannot change the workbench colors. Muted sage-gray means healthy or passed, amber means attention is needed, and red is reserved for a real risk, failure, or overdue item. Project workflow stages stay neutral or steel blue; they do not imply a test result. Never use color alone to communicate a state: pair it with text, an icon, or a position.

The workbench supports light, dark, and system themes. Dark mode uses charcoal surfaces and a lighter steel-blue accent. Theme changes affect appearance only; the information architecture and QA workflow remain the same.

## Typography

Use the DSH host font token when available, with the platform sans stack for Chinese and English as the standalone fallback. Use the code stack only for code and terminal output. Keep ordinary interface and supporting copy at 15px, section headings at 18px, and page titles at 28px. Use regular (400) for body copy, medium (500) for controls and secondary emphasis, and semibold (600) for headings and key values. Keep tracking neutral on Chinese text; reserve tight tracking for numeric data.

## Layout

The shell is a top bar, a collapsible primary rail, and a scrollable work area. The dashboard prioritizes attention items, then quality summary, then active projects and activity. The assistant keeps project context on the left, conversation in the center, and the live project radar on the right. At medium widths the radar may collapse; at narrow widths project context and radar become drawers.

Use the spacing scale for consistent rhythm. Page padding is generous enough for scanning, while risk and activity rows stay compact. Primary actions sit near their relevant heading and should not compete with more than one other primary action in the same region.

## Elevation & Depth

Panels use a thin border and a restrained neutral shadow. Depth indicates containment or an active overlay, not importance. Drawers and modals sit above the workbench with a clear backdrop. Focus rings remain distinct from elevation shadows.

## Shapes

Controls use 10px radii and panels use 14–16px radii. Status labels are pills. Focus rings remain visible in every theme.

## Components

Primary buttons are reserved for the main action of a region. Secondary and subtle buttons handle navigation and supporting actions. Status badges use the semantic success, warning, danger, and neutral roles. Toasts must state what happened and what the user can do next when an action fails.

The assistant distinguishes user messages, DSH analysis, DSH recommendations, and pending human confirmation. A model suggestion must never look like a final release decision. Empty states explain why the region is empty and provide one next action. Disabled controls explain why they are unavailable.

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
