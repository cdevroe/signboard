# Signboard Agent Guide

This repository keeps its primary Codex-specific instructions in [CODEX.md](./CODEX.md).

If you are an agent or tool that looks for `AGENTS.md`, use `CODEX.md` as the canonical source of repo guidance.

## Minimum Rules

- Read [CODEX.md](./CODEX.md) first.
- Read [docs/codex/PROJECT_CONTEXT.md](./docs/codex/PROJECT_CONTEXT.md) for architecture and behavior.
- Read [docs/codex/FILE_STRUCTURE.md](./docs/codex/FILE_STRUCTURE.md) for the repository map.
- Read [DESIGN.md](./DESIGN.md) before changing the default theme, visual system, or UI component styling.
- Treat `app/signboard.js` as generated output; edit source modules in `app/**` and then run `./buildjs.sh`.
- Keep keyboard shortcut behavior, `index.html` shortcut help, and user-facing shortcut docs in sync.
- Keep modal focus handling, live status announcements, reduced-motion behavior, forced-colors behavior, and keyboard-only focus styling in sync with `app/utilities/accessibility.js` and `static/styles.css`.
- Mark body-level popovers that must remain interactive while a modal is active with `data-sb-modal-layer`, so the modal background inert handler does not disable them.
- Keep right-click text editing context menu behavior in `main.js` in sync with editable renderer fields.
- Keep native app menu actions and the Playwright native-menu regression aligned when changing menu behavior.
- Defer DOM/layout mutations after macOS native menu or `<select>` popup interactions with `waitForNativeMenuTrackingToSettle()` before replacing, disabling, rerendering, or moving controls.
- Keep card drag/drop clone and placeholder behavior in sync with `app/utilities/cardDragTilt.js` and `static/styles.css`.
- MCP allowed roots include both explicit MCP roots and desktop trusted board roots; keep root loading, `get_config`, and board-name resolution tests aligned.
- CLI and MCP board creation should stay aligned: `signboard boards create` and `signboard_create_board` scaffold the same default lists and starter card.
- Quick board switching uses `Cmd/Ctrl + K`, searches all currently open boards, and should keep tab switching, overflow tab switching, and switcher switching on the same safe board-switch helper.
- Planner is the workspace-level home for Calendar, This Week, Day, and Agenda, including all-open-board and current-board shortcut scopes; keep `app/board/plannerView.js`, Kanban/Table board rendering, search/filter behavior, and shortcut docs aligned.
- Workspace-level keyboard shortcuts close the active card editor before changing context; editor-scoped card move/archive shortcuts should keep acting on the open card.
- External board-change sync should refresh board cards and unchanged open card editors after MCP/card-file edits without overwriting local editor changes.
- Card timestamp UI and automation surfaces use `timestamps.createdAt` and `timestamps.updatedAt`; keep editor timestamp display, Table age columns/sorting, CLI age sorts, and MCP card responses aligned with the shared timestamp helpers.
- Obsidian integration writes flat Obsidian-friendly card properties, detects containing vaults by walking upward for `.obsidian`, auto-creates/updates managed `Signboard Board.base` files without overwriting user-customized Bases, supports metadata-only linked Obsidian notes named `Linked Signboard Note.md` from the card editor only for cards inside detected vaults, shows the Obsidian-vault-required info modal for linked-note/Base actions outside a vault, and resolves `signboard://open-card` links only through trusted board roots. `signboard://open-board?path=...` opens validated vault-contained board folders after confirmation. The optional Obsidian companion plugin lives in `obsidian-plugin/` and can create/open Signboard boards from Obsidian. Linked objects use structured `linked_objects` frontmatter for Obsidian notes, local files/folders, web URLs, app deep links, and Signboard links; local files can be linked by picker or by dragging files onto the card editor, and Kanban/Table linked-object counts use `app/utilities/linkedObjects.js`. Keep `lib/obsidianIntegration.js`, `main.js`, preload, renderer menus/views, plugin helpers, and docs aligned.
- The sponsorship modal opens from the Board menu "Sponsor" action, About modal action, and fixed bottom-right "Sponsor" pill; the pill hides on compact windows to avoid covering board lists.
- Quick Add card creation supports board/list selection across open boards, an optional app-level global shortcut while Signboard is running, and `Shift + Enter` to create, immediately open, and focus the notes field on the new card.
- External Published Calendar is opt-in in App Settings, served only on `127.0.0.1`, and board inclusion is controlled in each board's Workflow settings.
- Completed-list workflow settings live in board settings; Planner, board date filters, and due notifications treat completed-list cards as non-actionable by default while preserving due dates.
- Completed task-list item due markers should not keep cards in Planner/date-filter views; only incomplete task due markers should place cards there.
- Keep agent-facing docs up to date: [CODEX.md](./CODEX.md), [AGENTS.md](./AGENTS.md), [docs/codex/PROJECT_CONTEXT.md](./docs/codex/PROJECT_CONTEXT.md), and [docs/codex/FILE_STRUCTURE.md](./docs/codex/FILE_STRUCTURE.md).
- Keep release-facing docs up to date when user behavior or CLI behavior changes: [docs/README.md](./docs/README.md), [docs/using-signboard.md](./docs/using-signboard.md), [docs/signboard-cli.md](./docs/signboard-cli.md), [readme.md](./readme.md), and [MCP_README.md](./MCP_README.md) when relevant.

When in doubt, follow [CODEX.md](./CODEX.md).
