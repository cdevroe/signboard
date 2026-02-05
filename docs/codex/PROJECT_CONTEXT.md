# Signboard Project Context

## What this app is
Signboard is a local-first Kanban desktop app built with Electron and plain JavaScript.

- A board is a folder on disk.
- Lists are subdirectories inside that board folder.
- Cards are Markdown files in each list directory.
- Card metadata is stored in YAML frontmatter (with legacy parser support).

## Runtime Architecture

### Main Process
File: `main.js`

- Creates a single `BrowserWindow` and loads `index.html`.
- Registers IPC handler `choose-directory` to open native folder picker.
- Uses `preload.js` for renderer API exposure.

### Preload Bridge
File: `preload.js`

- Exposes `window.board` (filesystem + card operations), `window.chooser`, and `window.electronAPI`.
- Wraps card reads/writes through `lib/cardFrontmatter.js`.
- Handles operations like list/card enumerate, move, create, and Trello import.

### Renderer
Files: `index.html`, `app/signboard.js` (generated), source modules in `app/**`

- UI is vanilla HTML/CSS/JS.
- `index.html` loads vendored libraries and then `app/signboard.js`.
- `app/signboard.js` is concatenated from source modules by `buildjs.sh`.

## Data Model and Naming Conventions

### Board
- `window.boardRoot` is the absolute board path with trailing slash.
- Last-opened board path is persisted in `localStorage.boardPath`.

### List directories
- Pattern: `NNN-<list-name>-<suffix>`
- Default starter lists use suffix `-stock`.
- Archive list is always `XXX-Archive` and hidden from normal board rendering.

### Card files
- Pattern: `NNN-<slug>-<rand5>.md`
- File content format written by app:
  - YAML frontmatter (`title`, optional `due`, optional `labels`, unknown keys preserved)
  - Markdown body

## Core User Flows (Where the behavior lives)

### App init and board open
- `app/init.js`:
  - Restores previous board from localStorage.
  - Hooks global click handling and top-level modal triggers.
  - Calls directory chooser and `openBoard`.
- `app/board/openBoard.js`:
  - Creates starter lists/cards when board folder is empty.
  - Sets `window.boardRoot` and renders board.

### Rendering board/lists/cards
- `app/board/renderBoard.js`:
  - Reads lists, builds columns, enables list drag-and-drop reorder.
- `app/lists/createListElement.js`:
  - Builds list UI, add-card button, list rename behavior.
  - Enables card drag-and-drop reorder and cross-list move.
- `app/cards/createCardElement.js`:
  - Reads card frontmatter/body preview.
  - Opens edit modal on click.

### Add/edit card and list
- `app/cards/processAddNewCard.js` and `app/cards/processAddNewList.js`:
  - Generate numbered filenames/directories and create on disk.
- `app/modals/toggleEditCardModal.js`:
  - Loads card into OverType editor.
  - Saves title/body/frontmatter through `window.board.writeCard`.
  - Handles due date picker, duplicate, and archive actions.
- `app/modals/*.js` and `app/modals/closeAllModals.js`:
  - Modal open/close, cleanup, and board rerender.

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

## Tooling, Build, and Test

### Run locally
- `npm start`

### Rebuild renderer bundle after module edits
- `./buildjs.sh`
- Concatenates module files into `app/signboard.js` in strict order.

### Frontmatter tests
- `npm run test:frontmatter`
- Script: `scripts/test-frontmatter.js`

### Legacy migration
- `npm run migrate:legacy-cards -- <board-root> [--dry-run] [--include-plain]`
- Script: `scripts/migrate-legacy-cards.js`

### Packaging
- Electron Builder config in `package.json` and `electron-builder.json`.
- macOS notarization hook: `scripts/notarize.js` (env vars from `.env`).

## Practical Editing Rules for Future Codex Runs

- Prefer editing `app/**` source modules, not `app/signboard.js` directly.
- Rebuild with `./buildjs.sh` whenever `app/**` module files change.
- Keep list/card filename conventions intact; drag/drop logic depends on numeric prefixes.
- Avoid refactoring path concatenation casually; many flows assume trailing `/`.
- For content/parsing changes, update both `lib/cardFrontmatter.js` and `scripts/test-frontmatter.js`.

## Fast Context Exclusions
Ignore these unless task explicitly requires them:

- `dist/` (build artifacts)
- `node_modules/` (dependencies)
- `static/vendor/` (vendored third-party libraries)
- `package-lock.json` (unless dependency updates are requested)

