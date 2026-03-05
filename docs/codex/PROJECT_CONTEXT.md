# Signboard Project Context

## What this app is
Signboard is a local-first board app built with Electron and plain JavaScript. It currently supports Kanban, Calendar, and This Week board views.

- A board is a folder on disk.
- Lists are subdirectories inside that board folder.
- Cards are Markdown files in each list directory.
- Board-level settings are stored in `board-settings.md` at the board root.
- Card metadata is stored in YAML frontmatter (with legacy parser support).

## Runtime Architecture

### Main Process
File: `main.js`

- Creates a single `BrowserWindow` and loads `index.html`.
- Supports a headless MCP server mode when launched with `--mcp-server` (no window created).
- Supports `--mcp-config` mode to print MCP client config JSON and exit.
- Registers IPC handler `choose-directory` to open native folder picker.
- Registers IPC handler `check-for-updates` for renderer-triggered manual update checks.
- Builds a native app menu with a `Check for Updates...` action.
- Help menu includes `Copy MCP Config` to copy a ready-to-paste Signboard MCP JSON snippet.
- In unpackaged/dev mode, Help menu includes `Preview Update Available...` and `Preview Update Ready...` to test updater dialogs without downloading/installing.
- Uses `electron-updater` against GitHub Releases for automatic and manual update checks.
- Handles renderer freeze/crash resilience with an unresponsive recovery dialog and renderer crash auto-recreate.
- Shows native update dialogs with release notes, changelog links, remind-later, and install/relaunch actions.
- Persists remind-later per version in `update-preferences.json` under Electron `userData`.
- Uses `preload.js` for renderer API exposure.
- In MCP mode, starts `lib/mcpServer.js` and communicates over stdio using MCP JSON-RPC framing.
- MCP stdio transport supports both `Content-Length` framing and newline-delimited JSON-RPC for client compatibility.
- Security-related window settings are:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false` (required because `preload.js` currently uses Node `fs`/`path` APIs directly)

### Preload Bridge
File: `preload.js`

- Exposes `window.board` (filesystem + card operations), `window.chooser`, and `window.electronAPI`.
- `window.electronAPI` includes external-link opening and manual update checks.
- Wraps card reads/writes through `lib/cardFrontmatter.js`.
- Handles operations like list/card enumerate, move, create, and Trello import.
- Exposes board watch helpers (`startBoardWatch`, `stopBoardWatch`, `getBoardWatchToken`) for detecting external filesystem changes.
- Uses `path.basename(path.normalize(...))` for cross-platform path parsing.
- Reuses shared `Intl.Collator` and `Intl.DateTimeFormat` instances for faster repeated sorting/date formatting.
- Trello import writes cards with awaited loops to avoid race conditions.

### Renderer
Files: `index.html`, `app/signboard.js` (generated), source modules in `app/**`

- UI is vanilla HTML/CSS/JS.
- `index.html` loads vendored libraries and `app/signboard.js` with `defer`.
- `app/signboard.js` is concatenated from source modules by `buildjs.sh`.

## Data Model and Naming Conventions

### Board
- `window.boardRoot` is the absolute board path with trailing slash.
- Open board tabs are persisted in `localStorage.boardTabs` (`[{ root, name }]`).
- Active board root is mirrored in `localStorage.boardPath` for backward compatibility.
- `board-settings.md` is auto-created with default label definitions when missing.

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

## Core User Flows (Where the behavior lives)

### App init and board open
- `app/init.js`:
  - Initializes board tab controls in the header.
  - Restores previous board tab session from localStorage.
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
  - Renders due-date cards in temporal views and updates due dates by drag/drop across days.
- `app/lists/createListElement.js`:
  - Builds list UI, add-card button, list rename behavior.
  - Enables card drag-and-drop reorder and cross-list move.
  - Sanitizes list names before filesystem rename.
  - Builds card DOM for a list concurrently to reduce list render time.
- `app/cards/createCardElement.js`:
  - Reads card frontmatter/body preview.
  - Shows label chips and a tag-icon picker on each card.
  - Hides cards that do not match the active label filter or search query.
  - Opens edit modal on click.
- `app/board/boardLabels.js`:
  - Owns board label state in the renderer.
  - Renders board label filter dropdown (multi-select, OR matching).
  - Handles card label popovers and board settings label editor.
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
  - Handles due date picker, labels picker, duplicate, and archive actions.
- `app/modals/*.js` and `app/modals/closeAllModals.js`:
  - Modal open/close, cleanup, and board rerender.
  - Disables board interaction (click/drag/select) while edit modal is open.
  - Re-renders board only when needed (instead of every modal close).

### Keyboard shortcuts
- `app/listeners/window.js`:
  - `Esc`: close modals.
  - `Cmd/Ctrl + N`: add card (with list picker modal).
  - `Cmd/Ctrl + Shift + N`: add list.

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

## Tooling, Build, and Test

### Run locally
- `npm start`

### Run MCP server locally
- `npm run mcp:server`

### Print MCP config locally
- `npm run mcp:config`

### Rebuild renderer bundle after module edits
- `./buildjs.sh`
- Concatenates module files into `app/signboard.js` in strict order.

### Frontmatter tests
- `npm run test:frontmatter`
- Script: `scripts/test-frontmatter.js`

### Board label tests
- `npm run test:board-labels`
- Script: `scripts/test-board-labels.js`

### MCP smoke test
- `npm run test:mcp`
- Script: `scripts/test-mcp-server.js`

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

## Fast Context Exclusions
Ignore these unless task explicitly requires them:

- `dist/` (build artifacts)
- `node_modules/` (dependencies)
- `static/vendor/` (vendored third-party libraries)
- `package-lock.json` (unless dependency updates are requested)
