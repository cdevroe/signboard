---
version: alpha
name: Signboard Default
description: Default visual identity for Signboard's local-first board interface.
colors:
  primary: "#0B5FFF"
  on-primary: "#FFFFFF"
  secondary: "#5D737E"
  tertiary: "#15803D"
  neutral: "#F7F8FA"
  surface: "#FFFFFF"
  on-surface: "#0F172A"
  muted: "#6B7280"
  border: "#E6E8EC"
  danger: "#D92D20"
  dark-primary: "#6FCF97"
  dark-on-primary: "#07130C"
  dark-neutral: "#091102"
  dark-surface: "#12200A"
  dark-on-surface: "#E8F0E5"
  dark-muted: "#A0B3A3"
  dark-border: "#1F2E17"
typography:
  headline-lg:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: 22px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: 0px
  heading-md:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: 0px
  body-md:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0px
  body-sm:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0px
  label-sm:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.04em
  metadata-mono:
    fontFamily: "JetBrains Mono Local, JetBrains Mono, SF Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.01em
rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 14px
  xl: 24px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  board-gap: 16px
  card-gap: 10px
  list-width: 280px
components:
  app-background:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  board-column:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 12px
    width: 280px
  board-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 10px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: 9px
    height: 40px
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 6px
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: 8px
  metadata:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.metadata-mono}"
  card-hover-boundary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: 10px
  label-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 1px
  popover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 16px
  tooltip:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: 6px
  divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.on-surface}"
    height: 1px
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-sm}"
  status-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.label-sm}"
  dark-app-background:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-md}"
  dark-board-card:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.md}"
    padding: 10px
  dark-button-primary:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    rounded: "{rounded.full}"
    padding: 9px
    height: 40px
  dark-metadata:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-muted}"
    typography: "{typography.metadata-mono}"
  dark-divider:
    backgroundColor: "{colors.dark-border}"
    textColor: "{colors.dark-muted}"
    height: 1px
---

## Overview

Signboard's default theme is a quiet, high-utility workspace for local-first planning. It should feel like a fast desktop tool: calm, crisp, file-native, and direct. The interface favors dense scannable work over decorative presence.

The first impression is a pale canvas with white cards and columns, slate text, restrained borders, and a single clear blue action color. Visual energy comes from interaction states, labels, due indicators, and drag motion, not from large illustrations or broad color fields.

The default theme is light mode. Dark mode is a companion implementation and should preserve the same hierarchy with green as the primary action color on a deep green-black canvas.

## Colors

The palette is based on cool neutrals and one action color.

