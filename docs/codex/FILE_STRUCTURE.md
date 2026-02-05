# Signboard File Structure (Annotated)

This map focuses on source and operational files. Large generated/vendor folders are summarized.

## Top level

- `main.js` - Electron main process window + IPC directory chooser.
- `preload.js` - Renderer bridge (`window.board`, `window.chooser`, `window.electronAPI`) + filesystem/date/sort helpers.
- `index.html` - App shell, modal markup, and deferred script/style includes.
- `readme.md` - Human-facing project README.
- `package.json` - Runtime/build scripts and dependencies.
- `package-lock.json` - NPM lockfile.
- `.gitignore` - Ignores `node_modules`, `dist`, `.env`, etc.
- `buildjs.sh` - Concatenate renderer modules into `app/signboard.js`.
- `electron-builder.json` - Build targets/artifact settings.
- `LICENSE` - MIT license.

## Renderer source (`app/`)

- `app/signboard.js` - Generated concatenated renderer file loaded by `index.html`.
- `app/utilities/santizeFileName.js` - Filename sanitization + random suffix helper.
- `app/cards/createCardElement.js` - Card DOM rendering and click behavior.
- `app/cards/processAddNewCard.js` - New card creation flow.
- `app/cards/processAddNewList.js` - New list creation flow.
- `app/lists/createListElement.js` - List DOM rendering, sanitized rename, card DnD handling.
- `app/board/renderBoard.js` - Whole-board render (with concurrent card-list reads) and list DnD handling.
- `app/board/openBoard.js` - Open/init board directory, starter content, and board picker label updates.
- `app/modals/closeAllModals.js` - Modal close logic + editor cleanup + conditional rerender + board interaction lock/unlock.
- `app/modals/toggleAddCardModal.js` - Add-card modal position/toggle.
- `app/modals/toggleAddListModal.js` - Add-list modal position/toggle.
- `app/modals/toggleAddCardToListModal.js` - Cross-list add-card modal toggle.
- `app/modals/toggleEditCardModal.js` - Card editor open/save/archive/duplicate logic with debounced + serialized saves.
- `app/listeners/window.js` - Keyboard shortcuts (`Esc`, `Cmd/Ctrl+N`, `Cmd/Ctrl+Shift+N`).
- `app/init.js` - App bootstrap, folder picker handling, and top-level event wiring.
- `app/ui/theme.js` - Theme toggle + OverType theme integration.

## Shared/library code

- `lib/cardFrontmatter.js` - Card parse/normalize/read/write/update with legacy support.

## Scripts (`scripts/`)

- `scripts/test-frontmatter.js` - Node assertions for frontmatter behavior.
- `scripts/migrate-legacy-cards.js` - Bulk migration to YAML frontmatter format.
- `scripts/notarize.js` - electron-builder `afterSign` notarization hook.

## Static assets (`static/`)

- `static/styles.css` - App styling, layout, theme tokens, modal/editor styles.
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

## Usually ignored for code tasks

- `node_modules/` - Installed dependencies.
- `dist/` - Generated binaries/installers.
- `static/vendor/` - External vendored source (edit only when updating vendored libs).

## Codex doc maintenance rule

- When behavior, architecture, or tooling changes, update Codex docs in the same change set:
  - `CODEX.md`
  - `docs/codex/PROJECT_CONTEXT.md`
  - `docs/codex/FILE_STRUCTURE.md`
