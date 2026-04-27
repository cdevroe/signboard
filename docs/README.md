# Signboard Documentation

Signboard is a local-first kanban app that stores lists as folders and cards as Markdown files.

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
- Due dates, task lists, labels, and board views
- Archiving and restoring cards and lists
- Board settings including colors, labels, tooltips, notifications, and imports
- Keyboard shortcuts for creating cards/lists, switching views, cycling colors, moving open cards, archiving, and opening Archive
- CLI setup, command reference, filters, JSON output, archive workflows, settings, and imports

## File-First Model

Signboard is intentionally simple on disk:

- A board is a folder.
- Each list is a subfolder inside the board's folder.
- Each card is a Markdown file inside a list folder.
- Board settings are stored in `board-settings.md`.
- Archived cards and lists live in `XXX-Archive`.

That makes boards easy to inspect, back up, sync, and automate with standard filesystem tools.
