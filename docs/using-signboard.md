# Using Signboard

This guide covers the desktop app and the core workflow for managing a project in Signboard.

## Table of Contents

- [How Signboard Stores Your Board](#how-signboard-stores-your-board)
- [Create or Open a Board](#create-or-open-a-board)
- [Work with Lists](#work-with-lists)
- [Work with Cards](#work-with-cards)
- [Due Dates, Labels, and Checklists](#due-dates-labels-and-checklists)
- [Search, Filters, and Open Boards](#search-filters-and-open-boards)
- [Board and Planner Views](#board-and-planner-views)
- [Planner](#planner)
- [Archive and Restore](#archive-and-restore)
- [Settings](#settings)
- [Accessibility](#accessibility)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [A Few Practical Tips](#a-few-practical-tips)

## How Signboard Stores Your Board

Signboard is file-first.

- A board is a folder on disk.
- Lists are folders inside the board.
- Cards are Markdown files inside those list folders.
- Board-level settings live in `board-settings.md`.
- Archived cards and lists live in `XXX-Archive`.

Boards can live inside an Obsidian vault. Use a normal folder such as `Vault/Signboard/<Board Name>/`; do not create a nested vault inside the board. You can also move an existing board into a vault later from `Settings > General > Move Board`.

Because the board is just files and folders, you can back it up, sync it, inspect it in your editor, and use it from the CLI or MCP server.

## Create or Open a Board

When Signboard opens without a board selected, click `Create your first board` and choose an empty directory.

If the directory is empty, Signboard creates a starter board with:

- `To do`
- `Doing`
- `Done`
- `Archive`

It also creates a starter card that explains the basics and includes a few upcoming checklist due-date examples. 👋

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

You can also open a list's actions menu and choose `Move list left` or `Move list right`.

### Archive a list

Open the list actions menu and choose `Archive this list`.

Archiving a list moves the entire list into `XXX-Archive` so it is removed from the active board without deleting its cards. It can be restored!

## Work with Cards

Cards are Markdown files, so every card is portable and readable outside the app.

### Create a card

You can create a card by:

- Pressing `Cmd/Ctrl + N` to open Quick Add for any currently open board
- Using the `Add new card` button for a specific list

In the Quick Add card modal, choose the board and list before creating the card. Press `Shift + Enter` after typing the title to create the card, open it immediately, and focus the notes field.

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
- Open it in Obsidian or the default Markdown app
- Create, open, or remove linked objects
- Archive it

The card body is Markdown, so plain text notes, headings, lists, and checklists all work naturally.

The editor shows when the card was created and when it was last updated. Newer cards use Signboard's card metadata for the created date; older cards fall back to filesystem timestamps.

Right-click in editable areas of the card title or body to use the native cut, copy, paste, delete, and select-all context menu.

### Move cards

Drag a card between lists in Kanban view. You can also move it from the card editor by changing its list in the dropdown menu at the top of the card modal, or from Table view by changing the row's list dropdown.

While dragging, the board shows an empty insertion slot where the card would land; the card is moved only after you drop it.

The list dropdown, arrow action, and card move keyboard shortcuts in the editor place moved cards at the top of the destination list.

### Duplicate a card

Use the duplicate action in the card editor when you want a copy of the card, including its content and metadata. You can use this to make it quick and easy to create new cards from templates. That's what I do!

The CLI can also duplicate cards and create cards from templates with `cards duplicate` and `cards create --from-card`, including dry-run previews for automation.

### Share a card

Use the share action in the card editor to hand the underlying Markdown file to another app using the operating system share flow when supported.

### Use Obsidian with Signboard

You can keep a board inside an Obsidian vault. A practical layout is `Vault/Signboard/<Board Name>/`. Do not make the board a nested vault with its own `.obsidian` folder. If you already created the board elsewhere, use `Settings > General > Move Board` and choose a folder inside the vault.

When Signboard detects that the board is inside a vault, the card editor's Open With menu can open the card in Obsidian and copy an Obsidian URI. Use the paperclip control next to labels to create a linked Obsidian note in the board folder. Signboard-created notes use the name `Linked Signboard Note.md` when available, add a numeric suffix when needed, and start empty except for link metadata. If the board is not inside a vault, Signboard explains that requirement instead of creating the note or Base file.

The same paperclip menu can link local files, folders, web URLs, app deep links, and `signboard://` links. You can also drag local files onto the open card editor to link them to that card. Local files and folders stay wherever they are on your computer; Signboard stores the path and opens the item in your default app. Web links open in your default browser, accept entries like `example.com/page`, and Signboard caches site favicons locally when possible so linked URL chips stay fast.

Linked objects appear in the card editor as removable chips. Click the object name to open it, or click its remove control to unlink it from the card without deleting the underlying file, folder, or note. Cards with linked objects also show a small paperclip count in Kanban and Table views.

New or edited cards include flat Obsidian-friendly properties such as `title`, `signboard_id`, `signboard_board`, `signboard_list`, `status`, `signboard_uri`, and `related`, plus structured `linked_objects` when the card has linked files, folders, URLs, app links, or Obsidian notes. When a board is inside a vault, Signboard automatically creates `Signboard Board.base` for Obsidian Bases and keeps it current while it is still Signboard-managed. If you customize the Base in Obsidian, Signboard leaves it alone until you choose `Settings > Obsidian > Generate Base` again.

Signboard also includes an optional desktop-only Obsidian companion plugin in `obsidian-plugin/`. Copy that folder into your vault as `.obsidian/plugins/signboard-companion` and enable it from Obsidian's Community plugins settings. The plugin can open and copy Signboard links, attach the active Obsidian note to a Signboard card, open cards by `obsidian://signboard?cardId=...`, and add a folder context-menu action named `Create Signboard`. That action asks first, then adds board metadata/list folders, treats existing child folders as lists, moves top-level Markdown notes into a To-do list, and opens the board in Signboard.

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

Task due dates are separate from the card’s main due date. Open checklist item due dates are included in Planner and board date filters, so a card can surface because one of its unchecked checklist items is due even if the card itself has no top-level due date. Once that checklist item is checked off, its due date stays in the Markdown but no longer keeps the card in date-based views. CLI due filters expose `--task-status open|any` when you need to choose whether checked task due markers count.

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

From the search field, press `Enter` or `Arrow Down` to focus the first visible matching card. While a card title is focused, use arrow keys to move between visible matches, `Enter` or `Space` to open the card, and `Esc` to return to the search field. Press `Esc` again from the search field to clear the search.

### Date and Label filters

Use the filter button in the header to narrow the visible cards by due today, overdue, and your board labels.

When a filter popover is open, use arrow keys, `Home`, and `End` to move through its controls. Press `Esc` to close the popover and return focus to the button that opened it.

## Board and Planner Views

Board context can be Kanban or Table. Dated planning happens in Planner.

### Kanban

Kanban is the board view. Use it for day-to-day drag-and-drop organization. Cards show compact metadata for due dates, checklist progress, labels, and linked-object counts.

### Table

Table is an active-board view for scanning cards in board/list order. It uses the same board search, label filters, Today/Overdue date filters, task progress badges, linked-object counts, and completed-list workflow rules as Kanban.

Open `Board menu > View > Table`. Click a card title or row to open the normal card editor. Use the row's list dropdown to move a card to another list; moved cards land at the top of the destination list.

Table includes `Updated` and `Created` columns plus a sort control. Sort by `Updated, oldest first` to find cards you have not touched in a while, or by `Created, oldest first` to find your oldest cards. Search and filters apply first, then the Table sort orders the visible cards.

### Dated Views

Planner Calendar, This Week, Day, and Agenda place cards and due task items on dates across your open boards. Calendar and This Week use Monday-first weeks.

Use it when you want to answer questions like:

- What is due this month?
- Which days are overloaded?
- Which cards have dated checklist items?
- What dates do I have open?

### Switch views

- Use `Board menu > View` to switch the current board between Kanban and Table.
- `Cmd/Ctrl + 1`: Kanban, closing Planner if it is open
- `Cmd/Ctrl + Option/Alt + 1`: Table, closing Planner if it is open
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

From Planner search, press `Enter` or `Arrow Down` to focus the first visible Planner card. Arrow keys move through the visible Planner cards, `Enter` or `Space` opens the focused card, and `Esc` returns focus to Planner search.

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

Inside Planner, `Cmd/Ctrl + 1` closes Planner and returns to Kanban. `Cmd/Ctrl + Option/Alt + 1` closes Planner and returns to Table.

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

From archive search, press `Enter` or `Arrow Down` to focus the first result. Arrow keys move through archived results, `Enter` or `Space` selects the focused result, and `Esc` returns to archive search.

This lets you keep the active board clean without losing history.

## Settings

Open `Settings` from the board menu or press `Cmd/Ctrl + ,`.

### App Settings

The `App Settings` section controls settings that apply across Signboard:

- tooltips
- daily due-date reminders
- an optional global Quick Add shortcut while Signboard is open
- External Published Calendar

If notifications are enabled, Signboard checks open boards each day at the configured local time and shows a reminder when cards are due. The notification time field is shown only while reminders are enabled.

### External Published Calendar

External Published Calendar is an optional read-only iCalendar feed for local calendar apps.

When enabled in App Settings, Signboard serves a local subscription URL on `127.0.0.1` while Signboard is open. The port and subscription URL settings are shown only while publishing is enabled. Copy the URL from Settings and subscribe to it from your calendar app. The feed is built from boards Signboard has opened and trusted, unless a board is toggled off.

The feed includes:

- card due dates
- unchecked task-list item due dates

The feed hides:

- checked-off task-list item due dates
- cards in completed lists
- boards that are toggled off in that board's Workflow settings

Due items are published as all-day events because Signboard due dates are date-only. The port can be changed in App Settings if the default local port is unavailable.

### Board General

The board `General` section lets you:

- rename the board
- move the board folder to a new location

### Workflow

The `Workflow` section controls which lists count as completed work for the current board.

Completed-list cards and checked-off task due markers keep their due dates, but Planner date views, Planner date filters, board date filters, and daily due reminders hide them by default so finished work does not look actionable.

Auto-detection is enabled by default. You can turn it off, manually choose completed lists, or uncheck an auto-detected list.

Workflow also includes the board-level External Published Calendar inclusion toggle. Leave it on to include this board in the app-wide local calendar feed, or turn it off to keep the board out of subscribed calendar apps.

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

## Accessibility

Signboard keeps common board work available from the keyboard. Card titles are native buttons, list titles are editable textboxes, list actions are native buttons, and modals move focus into the active dialog and restore focus when closed.

Status changes such as creating, moving, archiving, restoring, and switching views are announced through a polite status region for screen readers. The app also respects reduced-motion and forced-colors preferences.

Focus styling is keyboard-only where possible, including the card editor title and list names, so mouse users do not get a persistent editor outline while keyboard users still get a visible focus target.

## Keyboard Shortcuts

On macOS, use `Cmd`. On Windows and Linux, use `Ctrl`.

- `Cmd/Ctrl + /`: open keyboard shortcuts
- `Cmd/Ctrl + K`: switch between currently open boards
- `Cmd/Ctrl + N`: quick add a card to any open board
- `Cmd/Ctrl + Shift + N`: create a list
- `Cmd/Ctrl + 1`: return to Kanban and close Planner
- `Cmd/Ctrl + Option/Alt + 1`: switch to Table and close Planner
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

In board search, Planner search, and archive search, `Enter` or `Arrow Down` moves from the search field to the first visible result, arrow keys move between visible results, and `Enter` or `Space` opens or selects the focused result.

In board tabs, use arrow keys, `Home`, and `End` to move across visible tabs. Press `Enter` or `Space` to switch boards, or `Delete` / `Backspace` to close the focused board tab.

In list actions, label/filter popovers, and Settings sections, use arrow keys, `Home`, and `End` to move through options. `Esc` closes popovers and restores focus to the opener.

When a card is open, workspace-level shortcuts such as create, board switcher, Planner/view switching, Settings, Archive, and search close the card first. Card-specific shortcuts such as moving or archiving the open card still act on that card.

You can also open the shortcut helper from `Help > Keyboard Shortcuts`.

## A Few Practical Tips

- Keep list names short. They are stored in folder names, so concise names stay readable on disk.
- Use labels for durable categories and use lists for workflow stages.
- Archive aggressively. The archive browser makes restoring easy.
- If you want automation or scripting, pair this guide with [Signboard CLI](./signboard-cli.md), which can also create new board folders from the terminal.
