# Signboard MCP Server

Signboard includes a built-in Model Context Protocol (MCP) server mode so local LLM agents can read and update boards on your machine.

Generated MCP configurations run the bundled `bin/signboard-mcp.js` entrypoint in Electron's Node mode. This keeps the server headless from process startup and avoids initializing the desktop GUI lifecycle inside agent sandboxes.

## Why this exists

Most users install Signboard as a packaged desktop app. This MCP mode is designed to work from that packaged install, so users do not need a local source checkout to connect agents.

## Security defaults

By default, the server starts in read-only mode.

- `SIGNBOARD_MCP_READ_ONLY`:
  - default: `true`
  - set to `false` (or `0`) to allow write tools
- `SIGNBOARD_MCP_ALLOWED_ROOTS`:
  - optional allowlist for board-scoped tools when the desktop app already has trusted board roots
  - uses your OS path delimiter (`:` on macOS/Linux, `;` on Windows)
  - MCP combines these paths with Signboard's desktop trusted board roots from `trusted-board-roots.json`
  - `signboard_list_boards` reports known usable boards from desktop-open, desktop-trusted, and configured MCP roots
  - `boardRoot` arguments must resolve inside one configured or trusted root
  - import tool `sourcePath` / `sourcePaths` arguments must also resolve inside one configured or trusted root

Example (macOS/Linux):

```bash
SIGNBOARD_MCP_READ_ONLY=false \
SIGNBOARD_MCP_ALLOWED_ROOTS="$HOME/Documents/signboards:$HOME/Test\ Board\ Colin/" \
ELECTRON_RUN_AS_NODE=1 \
"/Applications/Signboard.app/Contents/MacOS/Signboard" \
"/Applications/Signboard.app/Contents/Resources/app.asar/bin/signboard-mcp.js"
```

Example (Windows PowerShell):

```powershell
$env:SIGNBOARD_MCP_READ_ONLY = "false"
$env:SIGNBOARD_MCP_ALLOWED_ROOTS = "C:\Users\you\Boards;D:\Work\Boards"
$env:ELECTRON_RUN_AS_NODE = "1"
& "C:\Users\you\AppData\Local\Programs\Signboard\Signboard.exe" `
  "C:\Users\you\AppData\Local\Programs\Signboard\resources\app.asar\bin\signboard-mcp.js"
