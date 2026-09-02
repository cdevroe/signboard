# Signboard File Structure (Annotated)

This map focuses on source and operational files. Large generated/vendor folders are summarized.

## Top level

- `main.js` - Electron main process window + IPC handlers + trusted board-root/path validation + last-known open-board state persistence for MCP/CLI discovery + board and Omarchy theme filesystem watchers + system-resume forwarding for local-day refresh + opt-in localhost External Published Calendar server + native menu/accelerators + optional Quick Add global shortcut registration + Smart Card Action/Ollama model-list IPC + renderer context menus + archive/board/Obsidian/deep-link operations. Also owns GitHub-release auto-update flow, safe Pacman installation routing, and release-note formatting before native dialogs.
- `CODEX.md` - Canonical Codex-specific repo instructions and maintenance rules.
- `AGENTS.md` - Cross-tool compatibility entrypoint that points agents to `CODEX.md`.
- `DESIGN.md` - Design.md-compatible default theme tokens and visual rationale for Signboard's UI.
- `MCP_README.md` - Dedicated setup guide for Signboard MCP server mode (`--mcp-server`).
- `preload.js` - Thin renderer bridge (`window.board`, `window.chooser`, `window.electronAPI`) that forwards allowed operations to main-process IPC and main-process-triggered renderer events, including board switcher/view/settings/Quick Add/signboard-card-link/signboard-board-link/Omarchy-theme/system-resume events, clipboard text copy, Smart Card Actions, Ollama model inspection, archive browse/read/restore, board snapshot reads, board duplication, Obsidian actions, dropped-file path extraction for linked objects, and transactional card/list reorder plus top-of-list card move calls.
- `index.html` - App shell, header board tab strip/search/filter/Card controls, bottom Planner/Kanban/Table workspace dock, Planner overlay markup, fixed dismissible Sponsor pill, board-menu archive/switcher modal markup (including `#workspaceViewDock`, `#modalKeyboardShortcuts`, `#modalBoardSwitcher`, `#modalArchiveBrowser`, and `#modalObsidianVaultRequired`), and deferred script/style includes.
- `readme.md` - Human-facing project README.
- `docs/release-template.md` - Curated GitHub release-body template for public download links.
- `package.json` - Runtime/build scripts and dependencies.
- `package-lock.json` - NPM lockfile.
- `.gitignore` - Ignores `node_modules`, `dist`, `.env`, etc.
- `buildjs.sh` - Concatenate shared renderer schema and renderer modules into `app/signboard.js`.
- `electron-builder.json` - Build targets/artifact settings, including packaged `signboard://` URL-scheme registration.
- Linux build targets include native Arch/Omarchy `.pacman` packages in addition to AppImage, deb, and optional rpm artifacts.
- `LICENSE` - MIT license.
- `obsidian-plugin/` - Optional desktop-only Obsidian companion plugin source (`manifest.json`, self-contained `main.js`, helper/tested conversion/link/delete-cleanup utilities, styles, and plugin README) for opening/copying Signboard links, attaching active notes, asking before removing links to deleted notes, creating Signboard boards from folders, and handling `obsidian://signboard?...`.
- `skills/signboard-mcp/SKILL.md` - Optional agent skill instructions for safe/consistent Signboard MCP tool usage.
- `skills/signboard-mcp/agents/openai.yaml` - UI metadata for clients that support skill lists/chips.

## Renderer source (`app/`)

