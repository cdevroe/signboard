# Signboard CLI

This guide covers the Signboard command-line interface.

## Table of Contents

- [How to Run It](#how-to-run-it)
- [Choose a Board](#choose-a-board)
- [Command Groups](#command-groups)
- [Reference Matching](#reference-matching)
- [Machine-Readable Output for Agents](#machine-readable-output-for-agents)
- [Common Workflows](#common-workflows)
- [Archive Workflows](#archive-workflows)
- [Settings and Imports](#settings-and-imports)
- [Markdown and Due-Date Conventions](#markdown-and-due-date-conventions)
- [Troubleshooting](#troubleshooting)

## How to Run It

On macOS and Linux, the desktop app can install the Signboard wrapper from `Help > Install Signboard CLI`. Sorry for those of you on Windows, but you can use WSL (it is good, and you should!).

Once installed, try it out!

```bash
signboard --help
```

The installed wrapper runs the packaged CLI in Electron's Node mode, so terminal commands do not open or quit the desktop app window.

If you need to run the packaged CLI at its full path, use Electron's Node mode and point it at the bundled CLI script:

```bash
ELECTRON_RUN_AS_NODE=1 \
  /Applications/Signboard.app/Contents/MacOS/Signboard \
  /Applications/Signboard.app/Contents/Resources/app.asar/bin/signboard.js \
  --help
```

## Choose a Board

Most commands operate on one board root. To simplify subsequent calls, you can first "choose a board" for Signboard CLI to interact with.

```bash
signboard use /Path/To/Board
```

You can always supply a differen't board's path with `--board`.

Example: 

```bash
signboard lists --board /Path/To/Board
```

You can print the current chosen board by running:

```bash
signboard use
```

## Command Groups

The CLI is organized into six command groups:

- `boards`
- `lists`
- `cards`
- `archive`
- `settings`
- `import`

### `boards`

Create a new board folder with Signboard's default starter lists.

```bash
signboard boards create /Path/To/NewBoard
signboard boards create /Path/To/NewBoard --use
signboard boards create --parent /Path/To --name "New Board" --json
signboard boards create /Path/To/EmptyBoard --no-welcome
```

Notes:

- New boards get `000-To-do-stock`, `001-Doing-stock`, `002-Done-stock`, and `XXX-Archive`.
- By default, Signboard seeds `000-hello-stock.md` in the To do list with the same starter guidance used by MCP-created boards.
- Add `--use` to make the new board the active CLI board for later commands.
- Add `--no-welcome` to create only the default list folders.

### `lists`

List, create, or rename lists.

```bash
signboard lists
signboard lists --include-archive
signboard lists create "Waiting"
signboard lists rename "Waiting" "Blocked"
```

Notes:

- `signboard lists` excludes `XXX-Archive` unless you add `--include-archive`.
- Newly created lists get an ordering prefix and a unique suffix automatically. This helps with name collisions.

### `cards`

List, read, create, or edit cards.

#### List cards

```bash
signboard cards
signboard cards "To do"
signboard cards --search release
signboard cards --label Urgent
signboard cards --label Urgent --label Writing --label-mode all
signboard cards --due today
signboard cards --due next:7 --due-source any
signboard cards --due overdue --task-status open
signboard cards --sort due
signboard cards --sort updated-oldest
signboard cards --sort created-oldest
signboard cards --limit 10
signboard cards --include-archive
```

Useful filters:

- `--list <ref>` repeatable
- `--label <ref>` repeatable
- `--label-mode any|all`
- `--search <query>`
- `--due today|tomorrow|overdue|upcoming|this-week|next:7|next:14|next:30|YYYY-MM-DD|none`
- `--due-source any|card|task`
- `--task-status open|any`
- `--sort list|due|title|updated|updated-oldest|updated-newest|created-oldest|created-newest`
- `--limit <n>`
- `--include-archive`

`updated` is kept as a compatibility alias for `updated-newest`. JSON card output includes `timestamps.createdAt` and `timestamps.updatedAt`; `createdAt` prefers Signboard card metadata and falls back to filesystem timestamps for older cards.

#### Read one card

```bash
signboard cards read --card ab123
signboard cards read --list Doing --card "Ship release notes"
signboard cards read --card 003-ship-release-notes-ab123.md
```

`cards read` always returns JSON so it is safe for scripts and agents.

#### Create a card

```bash
signboard cards create --list "To do" --title "Ship release notes"
signboard cards create --list "To do" --title "Write announcement" --due 2026-04-10
signboard cards create --list "To do" --title "Draft copy" --label Writing --label Marketing
signboard cards create --from-card ab123 --list "Leads" --title "New lead" --remove-label Template
```

Create options:

- `--list <list-ref>` required
- `--title <title>` required
- `--body <text>`
- `--body-file <path>`
- `--from-card <card-ref>` optional source card/template to copy
- `--from-list <list-ref>` optional source list disambiguation for `--from-card`
- `--due <YYYY-MM-DD|none>`
- `--label <ref>` repeatable
- `--remove-label <ref>` repeatable with `--from-card`
- `--clear-labels` with `--from-card`
- `--dry-run`

Using a body file means you can make your commands much shorter and import previous content faster, potentially.

Example with a body file:

```bash
signboard cards create \
  --list "To do" \
  --title "Launch checklist" \
  --body-file ./launch-checklist.md
```

#### Edit a card

```bash
signboard cards edit --card ab123 --title "Ship v1.2.0"
signboard cards edit --card ab123 --due 2026-04-12
signboard cards edit --card ab123 --due none
signboard cards edit --card ab123 --move-to Doing
signboard cards edit --card ab123 --append-body $'\n\nFollow up with QA.'
signboard cards edit --card ab123 --replace-section "Notes" --body-file ./notes.md
signboard cards edit --card ab123 --insert-after-heading "## Source" --text "Website form."
signboard cards edit --card ab123 --set-label Urgent
signboard cards edit --card ab123 --add-label Docs --remove-label Backlog
signboard cards edit --card ab123 --clear-labels
```

Edit options:

- `--card <card-ref>` required
- `--list <list-ref>` optional disambiguation when card refs are not unique
- `--title <title>`
- `--body <text>`
- `--body-file <path>`
- `--append-body <text>`
- `--replace-section <heading>` with `--body` or `--body-file`
- `--insert-after-heading <heading>` with `--text` or `--text-file`
- `--due <YYYY-MM-DD|none>`
- `--set-label <ref>` repeatable, replaces all labels
- `--add-label <ref>` repeatable
- `--remove-label <ref>` repeatable
- `--clear-labels`
- `--move-to <list-ref>`
- `--dry-run`

#### Duplicate a card

Use `cards duplicate` when you want Signboard to copy the full card structure, frontmatter, body, checklist metadata, ordering prefix, and future card fields.

```bash
signboard cards duplicate --card ab123 --list "Leads" --title "New lead"
signboard cards duplicate --card ab123 --from-list Templates --list "Leads" --remove-label Template --json
signboard cards duplicate --card ab123 --list "Leads" --dry-run --json
```

Duplicate options:

- `--card <card-ref>` required
- `--from-list <list-ref>` optional source disambiguation
- `--list <list-ref>` optional target list; defaults to the source list
- `--title <title>` optional exact title; defaults to `Copy of <source title>`
- `--body <text>` or `--body-file <path>` optional replacement body
- `--label <ref>` repeatable, adds labels to the duplicate
- `--remove-label <ref>` repeatable
- `--clear-labels`
- `--dry-run`

#### Add a note

Use `cards notes add` for append-only note updates. It writes under a `## Notes` section and creates that section when missing.

```bash
signboard cards notes add --card ab123 --text "Emailed follow-up" --timestamp
signboard cards notes add --card ab123 --section "Call Notes" --text-file ./call-notes.md
```

Note options:

- `--card <card-ref>` required
- `--list <list-ref>` optional disambiguation
- `--text <text>` or `--text-file <path>`
- `--timestamp` prefixes the note with the same month/day/time format used by the editor toolbar
- `--section <heading>` defaults to `Notes`
- `--dry-run`

## Reference Matching

The CLI accepts flexible references so you do not always need exact filenames.

### List refs

Lists can be matched by:

- directory name
- display name
- unique partial match of either

Example:

```bash
signboard lists rename wait blocked
```

If `wait` matches exactly one list, the command succeeds. If it matches multiple lists, the CLI fails with an ambiguity error.

### Card refs

Cards can be matched by:

- filename
- 5-character card id
- title
- unique partial match of any of those

Examples:

```bash
signboard cards read --card ab123
signboard cards read --card "Ship release notes"
signboard cards read --card ship-release
```

### Label refs

Labels can be matched by:

- label id
- label name
- unique partial match

## Machine-Readable Output for Agents

Prefer `--json` whenever you need reliable parsing.

Examples:

```bash
signboard lists --json
signboard cards --due next:7 --json
signboard archive cards --search launch --json
signboard settings --json
signboard import obsidian --source ~/Vault/Boards --json
```

Recommended agent workflow:

1. Pass `--board <path>` instead of changing global state with `signboard use`.
2. Read before write when references may be ambiguous.
3. Use `--json` for reads and verification.
4. Use `--dry-run --json` before card writes when you need to preview a mutation.
5. Use exact list or card references when possible.

## Common Workflows

### Create a new board and select it

```bash
signboard boards create ~/Boards/LaunchPlan --use
signboard lists
```

### Find cards due this week

```bash
signboard cards --due this-week --sort due --json
```

### Find cards with overdue checklist items

```bash
signboard cards --due overdue --due-source task --task-status open --json
```

### Create a card and move it later

```bash
signboard cards create --list Backlog --title "Write release post" --label Docs --due 2026-04-08
signboard cards edit --card "Write release post" --move-to Doing
```

### Search by title or body text

```bash
signboard cards --search release
```

### Filter by multiple labels

```bash
signboard cards --label Docs --label Review --label-mode all
```

### Show recently updated cards

```bash
signboard cards --sort updated --limit 20 --json
```

### Find stale or oldest cards

```bash
signboard cards --sort updated-oldest --limit 20 --json
signboard cards --sort created-oldest --limit 20 --json
```

## Archive Workflows

The CLI can find and restore archived cards and lists.

### List archived cards

```bash
signboard archive cards
signboard archive cards --search launch --json
```

### List archived lists

```bash
signboard archive lists
signboard archive lists --search done --json
```

### Read one archived entry

```bash
signboard archive read --kind card --entry ab123
signboard archive read --kind list --entry "Done"
```

### Restore an archived card

```bash
signboard archive restore-card --card ab123 --to-list "To do"
```

The `--card` value can be an archive path, archived filename, card id, or title as long as it resolves uniquely.

### Restore an archived list

```bash
signboard archive restore-list --list "Completed Sprint"
signboard archive restore-list --list "Completed Sprint" --as 010-Completed-Sprint-restored
```

If you use `--as`, provide the directory name you want for the restored list.

## Settings and Imports

### Read board settings

```bash
signboard settings
signboard settings --json
```

This returns the board settings Markdown document, including labels, color scheme data, workflow settings for completed lists, and whether the board is included in External Published Calendar. App-wide tooltip, notification, Quick Add global shortcut, and External Published Calendar server preferences are desktop app settings, not board settings.

Current CLI editing support is intentionally narrow.

For label editing, color-scheme changes, completed-list workflow changes, and External Published Calendar board inclusion changes, use the desktop app or edit `board-settings.md` carefully.

### Import from Trello

Trello will give you a JSON export of any board. You can import it into the current board.

```bash
signboard import trello --file ~/Downloads/trello-export.json
```

### Import from Obsidian

You can import any Markdown files. But also Signboard supports the frontmatter and metadata created by most of the leading popular community kanban plugins for Obsidian.

```bash
signboard import obsidian --source ~/Vault/Kanban.md
signboard import obsidian --source ~/Vault/Boards --source ~/Vault/ExtraBoard.md
```

### Import from Tasks.md

Tasks.md is one of the most popular Markdown kanban apps on GitHub. You can import data created with that app into Signboard.

```bash
signboard import tasksmd --source ~/Projects/MyTasksBoard
```

All import commands support `--json`.

## Markdown and Due-Date Conventions

Cards are Markdown files with frontmatter. The CLI reads and writes that structure for you. So you don't need to worry about that unless you are supplying your own files.

### Card due dates

Use ISO local dates:

```text
YYYY-MM-DD
```

Examples:

- `2026-04-02`
- `2026-04-14`
- `none` to clear the card due date

### Checklist due dates

Checklist items may also contain due dates in the body:

```md
- [ ] (due: 2026-04-05) Review screenshots
- [x] (due: 2026-04-01) Draft release notes
```

Task due dates participate in CLI due-date filtering. Use `--task-status open` to limit task matches to unchecked items, or `--task-status any` to include checked task due markers when you want historical matches.
