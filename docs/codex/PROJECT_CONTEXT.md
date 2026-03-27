# Signboard Project Context

## What this app is
Signboard is a local-first board app built with Electron and plain JavaScript. It currently supports Kanban, Calendar, and This Week board views.

- A board is a folder on disk.
- Lists are subdirectories inside that board folder.
- Cards are Markdown files in each list directory.
- Board-level settings are stored in `board-settings.md` at the board root.
- Card metadata is stored in YAML frontmatter (with legacy parser support).
- Task checklist lines in card bodies can store task due markers with `(due: YYYY-MM-DD)`.

## Runtime Architecture

### Main Process
File: `main.js`

- Creates a single `BrowserWindow` and loads `index.html`.
- Supports a headless MCP server mode when launched with `--mcp-server` (no window created).
- Supports `--mcp-config` mode to print MCP client config JSON and exit.
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
- Owns trusted board-root persistence, board path validation, and external board filesystem watchers.
- Owns explicit board import operations for Trello and Obsidian; renderer code passes tokenized selections and the main process performs all external file reads and board writes.
- In MCP mode, starts `lib/mcpServer.js` and communicates over stdio using MCP JSON-RPC framing.
- MCP stdio transport supports both `Content-Length` framing and newline-delimited JSON-RPC for client compatibility.
- Source checkouts also expose a Node CLI at `bin/signboard.js` for direct terminal list/card management.
- The packaged Electron executable also routes `lists ...` and `cards ...` CLI invocations through `main.js` without opening the desktop window.
- Help menu includes `Install Signboard CLI` on macOS/Linux, which installs a per-user shim and PATH profile block for the packaged app executable.
- Security-related window settings are:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`

### Preload Bridge
File: `preload.js`

- Exposes `window.board`, `window.chooser`, and `window.electronAPI`.
- `window.electronAPI` includes external-link opening and manual update checks.
- Proxies board operations to `main.js` over `ipcRenderer.invoke(...)`.
- Does not use Node filesystem APIs directly.
- `window.chooser.pickImportSources(...)` returns tokenized external file/directory selections for import flows, and `window.board.importTrello(...)` / `window.board.importObsidian(...)` invoke the main-process importers.
- Still exposes board watch helpers (`startBoardWatch`, `stopBoardWatch`, `getBoardWatchToken`), but the watcher implementation now lives in `main.js`.

### Renderer
Files: `index.html`, `app/signboard.js` (generated), source modules in `app/**`

- UI is vanilla HTML/CSS/JS.
- `index.html` loads vendored libraries and `app/signboard.js` with `defer`.
- `app/signboard.js` is concatenated from source modules by `buildjs.sh`.
- Board Settings includes an `Import` section for Trello and Obsidian imports, with summary/warning rendering in the existing settings modal.

## Data Model and Naming Conventions

### Board
- `window.boardRoot` is the absolute board path with trailing slash.
- Open board tabs are persisted in `localStorage.boardTabs` (`[{ root, name }]`).
- Active board root is mirrored in `localStorage.boardPath` for backward compatibility.
- `board-settings.md` is auto-created with default label definitions when missing.
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
  - Initializes the board `Views` selector (Kanban default, plus Calendar and This Week options).
  - Runs an external-change sync loop that watches active board files and re-renders after external updates (for example MCP card moves).
  - Calls directory chooser and `openBoard`.
- `app/board/openBoard.js`:
  - Creates starter lists/cards when board folder is empty.
  - Manages board tabs (add/open/close/reorder + active tab persistence).
  - Sets `window.boardRoot` and renders only the active board.
  - Uses `Open Board` for the folder picker label.
  - No longer performs any implicit Trello import during board open; imports are settings-driven only.

### Rendering board/lists/cards
- `app/board/renderBoard.js`:
  - Reads list metadata and routes rendering to the active board view (Kanban, Calendar, or This Week).
  - Builds Kanban columns and enables list drag-and-drop reorder when Kanban is active.
  - Fetches each list's card names concurrently for faster initial render.
  - Loads board label definitions and filter state before rendering cards.
- `app/board/boardViews.js`:
  - Owns active board view state and the `Views` dropdown behavior.
  - Renders Calendar month layout (Monday-first week), today highlighting, and month navigation.
  - Renders This Week layout, week navigation, and current-day highlighting.
  - Renders due-date cards in temporal views and updates card due dates by drag/drop across days.
  - Includes cards by both card due date and task due markers, deduped per day per card.
  - Shows task progress badges and a subdued source-list label on temporal cards.
- `app/lists/createListElement.js`:
  - Builds list UI, add-card button, list rename behavior.
  - Enables card drag-and-drop reorder and cross-list move.
  - Sanitizes list names before filesystem rename.
  - Builds card DOM for a list concurrently to reduce list render time.
- `app/cards/createCardElement.js`:
  - Reads card frontmatter/body preview.
  - Computes task summary + task due dates from card body checklist lines.
  - Shows task progress badge on board cards.
  - Shows label chips and a tag-icon picker on each card.
  - Hides cards that do not match the active label filter or search query.
  - Opens edit modal on click.
- `app/board/boardLabels.js`:
  - Owns board label state in the renderer.
  - Renders board label filter dropdown (multi-select, OR matching).
  - Handles card label popovers, board settings editors, and the Board Settings import UI/actions.
  - Persists board labels through preload APIs.
- `app/board/boardSearch.js`:
  - Stores the current search query/tokens.
  - Debounces live search renders for title/body filtering.

### Add/edit card and list
- `app/cards/processAddNewCard.js` and `app/cards/processAddNewList.js`:
  - Generate numbered filenames/directories and create on disk.
- `app/modals/toggleEditCardModal.js`:
  - Loads card into OverType editor.
  - Saves title/body/frontmatter through `window.board.writeCard`.
  - Debounces editor body writes and serializes save order to prevent stale overwrite races.
  - Renders task-line due-date controls at the start of each parsed checklist line in the editor.
  - Uses measured textarea line-start coordinates for control placement so wrapped lines do not drift button positions.
  - Handles due date picker, labels picker, duplicate, and archive actions.
- `app/utilities/taskList.js`:
  - Parses checklist items from card markdown body.
  - Computes task summary (`total`, `completed`, `remaining`) and task due-date sets.
  - Creates task progress badge elements and updates task-line due markers by line index.
- `app/utilities/dueNotifications.js`:
  - Collects due items from both card-level due dates and incomplete task-level due markers.
  - Builds notification body text that includes card title and task summary text for task due items.
- `app/modals/*.js` and `app/modals/closeAllModals.js`:
  - Modal open/close, cleanup, and board rerender.
  - Disables board interaction (click/drag/select) while edit modal is open.
  - Re-renders board only when needed (instead of every modal close).

### Keyboard shortcuts
- `app/listeners/window.js`:
  - `Cmd/Ctrl + /`: open the keyboard shortcuts helper modal.
  - `Esc`: close modals.
  - `Cmd/Ctrl + N`: add card (with list picker modal).
  - `Cmd/Ctrl + Shift + N`: add list.
  - `Cmd/Ctrl + 1`: switch to Kanban view.
  - `Cmd/Ctrl + 2`: switch to Calendar view.
  - `Cmd/Ctrl + 3`: switch to This Week view.
  - Any shortcut changes must update the helper list in `index.html` (`#modalKeyboardShortcuts`) in the same change.

### Theme support
- `app/ui/theme.js`:
  - Toggles `document.documentElement.dataset.theme`.
  - Persists theme to localStorage.
  - Updates OverType theme to match app theme.
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

File: `lib/boardLabels.js`

- Reads/writes board label definitions in `board-settings.md`.
- Creates default labels when settings are missing.
- Migrates legacy `labels.md` reads into `board-settings.md`.
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
- CLI board selection is stateful: `signboard use /path/to/board`, then `signboard lists`, `signboard cards`, `signboard settings`, or `signboard import ...`.
- Import commands:
  - `signboard import trello --file /absolute/or/relative/export.json [--board <path>] [--json]`
  - `signboard import obsidian --source /path/to/file-or-dir [--source /another/path] [--board <path>] [--json]`

### Run MCP server locally
- `npm run mcp:server`

### Print MCP config locally
- `npm run mcp:config`

### Rebuild renderer bundle after module edits
- `./buildjs.sh`
- Concatenates module files into `app/signboard.js` in strict order.

### CLI internals
- `lib/cliBoard.js` owns CLI board/list/card filesystem operations.
- `lib/taskList.js` exposes shared task parsing and due-date helpers for CLI filtering.
- `lib/cliApp.js` owns shared command parsing/output used by both the Node shim and Electron executable, including path-based Trello/Obsidian imports.
- `lib/cliInstall.js` owns user-level CLI shim + shell profile installation.
- `lib/cliState.js` persists the currently selected board for subsequent CLI commands.

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
- Asserts card tool outputs include `taskSummary` + `taskDueDates`, and verifies Trello/Obsidian import tools.

### CLI smoke test
- `npm run test:cli`
- Script: `scripts/test-cli.js`
- Covers list creation/rename, card create/edit/read/filter flows, and Trello/Obsidian imports.

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

### Legacy migration
- `npm run migrate:legacy-cards -- <board-root> [--dry-run] [--include-plain]`
- Script: `scripts/migrate-legacy-cards.js`

### Packaging
- Electron Builder config in `package.json` and `electron-builder.json`.
- macOS notarization hook: `scripts/notarize.js` (env vars from `.env`).
- Release validation script: `scripts/verify-release-assets.js` (`npm run release:verify`) checks cross-platform updater assets and metadata naming.
- End-to-end release prep: `npm run release:prepare` (build all + verify release assets).
- MCP instructions for packaged and source installs: `MCP_README.md`.
- Optional reusable agent skill for MCP workflows: `skills/signboard-mcp/SKILL.md`.
- Optional skill UI metadata for supported clients: `skills/signboard-mcp/agents/openai.yaml`.

## Practical Editing Rules for Future Codex Runs

- Prefer editing `app/**` source modules, not `app/signboard.js` directly.
- Rebuild with `./buildjs.sh` whenever `app/**` module files change.
- Always update Codex docs (`CODEX.md`, `docs/codex/PROJECT_CONTEXT.md`, `docs/codex/FILE_STRUCTURE.md`) when behavior/architecture/tooling changes.
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