```

## Running from source

```bash
npm run mcp:server
```

Print config JSON from source run:

```bash
npm run mcp:config
```

## Running from packaged Signboard

Typical desktop executable locations:

- macOS: `/Applications/Signboard.app/Contents/MacOS/Signboard`
- Windows: `C:\Users\<you>\AppData\Local\Programs\Signboard\Signboard.exe`
- Linux native package (including Arch/Omarchy): `/usr/bin/signboard`
- Linux AppImage: wherever you saved the `signboard_*.AppImage` file

Use `Help` -> `Copy MCP Config` from the packaged app to get the executable, bundled headless entrypoint, Node-mode environment, and current trusted roots for that installation. Avoid configuring an agent to invoke the desktop executable with only `--mcp-server`; that initializes the GUI lifecycle before JavaScript can select headless mode.

The legacy desktop `--mcp-server` and `--mcp-config` flags remain supported for compatibility; use the generated Node-mode configuration for agent clients.

## In-app config shortcut

Signboard includes a menu helper at `Help` -> `Copy MCP Config`.

- It copies a complete JSON config snippet to your clipboard.
- It sets `command` to Signboard's current executable path and `args` to the bundled headless MCP entrypoint.
- It includes `ELECTRON_RUN_AS_NODE=1`, so Electron starts as a Node process without initializing the desktop GUI lifecycle.
- It includes `SIGNBOARD_MCP_READ_ONLY=false` and uses existing trusted board roots for `SIGNBOARD_MCP_ALLOWED_ROOTS` when available; otherwise it falls back to a starter `Documents/Boards` value.

## Optional agent skill file

This repo includes a reusable skill file for agent behavior:

- `skills/signboard-mcp/SKILL.md`
- `skills/signboard-mcp/agents/openai.yaml`

Use it to standardize how agents call `signboard_*` tools (safety checks, read/write flow, and reporting style).

## MCP tools

The server currently exposes these tools:

- `signboard_get_config`
- `signboard_list_boards`
- `signboard_list_board_views`
- `signboard_resolve_board_by_name`
- `signboard_create_board` (write mode only)
- `signboard_list_lists`
- `signboard_list_cards`
- `signboard_read_card` (includes `timestamps`, `taskSummary`, `taskStartDates`, and `taskDueDates`)
- `signboard_create_card` (write mode only, includes `timestamps`, `taskSummary`, `taskStartDates`, and `taskDueDates`; supports `dryRun`)
- `signboard_update_card` (write mode only, includes `timestamps`, `taskSummary`, `taskStartDates`, and `taskDueDates`; supports section edits, note insertion, label operations, and `dryRun`)
- `signboard_duplicate_card` (write mode only, includes `timestamps`, `taskSummary`, `taskStartDates`, and `taskDueDates`; supports title/body override, label operations, and `dryRun`)
- `signboard_archive_card` (write mode only)
- `signboard_archive_list` (write mode only)
- `signboard_list_archive_entries`
- `signboard_read_archive_entry`
- `signboard_restore_archived_card` (write mode only)
- `signboard_restore_archived_list` (write mode only)
- `signboard_move_card` (write mode only)
- `signboard_create_list` (write mode only)
- `signboard_rename_board` (write mode only)
- `signboard_move_board` (write mode only)
- `signboard_read_board_settings`
- `signboard_update_board_settings` (write mode only)
- `signboard_import_trello` (write mode only)
- `signboard_import_obsidian` (write mode only)
- `signboard_import_tasksmd` (write mode only)

`tools/list` advertises underscore tool names. Dotted `signboard.*` names are still accepted as legacy aliases for backward compatibility.

Board-scoped tools take absolute `boardRoot` paths, `signboard_create_board` takes an absolute `parentRoot`, and all path inputs reject traversal.
Board settings tools include labels, theme overrides, completed-list workflow settings, and board-level External Published Calendar inclusion. App appearance (including Omarchy theme following), tooltip, notification, Quick Add, AI assistance/Smart Card Action prompt, and External Published Calendar server preferences are desktop app settings.
Import tools also take absolute external source paths, and those paths must resolve inside configured or trusted roots.

## Card Metadata in Card Tool Responses

`signboard_read_card`, `signboard_create_card`, `signboard_update_card`, and `signboard_duplicate_card` return:

- `card.timestamps.createdAt`: ISO timestamp for when the card was created, preferring Signboard card metadata and falling back to filesystem timestamps for older cards
- `card.timestamps.updatedAt`: ISO timestamp from the card file's filesystem modification time when available
- `taskSummary`: `{ total, completed, remaining }`
- `card.start`: optional card start/scheduled date (`YYYY-MM-DD`) when present
- `card.due`: optional card due date (`YYYY-MM-DD`) when present
- `taskStartDates`: sorted unique ISO start/scheduled dates found in task lines (`YYYY-MM-DD`)
- `taskDueDates`: sorted unique ISO due dates found in task lines (`YYYY-MM-DD`)

Task parsing rules:

- Checklist items are recognized from markdown checkbox lines (for example: `- [ ]`, `- [x]`, `- [X]`, `- [x ]`, `- [ x]`, `- [ x ]`).
- Task-level date markers are recognized when the task content starts with one or more of:
  - `(start: YYYY-MM-DD)`
  - `(scheduled: YYYY-MM-DD)`
  - `(due: YYYY-MM-DD)`

Example:

```md
- [ ] (start: 2026-03-18) (due: 2026-03-20) Draft announcement
- [ ] (scheduled: 2026-03-21) Follow up
- [x ] Confirm reviewers
```

Returned metadata shape:

```json
{
  "taskSummary": {
    "total": 2,
    "completed": 1,
    "remaining": 1
  },
  "taskStartDates": ["2026-03-18", "2026-03-21"],
  "taskDueDates": ["2026-03-20"]
}
```

## Board discovery and lookup

Agents should call this first:

- `signboard_list_boards`

It returns known board roots plus context flags such as `isOpen`, `isActive`, `isTrusted`, `isAllowed`, and `sources`. Desktop-open state comes from the last synced Signboard window tab state; trusted roots come from the desktop app's persisted trusted board roots; configured MCP roots are scanned with a bounded shallow search for board-looking folders.

If you know a board name but do not know its absolute path, use:

- `signboard_resolve_board_by_name`

This searches within configured and desktop-trusted roots and returns absolute matches. It also matches a root directory itself, so a trusted root can be the board folder, not only a parent folder.
If neither `SIGNBOARD_MCP_ALLOWED_ROOTS` nor desktop trusted board roots are available, the resolver tool returns an error.

## Example client config snippets

### Claude Desktop (example)

```json
{
  "mcpServers": {
    "signboard": {
      "command": "/Applications/Signboard.app/Contents/MacOS/Signboard",
      "args": ["/Applications/Signboard.app/Contents/Resources/app.asar/bin/signboard-mcp.js"],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1",
        "SIGNBOARD_MCP_READ_ONLY": "false",
        "SIGNBOARD_MCP_ALLOWED_ROOTS": "/Users/you/Documents/Boards",
        "SIGNBOARD_DESKTOP_USER_DATA_DIR": "/Users/you/Library/Application Support/Signboard"
      }
    }
  }
}
```

### Codex-style MCP config (example)

```json
{
  "name": "signboard",
  "command": "/Applications/Signboard.app/Contents/MacOS/Signboard",
  "args": ["/Applications/Signboard.app/Contents/Resources/app.asar/bin/signboard-mcp.js"],
  "env": {
    "ELECTRON_RUN_AS_NODE": "1",
    "SIGNBOARD_MCP_READ_ONLY": "false",
    "SIGNBOARD_MCP_ALLOWED_ROOTS": "/Users/you/Documents/Boards",
    "SIGNBOARD_DESKTOP_USER_DATA_DIR": "/Users/you/Library/Application Support/Signboard"
  }
}
```

## Maintenance behavior in 1.7.3

- Allowed roots are checked against resolved filesystem paths, including destination parents. A symlink cannot grant access outside the configured or desktop-trusted roots. Explicitly allowed symlink roots remain usable. Bulk archive/import operations validate nested links before invoking shared filesystem helpers.
- Card create, update, duplicate, move, and dry-run responses normalize Signboard/Obsidian metadata against the destination. Copies receive their own ID/link; moving updates list and status properties.
- Explicit `start` and `due` writes require real calendar dates in `YYYY-MM-DD` form; empty/null still clears a date. Invalid writes fail before changing the card.
- Card/list order prefixes support values above 999.

## Behavior notes

- The recommended Node-mode MCP entrypoint never initializes or reveals the desktop window.
- The process communicates over stdio (MCP JSON-RPC framing).
- The stdio parser accepts both header-framed MCP and newline-delimited JSON-RPC payloads.
- `signboard_list_board_views` reports the board-scoped Kanban and Table views; dated Calendar/This Week/Day/Agenda planning is handled by the desktop Planner overlay.
- Card reads/writes use Signboard's existing frontmatter logic (`lib/cardFrontmatter.js`), including optional `start` and `due` fields.
- `signboard_create_card` and `signboard_update_card` normalize literal `\n` / `\N` escape sequences in body input into real line breaks.
- `signboard_update_card` can replace a Markdown heading section (`replaceSection` + `body`), insert text after a heading (`insertAfterHeading` + `insertText`), append a note under `## Notes` (`addNote`), and clear/add/remove labels without replacing the full body.
- `dryRun: true` on card create/update/duplicate returns the planned card payload without writing a file.
- Board settings use Signboard's existing settings logic (`lib/boardLabels.js`).
- Trello/Obsidian/Tasks.md import tools reuse the same importer modules as the desktop app (`lib/importers/*`).
- When the desktop app is open, external board edits (including MCP edits) are watched and auto-refreshed.
