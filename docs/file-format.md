# File format and backups

This reference describes Signboard 1.7.x boards for people inspecting their files and agents integrating with them. Use the [CLI](./signboard-cli.md) or [MCP server](../MCP_README.md) for routine automation: they maintain ordering, card identity, and related metadata when changing files.

## Board layout

A typical board looks like this:

```text
Launch Plan/
  board-settings.md
  000-To-do-stock/
    000-draft-announcement-ab123.md
  001-Doing-stock/
  002-Done-stock/
  XXX-Archive/
```

Lists are directories. Cards are Markdown files inside those directories. Numeric prefixes store manual list/card order; three digits are the minimum padding, so ordering continues beyond 999. Display names hide the ordering prefix and identifying suffix.

The final card filename suffix supplies its identity. Changing a card's title does not rename its file, but moving or reordering cards can change their paths. Use the app, CLI, or MCP to move and duplicate cards so destination metadata and copied IDs remain correct.

`board-settings.md` contains the board's labels, color scheme, completed-list workflow, and calendar inclusion setting. `XXX-Archive` retains archived cards and lists. Archived lists can also contain a hidden `.signboard-archive.json` recovery file.

## Card content

A simplified card has YAML frontmatter followed by Markdown:

```markdown
---
title: Draft announcement
start: '2026-09-22'
due: '2026-09-24'
labels: []
---
## Notes

Prepare the release announcement.

- [ ] (start: 2026-09-22) Draft copy
- [ ] (due: 2026-09-24) Publish
```

`start` and `due` are optional local calendar dates in `YYYY-MM-DD` form. Labels store IDs defined by this board, not their display names. Task dates go at the start of checklist content; `(scheduled: YYYY-MM-DD)` is another spelling for a task start date. Completed task dates stay in the file but do not keep a card in Planner's actionable date results.

Cards written by Signboard also carry managed fields such as `signboard_id`, `signboard_board`, `signboard_list`, `status`, and `signboard_uri`. New cards have `createdAt` and a compact `activity` history. Linked objects use `linked_objects` and, where applicable, `related`; archived cards have restore metadata in `archive`. Preserve these fields and any unrecognized properties when editing Markdown directly. Use duplication tools to make a new card instead of copying its identity fields.

CLI and MCP responses expose `timestamps.updatedAt` from the file's modification time. It is not a separately maintained `updatedAt` frontmatter field. Older cards without a recorded creation date use filesystem timestamps as a fallback, so copying files can affect their displayed age.

## What to back up

Copy the **whole board directory**, including `board-settings.md`, `XXX-Archive`, and hidden files. A collection of active card files alone omits settings and restore information. Closing the board and finishing other writes before taking a copy avoids mixing files from different moments.

Linked local files and folders remain at their original locations; linking them does not copy them into the board. Back those up separately. For a board inside an Obsidian vault, backing up the whole vault also preserves linked notes outside the board and vault configuration.

App-wide settings, open-board tabs, trusted roots, and CLI preferences are stored separately from board folders. A board backup preserves the board's content, not every preference of the installed app.

## Restore or sync a board

Restore a backup into a separate folder first and open that folder in Signboard to inspect it. Keep the current copy until you have checked the restored cards, lists, labels, and archive. Once you choose the restored copy, close the other one: restoring a backup preserves card IDs, whereas **Duplicate Board** creates new identities for an independent board.

You can use a filesystem sync service for board folders. Let synchronization finish before editing on another device, and avoid simultaneous edits to the same card. Signboard 1.7.x does not provide a multi-user conflict-merging service. Keep versioned backups as well as sync, since deletions and unwanted changes can sync too.

When the desktop app is open, external file changes are watched and an unchanged open editor can refresh. Finish or close an active edit before an agent or another editor rewrites that card.
