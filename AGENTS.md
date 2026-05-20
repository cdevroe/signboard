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
- Keep right-click text editing context menu behavior in `main.js` in sync with editable renderer fields.
- Keep card drag/drop clone and placeholder behavior in sync with `app/utilities/cardDragTilt.js` and `static/styles.css`.
- MCP allowed roots include both explicit MCP roots and desktop trusted board roots; keep root loading, `get_config`, and board-name resolution tests aligned.
- Quick board switching uses `Cmd/Ctrl + K`, searches all currently open boards, and should keep tab switching, overflow tab switching, and switcher switching on the same safe board-switch helper.
- Planner is the workspace-level home for Calendar, This Week, Day, and Agenda, including all-open-board and current-board shortcut scopes; keep `app/board/plannerView.js`, Kanban/Table board rendering, search/filter behavior, and shortcut docs aligned.
- Workspace-level keyboard shortcuts close the active card editor before changing context; editor-scoped card move/archive shortcuts should keep acting on the open card.
- External board-change sync should refresh board cards and unchanged open card editors after MCP/card-file edits without overwriting local editor changes.
- The sponsorship modal opens from the Board menu "Sponsor" action, About modal action, and fixed bottom-right "Sponsor" pill; the pill hides on compact windows to avoid covering board lists.
- New-card modals support `Shift + Enter` to create, immediately open, and focus the notes field on the new card.
- Completed-list workflow settings live in board settings; Planner, board date filters, and due notifications treat completed-list cards as non-actionable by default while preserving due dates.
- Keep agent-facing docs up to date: [CODEX.md](./CODEX.md), [AGENTS.md](./AGENTS.md), [docs/codex/PROJECT_CONTEXT.md](./docs/codex/PROJECT_CONTEXT.md), and [docs/codex/FILE_STRUCTURE.md](./docs/codex/FILE_STRUCTURE.md).
- Keep release-facing docs up to date when user behavior or CLI behavior changes: [docs/README.md](./docs/README.md), [docs/using-signboard.md](./docs/using-signboard.md), [docs/signboard-cli.md](./docs/signboard-cli.md), [readme.md](./readme.md), and [MCP_README.md](./MCP_README.md) when relevant.

When in doubt, follow [CODEX.md](./CODEX.md).
