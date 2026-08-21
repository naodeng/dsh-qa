---
version: alpha
name: DSH QA Quality Control Room
description: Visual identity and interaction system for the local DSH QA workbench.
colors:
  primary: "#0E3A5F"
  ink: "#17212B"
  muted: "#667380"
  page: "#F3F5F7"
  panel: "#FFFFFF"
  line: "#E3E8EC"
  action: "#1768AD"
  success: "#0B6B5F"
  warning: "#8A5300"
  danger: "#BC3D44"
  dashboard-navy: "#0E3A5F"
  terminal-green: "#3DDC84"
  minimal-black: "#111111"
  cyber-cyan: "#00D4FF"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: 0.875rem
    lineHeight: 1.5
  code:
    fontFamily: "SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 0.75rem
    lineHeight: 1.4
rounded:
  none: 0px
  sm: 7px
  md: 10px
  lg: 14px
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
    backgroundColor: "{colors.dashboard-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    height: 36px
  status-success:
    backgroundColor: "#E7F5F2"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
  status-warning:
    backgroundColor: "#FFF6E7"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
  status-danger:
    backgroundColor: "#FCECEE"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
  theme-dashboard:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  theme-terminal:
    backgroundColor: "#07130C"
    textColor: "{colors.terminal-green}"
    rounded: "{rounded.none}"
  theme-minimal:
    backgroundColor: "#FAFAFA"
    textColor: "{colors.minimal-black}"
    rounded: "{rounded.none}"
  theme-cyber:
    backgroundColor: "#0A0618"
    textColor: "{colors.cyber-cyan}"
    rounded: "6px"
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

DSH QA is a local quality control room, not a generic project tracker. The interface should help a test lead answer what is risky, what is due, which project is active, and which decisions still require a human. The default `dashboard` theme is calm, dense, and operational; the other themes are visual modes over the same information architecture.

## Colors

The palette uses deep navy for the workbench frame, warm gray for the page, white for working surfaces, and one semantic accent per state. Green means healthy or passed, amber means attention is needed, and red is reserved for a real risk, failure, or overdue item. Never use color alone to communicate a state: pair it with text, an icon, or a position.

Themes may change the visual treatment, but semantic meaning does not change. `dashboard` uses navy and QA green, `terminal` uses green phosphor on near-black, `minimal` uses black and quiet grays, and `cyber` uses cyan with deep violet surfaces.

## Typography

Use the platform sans stack for Chinese and English product copy. Use the code stack for project keys, timestamps, counts, and technical status labels. Headings are compact and slightly tracked in; metadata is smaller and quieter. Do not use display typography that reduces scan speed in risk lists or tables.

## Layout

The shell is a top bar, a collapsible primary rail, and a scrollable work area. The dashboard prioritizes attention items, then quality summary, then active projects and activity. The assistant keeps project context on the left, conversation in the center, and the live project radar on the right. At medium widths the radar may collapse; at narrow widths project context and radar become drawers.

Use the spacing scale for consistent rhythm. Page padding is generous enough for scanning, while risk and activity rows stay compact. Primary actions sit near their relevant heading and should not compete with more than one other primary action in the same region.

## Elevation & Depth

Panels use a thin border and a restrained shadow. Depth indicates containment or an active overlay, not importance. Drawers and modals sit above the workbench with a clear backdrop. Terminal and cyber themes may use glow or inset edges sparingly; they must not obscure text or focus rings.

## Shapes

The default theme uses small-to-medium radii for panels and controls. Status labels are pills. `minimal` intentionally removes most rounding. `terminal` uses tighter corners to evoke a console. `cyber` uses modest rounding rather than decorative excess. Focus rings remain visible in every theme.

## Components

Primary buttons are reserved for the main action of a region. Secondary and subtle buttons handle navigation and supporting actions. Status badges use the semantic success, warning, danger, and neutral roles. Toasts must state what happened and what the user can do next when an action fails.

The assistant distinguishes user messages, DSH analysis, DSH recommendations, and pending human confirmation. A model suggestion must never look like a final release decision. Empty states explain why the region is empty and provide one next action. Disabled controls explain why they are unavailable.

The theme picker previews all four themes and states that themes change appearance only; project data, DSH models, skills, and testing mode are unchanged.

## Do's and Don'ts

- Do put overdue work, high-risk defects, and pending approvals above decorative summaries.
- Do keep action labels explicit and pair status color with text.
- Do preserve the current project and testing stage in the assistant header.
- Do support keyboard focus, reduced motion, and narrow screens.
- Don't introduce a new color for every feature.
- Don't present DSH suggestions as approved test conclusions.
- Don't change navigation or workflow semantics when switching themes.
- Don't use large decorative gradients, oversized icons, or dense unexplained metric grids.
