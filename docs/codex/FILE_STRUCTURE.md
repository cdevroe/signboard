# Signboard File Structure (Annotated)

This map focuses on source and operational files. Large generated/vendor folders are summarized.

## Top level

- `main.js` - Electron main process window + IPC handlers + trusted board-root/path validation + filesystem watchers + opt-in localhost External Published Calendar server + native menu/accelerators (including board switcher/settings/theme shortcuts) + optional Quick Add global shortcut registration + renderer right-click text editing context menu with deferred native popup handling + archive browse/restore + top-of-list card move IPC + GitHub-release auto-update flow (`electron-updater`), including release-note formatting that strips a `## Downloads` section from in-app update dialogs.
- `CODEX.md` - Canonical Codex-specific repo instructions and maintenance rules.
- `AGENTS.md` - Cross-tool compatibility entrypoint that points agents to `CODEX.md`.
- `DESIGN.md` - Design.md-compatible default theme tokens and visual rationale for Signboard's UI.
- `MCP_README.md` - Dedicated setup guide for Signboard MCP server mode (`--mcp-server`).
- `preload.js` - Thin renderer bridge (`window.board`, `window.chooser`, `window.electronAPI`) that forwards allowed operations to main-process IPC and main-process-triggered renderer events, including board switcher/view/settings/Quick Add events, clipboard text copy, archive browse/read/restore, and top-of-list card move calls.
- `index.html` - App shell, header board tab strip, left-edge Planner rail/overlay markup, fixed Sponsor pill, board-menu view/archive/switcher modal markup (including `#boardViewButton`, `#modalKeyboardShortcuts`, `#modalBoardSwitcher`, and `#modalArchiveBrowser`), and deferred script/style includes.
- `readme.md` - Human-facing project README.
- `docs/release-template.md` - Curated GitHub release-body template for public download links.
- `package.json` - Runtime/build scripts and dependencies.
- `package-lock.json` - NPM lockfile.
- `.gitignore` - Ignores `node_modules`, `dist`, `.env`, etc.
- `buildjs.sh` - Concatenate renderer modules into `app/signboard.js`.
- `electron-builder.json` - Build targets/artifact settings.
- `LICENSE` - MIT license.
- `skills/signboard-mcp/SKILL.md` - Optional agent skill instructions for safe/consistent Signboard MCP tool usage.
- `skills/signboard-mcp/agents/openai.yaml` - UI metadata for clients that support skill lists/chips.

## Renderer source (`app/`)

