---
name: signboard-mcp
description: Use this skill when working with Signboard boards through the local MCP server (listing views/lists/cards, reading cards, and safely creating/updating/moving cards, boards, or board settings).
---

# Signboard MCP Skill

Use this skill when the user asks to read or modify Signboard data through MCP.

## Preconditions

- Signboard MCP server is configured and running.
- `boardRoot` values must be absolute paths.
- Respect server mode from `signboard_get_config`:
  - `readOnly: true` means do not attempt write tools.
  - `allowedRoots` is the union of explicit MCP roots and desktop trusted board roots; only use board paths inside those roots.

## Tool Workflow

1. Call `signboard_get_config` first.
2. If board root is unknown, prefer `signboard_resolve_board_by_name` first when `allowedRoots` are available; otherwise ask user for the absolute board path.
3. Discover structure:
   - `signboard_list_lists`
   - `signboard_list_cards`
   - `signboard_read_card` as needed
4. Before write actions, verify:
   - user requested the change
   - server is not read-only
   - target list/card exists (or should be created)
5. Execute write tool only after checks:
   - `signboard_create_card`
   - `signboard_update_card`
   - `signboard_duplicate_card`
   - `signboard_archive_card`
   - `signboard_move_card`
   - `signboard_create_list`
   - `signboard_rename_board`
   - `signboard_move_board`
   - `signboard_update_board_settings`

## Safety Rules

- Never invent filesystem paths.
- Never pass relative paths as `boardRoot`.
- Do not attempt path traversal or multi-segment names in list/card fields.
- Prefer read operations first when user intent is ambiguous.
- Treat `XXX-Archive` as archive list unless user explicitly asks to include/use it.

## Tool Reference

- `signboard_get_config`: inspect MCP mode and path constraints.
- `signboard_list_board_views`: list available board views (`kanban`, `calendar`, `this-week`).
- `signboard_resolve_board_by_name`: map a board directory name to absolute board paths under allowed roots, including allowed roots that are themselves board folders.
- `signboard_list_lists`: get list directory names in a board.
- `signboard_list_cards`: get card markdown files in a list.
- `signboard_read_card`: return normalized frontmatter and body.
- `signboard_create_card`: create a card from title/body/optional due+labels.
- `signboard_update_card`: patch title/body/due/labels of a card, including section edits, note insertion, label add/remove/clear, and dry-run previews.
- `signboard_duplicate_card`: duplicate an existing card with optional title/body override, label add/remove/clear, and dry-run preview.
- `signboard_archive_card`: move a card to `XXX-Archive`.
- `signboard_move_card`: move card between lists.
- `signboard_create_list`: create a list directory.
- `signboard_rename_board`: rename a board directory.
- `signboard_move_board`: move a board directory to a new parent directory.
- `signboard_read_board_settings`: read labels/theme/notification settings.
- `signboard_update_board_settings`: update labels/theme/notification settings.

## Output Style

- Confirm which board path was used.
- For reads, summarize key data (lists, card ids/titles, due dates, labels).
- For writes, report exactly what changed (before/after when relevant).
- If blocked by read-only mode or root restrictions, state the exact constraint and required user action.