- `app/signboard.js` - Generated concatenated renderer file loaded by `index.html`.
- `app/utilities/santizeFileName.js` - Filename sanitization + random suffix helper.
- `app/utilities/taskList.js` - Task checklist parser, start/due marker helpers, all/open task date sets, task-summary counters, and task progress badge creation.
- `app/utilities/dueNotifications.js` - Due-notification collection + message formatting for card due dates and incomplete task due markers, skipping completed workflow lists.
- `app/utilities/accessibility.js` - Shared renderer accessibility helpers for modal focus restoration/trapping, background inert state, live status announcements, stable DOM IDs, reduced-motion checks, and deferring DOM mutations until native menu/select popup tracking settles on macOS.
- `app/utilities/cardDragTilt.js` - Shared card Sortable fallback options, frame-coalesced drag tilt, reduced-motion handling, and drag text-selection lock used by Kanban and temporal card drag/drop.
- `app/utilities/cardTimestamps.js` - Renderer card timestamp formatting helpers for editor metadata and Table age columns.
- `app/utilities/linkedObjects.js` - Shared renderer helpers for counting structured `linked_objects` and legacy `related` links, plus paperclip count badge creation for Kanban/Table.
- `app/appSettings.js` - Renderer app-settings state, app-wide General/Notifications/Smart Actions controls, drag-reorderable accordion Smart Card Action prompt/target rows, tooltip/notification/Quick Add global shortcut/AI assistance/External Published Calendar persistence scheduling, and one-time migration from legacy board settings; shared defaults/normalizers come from `shared/appSettingsSchema.js`.
- `app/board/boardLabels.js` - Board-label state, completed-list workflow settings, shared shortcut-label helpers, header filter UI (`Today` / `Overdue` / next-range date filters + label filters, with date filters ignoring completed task date markers and completed workflow lists), keyboard-operable card label popovers with inline label creation and Labels settings shortcut, new-card label selection helpers, Settings modal app/current-board panel nav, General board rename/move/duplicate controls, Obsidian Base generation controls, and Trello/Obsidian import panel wiring + summary rendering.
- `app/board/boardSearch.js` - Board search state, input handling for title/body filtering, and keyboard navigation from the search field through visible card results.
- `app/board/boardSnapshot.js` - Renderer adapter for batched `readBoardSnapshot` results, with fallback to legacy per-list/per-card reads for tests or older bridges.
- `app/board/boardViews.js` - Shared Kanban/Planner temporal helpers, bottom Planner/Kanban/Table workspace dock state, direct workspace view transitions, Kanban/Table board view state, Calendar/This Week layout helpers, temporal card placement by card start/due and open task start/due markers, and source-list/source-board pills on temporal cards.
- `app/board/tableView.js` - Board-scoped Table view rendering, dense row metadata including Start/Due, Created/Updated age columns, and linked-object counts, board filter/search reuse, Table list filter and sort controls, checkbox/shift-range bulk selection, bulk archive/move/label/date actions, and list-column card moves through the top-of-list move IPC path.
- `app/board/plannerView.js` - Workspace-level Planner overlay with Calendar, This Week, Day, and Agenda views across currently open boards, all/current/custom board scope controls, Planner-local search/date/completed-card/board/active-board-label filters, local-day cursor reconciliation that preserves browsed periods, keyboard navigation for Planner search/filter controls, bottom-dock open/close behavior, and Planner card opening that switches the active board when needed.
- `app/board/archiveBrowser.js` - Dedicated Archive modal UI, search-first archived card/list browsing with keyboard result navigation, detail-pane rendering, incremental result loading, and restore flows.
- `app/board/boardTabs.js` - Open-board tab session state (restore/add/close/reorder), last-known open/active board snapshot sync to main process, keyboard navigation/close behavior for visible tabs, responsive `N more` overflow for unbounded open boards, plus the shared safe board-switch helper used by tab clicks and the switcher.
- `app/board/boardSwitcher.js` - Quick board switcher overlay for `Cmd/Ctrl + K`, filtering and closing currently open boards and delegating selected board changes to the shared switch helper.
- `app/cards/createCardElement.js` - Card DOM rendering, compact start/due date metadata popover, task progress and linked-object badge display, list-item/card-title button semantics, and click behavior.
- `app/cards/processAddNewCard.js` - New card creation flow, including open-board targeting and optional create-and-open behavior.
- `app/cards/processAddNewList.js` - New list creation flow.
- `app/lists/listActionsPopover.js` - List action popover rendering for adding cards/lists, moving lists left/right, confirmed one-time due-date ordering, archiving cards/lists, keyboard option navigation, shortcut hints, and status announcements.
- `app/lists/createListElement.js` - List DOM rendering with labelled section/list semantics, sanitized rename, card DnD handling, returned-path in-place updates, and cross-list move lifecycle logging.
- `app/board/renderBoard.js` - Whole-board render using batched board snapshots, active Kanban/Table view dispatch, and Kanban list DnD handling through main-process transactional reorder.
- `app/board/openBoard.js` - Board open/init logic and starter content.
- `app/modals/closeAllModals.js` - Modal close logic + editor cleanup + conditional rerender + board interaction lock/unlock.
- `app/modals/toggleAddCardModal.js` - Add-card modal position/toggle.
- `app/modals/toggleAddListModal.js` - Add-list modal position/toggle.
- `app/modals/toggleAddCardToListModal.js` - Cross-list add-card modal toggle.
- `app/modals/toggleEditCardModal.js` - Card editor open/save/archive/duplicate logic, compact calendar-based card start/due metadata control, Created/Updated timestamp display, active-card top-of-list moves from the dropdown/directional controls, debounced + serialized saves, clean-editor reloads after external/MCP card edits, fresh duplicate lifecycle metadata, raw body URL detection/open controls, linked-object paperclip controls including inline URL/app-link entry, anchored Smart Card Action previews for title/summary/task-list/auto-label/smart-paste/due-date/attachment/custom/Quick output and read-only Question the Card answers plus a Smart Actions settings shortcut, Obsidian rename reconciliation between `linked_objects` and `related` wikilinks, missing-note status rendering with recreate/relink/remove actions, drag/drop local-file linking, Open With/Obsidian actions, and one task-line calendar control for start/due dates aligned from measured line coordinates.
- `app/listeners/window.js` - Keyboard shortcuts, menu/global-command listeners, Quick Add card modal wiring with board/list selection across open boards, workspace view switching, Planner toggle/view shortcut handling including all-open-board and current-board date-view scopes, Settings fallback handling, quick board switcher shortcut handling, color cycling, active-card move/archive shortcuts, active-editor closing for workspace-level shortcuts, and the `Cmd/Ctrl + /` helper modal behavior; keep `#modalKeyboardShortcuts` list in sync when adding/changing shortcuts.
- `app/init.js` - App bootstrap, folder picker handling, top-level event wiring, Obsidian-vault-required info modal controls, sponsorship modal triggers, external board-change auto-refresh sync, and the DST-safe local-day rollover lifecycle across midnight/focus/visibility/system-resume, including safe deferred board renders and open-editor date-status refreshes.
- `app/ui/theme.js` - Theme toggle + OverType theme integration, including opt-in Omarchy runtime palette application, Planner variables, atomic replacement events, and manual-toggle opt-out.
- `app/ui/tooltips.js` - Lightweight custom tooltip engine (event delegation + mutation observer) using existing element label attributes.

