# CLI and MCP board operations

The CLI and MCP expose the same core board operations. Use the CLI for scripts and MCP for structured agent calls. See the [CLI guide](./signboard-cli.md) for reference matching and [MCP guide](../MCP_README.md) for allowed roots and read-only mode.

| Operation | CLI | MCP |
| --- | --- | --- |
| Discover/create boards | `boards list`, `boards create` | `signboard_list_boards`, `signboard_create_board` |
| Rename/move/duplicate a board | `boards rename`, `boards move`, `boards duplicate` | `signboard_rename_board`, `signboard_move_board`, `signboard_duplicate_board` |
| Create/rename a list | `lists create`, `lists rename` | `signboard_create_list`, `signboard_rename_list` |
| Search/filter cards | `cards --search/--label/--due` | `signboard_search_cards` |
| Read/create/edit/duplicate a card | `cards read/create/edit/duplicate` | `signboard_read_card`, `signboard_create_card`, `signboard_update_card`, `signboard_duplicate_card` |
| Move a card | `cards edit --move-to` | `signboard_move_card` |
| Archive cards/lists | `cards archive`, `lists archive` | `signboard_archive_card`, `signboard_archive_list` |
| Browse/read/restore archives | `archive cards/lists/read/restore-card/restore-list` | `signboard_list_archive_entries`, `signboard_read_archive_entry`, `signboard_restore_archived_card`, `signboard_restore_archived_list` |
| Save card/list order | `cards reorder`, `lists reorder` | `signboard_reorder_cards`, `signboard_reorder_lists` |
| Read/update board settings | `settings`, `settings update` | `signboard_read_board_settings`, `signboard_update_board_settings` |
| Import Trello/Obsidian/Tasks.md | `import trello/obsidian/tasksmd` | `signboard_import_trello`, `signboard_import_obsidian`, `signboard_import_tasksmd` |

This table describes board-file operations. Desktop window control, app preferences, and Smart Actions have their own interfaces.

## Archive and restore

```bash
signboard cards archive --card ab123 --list "To do" --json
signboard archive cards --json
signboard archive restore-card --card ab123 --to-list "To do" --json
signboard lists archive "Completed Sprint" --json
signboard archive restore-list --list "Completed Sprint" --json
```

Archiving uses the same lifecycle and original-list metadata as the desktop and MCP. It moves data into `XXX-Archive` and leaves it available for restoration. Ambiguous references fail without archiving a match.

## Board management

```bash
signboard boards rename "Launch plan" --board /path/to/Board --json
signboard boards move --parent /path/to/Projects --board "/path/to/Launch plan" --json
signboard boards duplicate --parent /path/to/Templates --name "Launch template" --board "/path/to/Projects/Launch plan" --json
```

Rename and move update card board metadata and return `newBoardRoot`. The CLI updates its selected board if it points to the moved board. Move uses a filesystem rename; cross-filesystem moves can fail without relocating the board. Reopen a relocated board in the desktop using its returned path.

Duplication returns `boardRoot` for the copy, assigns fresh card IDs, remaps internal card links, and leaves the source unchanged. Destinations must not already exist or be inside the source board. MCP requires both source and destination within its allowed roots; an explicitly trusted source board alone does not authorize a sibling destination.

## Persisted ordering

```bash
signboard cards reorder --list "To do" --card ab123 --card cd456 --card ef789 --json
signboard cards reorder --list "To do" --by due --json
signboard lists reorder --list "To do" --list Doing --list Done --json
```

An explicit order must contain every current card in the selected list, or every active list in the board, exactly once. `XXX-Archive` is excluded from list ordering. Missing, duplicate, ambiguous, or obsolete references fail before mutation. Refresh discovery and retry when the set has changed. A same-set concurrent reorder cannot be detected solely from this request.

MCP uses exact names: `signboard_reorder_cards` takes `boardRoot`, `listName`, and either `cardFiles` or `orderBy: "due"`; `signboard_reorder_lists` takes `boardRoot` and `listNames`. Use the returned card/list paths for subsequent operations because numbering may change.

Due ordering uses the card due date first, otherwise its earliest incomplete task due date. Undated cards go last, with existing order preserved for ties. These commands persist file order; `cards --sort` only changes query output. Shared transactional helpers preserve unaffected files and roll back failed renames. Completed-list workflow references follow list prefix changes.

## Board settings updates

```bash
signboard settings --json
signboard settings update --file /path/to/board-settings-patch.json --json
```

The file contains a JSON object with one or more of `labels`, `themeOverrides`, `workflow`, or `externalPublishedCalendar`, matching the MCP settings update fields. For example:

```json
{
  "workflow": {
    "autoDetectCompletedLists": false,
    "completedListNames": ["002-Done-stock"],
    "ignoredCompletedListNames": []
  },
  "externalPublishedCalendar": { "include": false }
}
```

Supplied fields replace that field's value after shared normalization; omitted top-level fields remain unchanged. Read the current settings before replacing a label array or workflow object. These are board settings, not application preferences or credentials.

## MCP queries

`signboard_search_cards` searches a whole board or exact `listNames`, with `search`, `labels`, `labelMode` (`any`/`all`), `due`, `dueSource` (`any`/`card`/`task`), `taskStatus` (`open`/`any`), and the CLI's title/due/created/updated sort options. Overdue task filtering defaults to incomplete tasks. `includeArchive` includes standalone archived cards; use the archive tools for cards inside archived lists.

Results contain card IDs, current list names and filenames, titles, labels, dates, timestamps and task summaries. Full bodies come from `signboard_read_card`. `limit` defaults to 50 and accepts 1–100; `offset` starts at zero. Continue at `nextOffset` until it is `null`. Paging reads current board state, so repeat the query if another writer changes the board between pages. Incomplete reads fail rather than presenting partial results as complete.

The original `signboard_list_cards` remains a lightweight filename listing for one list. Search works in MCP read-only mode. New mutation commands require write mode and execute immediately; the existing card create/edit/duplicate previews remain available through `dryRun` or `--dry-run`.
