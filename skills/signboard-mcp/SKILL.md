---
name: signboard-mcp
description: Use this skill when working with Signboard boards through the local MCP server (listing views/lists/cards, reading cards, and safely creating/updating/moving cards, boards, or board settings).
---

# Signboard MCP Skill

Use this skill when the user asks to read or modify Signboard data through MCP.

## Preconditions

- Signboard MCP server is configured and running.
- `boardRoot` values must be absolute paths.
- Board creation uses an absolute `parentRoot`; import source paths must also be absolute and allowed.
- Respect server mode from `signboard_get_config`:
  - `readOnly: true` means do not attempt write tools.
  - `allowedRoots` is the union of explicit MCP roots and desktop trusted board roots; only use board paths inside those roots.

## Tool Workflow

1. Call `signboard_get_config` first.
2. Call `signboard_list_boards` when board root is unknown or ambiguous; prefer an `isActive` or `isOpen` match when it fits the user's request.
3. If the board is not listed but the name is known, use `signboard_resolve_board_by_name` when `allowedRoots` are available; otherwise ask user for the absolute board path.
4. Discover structure:
   - `signboard_list_lists`
   - `signboard_list_cards`
   - `signboard_read_card` as needed
5. Before write actions, verify:
   - user requested the change
   - server is not read-only
   - target list/card exists (or should be created)
6. Execute write tool only after checks:
   - `signboard_create_card`
   - `signboard_update_card`
   - `signboard_duplicate_card`
   - `signboard_archive_card`
   - `signboard_archive_list`
   - `signboard_restore_archived_card`
   - `signboard_restore_archived_list`
   - `signboard_move_card`
   - `signboard_create_list`
   - `signboard_create_board`
   - `signboard_rename_board`
   - `signboard_move_board`
   - `signboard_update_board_settings`
   - `signboard_import_trello`
   - `signboard_import_obsidian`
   - `signboard_import_tasksmd`

## Safety Rules

- Never invent filesystem paths.
- Never pass relative paths as `boardRoot`.
- Do not attempt path traversal or multi-segment names in list/card fields.
- Prefer read operations first when user intent is ambiguous.
- Treat `XXX-Archive` as archive list unless user explicitly asks to include/use it.

## Tool Reference

- `signboard_get_config`: inspect MCP mode and path constraints.
- `signboard_list_boards`: list known usable board roots with desktop-open, active, trusted, current, and allowed-root metadata.
- `signboard_list_board_views`: list available board views (`kanban`, `table`).
- `signboard_resolve_board_by_name`: map a board directory name to absolute board paths under allowed roots, including allowed roots that are themselves board folders.
- `signboard_create_board`: scaffold the default lists and optional starter card under an allowed parent root.
- `signboard_list_lists`: get list directory names in a board.
- `signboard_list_cards`: get card markdown files in a list.
- `signboard_read_card`: return normalized frontmatter and body.
- `signboard_create_card`: create a card from title/body/optional start/due/labels, with dry-run preview support.
- `signboard_update_card`: patch title/body/start/due/labels of a card, including section edits, note insertion, label add/remove/clear, and dry-run previews.
- `signboard_duplicate_card`: duplicate an existing card with optional title/body/start/due override, label add/remove/clear, and dry-run preview.
- `signboard_archive_card`: move a card to `XXX-Archive`.
- `signboard_archive_list`: archive a list and its cards with restore metadata.
- `signboard_list_archive_entries`: list archived cards or lists.
- `signboard_read_archive_entry`: inspect one archived card or list.
- `signboard_restore_archived_card`: restore an archived card into an active list.
- `signboard_restore_archived_list`: restore an archived list directory.
- `signboard_move_card`: move card between lists.
- `signboard_create_list`: create a list directory.
- `signboard_rename_board`: rename a board directory.
- `signboard_move_board`: move a board directory to a new parent directory.
- `signboard_read_board_settings`: read labels, board theme, completed-list workflow, and Published Calendar inclusion settings.
- `signboard_update_board_settings`: update labels, board theme, completed-list workflow, and Published Calendar inclusion settings.
- `signboard_import_trello`: import a Trello JSON export into an existing board.
- `signboard_import_obsidian`: import one or more Markdown files/directories into an existing board.
- `signboard_import_tasksmd`: import a Tasks.md project into an existing board.

## Output Style

- Confirm which board path was used.
- For reads, summarize key data (lists, card ids/titles, due dates, labels).
- For writes, report exactly what changed (before/after when relevant).
- If blocked by read-only mode or root restrictions, state the exact constraint and required user action.