## Shared/library code

- `shared/appSettingsSchema.js` - Pure app-settings defaults and normalizers shared by the main process and renderer bundle; the single source for appearance source, built-in Smart Card Action prompts, targets, and saved action order normalization.
- `shared/localDate.js` - Main/renderer shared local calendar-date formatting, strict local ISO-date parsing, and DST-safe next-local-midnight delay helpers.
- `lib/atomicFile.js` - Shared durable write helper that writes to a same-directory temp file, fsyncs, renames into place, and best-effort fsyncs the containing directory.
- `lib/boardSnapshot.js` - Main-process batched board reader used by renderer Kanban/Table/Planner views; returns list/card records, opt-in timestamps/task metadata/board settings, and per-card/list read errors.
- `lib/cardFrontmatter.js` - Card parse/normalize/read/write/update with legacy support, including `start` and `due` date normalization.
- `lib/cardLifecycle.js` - Shared card lifecycle metadata helper for `createdAt`, compact `activity` trails, archive frontmatter state, and moved/restored transitions.
- `lib/cardTimestamps.js` - Shared timestamp resolver for desktop reads, CLI card records/JSON output, and MCP card responses, preferring frontmatter/activity creation data and filesystem modification data.
- `lib/updateReleaseNotes.js` - Pure GitHub release-note extraction and HTML/Markdown-to-plain-text normalization for native updater dialogs, including entity decoding, link/markup removal, Downloads-section stripping, and post-normalization truncation.
- `lib/updateErrors.js` - Testable updater-error classification and native-dialog copy, including package-specific Ubuntu and Arch/Omarchy failures and invalid-download recovery.
- `lib/linuxPackageInstaller.js` - Safe Arch package validation/installation helper using `pacman -Qp` then `pkexec pacman -U`, deliberately without `pacman -Sy` fallback.
- `lib/omarchyTheme.js` - Canonical Omarchy active-theme path resolution, restricted TOML palette parsing, contrast-safe token derivation, and read status.
- `lib/releaseArtifactValidation.js` - Debian/ar and Pacman archive recognition, minimum release-artifact sizing, and SHA-512 helpers shared by runtime download checks and release validation.
- `lib/cardOrdering.js` - Shared transactional ordering helpers used by main-process/MCP restore and move flows to insert a card at the top, reorder cards in a list, perform stable due-date ordering, and reorder list directories while staging only changed entries and rolling back on failures.
- `lib/archive.js` - Archive/archive-list filesystem operations plus archive listing/detail/restore helpers and legacy archive fallback handling.
- `lib/boardLabels.js` - Board-level label/theme/workflow/External Published Calendar inclusion settings read/write/defaults/filter helpers (`board-settings.md`) plus legacy app-setting extraction for migration.
- `lib/boardDuplication.js` - Board folder duplication helper used by desktop Settings; copies board contents, assigns fresh copied-card IDs, refreshes copied Signboard metadata, rewrites internal `signboard://open-card` references, rewrites copied local linked-object paths, and resets copied managed Base state.
- `lib/appSettings.js` - App-wide tooltip/notification/appearance-source/Quick Add global shortcut/AI assistance and External Published Calendar JSON persistence under Electron `userData`, delegating defaults and normalization to `shared/appSettingsSchema.js`.
- `lib/aiTaskSuggestions.js` - Ollama `/api/tags` model-list inspection, chat request construction, response parsing, Smart Card Action output parsing including label references, due dates, linked-object attachment suggestions, read-only card-question answers, checklist task cleanup, and card-context prompt helpers for Card Editor Smart Card Actions.
- `lib/externalPublishedCalendar.js` - External Published Calendar event collection and iCalendar feed generation for card due dates and incomplete task due markers.
- `lib/obsidianIntegration.js` - Obsidian URI and Signboard deep-link helpers, flat card property normalization, Obsidian vault discovery, managed generated `Signboard Board.base` files with hash-based user-edit protection, linked-note creation/recreation, and linked-note wikilink resolution.
- `lib/importers/index.js` - Export surface for board importers.
- `lib/importers/shared.js` - Shared importer helpers for list/card creation, label reuse/creation, metadata section building, and markdown source discovery.
- `lib/importers/trello.js` - Trello JSON importer.
- `lib/importers/obsidian.js` - Obsidian importer covering `obsidian-kanban`, generic task scopes, and CardBoard snapshot imports.
- `lib/cardBodyEdits.js` - Shared Markdown body-edit helpers for replacing heading sections, inserting text below headings, and appending timestamped note list items.
- `lib/boardCreation.js` - Shared default board scaffolding for MCP and CLI-created boards, including default list folders and a starter card with normalized flat Signboard/Obsidian metadata.
- `lib/boardDiscovery.js` - Shared known-board discovery for MCP and CLI, including desktop trusted-root reads, last-known desktop open-board state reads, board-looking folder detection, and bounded allowed-root scans.
- `lib/mcpServer.js` - Headless MCP stdio server for agent access to board/list/card/settings/archive operations inside configured or desktop-trusted roots, safe board discovery/creation, archive browse/read/restore tools, Trello/Obsidian/Tasks.md imports, dry-run card writes, and timestamp/task metadata on card tools.
- `lib/cliApp.js` - CLI command parsing/output for `use`, `boards`, `lists`, `cards`, `archive`, `settings`, and path-based `import` commands, including board discovery/creation, card duplicate/template commands, `--start` writes, section/note card edits, dry-run previews, JSON timestamp/date output, and `--task-status open|any` for card due filtering.
- `lib/cliBoard.js` - CLI list/card filesystem operations, record loading, card duplication/template creation, section/note body edits, explicit label clearing, flat Signboard/Obsidian metadata normalization on create/edit/move writes, due/search/label filtering, start/task-date metadata output, and created/updated age sorting; overdue task filtering defaults to incomplete/open task markers unless callers pass `--task-status any`.
- `lib/cliInstall.js` - User-level CLI shim + shell profile installation; packaged shims run `app.asar/bin/signboard.js` under `ELECTRON_RUN_AS_NODE` instead of launching the desktop lifecycle.

