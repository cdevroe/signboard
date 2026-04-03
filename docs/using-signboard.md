# Using Signboard

This guide covers the desktop app and the core workflow for managing a project in Signboard.

## Table of Contents

- [How Signboard Stores Your Board](#how-signboard-stores-your-board)
- [Create or Open a Board](#create-or-open-a-board)
- [Work with Lists](#work-with-lists)
- [Work with Cards](#work-with-cards)
- [Due Dates, Labels, and Checklists](#due-dates-labels-and-checklists)
- [Search, Filters, and Open Boards](#search-filters-and-open-boards)
- [Board Views](#board-views)
- [Archive and Restore](#archive-and-restore)
- [Board Settings](#board-settings)
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

You can switch between multiple projects using the board tabs across the top of the window.

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

### Move cards

Drag a card between lists in kanban view. You can also move it from the card editor by changing its list in the dropdown menu at the top of the card modal.

### Duplicate a card

Use the duplicate action in the card editor when you want a copy of the card, including its content and metadata. You can use this to make it quick and easy to create new cards from templates. That's what I do!

### Share a card

Use the share action in the card editor to hand the underlying Markdown file to another app using the operating system share flow when supported.

## Due Dates, Labels, and Checklists

These features are what make cards show up in the calendar and this week views and filters.

### Card due dates

Every card can have a due date.

Once a card has a due date, it becomes visible in:

- due date displays on the card
- due-date-aware filters
- Calendar view
- This Week view
- daily due notifications if enabled for the board

### Task list items with due dates

Signboard also understands due dates inside Markdown task lists.

Example:

```md
- [ ] Draft release notes
- [ ] (due: 2026-04-05) Send beta build
- [x] Review copy
```

Task due dates are separate from the card’s main due date. They are included in CLI filters and calendar and this week views, so a card can surface because one of its checklist items is due even if the card itself has no top-level due date.

### Labels

Labels are defined per board. Add them in `Board Settings > Labels`, then assign them to cards from the card editor.

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

## Board Views

Signboard includes three board views.

### Kanban

Kanban is the default view. Use it for day-to-day drag-and-drop organization.

### Calendar

Calendar view places cards and due task items on calendar dates so you can see upcoming work by month. The week starts on a Monday. Anything else is a bug.

Use it when you want to answer questions like:

- What is due this month?
- Which days are overloaded?
- Which cards have dated checklist items?
- What dates do I have open?

### This Week

Inspired by multiple years coming up with a unique Bullet Journal view in my paper notebook, This Week view focuses on the current week, Monday through Sunday. It lets to sit and plan your week and understand what needs done each day. I love it.

### Switch views

- `Cmd/Ctrl + 1`: Kanban
- `Cmd/Ctrl + 2`: Calendar
- `Cmd/Ctrl + 3`: This Week

You can also switch views from the board menu. Like an animal.

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

## Board Settings

Open `Board Settings` from the board menu or press `Cmd/Ctrl + ,`.

### General

The `General` section lets you:

- rename the board
- move the board folder to a new location
- enable or disable tooltips for that board

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

### Notifications

The `Notifications` section controls daily due-date reminders.

You can:

- turn reminders on or off
- choose the local notification time in 24-hour `HH:MM` format
- apply notification settings to all open boards

If notifications are enabled, Signboard checks the board each day at the configured local time and shows a reminder when cards are due.

### Import

The `Import` section can bring content into the current board from:

- Trello
- Obsidian
- Tasks.md

Imports copy data into Signboard and leave the original source files where they are.

## Keyboard Shortcuts

On macOS, use `Cmd`. On Windows and Linux, use `Ctrl`.

- `Cmd/Ctrl + /`: open keyboard shortcuts
- `Cmd/Ctrl + N`: create a card
- `Cmd/Ctrl + Shift + N`: create a list
- `Cmd/Ctrl + 1`: switch to Kanban view
- `Cmd/Ctrl + 2`: switch to Calendar view
- `Cmd/Ctrl + 3`: switch to This Week view
- `Cmd/Ctrl + ,`: open Board Settings
- `Cmd/Ctrl + Shift + D`: toggle light and dark mode
- `Cmd/Ctrl + F`: focus search
- `Esc`: close open modals

You can also open the shortcut helper from `Help > Keyboard Shortcuts`.

## A Few Practical Tips

- Keep list names short. They are stored in folder names, so concise names stay readable on disk.
- Use labels for durable categories and use lists for workflow stages.
- Archive aggressively. The archive browser makes restoring easy.
- If you want automation or scripting, pair this guide with [Signboard CLI](./signboard-cli.md).
