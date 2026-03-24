# Codex Quick Context - Signboard

Start here before opening source files.

- Read `docs/codex/PROJECT_CONTEXT.md` for architecture, data model, and behavior.
- Read `docs/codex/FILE_STRUCTURE.md` for an annotated map of the repository.
- Treat `app/signboard.js` as generated output; edit the source modules in `app/**` and then run `./buildjs.sh`.
- Tooltip UI is implemented in `app/ui/tooltips.js` and reads existing control labels (`title` / `aria-label` / `alt`) to keep tooltip copy centralized in markup.
- App updates are handled in `main.js` via `electron-updater` (GitHub releases), with menu-triggered/manual checks and remind-later state in `update-preferences.json` under Electron `userData`.
- `main.js` also supports headless MCP mode via `--mcp-server` for local agent integration over stdio; implementation lives in `lib/mcpServer.js`.
- Signboard MCP includes board-name resolution (`signboard.resolve_board_by_name`) and supports both header-framed + newline-delimited stdio JSON-RPC.
- Main window stability guards are in `main.js` (`unresponsive` dialog + renderer crash recovery window recreate).
- `main.js` supports `--mcp-config` to print a ready-to-paste MCP config JSON snippet and exit.
- `Help` menu includes `Copy MCP Config`, which copies a ready-to-paste MCP server config snippet to clipboard.
- `preload.js` is now a thin IPC bridge only; board filesystem access, trusted-board validation, and filesystem watch helpers live in `main.js`, while `app/init.js` still uses the same watch methods to auto-refresh after external board changes.
- Board view switching (Kanban/Calendar/This Week) is managed in `app/board/boardViews.js`; temporal views include cards by card due date and task-level due markers (`(due: YYYY-MM-DD)`).
- Calendar and This Week cards also show a subdued source-list label so users can tell which Kanban list a due item currently belongs to without opening it.
- Keyboard shortcut handling is centralized in `app/listeners/window.js`; the hold-for-2-seconds shortcut helper modal is rendered in `index.html` as `#modalKeyboardShortcuts` and must be kept in sync whenever shortcuts change.
- Task checklist parsing + counters + task due-date helpers live in `app/utilities/taskList.js` and feed Board/Calendar/This Week card badges.
- Due notification aggregation/formatting (including task-due item snippets) lives in `app/utilities/dueNotifications.js` and is consumed by `app/init.js`.
- Task-line due-date controls in the editor are positioned from measured textarea line-start coordinates (not raw line index math) to stay aligned with wrapped content.
- In dev/unpackaged builds, `Help` includes updater preview dialogs so update UI can be tested without publishing a release.
- Release assets for updater compatibility are validated by `scripts/verify-release-assets.js` (`npm run release:verify`).
- Task parser coverage tests are in `scripts/test-task-list-parser.js` (`npm run test:task-list`).
- Due notification coverage tests are in `scripts/test-due-notifications.js` (`npm run test:due-notifications`).
- Dedicated user-facing MCP setup docs are in `MCP_README.md`.
- Reusable agent skill for MCP usage lives at `skills/signboard-mcp/SKILL.md`.
- Skill UI metadata lives at `skills/signboard-mcp/agents/openai.yaml`.
- Board tabs/session state live in renderer localStorage: `boardTabs` (open tab order) and `boardPath` (active board root fallback).
- Board label definitions are managed in `board-settings.md` files inside each board folder (runtime data, not repo source).
- Board Settings now includes an `Import` panel that launches explicit Trello/Obsidian imports into the current board; the renderer wiring lives in `app/board/boardLabels.js`, while the actual import filesystem work lives in `lib/importers/*` through `main.js` IPC.
- External import pickers are tokenized in `main.js` and surfaced through `window.chooser.pickImportSources(...)`; renderer code never reads arbitrary external files directly.
- Trello and Obsidian importer coverage lives in `scripts/test-import-trello.js` and `scripts/test-import-obsidian.js`.
- Skip heavy/generated content unless explicitly needed: `node_modules/`, `dist/`, `static/vendor/`, and usually `package-lock.json`.
- Always update Codex markdown docs when behavior/architecture/tooling changes (`CODEX.md`, `docs/codex/PROJECT_CONTEXT.md`, `docs/codex/FILE_STRUCTURE.md`).
