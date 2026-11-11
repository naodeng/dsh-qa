---
version: alpha
name: DSH QA Quality Control Room
description: Visual identity and interaction system for the local DSH QA workbench.
colors:
  primary: "#385B72"
  ink: "#25292C"
  muted: "#515A60"
  muted-strong: "#454D52"
  faint-strong: "#616A70"
  page: "#F4F3F0"
  panel: "#FCFCFA"
  panel-soft: "#F0F0ED"
  line: "#D9D9D4"
  line-strong: "#8D9495"
  action: "#385B72"
  action-hover: "#2F4D61"
  success: "#536873"
  success-soft: "#E9EEF0"
  warning: "#8B5D19"
  warning-soft: "#F6EFDF"
  danger: "#A43E42"
  danger-soft: "#F6E9E9"
  dark-page: "#1C2023"
  dark-panel: "#272C30"
  dark-panel-soft: "#22272A"
  dark-ink: "#ECEEED"
  dark-muted: "#C2C7C8"
  dark-faint: "#AEB5B8"
  dark-success: "#B2C0C6"
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
  xs: 5px
  sm: 7px
  md: 9px
  control-lg: 10px
  lg: 12px
  panel: 14px
  panel-large: 16px
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
    height: 40px
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

Use graphite text on a quiet, warm-neutral page with clean near-white work surfaces. Steel blue is the single action and selection accent. The standalone palette is explicit so a host application's unrelated theme cannot change the workbench colors. Blue-gray means healthy or passed, amber means attention is needed, and red is reserved for a real risk, failure, or overdue item. Project workflow stages stay neutral or steel blue; they do not imply a test result. Never use color alone to communicate a state: pair it with text, an icon, or a position.

The workbench supports light, dark, and system themes. Dark mode uses charcoal surfaces and a lighter steel-blue accent. Theme changes affect appearance only; the information architecture and QA workflow remain the same.

## Typography

Use the DSH host font token when available, with the platform sans stack for Chinese and English as the standalone fallback. Use the code stack only for code and terminal output. Keep ordinary interface copy at 16px, labels and secondary metadata at 14px, section headings at 18px, and page titles at 28px. Use regular (400) for body copy, medium (500) for controls and secondary emphasis, and semibold (600) for headings and key values. Keep tracking neutral on Chinese text; reserve tight tracking for numeric data. Risk lists, tables, and forms use the same sans family and role-appropriate sizes so long work sessions remain easy to read.

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
