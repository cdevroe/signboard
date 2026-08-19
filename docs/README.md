# Signboard Documentation

Signboard is a local-first board app that stores lists as folders and cards as Markdown files.

## Table of Contents

- [Using Signboard](./using-signboard.md)
- [Signboard CLI](./signboard-cli.md)
- [MCP Server](../MCP_README.md)

## Start Here

If you are using the desktop app, begin with [Using Signboard](./using-signboard.md).

If you want to automate Signboard, script it, or drive it from an agent without MCP, go to [Signboard CLI](./signboard-cli.md).

If you want structured tool access from an agent, see [MCP Server](../MCP_README.md).

## What These Docs Cover

- Creating and organizing boards, lists, and cards
- Drag-and-drop movement, including the empty insertion slot shown while dragging cards
- Calendar-based start/due date ranges on Kanban cards and in the card editor, task lists, labels, linked-object counts, completed-list workflow settings, Kanban/Table board views, card age sorting and bulk actions in Table, Planner date views with automatic local-day rollover, and External Published Calendar
- Archiving and restoring cards and lists
- Settings, including app-wide General/Notifications/Smart Actions panels, independent Normal and Advanced models using Ollama, LM Studio, OpenAI, Gemini, or Anthropic, OS-encrypted cloud API keys, separate Card and Board action tabs, drag-reorderable custom actions, portable action import/export/share links, and board-specific General, Labels, Appearance, Workflow, Obsidian, and Import panels
- Smart Board Actions for board briefs, quick-win discovery, one-off questions, and reviewed proposals to create, clean up, label, date, move, or archive cards
- Obsidian integration, including boards stored inside vaults, Open With actions, generated Bases files, CLI writes that remain visible in managed Bases, linked notes, missing-note handling, linked objects, dropped local-file linking, URL favicons, `signboard://` card/board links, and the optional Obsidian companion plugin
- Raw web URLs in card bodies, opened from the editor through the inline open-link control or Cmd/Ctrl-click
- Native text editing context menus in editable fields
- Readable plain-text update changelogs in native dialogs across macOS, Windows, and Linux, plus Ubuntu `.deb` validation and actionable package-install recovery
- Accessibility support for keyboard-operable cards/list actions, modal focus handling, live status announcements, reduced motion, and forced-colors mode
- Keyboard result/menu navigation for board search, Planner search, Archive search, board tabs, list actions, label/filter popovers, and Settings sections
- Keyboard shortcuts for Quick Add card creation across open boards, creating lists, switching and closing open boards, opening Planner views across all open boards or the current board, cycling colors, moving open cards, archiving, and opening Archive
- CLI setup, board discovery, board creation, command reference, filters, age sorting, timestamp JSON output, card duplication/template workflows, dry-run previews, archive workflows, settings, and imports
- MCP trusted/open board discovery, trusted-root behavior, and board-name lookup

## File-First Model

Signboard is intentionally simple on disk:

- A board is a folder.
- Each list is a subfolder inside the board's folder.
- Each card is a Markdown file inside a list folder.
- Board settings are stored in `board-settings.md`.
- Archived cards and lists live in `XXX-Archive`.
- Obsidian helpers auto-create a managed `Signboard Board.base` for boards inside detected vaults, create linked notes in the board root when requested, and mark missing linked notes for explicit recreate/relink/remove actions. Existing boards can be moved into an Obsidian vault from `Settings > General > Move Board`. The optional `obsidian-plugin/` companion plugin can open/copy Signboard links, attach active notes, ask before removing links to deleted notes, and create a Signboard board from an Obsidian folder after confirmation.

That makes boards easy to inspect, back up, sync, and automate with standard filesystem tools.