## Scripts (`scripts/`)

- `scripts/test-frontmatter.js` - Node assertions for frontmatter behavior.
- `scripts/test-card-ordering.js` - Node assertions for transactional card/list reordering, stable due-date ordering, task-date fallback, rollback, and unchanged-entry avoidance.
- `scripts/test-board-labels.js` - Node assertions for board label settings defaults/migration/filter logic.
- `scripts/test-board-snapshot.js` - Node assertions for batched board snapshot list/card reads, task metadata, timestamps, board settings, and archive inclusion behavior.
- `scripts/test-board-duplication.js` - Node assertions for board folder duplication, copied-card ID refresh, internal Signboard link rewrites, linked-object path rewrites, and copied managed Base reset behavior.
- `scripts/test-app-settings.js` - Node assertions for app-wide settings persistence, including appearance/Omarchy source and AI settings, and one-time board-settings migration.
- `scripts/test-ai-task-suggestions.js` - Node assertions for Ollama model-list/chat request construction, Smart Card Action output parsing including label references, due dates, attachments, answers, and AI checklist suggestion cleanup without live network calls.
- `scripts/test-board-card-metadata.js` - Board card metadata rendering assertions (compact start/due ranges, labels, task badge behavior).
- `scripts/test-board-views.js` - Kanban/Table/Planner rendering and filter helper assertions.
- `scripts/test-card-timestamps.js` - Card timestamp normalization assertions for frontmatter, activity, and filesystem fallback behavior.
- `scripts/test-local-date.js` - Shared local-date parsing/formatting and ordinary/spring-forward/fall-back rollover timing assertions.
- `scripts/test-update-release-notes.js` - Windows-style GitHub HTML, Markdown, encoded markup, entity decoding, Downloads stripping, custom-tag/script removal, array metadata, fallback, and truncation coverage for updater dialog notes.
- `scripts/test-update-errors.js` - Linux package-manager and generic updater error presentation assertions.
- `scripts/test-linux-package-installer.js` - Pacman query/install command assertions, including protection against `pacman -Sy` fallback.
- `scripts/test-omarchy-theme.js` - Omarchy path, palette parsing, malformed input, platform no-op, and active-theme replacement assertions.
- `scripts/test-release-artifact-validation.js` - Valid, malformed, incomplete, and file-backed Debian/Pacman archive inspection assertions.
- `scripts/test-archive.js` - Archive metadata, archive-browser data, restore flow, empty archived-list cleanup, and legacy archive fallback assertions.
- `scripts/test-due-notifications.js` - Due-notification assertions for task due item collection and notification body formatting.
- `scripts/test-external-published-calendar.js` - External Published Calendar assertions for ICS generation, completed-list skipping, checked-task skipping, and board opt-out.
- `scripts/test-import-trello.js` - Trello importer assertions for order, label reuse, archive routing, and metadata preservation.
- `scripts/test-import-obsidian.js` - Obsidian importer assertions for kanban/task/CardBoard cases, due conversion, and source-prefix naming.
- `scripts/test-obsidian-integration.js` - Obsidian outbound integration assertions for URI/deep-link helpers, flat card properties, managed generated Bases YAML, linked notes, and linked-note resolution.
- `scripts/test-obsidian-plugin.js` - Pure helper assertions for the optional Obsidian companion plugin.
- `scripts/test-task-list-parser.js` - Task checklist parser assertions (`completed/total` and task start/due date extraction).
- `scripts/migrate-legacy-cards.js` - Bulk migration to YAML frontmatter format.
- `scripts/notarize.js` - electron-builder `afterSign` notarization hook.
- `scripts/verify-release-assets.js` - Release checklist validator for updater metadata/assets across macOS/Windows/Linux, including artifact size, Debian/Pacman structure, packaged protocol registration, metadata size/SHA-512 integrity, and curated public-download guidance.
- `scripts/test-mcp-server.js` - MCP protocol smoke test across header + ndjson stdio transports, including board discovery, trusted-root config/resolution coverage, archive tool coverage, card task metadata assertions, import-tool coverage, and MCP documentation inventory parity.
- `scripts/test-cli.js` - Node CLI smoke test covering board discovery, list/card/archive flows, duplicate/template card commands, Signboard/Obsidian metadata normalization and legacy-card repair, section/note edits, dry-run previews, plus Trello/Obsidian imports.
- `scripts/test-desktop-cli.js` - Packaged-shim-style Electron Node-mode CLI smoke test, including board creation and import command routing.

## Playwright tests (`tests/playwright/`)

- `tests/playwright/signboard-smoke.spec.js` - Electron UI smoke tests for board rendering, shortcuts, drag/drop behavior, modals, board switching, Planner overlay behavior, archive, settings, and imports. The suite avoids explicit `page.bringToFront()` by default; set `SIGNBOARD_PLAYWRIGHT_FOREGROUND=1` for foreground debugging.
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
- `app-settings.json` (runtime, Electron `userData`) - App-wide tooltip, notification, Quick Add global shortcut, AI assistance, and External Published Calendar preferences.

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
