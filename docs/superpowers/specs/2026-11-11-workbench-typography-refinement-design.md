# Workbench Typography Refinement Design

## Intent

Reduce the abrupt changes in the workbench's text hierarchy while keeping its current DSH and system sans-serif family. The review found inconsistent CSS overrides and weights, not a need for a new font family.

## Goals

- Make the rendered type roles match `DESIGN.md`: 28px page titles, 18px section headings, 16px body copy, and 14px supporting labels.
- Use a compact weight set: 400 for body copy, 500 for secondary emphasis and controls, and 600 for headings and key values.
- Keep Chinese tracking neutral; reserve tighter tracking for numeric values where it helps scanning.
- Remove or consolidate duplicate typography declarations in `public/style.css` so the final style does not depend on a long override chain.
- Preserve a 12px compact role only where dense metadata needs it and remains readable.

## Non-goals

- Replace `--dsw-font-family` or the existing system fallback.
- Add font downloads, a display face, or new dependencies.
- Redesign the dashboard, assistant layout, colors, or component behavior.

## Approaches considered

1. **Consolidate a role-based type scale (selected).** Align existing CSS with the role sizes and weights already documented in `DESIGN.md`, then remove duplicate overrides. This fixes hierarchy across screens while preserving the workbench identity.
2. **Tweak only page titles and metric figures.** This is a smaller diff, but leaves inconsistent body, label, and metadata rules in place.
3. **Replace the font family.** This changes the visual identity and may render differently between DSH and standalone mode without addressing the inconsistent sizes and weights.

The selected approach is the first option because the live page uses one consistent sans-serif family; the abruptness comes from its role rules and cascade.

## Constraints and implementation calls

- Keep `--dsw-font-family` as the host preference and the current platform sans stack as fallback.
- Keep the same role scale in light and dark themes, Chinese and English, dashboard and assistant views, and desktop and mobile widths.
- Keep ordinary prose readable at 16px, with 14px supporting copy and a 12px compact role only for dense metadata.
- Prefer shared typography tokens and role selectors over component-specific pixel values. Preserve numeric tabular alignment where it exists.

## Verification

- Inspect desktop and mobile dashboard and assistant views in light and dark themes.
- Run the Impeccable typography detector and `npm test`.
- Run `git diff --check`, stage only the typography changes, and leave unrelated working-tree modifications untouched.