- **Primary (#0B5FFF):** Interaction blue for primary actions, active filters, focus rings, selected tabs, and today emphasis.
- **On Primary (#FFFFFF):** Text and icons placed directly on primary blue.
- **Neutral (#F7F8FA):** The default board canvas and app background.
- **Surface (#FFFFFF):** Cards, columns, controls, popovers, and modals.
- **On Surface (#0F172A):** Core text and high-priority UI chrome.
- **Muted (#6B7280):** Card previews, metadata, helper text, inactive tabs, and secondary icon color.
- **Border (#E6E8EC):** Low-contrast dividers and object boundaries.
- **Secondary (#5D737E):** Hover-strength neutral used when cards need a stronger boundary.
- **Tertiary (#15803D):** Success and completed-task color.
- **Danger (#D92D20):** Today/overdue and destructive color. Use sparingly.

Dark mode mirrors the hierarchy with `#091102` as the canvas, `#12200A` as the surface, `#E8F0E5` as text, `#A0B3A3` as muted text, and `#6FCF97` as the primary action color.

## Typography

Use Inter through the system font stack for nearly all UI. It should stay compact and readable, with regular weight for card titles and body text so the board does not become visually loud.

- **Headlines:** 22px, weight 650, used for app and modal titles.
- **Section headings:** 16px, weight 650, used in settings panels, archive detail, and helper dialogs.
- **Body:** 16px or 14px, regular weight, line-height 1.45.
- **Labels:** 12px, uppercase only when a label acts as metadata or a section eyebrow.
- **Monospace metadata:** JetBrains Mono Local at 11px or 12px for shortcut hints, compact IDs, and technical metadata.

Keep letter spacing at `0px` except for small labels and shortcut hints, which may use modest positive spacing.

## Layout

Signboard uses a desktop-first board layout. The board surface scrolls horizontally for Kanban columns and vertically inside the main workspace. Columns are fixed at 280px wide to keep card scanning predictable.

Spacing follows a compact 4/8/12/16px rhythm. Board and calendar grids use 16px page padding, 8px cell gaps, 10px card gaps, 12px column padding, and 16px card-to-card vertical spacing.

Header controls should remain compact and tool-like: icon buttons are 40px minimum, search is pill-shaped, board tabs sit flush against the board edge, and popovers open near their triggering controls.

Planner Calendar, This Week, Day, and Agenda keep the same card language as Kanban, but compress cards into small temporal summaries with board/list context and task progress.

Planner is a workspace-level overlay, not a board color-scheme surface. Its rail and full-screen panel should use the default Signboard light/dark palette so it does not appear to belong to the active board. Planner cards must preserve source context with board and list text because they gather work from multiple boards.

## Elevation & Depth

Depth is subtle. Use borders first, then soft shadows only for lift and modality.

Cards use a small shadow, columns use a broader but faint shadow, and modals/popovers use stronger shadows to separate them from the board. Drag and hover states may raise a card by increasing shadow and translating it up by 1px.

Avoid heavy material-style elevation. Signboard should read as layered paper and desktop controls, not as floating glass.

## Shapes

The default shape language is soft but still utilitarian.

- **Cards and generic controls:** 10px radius.
- **Columns and modals:** 14px radius.
- **Popovers and menu rows:** 8px to 10px radius.
- **Pills, chips, tabs indicators, switches:** full radius.
- **Empty and missing-board callouts:** 24px radius because they are large, standalone states.

Do not mix sharp rectangular controls into the default theme unless matching native browser controls is required.

## Components

Buttons are quiet by default: white surface, slate text, one-pixel border, and 10px radius. Primary buttons use blue fill, white text, pill radius, and at least 40px height.

Cards are white surfaces with 10px radius, 10px padding, subtle border, and a low shadow. Card titles are regular 16px text; preview and metadata text is muted. Label chips are pill-shaped, small, and use board label colors without overwhelming card text.

Columns are fixed-width white surfaces with 14px radius, 12px padding, and a faint shadow. Column headers use 14px semibold text with a subtle bottom divider.

Popovers and menus use white surfaces, 8px padding, 8-10px row radii, and hover states made from light border/surface mixing. Menu rows should use icons plus text, with shortcut hints in JetBrains Mono.

Modals are white surfaces with 14px radius, 16px or greater padding, and stronger shadow. Form fields are 12px radius, full-width when inside modal flows, and use the primary color only for focus rings and selected states.

Tooltips are compact, high-contrast overlays using surface/text inversion and a small pointer. They should explain icon controls without adding visible instructional text to the main UI.

## Accessibility

Focus affordances should be visible for keyboard navigation without making pointer editing feel boxed in. Use `:focus-visible` for card titles, list names, contenteditable fields, and compact icon controls; avoid persistent outlines on the card editor when focus came from mouse or touch.

Motion should respect `prefers-reduced-motion`: drag tilt, hover lift, animated Sortable movement, and nonessential transitions should reduce or stop while preserving clear placement feedback. Forced-colors mode should keep borders, focus, and selected states available through system colors.

## Do's and Don'ts

- Do keep the board dense, scannable, and calm.
- Do use primary blue for active, focused, selected, or highest-priority actions only.
- Do keep keyboard focus visible without adding persistent editor chrome for pointer users.
- Do use borders and muted text to create hierarchy before adding stronger shadows.
- Do keep card titles modest and regular weight so many cards can sit together comfortably.
- Do preserve fixed column width and stable control sizes.
- Don't introduce broad gradients, decorative background shapes, or saturated page sections.
- Don't make cards visually heavier than columns or modals.
- Don't use multiple competing accent colors for core actions.
- Don't hide essential file-first context such as list names, labels, due dates, or source list labels in temporal views.
- Don't use negative letter spacing or viewport-scaled type.
