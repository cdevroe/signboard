# Using Signboard

This guide covers the desktop app and the core workflow for managing a project in Signboard.

## Table of Contents

- [How Signboard Stores Your Board](#how-signboard-stores-your-board)
- [Create or Open a Board](#create-or-open-a-board)
- [Work with Lists](#work-with-lists)
- [Work with Cards](#work-with-cards)
- [Start Dates, Due Dates, Labels, and Checklists](#start-dates-due-dates-labels-and-checklists)
- [Search, Filters, and Open Boards](#search-filters-and-open-boards)
- [Board and Planner Views](#board-and-planner-views)
- [Planner](#planner)
- [Archive and Restore](#archive-and-restore)
- [Settings](#settings)
- [Updates](#updates)
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

- Clicking the header `Card` button
- Pressing `Cmd/Ctrl + N` to open Quick Add for any currently open board
- Using the `Add new card` button for a specific list

In the Quick Add card modal, choose the board and list before creating the card. Press `Shift + Enter` after typing the title to create the card, open it immediately, and focus the notes field.

Card filenames are chosen based on the name or title you first give it, along with a prefix for ordering, and a random card ID suffix (to help with name collisions). Once set, the filename will stay the same even if you rename the card.

### Open and edit a card

Click a card to open it. In the card editor you can:

- Rename the card
- Edit the Markdown body
- Set start and due dates
- Add or remove labels
- Move the card to another list
- Move it to the next list
- Duplicate it
- Share it
- Open it in Obsidian or the default Markdown app
- Open raw web URLs from the card body
- Create, open, or remove linked objects
- Use Smart Card Actions when AI assistance is enabled
- Archive it

The card body is Markdown, so plain text notes, headings, lists, and checklists all work naturally.

Raw `http://`, `https://`, and `www.` URLs in the body stay as plain Markdown text. When the cursor is in one, Signboard shows a small open-link control; Cmd/Ctrl-clicking the URL also opens it in your default browser.

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

Linked objects appear in the card editor as removable chips. Click the object name to open it, or click its remove control to unlink it from the card without deleting the underlying file, folder, or note. If a linked Obsidian note cannot be found, Signboard keeps the link, marks the chip as missing, and offers controls to recreate the note, relink it to another Markdown note, or remove the link. Cards with linked objects also show a small paperclip count in Kanban and Table views.

New or edited cards include flat Obsidian-friendly properties such as `title`, `signboard_id`, `signboard_board`, `signboard_list`, `status`, `signboard_uri`, and `related`, plus structured `linked_objects` when the card has linked files, folders, URLs, app links, or Obsidian notes. The CLI maintains these properties when it creates, duplicates, edits, adds notes to, or moves cards, so those cards remain visible in the board's managed Obsidian Base. When a board is inside a vault, Signboard automatically creates `Signboard Board.base` for Obsidian Bases and keeps it current while it is still Signboard-managed. If you customize the Base in Obsidian, Signboard leaves it alone until you choose `Settings > Obsidian > Generate Base` again.

Signboard also includes an optional desktop-only Obsidian companion plugin in `obsidian-plugin/`. Copy or symlink that folder into your vault as `.obsidian/plugins/signboard-companion` and enable it from Obsidian's Community plugins settings. The plugin can open and copy Signboard links, attach the active Obsidian note to a Signboard card, open cards by `obsidian://signboard?cardId=...`, and add a folder context-menu action named `Create Signboard`. That action asks first, then adds board metadata/list folders, treats existing child folders as lists, moves top-level Markdown notes into a To-do list, and opens the board in Signboard. When you delete an Obsidian note that is linked from Signboard cards, the plugin asks before removing those linked objects from the cards.

## Start Dates, Due Dates, Labels, and Checklists

These features are what make cards show up in Planner and filters.

### Card start dates

Every card can have a start date in addition to a due date. Use a start date when work is scheduled to begin or become actionable before it is due.

Start dates appear on cards, in Table's `Start` column, in Planner date views, and in date-aware filters. On Kanban cards and in the card editor, start and due dates share one compact `Dates` control. Click the calendar icon or date range to open both fields.

### Card due dates

Every card can have a due date.

Once a card has a due date, it becomes visible in:

- date displays on the card
- due-date-aware filters
- Planner
- daily due notifications if enabled in app settings

### Task list items with start and due dates

Signboard also understands start and due dates inside Markdown task lists.

Example:

```md
- [ ] Draft release notes
- [ ] (start: 2026-04-02) Draft beta announcement
- [ ] (start: 2026-04-03) (due: 2026-04-05) Send beta build
- [ ] (scheduled: 2026-04-06) Follow up with testers
- [x] Review copy
```

Task dates are separate from the card’s main start and due dates. Open checklist item start/due dates are included in Planner and board date filters, so a card can surface because one of its unchecked checklist items is dated even if the card itself has no top-level date. Once that checklist item is checked off, its date stays in the Markdown but no longer keeps the card in date-based views. CLI due filters expose `--task-status open|any` when you need to choose whether checked task due markers count.

### Labels

Labels are defined per board. Add them in `Settings > Labels`, or create a new label directly from the label picker while editing or creating a card. The label picker also has a gear button that opens the board's Labels settings for renaming labels or changing colors.

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

Use the filter button in the header to narrow the visible cards by `Today`, `Overdue`, `Next 7 days`, `Next 14 days`, `Next 30 days`, and your board labels. When filters are active, Signboard shows a compact summary chip beside search; click it to clear the active filters.

When a filter popover is open, use arrow keys, `Home`, and `End` to move through its controls. Press `Esc` to close the popover and return focus to the button that opened it.

## Board and Planner Views

Board context can be Kanban or Table. Dated planning happens in Planner.

### Kanban

Kanban is the board view. Use it for day-to-day drag-and-drop organization. Cards show compact metadata for start/due date ranges, checklist progress, labels, and linked-object counts.

### Table

Table is an active-board view for scanning and bulk-managing cards in board/list order. It uses the same board search, label filters, date filters, task progress badges, linked-object counts, and completed-list workflow rules as Kanban.

Use the bottom view dock to switch to Table. Click a card title or row to open the normal card editor. Use the row's list dropdown to move a card to another list; moved cards land at the top of the destination list.

Table includes `Start`, `Due`, `Updated`, and `Created` columns plus list filtering and sorting. Filter to one list, all completed lists, or all lists. Sort by `Updated, oldest first` to find cards you have not touched in a while, or by `Created, oldest first` to find your oldest cards. Search and filters apply first, then the Table sort orders the visible cards.

Use the row checkboxes to select visible cards for bulk actions. After selecting one card, hold `Shift` while checking another row to select the range between them. The header checkbox selects the currently visible rows only. Bulk actions can archive selected cards, move them to another list, add or remove labels, set or clear start dates, and set or clear due dates.

### Dated Views

Planner Calendar, This Week, Day, and Agenda place cards and dated task items on dates across your open boards. Calendar and This Week use Monday-first weeks.

Use it when you want to answer questions like:

- What is due this month?
- Which days are overloaded?
- Which cards have dated checklist items?
- What dates do I have open?

### Switch views

- Use the bottom view dock to switch between Planner, Kanban, and Table. Kanban is centered in the dock as the default board view.
- `Cmd/Ctrl + 1`: Kanban, closing Planner if it is open
- `Cmd/Ctrl + Option/Alt + 1`: Table, closing Planner if it is open
- `Cmd/Ctrl + 2`: Planner Calendar for all open boards
- `Cmd/Ctrl + 3`: Planner This Week for all open boards
- `Cmd/Ctrl + 4`: Planner Day for all open boards
- `Cmd/Ctrl + 5`: Planner Agenda for all open boards
- `Cmd/Ctrl + Option/Alt + 2`: Planner Calendar for the current board
- `Cmd/Ctrl + Option/Alt + 3`: Planner This Week for the current board
- `Cmd/Ctrl + Option/Alt + 4`: Planner Day for the current board
- `Cmd/Ctrl + Option/Alt + 5`: Planner Agenda for the current board

## Planner

Planner is a workspace-level view for dated work across your currently open boards. It is the left-most item in the bottom view dock when at least one board is open.

Open Planner from the bottom view dock or press `Cmd/Ctrl + Shift + P`. Planner slides over the board tabs and board content, so it is clear you are no longer looking at a single board.

Planner includes:

- Calendar
- This Week
- Day
- Agenda

Planner cards show their source as `Board · List`, with that source pill tinted from the source board's color scheme. Clicking a Planner card opens the normal card editor and switches the active board behind Planner when needed, so labels and list moves stay tied to the card’s real board.

Planner defaults to all open boards. Use the scope toggle to narrow to the current board, or use the filter menu to choose a custom set of open boards.

Planner search matches card title, body, board name, and list name. Planner filters can narrow by date (`Today`, `Overdue`, `Next 7 days`, `Next 14 days`, or `Next 30 days`), completed-card visibility, and open board. When Planner is scoped to the current board only, the filter menu also includes that board's labels.

From Planner search, press `Enter` or `Arrow Down` to focus the first visible Planner card. Arrow keys move through the visible Planner cards, `Enter` or `Space` opens the focused card, and `Esc` returns focus to Planner search.

Planner hides cards from completed lists by default. Each board can auto-detect lists named `Done`, `Completed`, `Complete`, `Closed`, `Finished`, `Resolved`, or `Shipped`, and you can override those choices in Settings. Use the Planner filter menu when you want completed dated cards shown for historical review.

Planner uses your light/dark mode but keeps the default Signboard color palette instead of inheriting the active board color scheme.

You can leave Signboard running continuously. At local midnight—and again when the window becomes visible, receives focus, or the computer resumes from sleep—Signboard refreshes date filters, date colors, relative Table ages, Agenda labels, and Planner date views. Calendar, This Week, and Day advance when they were showing the previously current period; if you deliberately browsed to another month, week, or day, that date remains pinned.

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

Inside Planner, `Cmd/Ctrl + 1` switches directly to Kanban. `Cmd/Ctrl + Option/Alt + 1` switches directly to Table. The bottom dock always shows the active workspace view.

## Archive and Restore

Archiving removes things from the active board without deleting them.

### Archive a card

Open the card editor and choose the archive action.

### Archive all cards in a list

Open the list actions menu and choose `Archive cards in this list`.

For selective cleanup, switch to Table, filter to `Completed lists` or a specific list, select the cards you want, and choose `Archive` from the bulk toolbar.

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

The `App Settings` group controls settings that apply across Signboard:

- `General`: tooltips and the optional global Quick Add shortcut while Signboard is open
- `Notifications`: daily due-date reminders and External Published Calendar publishing
- `Smart Actions`: AI assistance through Ollama, LM Studio, OpenAI, Gemini, or Anthropic and Smart Card Actions

If notifications are enabled, Signboard checks open boards each day at the configured local time and shows a reminder when cards are due. The notification time field is shown only while reminders are enabled.

When AI assistance is enabled, configure a Normal model and, optionally, an Advanced model for harder work. Each profile independently chooses Ollama, LM Studio, OpenAI, Gemini, or Anthropic, so either model may run locally or in the cloud. Ollama defaults to `http://127.0.0.1:11434`; LM Studio defaults to `http://127.0.0.1:1234` and requires its local server to be running. You may also enter an LM Studio URL ending in `/v1`; Signboard normalizes it to the server base URL. For OpenAI, Gemini, or Anthropic, save that service's API key and refresh the model list. Keys are stored separately using your operating system's secure credential encryption and are never written to app settings. Signboard shows whether it can connect and loads available models into each profile's model dropdown. Local provider URLs and cloud credentials are shared by both profiles, while provider and model choices are independent.

When an Advanced model is configured, the Smart Card Actions menu lets you choose Normal or Advanced before running an action. When AI assistance is off, Smart Actions shows a setup state with an enable button. The card editor then shows a floating Smart Card Actions button with default actions for generating a new title, generating a summary, generating a task list, auto-labeling from the current board's existing labels, smart paste formatting, a one-off Quick Smart Action, and a read-only Question the Card action. Use the gear in the Smart Card Actions menu to open the Smart Actions settings panel directly. App Settings lets you drag actions to reorder them, expand an action with `Edit`, customize each built-in prompt, and add custom actions with a label, affected card data, and prompt. Custom actions can target Title, Labels, Content, Due Dates, or Attachments. Content suggestions are appended to the card instead of replacing existing notes. Quick Smart Action is reorderable in settings but does not store a prompt; choose its prompt and target when you run it from the card editor. Question the Card is reorderable in settings but does not store a prompt or show an affected-data selector; type a question when you run it, review the answer in the modal, and optionally ask a fresh follow-up without storing chat history or changing card data. New custom actions appear at the top of the actions list. For the generated task list action, change the number in the prompt when you want a different number of tasks. Suggestions are previewed before they replace the title, insert Markdown, set a due date, link suggested URL/app attachments, or apply labels. Auto-label only applies labels that already exist on the current board, preserves labels already assigned to the card, and skips duplicates. Attachment suggestions only link web URLs, app links, or `signboard://` links after confirmation; local file paths are not attached by AI. Card title, body, board/list context, start/due dates, current labels, available board labels, linked-object summaries, a compact markdown-file view of the card for questions, pasted smart-paste text, Quick Smart Action prompts, and Question the Card prompts are sent only to the selected provider when you use an action.

### External Published Calendar

External Published Calendar is an optional read-only iCalendar feed for local calendar apps.

When enabled in `App Settings` > `Notifications`, Signboard serves a local subscription URL on `127.0.0.1` while Signboard is open. The port and subscription URL settings are shown only while publishing is enabled. Copy the URL from Settings and subscribe to it from your calendar app. The feed is built from boards Signboard has opened and trusted, unless a board is toggled off.

The feed includes:

- card due dates
- unchecked task-list item due dates

The feed hides:

- checked-off task-list item due dates
- cards in completed lists
- boards that are toggled off in that board's Workflow settings

Due items are published as all-day events because Signboard due dates are date-only. The port can be changed in `App Settings` > `Notifications` if the default local port is unavailable.

### Board General

The board `General` section lets you:

- rename the board
- move the board folder to a new location
- duplicate the board into a chosen folder with a chosen board name

Duplicating a board copies the board folder, lists, cards, labels, settings, archive contents, and linked objects. Signboard gives copied cards fresh card IDs and updates their `signboard://open-card` links so the new board does not collide with the original.

### Labels

The `Labels` section lets you:

- add labels
- rename labels
- choose label colors
- remove labels

Labels are stored with the board so each board can have its own vocabulary.

### Appearance

The `Appearance` section lets you choose a board color scheme. Each scheme includes both light and dark variants.

You can also apply the color scheme to all currently open boards.

### Workflow

The `Workflow` section controls which lists count as completed work for the current board.

Completed-list cards and checked-off task date markers keep their dates, but Planner date views, Planner date filters, board date filters, and daily due reminders hide them by default so finished work does not look actionable.

Auto-detection is enabled by default. You can turn it off, manually choose completed lists, or uncheck an auto-detected list.

Workflow also includes the board-level External Published Calendar inclusion toggle. Leave it on to include this board in the app-wide local calendar feed, or turn it off to keep the board out of subscribed calendar apps.

### Obsidian

The `Obsidian` section lets you generate or open the managed `Signboard Board.base` file for boards stored inside an Obsidian vault.

### Import

The `Import` section can bring content into the current board from:

- Trello
- Obsidian
- Tasks.md

Imports copy data into Signboard and leave the original source files where they are.

## Updates

Signboard checks for updates automatically. You can also choose `Check for Updates...` from the Signboard app menu on macOS or the Help menu on Windows and Linux. The native update dialog converts the GitHub release body from HTML or Markdown into readable plain text and omits the release's download-link section. Use `View changelog` to open the complete release page.

On Ubuntu, Signboard validates a downloaded `.deb` before requesting administrator access. If the download is invalid or Ubuntu's package manager rejects it, your installed copy remains unchanged and the error dialog offers `Open Downloads` so you can download and install the latest package manually.

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
- `Cmd/Ctrl + 4`: open Planner Day for all open boards
- `Cmd/Ctrl + 5`: open Planner Agenda for all open boards
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