- `app/signboard.js` - Generated concatenated renderer file loaded by `index.html`.
- `app/utilities/santizeFileName.js` - Filename sanitization + random suffix helper.
- `app/utilities/taskList.js` - Task checklist parser, due-marker helpers, all/open task due-date sets, task-summary counters, and task progress badge creation.
- `app/utilities/dueNotifications.js` - Due-notification collection + message formatting for card due dates and incomplete task due markers, skipping completed workflow lists.
- `app/utilities/accessibility.js` - Shared renderer accessibility helpers for modal focus restoration/trapping, background inert state, live status announcements, stable DOM IDs, reduced-motion checks, and deferring DOM mutations until native menu/select popup tracking settles on macOS.
- `app/utilities/cardDragTilt.js` - Shared card Sortable fallback options, drag tilt, reduced-motion handling, and drag text-selection lock used by Kanban and temporal card drag/drop.
- `app/appSettings.js` - Renderer app-settings state, app-wide tooltip/notification/Quick Add global shortcut/External Published Calendar controls, persistence scheduling, and one-time migration from legacy board settings.
- `app/board/boardLabels.js` - Board-label state, completed-list workflow settings, shared shortcut-label helpers, header filter UI (`Today` / `Overdue` + label filters, with date filters ignoring completed task due markers and completed workflow lists), keyboard-operable card label popovers, Settings modal board panels/nav, and Trello/Obsidian import panel wiring + summary rendering.
- `app/board/boardSearch.js` - Board search state, input handling for title/body filtering, and keyboard navigation from the search field through visible card results.
- `app/board/boardViews.js` - Shared Kanban/Planner temporal helpers, Kanban/Table board view state and menu controls, Calendar/This Week layout helpers, temporal card placement by card due/open task due markers, and source-list/source-board pills on temporal cards.
- `app/board/tableView.js` - Board-scoped Table view rendering, dense row metadata, board filter/search reuse, and list-column card moves through the top-of-list move IPC path.
- `app/board/plannerView.js` - Workspace-level Planner overlay with Calendar, This Week, Day, and Agenda views across currently open boards, all/current/custom board scope controls, Planner-local search/date/completed-card/board/active-board-label filters, keyboard navigation for Planner search/filter controls, left-rail open/close behavior, and Planner card opening that switches the active board when needed.
- `app/board/archiveBrowser.js` - Dedicated Archive modal UI, search-first archived card/list browsing with keyboard result navigation, detail-pane rendering, incremental result loading, and restore flows.
- `app/board/boardTabs.js` - Open-board tab session state (restore/add/close/reorder), keyboard navigation/close behavior for visible tabs, responsive `N more` overflow for unbounded open boards, plus the shared safe board-switch helper used by tab clicks and the switcher.
- `app/board/boardSwitcher.js` - Quick board switcher overlay for `Cmd/Ctrl + K`, filtering and closing currently open boards and delegating selected board changes to the shared switch helper.
- `app/cards/createCardElement.js` - Card DOM rendering, task progress badge display, list-item/card-title button semantics, and click behavior.
- `app/cards/processAddNewCard.js` - New card creation flow, including open-board targeting and optional create-and-open behavior.
- `app/cards/processAddNewList.js` - New list creation flow.
- `app/lists/listActionsPopover.js` - List action popover rendering for adding cards/lists, moving lists left/right, archiving cards/lists, keyboard option navigation, shortcut hints, and status announcements.
- `app/lists/createListElement.js` - List DOM rendering with labelled section/list semantics, sanitized rename, card DnD handling, and cross-list move lifecycle logging.
- `app/board/renderBoard.js` - Whole-board render (with concurrent card-list reads), active Kanban/Table view dispatch, and Kanban list DnD handling.
- `app/board/openBoard.js` - Board open/init logic and starter content.
- `app/modals/closeAllModals.js` - Modal close logic + editor cleanup + conditional rerender + board interaction lock/unlock.
- `app/modals/toggleAddCardModal.js` - Add-card modal position/toggle.
- `app/modals/toggleAddListModal.js` - Add-list modal position/toggle.
- `app/modals/toggleAddCardToListModal.js` - Cross-list add-card modal toggle.
- `app/modals/toggleEditCardModal.js` - Card editor open/save/archive/duplicate logic, active-card top-of-list moves from the dropdown/directional controls, debounced + serialized saves, clean-editor reloads after external/MCP card edits, fresh duplicate lifecycle metadata, and task-line due-date controls aligned from measured line coordinates.
- `app/listeners/window.js` - Keyboard shortcuts, menu/global-command listeners, Quick Add card modal wiring with board/list selection across open boards, board view switching, Planner toggle/view shortcut handling including all-open-board and current-board date-view scopes, Settings fallback handling, quick board switcher shortcut handling, color cycling, active-card move/archive shortcuts, active-editor closing for workspace-level shortcuts, and the `Cmd/Ctrl + /` helper modal behavior; keep `#modalKeyboardShortcuts` list in sync when adding/changing shortcuts.
- `app/init.js` - App bootstrap, folder picker handling, top-level event wiring, sponsorship modal triggers, and external board-change auto-refresh sync loop, including clean open-editor refreshes.
- `app/ui/theme.js` - Theme toggle + OverType theme integration, including the theme shortcut hint/state in the board menu.
- `app/ui/tooltips.js` - Lightweight custom tooltip engine (event delegation + mutation observer) using existing element label attributes.

## Shared/library code

- `lib/cardFrontmatter.js` - Card parse/normalize/read/write/update with legacy support.
- `lib/cardLifecycle.js` - Shared card lifecycle metadata helper for `createdAt`, compact `activity` trails, archive frontmatter state, and moved/restored transitions.
- `lib/cardOrdering.js` - Shared list-card ordering helper used by main-process/MCP restore and move flows to insert a card at the top while renumbering existing files.
- `lib/archive.js` - Archive/archive-list filesystem operations plus archive listing/detail/restore helpers and legacy archive fallback handling.
- `lib/boardLabels.js` - Board-level label/theme/workflow/External Published Calendar inclusion settings read/write/defaults/filter helpers (`board-settings.md`) plus legacy app-setting extraction for migration.
- `lib/appSettings.js` - App-wide tooltip/notification/Quick Add global shortcut/External Published Calendar settings normalization and JSON persistence under Electron `userData`.
- `lib/externalPublishedCalendar.js` - External Published Calendar event collection and iCalendar feed generation for card due dates and incomplete task due markers.
- `lib/importers/index.js` - Export surface for board importers.
- `lib/importers/shared.js` - Shared importer helpers for list/card creation, label reuse/creation, metadata section building, and markdown source discovery.
- `lib/importers/trello.js` - Trello JSON importer.
- `lib/importers/obsidian.js` - Obsidian importer covering `obsidian-kanban`, generic task scopes, and CardBoard snapshot imports.
- `lib/cardBodyEdits.js` - Shared Markdown body-edit helpers for replacing heading sections, inserting text below headings, and appending timestamped note list items.
- `lib/boardCreation.js` - Shared default board scaffolding for MCP and CLI-created boards, including default list folders and the starter card body/frontmatter.
- `lib/mcpServer.js` - Headless MCP stdio server for agent access to board/list/card/settings/archive operations inside configured or desktop-trusted roots, safe board creation, archive browse/read/restore tools, Trello/Obsidian/Tasks.md imports, dry-run card writes, and task-summary metadata on card tools.
- `lib/cliApp.js` - CLI command parsing/output for `use`, `boards`, `lists`, `cards`, `archive`, `settings`, and path-based `import` commands, including board creation, card duplicate/template commands, section/note card edits, dry-run previews, and `--task-status open|any` for card due filtering.
- `lib/cliBoard.js` - CLI list/card filesystem operations, record loading, card duplication/template creation, section/note body edits, explicit label clearing, and due/search/label filtering; overdue task filtering defaults to incomplete/open task markers unless callers pass `--task-status any`.
- `lib/cliInstall.js` - User-level CLI shim + shell profile installation; packaged shims run `app.asar/bin/signboard.js` under `ELECTRON_RUN_AS_NODE` instead of launching the desktop lifecycle.

