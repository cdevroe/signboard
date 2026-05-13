# Signboard Project Context

## What this app is
Signboard is a local-first board app built with Electron and plain JavaScript. Boards render as Kanban; Calendar, This Week, Day, and Agenda dated workflows live in the workspace-level Planner overlay.

- A board is a folder on disk.
- Lists are subdirectories inside that board folder.
- Cards are Markdown files in each list directory.
- Board-level settings are stored in `board-settings.md` at the board root, including labels, color scheme data, and completed-list workflow rules.
- App-level tooltip and notification settings are stored in `app-settings.json` under Electron `userData`.
- Card metadata is stored in YAML frontmatter (with legacy parser support).
- Task checklist lines in card bodies can store task due markers with `(due: YYYY-MM-DD)`.

## Runtime Architecture

### Main Process
File: `main.js`

- Creates a single `BrowserWindow` and loads `index.html`.
- Supports a headless MCP server mode when launched with `--mcp-server` (no window created).
- Supports `--mcp-config` mode to print MCP client config JSON and exit.
- MCP board-scoped tools use the union of `SIGNBOARD_MCP_ALLOWED_ROOTS` and the desktop app's trusted board roots from `trusted-board-roots.json`; with neither source configured, only non-board config/listing tools are usable.
- MCP board-name resolution searches within allowed roots and also matches an allowed root directory itself, so a trusted board root can be either a parent folder or the board folder.
- Registers IPC handler `choose-directory` to open native folder picker.
- Registers IPC handler `pick-import-sources` to open native file/directory pickers for Trello JSON and Obsidian markdown/vault sources.
- Registers IPC handler `check-for-updates` for renderer-triggered manual update checks.
- Builds a native app menu with a `Check for Updates...` action.
- Help menu includes `Copy MCP Config` to copy a ready-to-paste Signboard MCP JSON snippet.
- In unpackaged/dev mode, Help menu includes `Preview Update Available...` and `Preview Update Ready...` to test updater dialogs without downloading/installing.
- Uses `electron-updater` against GitHub Releases for automatic and manual update checks.
- Handles renderer freeze/crash resilience with an unresponsive recovery dialog and renderer crash auto-recreate.
- Shows native update dialogs with release notes, changelog links, remind-later, and install/relaunch actions.
- Persists remind-later per version in `update-preferences.json` under Electron `userData`.
- Uses `preload.js` as a thin renderer bridge into main-process IPC.
- Owns renderer right-click text editing context menus through the `webContents` `context-menu` event, covering editable fields such as the card title and OverType notes editor.
- Owns trusted board-root persistence, board path validation, and external board filesystem watchers.
- Owns explicit board import operations for Trello, Obsidian, and Tasks.md; renderer code passes tokenized selections and the main process performs all external file reads and board writes.
- Owns archive browse/read/restore operations through `lib/archive.js`; renderer code never scans or restores archive contents directly.
- Owns adjacent-card top-of-list moves through `moveCardToTop`, backed by `lib/cardOrdering.js`.
- In MCP mode, starts `lib/mcpServer.js`, passes desktop trusted board roots into it, and communicates over stdio using MCP JSON-RPC framing.
- MCP stdio transport supports both `Content-Length` framing and newline-delimited JSON-RPC for client compatibility.
- Source checkouts also expose a Node CLI at `bin/signboard.js` for direct terminal list/card/archive management.
- The packaged Electron executable also routes `lists ...`, `cards ...`, `archive ...`, `settings ...`, and `import ...` CLI invocations through `main.js` without opening the desktop window.
- Help menu includes `Install Signboard CLI` on macOS/Linux, which installs a per-user shim and PATH profile block for the packaged app executable.
- Security-related window settings are:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`

### Preload Bridge
File: `preload.js`

- Exposes `window.board`, `window.chooser`, and `window.electronAPI`.
- `window.electronAPI` includes external-link opening, manual update checks, app settings reads/writes, and one-time migration from legacy board-level tooltip/notification settings.
- Proxies board operations to `main.js` over `ipcRenderer.invoke(...)`.
- Does not use Node filesystem APIs directly.
- Archive browsing uses preload bridge methods (`listArchiveEntries`, `readArchiveEntry`, `restoreArchivedCard`, `restoreArchivedList`) backed by the same trusted-board gate as normal board operations.
- Adjacent-card moves from renderer shortcuts use preload method `moveCardToTop`, which validates source/target paths in `main.js` and inserts the card at the top of the target list through `lib/cardOrdering.js`.
- `window.chooser.pickImportSources(...)` returns tokenized external file/directory selections for import flows, and `window.board.importTrello(...)` / `window.board.importObsidian(...)` / `window.board.importTasksMd(...)` invoke the main-process importers.
- Still exposes board watch helpers (`startBoardWatch`, `stopBoardWatch`, `getBoardWatchToken`), but the watcher implementation now lives in `main.js`.

### Renderer
Files: `index.html`, `app/signboard.js` (generated), source modules in `app/**`

- UI is vanilla HTML/CSS/JS.
- `index.html` loads vendored libraries and `app/signboard.js` with `defer`.
- The left-edge Planner rail and overlay markup live in `index.html`; Planner covers the board header/tabs while open and is hidden when no boards are open.
- `app/signboard.js` is concatenated from source modules by `buildjs.sh`.
- Settings includes app-level tooltip/notification controls and board-specific General, Workflow, Labels, Colors, and Import sections, with import summary/warning rendering in the existing settings modal.
- The Board menu now opens a dedicated Archive browser modal; Archive remains hidden from normal board rendering and is not a fourth board view.
- The quick board switcher is a top-center renderer overlay opened with `Cmd/Ctrl + K`; it searches currently open board tabs only and switches through the same safe board transition helper as tab clicks.

## Data Model and Naming Conventions

### Board
- `window.boardRoot` is the absolute board path with trailing slash.
- Open board tabs are persisted in `localStorage.openBoardPaths`.
- Active board root is persisted in `localStorage.activeBoardPath` and mirrored in legacy `localStorage.boardPath` for backward compatibility.
- `board-settings.md` is auto-created with default label definitions when missing; legacy tooltip/notification keys are read for app-settings migration and removed on rewrite.
- Imports are additive only: they create new lists/cards in the current board and never modify external source files.

### List directories
- Pattern: `NNN-<list-name>-<suffix>`
- Default starter lists use suffix `-stock`.
- Archive list is always `XXX-Archive` and hidden from normal board rendering.

### Card files
- Pattern: `NNN-<slug>-<rand5>.md`
- File content format written by app:
  - YAML frontmatter (`title`, optional `due`, optional `labels`, unknown keys preserved)
  - Markdown body
- Card `labels` frontmatter stores board label ids (e.g. `labels: ["label-1"]`).
- New cards created through current app flows now also carry:
  - `createdAt` (ISO timestamp)
  - `activity` (compact lifecycle entries only: `created`, `moved-list`, `archived`, `restored`)
- Archived cards temporarily carry an `archive` object in frontmatter while they remain archived:
  - `archivedAt`
  - `originalListDirectoryName`
  - `originalListDisplayName`
  - `archiveContainerType` (`standalone-card` or `archived-list`)

### Archived list metadata
- Archived list directories may contain a hidden sidecar file: `.signboard-archive.json`
- The sidecar stores only lightweight recovery metadata:
  - original list directory/display name
  - archived timestamp
  - compact list lifecycle activity
- Restored lists keep that sidecar so future archive/restore cycles retain lightweight history without a full event log.

### Task checklist lines (in card body markdown)

- Checkbox items are parsed from markdown list entries such as:
  - `- [ ]`
  - `- [x]`, `- [X]`
  - spaced variants like `- [x ]`, `- [ x]`, `- [ x ]`
- Task due marker syntax is recognized only at the start of task content:
  - `(due: YYYY-MM-DD)`
- Task list summary is always computed as:
  - `completed/total` where `total` includes completed and incomplete checklist items.

## Core User Flows (Where the behavior lives)

### App init and board open
- `app/init.js`:
  - Initializes board tab controls in the header.
  - Restores previous board tab session from localStorage.
  - Re-authorizes restored boards through the main-process trusted-board gate before rendering.
  - Hooks global click handling and top-level modal triggers.
  - Initializes board label toolbar/settings controls.
  - Initializes board search input for live filtering.
  - Initializes app settings, including one-time migration from the left-most open board's legacy settings values.
  - Initializes Planner controls for the left rail, overlay, Planner search/filter popover, and Planner view tabs.
  - Runs an external-change sync loop that watches active board files, re-renders after external updates (for example MCP card moves), and refreshes an unchanged open card editor after external/MCP card edits.
  - Calls directory chooser and `openBoard`.
- `app/board/boardTabs.js`:
  - Manages board tabs (add/open/close/reorder + active tab persistence).
  - Provides the shared safe board-switch helper used by both board tabs and the quick switcher.
- `app/board/openBoard.js`:
  - Creates starter lists/cards when board folder is empty.
  - Sets `window.boardRoot` and renders only the active board.
  - Uses `Open Board` for the folder picker label.
  - No longer performs any implicit Trello import during board open; imports are settings-driven only.

### Rendering board/lists/cards
- `app/board/renderBoard.js`:
  - Reads list metadata and renders Kanban columns.
  - Enables list drag-and-drop reorder in Kanban.
  - Fetches each list's card names concurrently for faster initial render.
  - Loads board label definitions and temporary filter state before rendering cards.
- `app/board/archiveBrowser.js`:
  - Opens the dedicated Archive modal from the Board menu.
  - Lists archived cards and archived lists with search-first filtering, incremental result rendering, and a detail pane.
  - Reads archive entry detail lazily over preload IPC.
  - Restores cards through an explicit destination-list picker and restores archived lists back into the board root with rename-on-collision handling.
- `app/board/boardSwitcher.js`:
  - Opens the `Cmd/Ctrl + K` board switcher overlay.
  - Filters currently open boards by visible board name, highlights autocomplete results, and delegates switching to the shared board switch helper.
- `app/board/boardViews.js`:
  - Owns shared Kanban/Planner temporal helpers such as calendar math, week math, card collection, task due-date placement, and temporal card rendering.
  - Board-facing view state normalizes to Kanban only.
  - Shows task progress badges and source-list/source-board pills on temporal cards, tinting source-board pills from each board's color scheme when available.
- `app/board/plannerView.js`:
  - Owns the workspace Planner overlay opened from the left rail or `Cmd/Ctrl + Shift + P`.
  - Scopes Planner data to currently open board tabs only and defaults to all open boards.
  - Offers quick `All Boards` and `Current Board` scope controls plus custom board selection in the filter menu.
  - Renders Planner Calendar, This Week, Day, and Agenda views from card due dates and task-level due markers.
  - Uses Planner-local search plus `Today` / `Overdue`, completed-card visibility, and open-board filters; label filters appear only when scoped to the active board.
  - Hides cards from completed workflow lists by default while preserving their due-date metadata; the Planner filter menu can show completed dated cards when needed.
  - Opens Planner cards through the normal editor, switching the active board behind the overlay first when the card belongs to a different board.
  - Keeps Planner on the default Signboard palette for the active light/dark mode instead of inheriting the active board color scheme, while tinting card source pills from their source board color schemes.
- `app/lists/createListElement.js`:
  - Builds list UI, add-card button, list rename behavior.
  - Enables card drag-and-drop reorder and cross-list move.
  - Uses shared Sortable card drag options from `app/utilities/cardDragTilt.js`; the visible ghost placeholder is an empty drop slot rather than a readable duplicate card.
  - Sanitizes list names before filesystem rename.
  - Builds card DOM for a list concurrently to reduce list render time.
  - Records `moved-list` lifecycle events only for real cross-list card moves, not same-list reindexing.
- `app/cards/createCardElement.js`:
  - Reads card frontmatter/body preview.
  - Computes task summary + task due dates from card body checklist lines.
  - Shows task progress badge on board cards.
  - Shows label chips and a tag-icon picker on each card.
  - Hides cards that do not match the active label filter or search query.
  - Opens edit modal on click.
- `app/board/boardLabels.js`:
  - Owns board label state in the renderer.
  - Renders the header filter dropdown with mutually exclusive `Today` / `Overdue` date filters plus multi-select OR label filters.
  - Combines date filters, label filters, and board search with AND logic when determining visibility.
  - Owns board workflow settings for completed-list auto-detection, ignored auto-detected lists, and manual completed-list selection.
  - Keeps filter state temporary only; opening or switching boards resets the active date + label filters.
  - Keeps the filter toolbar button icon-only and applies an accent-tinted active state when any filter is set; active summary text lives in tooltip/ARIA copy.
  - Handles card label popovers, Settings modal board panels, and the board import UI/actions.
  - Persists board labels through preload APIs.
- `app/board/boardSearch.js`:
  - Stores the current search query/tokens.
  - Debounces live search renders for title/body filtering.

### Add/edit card and list
- `app/cards/processAddNewCard.js` and `app/cards/processAddNewList.js`:
  - Generate numbered filenames/directories and create on disk.
  - New-card modal submissions can request opening the created card immediately with the notes field focused, used by `Shift + Enter` from either add-card modal.
- `app/modals/toggleEditCardModal.js`:
  - Loads card into OverType editor.
  - Saves title/body/frontmatter through `window.board.writeCard`.
  - Debounces editor body writes and serializes save order to prevent stale overwrite races.
  - Tracks the clean on-disk editor state so external/MCP updates can reload an open card editor when the user has no local edits in progress.
  - Relies on the main-process renderer context menu for native right-click cut/copy/paste/select-all in editable title/body fields.
  - Moves active cards to selected/adjacent lists from the list dropdown, arrow action, and keyboard shortcuts by calling the main-process `moveCardToTop` IPC path, which inserts at the top of the destination list.
  - Renders task-line due-date controls at the start of each parsed checklist line in the editor.
  - Uses measured textarea line-start coordinates for control placement so wrapped lines do not drift button positions.
  - Handles due date picker, labels picker, duplicate, and archive actions.
  - Card duplication now resets archive/lifecycle fields and seeds a fresh `created` event.
- `app/utilities/taskList.js`:
  - Parses checklist items from card markdown body.
  - Computes task summary (`total`, `completed`, `remaining`) and task due-date sets.
  - Creates task progress badge elements and updates task-line due markers by line index.
- `app/utilities/dueNotifications.js`:
  - Collects due items from both card-level due dates and incomplete task-level due markers, skipping cards in completed workflow lists.
  - Builds notification body text that includes board/card title and task summary text for task due items.
- `app/utilities/cardDragTilt.js`:
  - Centralizes card Sortable fallback options, drag tilt, and text-selection locking for Kanban and temporal card drag/drop.
  - Pairs with `static/styles.css` ghost styles so drag placeholders show an empty insertion slot while the dragged fallback clone remains the only readable card.
- `app/modals/*.js` and `app/modals/closeAllModals.js`:
  - Modal open/close, cleanup, and board rerender.
  - Disables board interaction (click/drag/select) while edit modal is open.
  - Re-renders board only when needed (instead of every modal close).

### Keyboard shortcuts
- `app/listeners/window.js`:
  - `Cmd/Ctrl + /`: open the keyboard shortcuts helper modal.
  - `Cmd/Ctrl + K`: open/toggle the quick board switcher from any screen.
  - `Esc`: close modals.
  - `Cmd/Ctrl + N`: add card (with list picker modal).
  - `Cmd/Ctrl + Shift + N`: add list.
  - `Cmd/Ctrl + 1`: return to Kanban and close Planner if it is open.
  - `Cmd/Ctrl + 2`: open Planner Calendar from the board, or switch to Calendar inside Planner.
  - `Cmd/Ctrl + 3`: open Planner This Week from the board, or switch to This Week inside Planner.
  - `Cmd/Ctrl + Shift + P`: open/close Planner.
  - While Planner is open, `Cmd/Ctrl + 4` switches Planner Day and `Cmd/Ctrl + 5` switches Planner Agenda.
  - `Cmd/Ctrl + ,`: open Settings from renderer key handling and the native menu accelerator.
  - `Cmd/Ctrl + Shift + D`: toggle light/dark mode through the native menu accelerator.
  - `Cmd + Control + Shift + C` on macOS / `Ctrl + Alt + Shift + C` elsewhere: cycle board color schemes without closing the active screen.
  - `Cmd/Ctrl + Shift + [` and `Cmd/Ctrl + Shift + ]`: move the open card to the previous/next list, no-op at board edges.
  - `Cmd/Ctrl + Option/Alt + Shift + Backspace`: archive the open card.
  - `Cmd/Ctrl + Shift + A`: open the Archive browser modal.
  - Workspace-level shortcuts close the active card editor before changing context; editor-scoped move/archive shortcuts keep acting on the open card.
  - Any shortcut changes must update the helper list in `index.html` (`#modalKeyboardShortcuts`) in the same change.
- View-switcher rows and list-action rows surface the same shortcut hints in subtle monospace text so the app teaches the keyboard path inline.
- Board date filtering treats overdue task markers and completed workflow lists as actionable work only: completed task due markers and completed-list cards do not keep a card visible in date filters, but overdue card-level due dates still do on actionable lists.

### Theme support
- `app/ui/theme.js`:
  - Toggles `document.documentElement.dataset.theme`.
  - Persists theme to localStorage.
  - Updates OverType theme to match app theme.
  - Renders the board-menu theme action label, shortcut hint, and accessible shortcut metadata.
- `DESIGN.md` documents the default Signboard theme as Design.md-compatible tokens plus rationale; consult it before changing default palette, typography, spacing, shape, elevation, or core component styling.
- `app/ui/tooltips.js`:
  - Provides custom app-styled tooltips for primary controls without third-party dependencies.
  - Sources tooltip text from existing control labels (`title`, `aria-label`, `alt`) and keeps styling aligned with board palette CSS variables.
  - Uses delegated listeners + a MutationObserver so dynamic controls receive tooltips automatically.

## Frontmatter System
File: `lib/cardFrontmatter.js`

- Supports parsing:
  - YAML frontmatter cards (`---` blocks)
  - Legacy delimiter format (`**********`)
  - Legacy heading-only format (`# Title` first line)
- Normalizes metadata:
  - `Title` -> `title`
  - `Due-date` -> `due`
  - `Labels` -> `labels`
- Standardizes due date to `YYYY-MM-DD` when possible.
- Ensures deterministic write order:
  1) `title`
  2) optional `due`
  3) optional `labels` (non-empty only)
  4) other keys sorted alphabetically

File: `lib/cardLifecycle.js`

- Shared lifecycle helper for:
  - `createdAt` seeding on new cards
  - compact `activity` entry creation
  - temporary archive frontmatter state
  - `moved-list` / `archived` / `restored` card metadata transitions

File: `lib/cardBodyEdits.js`

- Shared card-body helper for Markdown section replacement, insertion below headings, and timestamped note list items used by CLI and MCP card writes.

File: `lib/archive.js`

- Owns archive/archive-list filesystem operations plus archive browsing and restore.
- Lists both standalone archived cards and cards nested inside archived lists.
- Restores archived cards to the top of an explicit destination list.
- Restores whole archived lists back into the board root and updates each card's archive lifecycle metadata.
- Cleans up empty archived-list containers automatically when the last card is extracted.
- Falls back gracefully for legacy archived cards/lists that predate archive metadata.

File: `lib/boardLabels.js`

- Reads/writes board label definitions in `board-settings.md`.
- Creates default labels when settings are missing.
- Migrates legacy `labels.md` reads into `board-settings.md`.
- Normalizes completed-list workflow settings under `workflow`, defaulting auto-detection on for common list names while preserving manual completed and ignored-list overrides.
- Exposes OR-based label filtering helper logic.

## Importers
Files: `lib/importers/*`

- `lib/importers/trello.js` imports Trello board JSON into Signboard lists/cards, preserving labels, checklists, comments, attachments, due dates, and archive routing for closed Trello content.
- `lib/importers/obsidian.js` imports:
  - markdown-backed `obsidian-kanban` boards
  - generic task-based Obsidian markdown scopes
  - CardBoard vault snapshots when `.obsidian/plugins/card-board/data.json` is available
- `lib/importers/shared.js` owns list/card creation helpers, label reconciliation, import summaries, markdown metadata sections, and recursive markdown file discovery.

## Tooling, Build, and Test

### Run locally
- `npm start`

### Run CLI locally
- `npm run cli -- <command>`
- `node bin/signboard.js <command>`
- `electron . <command>` routes through the desktop executable path used by packaged builds.
- CLI board selection is stateful: `signboard use /path/to/board`, then `signboard lists`, `signboard cards`, `signboard archive ...`, `signboard settings`, or `signboard import ...`.
- Import commands:
  - `signboard import trello --file /absolute/or/relative/export.json [--board <path>] [--json]`
  - `signboard import obsidian --source /path/to/file-or-dir [--source /another/path] [--board <path>] [--json]`
  - `signboard import tasksmd --source /path/to/tasks-project [--board <path>] [--json]`
- Archive commands:
  - `signboard archive cards [--search <query>] [--board <path>] [--json]`
  - `signboard archive lists [--search <query>] [--board <path>] [--json]`
  - `signboard archive read --kind card|list --entry <ref> [--board <path>] [--json]`
  - `signboard archive restore-card --card <ref> --to-list <list-ref> [--board <path>] [--json]`
  - `signboard archive restore-list --list <ref> [--as <directory-name>] [--board <path>] [--json]`
- Card write helpers:
  - `signboard cards duplicate --card <ref> [--list <target-list>] [--dry-run] [--json]`
  - `signboard cards create --from-card <ref> --list <target-list> [--title <title>] [--json]`
  - `signboard cards edit --card <ref> --replace-section <heading> --body-file <path>`
  - `signboard cards edit --card <ref> --insert-after-heading <heading> --text <text>`
  - `signboard cards notes add --card <ref> --text <text> [--timestamp]`

### Run MCP server locally
- `npm run mcp:server`

### Print MCP config locally
- `npm run mcp:config`

### Rebuild renderer bundle after module edits
- `./buildjs.sh`
- Concatenates module files into `app/signboard.js` in strict order.

### CLI internals
- `lib/cliBoard.js` owns CLI board/list/card filesystem operations, including due filtering with `--due-source any|card|task`, `--task-status open|any`, card duplication/template creation, targeted Markdown section edits, timestamped notes, explicit label clearing, and card write dry-run payloads.
- `lib/taskList.js` exposes shared task parsing and due-date helpers for CLI filtering.
- `lib/cliApp.js` owns shared command parsing/output used by both the Node shim and Electron executable, including archive listing/read/restore flows, card write previews, and path-based Trello/Obsidian/Tasks.md imports.
- `lib/cliInstall.js` owns user-level CLI shim + shell profile installation.
- `lib/cliState.js` persists the currently selected board for subsequent CLI commands.

CLI overdue behavior:
- `signboard cards --due overdue` now defaults task-derived matches to open/incomplete tasks only, aligning with the desktop overdue filter.
- Pass `--task-status any` to include completed task due markers again.

### Frontmatter tests
- `npm run test:frontmatter`
- Script: `scripts/test-frontmatter.js`

### Board label tests
- `npm run test:board-labels`
- Script: `scripts/test-board-labels.js`

### Importer tests
- `npm run test:import-trello`
- `npm run test:import-obsidian`
- Scripts: `scripts/test-import-trello.js`, `scripts/test-import-obsidian.js`

### MCP smoke test
- `npm run test:mcp`
- Script: `scripts/test-mcp-server.js`
- Asserts card tool outputs include `taskSummary` + `taskDueDates`, verifies trusted-root config and board-name resolution, verifies archive browse/read/restore tools, and covers Trello/Obsidian/Tasks.md import tools.

### CLI smoke test
- `npm run test:cli`
- Script: `scripts/test-cli.js`
- Covers list creation/rename, card create/edit/read/filter flows, duplicate/template card writes, section edits, timestamped notes, dry-run previews, archive list/read/restore flows, and Trello/Obsidian/Tasks.md imports.

### Archive tests
- `node scripts/test-archive.js`
- Covers archive metadata, archive-browser listing data, restore flows, empty archived-list cleanup, and legacy archive fallbacks.

### Desktop CLI smoke test
- `npm run test:desktop-cli`
- Script: `scripts/test-desktop-cli.js`
- Verifies Electron executable CLI dispatch without opening the UI, including import command routing.

### CLI installer test
- `npm run test:cli-install`
- Script: `scripts/test-cli-install.js`
- Verifies shim creation plus shell profile PATH updates for zsh/fish installs.

### Task list parser tests
- `npm run test:task-list`
- Script: `scripts/test-task-list-parser.js`
- Covers checklist completion variants and task due-date extraction.

### Due notification tests
- `npm run test:due-notifications`
- Script: `scripts/test-due-notifications.js`
- Covers task due-date notification collection and card/task notification body formatting.

### App settings tests
- `npm run test:app-settings`
- Script: `scripts/test-app-settings.js`
- Covers app-wide tooltip/notification settings persistence and one-time migration from legacy board settings.

### Legacy migration
- `npm run migrate:legacy-cards -- <board-root> [--dry-run] [--include-plain]`
- Script: `scripts/migrate-legacy-cards.js`

### Packaging
- Electron Builder config in `package.json` and `electron-builder.json`.
- macOS notarization hook: `scripts/notarize.js` (env vars from `.env`).
- Release validation script: `scripts/verify-release-assets.js` (`npm run release:verify`) checks cross-platform updater assets and metadata naming.
- Standard public releases should promote macOS universal, a single Windows installer, and Linux `x64`/`ARM64` `AppImage` + `deb` downloads; use `docs/release-template.md` for the curated GitHub release body.
- The in-app update dialog reads GitHub release notes and strips a `## Downloads` section before rendering, so curated download links can live in release bodies without polluting the changelog shown in-app.
- End-to-end release prep: `npm run release:prepare` (build all + verify release assets).
- MCP instructions for packaged and source installs: `MCP_README.md`.
- Optional reusable agent skill for MCP workflows: `skills/signboard-mcp/SKILL.md`.
- Optional skill UI metadata for supported clients: `skills/signboard-mcp/agents/openai.yaml`.

## Practical Editing Rules for Future Codex Runs

- Prefer editing `app/**` source modules, not `app/signboard.js` directly.
- Rebuild with `./buildjs.sh` whenever `app/**` module files change.
- Always update agent docs (`CODEX.md`, `AGENTS.md`, `docs/codex/PROJECT_CONTEXT.md`, `docs/codex/FILE_STRUCTURE.md`) when behavior/architecture/tooling changes.
- Always update release-facing docs (`readme.md`, `docs/README.md`, `docs/using-signboard.md`, `docs/signboard-cli.md`, and `MCP_README.md` when relevant) when user behavior, CLI behavior, or setup flows change.
- Keep list/card filename conventions intact; drag/drop logic depends on numeric prefixes.
- Avoid refactoring path concatenation casually; many flows assume trailing `/`.
- For content/parsing changes, update both `lib/cardFrontmatter.js` and `scripts/test-frontmatter.js`.
- For board label settings behavior, update both `lib/boardLabels.js` and `scripts/test-board-labels.js`.
- For task checklist parsing or badge behavior, update `app/utilities/taskList.js` tests (`scripts/test-task-list-parser.js`) and MCP smoke assertions (`scripts/test-mcp-server.js`) when applicable.
- For due notification behavior, update `app/utilities/dueNotifications.js` tests (`scripts/test-due-notifications.js`).

## Fast Context Exclusions
Ignore these unless task explicitly requires them:

- `dist/` (build artifacts)
- `node_modules/` (dependencies)
- `static/vendor/` (vendored third-party libraries)
- `package-lock.json` (unless dependency updates are requested)
