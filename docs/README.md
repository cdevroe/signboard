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
- Due dates, task lists, labels, completed-list workflow settings, Kanban/Table board views, card age sorting in Table, Planner date views, and External Published Calendar
- Archiving and restoring cards and lists
- Settings, including app-wide tooltips/notifications/Quick Add global shortcut/External Published Calendar and board-specific workflow, colors, labels, and imports
- Native text editing context menus in editable fields
- Accessibility support for keyboard-operable cards/list actions, modal focus handling, live status announcements, reduced motion, and forced-colors mode
- Keyboard result/menu navigation for board search, Planner search, Archive search, board tabs, list actions, label/filter popovers, and Settings sections
- Keyboard shortcuts for Quick Add card creation across open boards, creating lists, switching and closing open boards, opening Planner views across all open boards or the current board, cycling colors, moving open cards, archiving, and opening Archive
- CLI setup, board creation, command reference, filters, age sorting, timestamp JSON output, card duplication/template workflows, dry-run previews, archive workflows, settings, and imports
- MCP trusted-root behavior and board-name lookup

## File-First Model

Signboard is intentionally simple on disk:

- A board is a folder.
- Each list is a subfolder inside the board's folder.
- Each card is a Markdown file inside a list folder.
- Board settings are stored in `board-settings.md`.
- Archived cards and lists live in `XXX-Archive`.

That makes boards easy to inspect, back up, sync, and automate with standard filesystem tools.