## Scripts (`scripts/`)

- `scripts/test-frontmatter.js` - Node assertions for frontmatter behavior.
- `scripts/test-board-labels.js` - Node assertions for board label settings defaults/migration/filter logic.
- `scripts/test-app-settings.js` - Node assertions for app-wide settings persistence and one-time board-settings migration.
- `scripts/test-board-card-metadata.js` - Board card metadata rendering assertions (due/labels/task badge behavior).
- `scripts/test-board-views.js` - Kanban/Table/Planner rendering and filter helper assertions.
- `scripts/test-archive.js` - Archive metadata, archive-browser data, restore flow, empty archived-list cleanup, and legacy archive fallback assertions.
- `scripts/test-due-notifications.js` - Due-notification assertions for task due item collection and notification body formatting.
- `scripts/test-external-published-calendar.js` - External Published Calendar assertions for ICS generation, completed-list skipping, checked-task skipping, and board opt-out.
- `scripts/test-import-trello.js` - Trello importer assertions for order, label reuse, archive routing, and metadata preservation.
- `scripts/test-import-obsidian.js` - Obsidian importer assertions for kanban/task/CardBoard cases, due conversion, and source-prefix naming.
- `scripts/test-task-list-parser.js` - Task checklist parser assertions (`completed/total` and task due-date extraction).
- `scripts/migrate-legacy-cards.js` - Bulk migration to YAML frontmatter format.
- `scripts/notarize.js` - electron-builder `afterSign` notarization hook.
- `scripts/verify-release-assets.js` - Release checklist validator for updater metadata/assets across macOS/Windows/Linux plus curated public-download guidance.
- `scripts/test-mcp-server.js` - MCP protocol smoke test across header + ndjson stdio transports, including trusted-root config/resolution coverage, archive tool coverage, card task metadata assertions, and import-tool coverage.
- `scripts/test-cli.js` - Node CLI smoke test covering list/card/archive flows, duplicate/template card commands, section/note edits, dry-run previews, plus Trello/Obsidian imports.
- `scripts/test-desktop-cli.js` - Packaged-shim-style Electron Node-mode CLI smoke test, including board creation and import command routing.

## Playwright tests (`tests/playwright/`)

- `tests/playwright/signboard-smoke.spec.js` - Electron UI smoke tests for board rendering, shortcuts, drag/drop behavior, modals, board switching, Planner overlay behavior, archive, settings, and imports.
- `tests/playwright/helpers/fixtureBoard.js` - Temporary board fixture builder used by the Playwright smoke suite.

## Static assets (`static/`)

- `static/styles.css` - App styling, layout, theme tokens, modal/editor styles, keyboard-only focus affordances, reduced-motion/forced-colors rules, and card drag placeholder visuals.
- `static/vendor/*.js|*.css` - Vendored third-party libs:
  - Marked
  - Turndown
  - SortableJS
  - Feather Icons
  - OverType
  - FDatepicker

## Build and packaging support

- `build/entitlements.mac.plist` - macOS hardened runtime entitlements.
- `dist/` - Build outputs and unpacked platform artifacts (generated).
- `board-settings.md` (runtime, per board folder) - Board settings frontmatter file for labels/color scheme/workflow/External Published Calendar inclusion data; legacy tooltip/notification fields are migrated to app settings and removed on rewrite.
- `app-settings.json` (runtime, Electron `userData`) - App-wide tooltip, notification, Quick Add global shortcut, and External Published Calendar preferences.

## Usually ignored for code tasks

- `node_modules/` - Installed dependencies.
- `dist/` - Generated binaries/installers.
- `static/vendor/` - External vendored source (edit only when updating vendored libs).

## Codex doc maintenance rule

- When behavior, architecture, or tooling changes, update agent docs in the same change set:
  - `CODEX.md`
  - `AGENTS.md`
  - `docs/codex/PROJECT_CONTEXT.md`
  - `docs/codex/FILE_STRUCTURE.md`

- When user-facing behavior, setup, or CLI flows change, update release-facing docs in the same change set:
  - `readme.md`
  - `docs/README.md`
  - `docs/using-signboard.md`
  - `docs/signboard-cli.md`
  - `MCP_README.md` (when MCP setup or behavior changes)
