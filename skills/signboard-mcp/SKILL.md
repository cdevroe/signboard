---
name: signboard-mcp
description: Use this skill when working with Signboard boards through the local MCP server (listing lists/cards, reading cards, and safely creating/updating/moving cards or board settings).
---

# Signboard MCP Skill

Use this skill when the user asks to read or modify Signboard data through MCP.

## Preconditions

- Signboard MCP server is configured and running.
- `boardRoot` values must be absolute paths.
- Respect server mode from `signboard.get_config`:
  - `readOnly: true` means do not attempt write tools.
  - If `allowedRoots` is non-empty, only use board paths inside those roots.

## Tool Workflow

1. Call `signboard.get_config` first.
2. If board root is unknown, ask user for the absolute board path.
   - If `allowedRoots` are configured, prefer `signboard.resolve_board_by_name` first.
3. Discover structure:
   - `signboard.list_lists`
   - `signboard.list_cards`
   - `signboard.read_card` as needed
4. Before write actions, verify:
   - user requested the change
   - server is not read-only
   - target list/card exists (or should be created)
5. Execute write tool only after checks:
   - `signboard.create_card`
   - `signboard.update_card`
   - `signboard.duplicate_card`
   - `signboard.archive_card`
   - `signboard.move_card`
   - `signboard.create_list`
   - `signboard.update_board_settings`

## Safety Rules

- Never invent filesystem paths.
- Never pass relative paths as `boardRoot`.
- Do not attempt path traversal or multi-segment names in list/card fields.
- Prefer read operations first when user intent is ambiguous.
- Treat `XXX-Archive` as archive list unless user explicitly asks to include/use it.

## Tool Reference

- `signboard.get_config`: inspect MCP mode and path constraints.
- `signboard.resolve_board_by_name`: map a board directory name to absolute board paths under allowed roots.
- `signboard.list_lists`: get list directory names in a board.
- `signboard.list_cards`: get card markdown files in a list.
- `signboard.read_card`: return normalized frontmatter and body.
- `signboard.create_card`: create a card from title/body/optional due+labels.
- `signboard.update_card`: patch title/body/due/labels of a card.
- `signboard.duplicate_card`: duplicate an existing card with optional label removal.
- `signboard.archive_card`: move a card to `XXX-Archive`.
- `signboard.move_card`: move card between lists.
- `signboard.create_list`: create a list directory.
- `signboard.read_board_settings`: read labels/theme settings.
- `signboard.update_board_settings`: update labels/theme settings.

## Output Style

- Confirm which board path was used.
- For reads, summarize key data (lists, card ids/titles, due dates, labels).
- For writes, report exactly what changed (before/after when relevant).
- If blocked by read-only mode or root restrictions, state the exact constraint and required user action.
