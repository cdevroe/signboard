# Using Signboard

This guide covers the desktop app and the core workflow for managing a project in Signboard.

## Table of Contents

- [How Signboard Stores Your Board](#how-signboard-stores-your-board)
- [Create or Open a Board](#create-or-open-a-board)
- [Work with Lists](#work-with-lists)
- [Work with Cards](#work-with-cards)
- [Due Dates, Labels, and Checklists](#due-dates-labels-and-checklists)
- [Search, Filters, and Open Boards](#search-filters-and-open-boards)
- [Kanban and Planner Views](#kanban-and-planner-views)
- [Planner](#planner)
- [Archive and Restore](#archive-and-restore)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [A Few Practical Tips](#a-few-practical-tips)

## How Signboard Stores Your Board

Signboard is file-first.

- A board is a folder on disk.
- Lists are folders inside the board.
- Cards are Markdown files inside those list folders.
- Board-level settings live in `board-settings.md`.
- Archived cards and lists live in `XXX-Archive`.

Because the board is just files and folders, you can back it up, sync it, inspect it in your editor, and use it from the CLI or MCP server.

## Create or Open a Board

When Signboard opens without a board selected, click `Create your first board` and choose an empty directory.

If the directory is empty, Signboard creates a starter board with:

- `To do`
- `Doing`
- `Done`
- `Archive`

It also creates a starter card that explains the basics. 👋

You can switch between multiple projects using the board tabs across the top of the window. Signboard does not cap the number of open boards; when they no longer fit, the tab strip shows an `N more` control that opens the quick board switcher.

Press `Cmd/Ctrl + K` from any screen to open the quick board switcher, then type an open board name and press `Enter`. You can also close open boards from the switcher result list.

## Work with Lists

Lists are the columns of your kanban board.

### Create a list

You can create a list in a few ways:

- Press `Cmd/Ctrl + Shift + N`
- Use the list actions menu on an existing list and choose `Add new list`

Signboard creates a numbered folder for the list and keeps ordering based on that folder prefix.

### Rename a list

Click a list title, edit it inline, and press `Enter` or click away.

Under the hood, Signboard updates the folder name while preserving its ordering prefix.

### Move lists

Lists can be reordered visually in the board. Since list order is stored in the folder naming scheme, Signboard updates the underlying directory names.

### Archive a list

Open the list actions menu and choose `Archive this list`.

Archiving a list moves the entire list into `XXX-Archive` so it is removed from the active board without deleting its cards. It can be restored!

## Work with Cards

Cards are Markdown files, so every card is portable and readable outside the app.

### Create a card

You can create a card by:

- Pressing `Cmd/Ctrl + N`
- Using the `Add new card` button for a specific list

In the new-card modal, press `Shift + Enter` after typing the title to create the card, open it immediately, and focus the notes field.

Card filenames are chosen based on the name or title you first give it, along with a prefix for ordering, and a random card ID suffix (to help with name collisions). Once set, the filename will stay the same even if you rename the card.

### Open and edit a card

Click a card to open it. In the card editor you can:

- Rename the card
- Edit the Markdown body
- Set a due date
- Add or remove labels
- Move the card to another list
- Move it to the next list
- Duplicate it
- Share it
- Archive it

The card body is Markdown, so plain text notes, headings, lists, and checklists all work naturally.

Right-click in editable areas of the card title or body to use the native cut, copy, paste, delete, and select-all context menu.

### Move cards

Drag a card between lists in kanban view. You can also move it from the card editor by changing its list in the dropdown menu at the top of the card modal.

While dragging, the board shows an empty insertion slot where the card would land; the card is moved only after you drop it.

The list dropdown, arrow action, and card move keyboard shortcuts in the editor place moved cards at the top of the destination list.

### Duplicate a card

Use the duplicate action in the card editor when you want a copy of the card, including its content and metadata. You can use this to make it quick and easy to create new cards from templates. That's what I do!

The CLI can also duplicate cards and create cards from templates with `cards duplicate` and `cards create --from-card`, including dry-run previews for automation.

### Share a card

Use the share action in the card editor to hand the underlying Markdown file to another app using the operating system share flow when supported.

## Due Dates, Labels, and Checklists

These features are what make cards show up in Planner and filters.

### Card due dates

Every card can have a due date.

Once a card has a due date, it becomes visible in:

- due date displays on the card
- due-date-aware filters
- Planner
- daily due notifications if enabled in app settings

### Task list items with due dates

Signboard also understands due dates inside Markdown task lists.

Example:

```md
- [ ] Draft release notes
- [ ] (due: 2026-04-05) Send beta build
- [x] Review copy
```

Task due dates are separate from the card’s main due date. They are included in CLI filters and Planner views, so a card can surface because one of its checklist items is due even if the card itself has no top-level due date.

### Labels

Labels are defined per board. Add them in `Settings > Labels`, then assign them to cards from the card editor.

Labels are useful for:

- priority
- work type
- people or teams
- contexts such as `Waiting`, `Errands`, or `Writing`
- Version numbers!

### Progress counters

If a card contains checklist items, Signboard shows progress based on completed versus total tasks.

## Search, Filters, and Open Boards

### Search

Use the search field in the header. Reminder: `Cmd/Ctrl + F` to focus the search field.

Search matches card title and body text.

### Date and Label filters

Use the filter button in the header to narrow the visible cards by due today, overdue, and your board labels.

## Kanban and Planner Views

Board context is Kanban. Dated planning happens in Planner.

### Kanban

Kanban is the board view. Use it for day-to-day drag-and-drop organization.

### Dated Views

Planner Calendar, This Week, Day, and Agenda place cards and due task items on dates across your open boards. Calendar and This Week use Monday-first weeks.

Use it when you want to answer questions like:

- What is due this month?
- Which days are overloaded?
- Which cards have dated checklist items?
- What dates do I have open?

### Switch views

- `Cmd/Ctrl + 1`: Kanban, closing Planner if it is open
- `Cmd/Ctrl + 2`: Planner Calendar for all open boards
- `Cmd/Ctrl + 3`: Planner This Week for all open boards
- `Cmd/Ctrl + Option/Alt + 2`: Planner Calendar for the current board
- `Cmd/Ctrl + Option/Alt + 3`: Planner This Week for the current board
- `Cmd/Ctrl + Option/Alt + 4`: Planner Day for the current board
- `Cmd/Ctrl + Option/Alt + 5`: Planner Agenda for the current board

## Planner

Planner is a workspace-level view for dated work across your currently open boards. It appears as a narrow rail on the far left when at least one board is open.

Open Planner from the left rail or press `Cmd/Ctrl + Shift + P`. Planner slides over the board tabs and board content, so it is clear you are no longer looking at a single board.

Planner includes:

- Calendar
- This Week
- Day
- Agenda

Planner cards show their source as `Board · List`, with that source pill tinted from the source board's color scheme. Clicking a Planner card opens the normal card editor and switches the active board behind Planner when needed, so labels and list moves stay tied to the card’s real board.

Planner defaults to all open boards. Use the scope toggle to narrow to the current board, or use the filter menu to choose a custom set of open boards.

Planner search matches card title, body, board name, and list name. Planner filters can narrow by date (`Today` or `Overdue`), completed-card visibility, and open board. When Planner is scoped to the current board only, the filter menu also includes that board's labels.

Planner hides cards from completed lists by default. Each board can auto-detect lists named `Done`, `Completed`, `Complete`, `Closed`, `Finished`, `Resolved`, or `Shipped`, and you can override those choices in Settings. Use the Planner filter menu when you want completed dated cards shown for historical review.

Planner uses your light/dark mode but keeps the default Signboard color palette instead of inheriting the active board color scheme.

### Planner shortcuts

- `Cmd/Ctrl + Shift + P`: open or close Planner
- `Cmd/Ctrl + 2`: Calendar for all open boards
- `Cmd/Ctrl + 3`: This Week for all open boards
- `Cmd/Ctrl + 4`: Day for all open boards
- `Cmd/Ctrl + 5`: Agenda for all open boards
- `Cmd/Ctrl + Option/Alt + 2`: Calendar for the current board
- `Cmd/Ctrl + Option/Alt + 3`: This Week for the current board
- `Cmd/Ctrl + Option/Alt + 4`: Day for the current board
- `Cmd/Ctrl + Option/Alt + 5`: Agenda for the current board

Inside Planner, `Cmd/Ctrl + 1` closes Planner and returns to the Kanban board.

## Archive and Restore

Archiving removes things from the active board without deleting them.

### Archive a card

Open the card editor and choose the archive action.

### Archive all cards in a list

Open the list actions menu and choose `Archive cards in this list`.

### Archive a list

Open the list actions menu and choose `Archive this list`.

### Restore from archive

Open the board menu and choose `Archive`.

From the archive browser you can:

- browse archived cards
- browse archived lists
- search archived content
- inspect details before restoring
- restore a card into a destination list
- restore an archived list back into the board

This lets you keep the active board clean without losing history.

## Settings

Open `Settings` from the board menu or press `Cmd/Ctrl + ,`.

### App Settings

The `App Settings` section controls settings that apply across Signboard:

- tooltips
- daily due-date reminders

If notifications are enabled, Signboard checks open boards each day at the configured local time and shows a reminder when cards are due.

### Board General

The board `General` section lets you:

- rename the board
- move the board folder to a new location

### Workflow

The `Workflow` section controls which lists count as completed work for the current board.

Completed-list cards keep their due dates, but Planner date views, the Planner `Overdue` filter, board date filters, and daily due reminders hide them by default so finished work does not look actionable.

Auto-detection is enabled by default. You can turn it off, manually choose completed lists, or uncheck an auto-detected list.

### Labels

The `Labels` section lets you:

- add labels
- rename labels
- choose label colors
- remove labels

Labels are stored with the board so each board can have its own vocabulary.

### Colors

The `Colors` section lets you choose a board color scheme. Each scheme includes both light and dark variants.

You can also apply the color scheme to all currently open boards.

### Import

The `Import` section can bring content into the current board from:

- Trello
- Obsidian
- Tasks.md

Imports copy data into Signboard and leave the original source files where they are.

## Keyboard Shortcuts

On macOS, use `Cmd`. On Windows and Linux, use `Ctrl`.

- `Cmd/Ctrl + /`: open keyboard shortcuts
- `Cmd/Ctrl + K`: switch between currently open boards
- `Cmd/Ctrl + N`: create a card
- `Cmd/Ctrl + Shift + N`: create a list
- `Cmd/Ctrl + 1`: return to Kanban and close Planner
- `Cmd/Ctrl + 2`: open Planner Calendar for all open boards
- `Cmd/Ctrl + 3`: open Planner This Week for all open boards
- `Cmd/Ctrl + Shift + P`: open or close Planner
- `Cmd/Ctrl + 4`: switch to Planner Day view for all open boards when Planner is open
- `Cmd/Ctrl + 5`: switch to Planner Agenda view for all open boards when Planner is open
- `Cmd/Ctrl + Option/Alt + 2`: open Planner Calendar for the current board
- `Cmd/Ctrl + Option/Alt + 3`: open Planner This Week for the current board
- `Cmd/Ctrl + Option/Alt + 4`: open Planner Day for the current board
- `Cmd/Ctrl + Option/Alt + 5`: open Planner Agenda for the current board
- `Cmd/Ctrl + ,`: open Settings
- `Cmd/Ctrl + Shift + D`: toggle light and dark mode
- `Cmd + Control + Shift + C` on macOS, `Ctrl + Alt + Shift + C` elsewhere: cycle board color schemes
- `Cmd/Ctrl + Shift + [`: move the open card to the previous list
- `Cmd/Ctrl + Shift + ]`: move the open card to the next list
- `Cmd/Ctrl + Option/Alt + Shift + Backspace`: archive the open card
- `Cmd/Ctrl + Shift + A`: open Archive
- `Cmd/Ctrl + F`: focus board search or Planner search
- `Esc`: close open modals

When a card is open, workspace-level shortcuts such as create, board switcher, Planner/view switching, Settings, Archive, and search close the card first. Card-specific shortcuts such as moving or archiving the open card still act on that card.

You can also open the shortcut helper from `Help > Keyboard Shortcuts`.

## A Few Practical Tips

- Keep list names short. They are stored in folder names, so concise names stay readable on disk.
- Use labels for durable categories and use lists for workflow stages.
- Archive aggressively. The archive browser makes restoring easy.
- If you want automation or scripting, pair this guide with [Signboard CLI](./signboard-cli.md).
