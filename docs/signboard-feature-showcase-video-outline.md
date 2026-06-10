# Signboard Feature Showcase Video Outline

Use this as a chaptered recording script for a long-form Signboard walkthrough. The goal is not to click every control in isolation, but to show how the app works as one coherent local-first workflow: boards, files, cards, dates, archive, imports, CLI, and MCP.

## Recording Setup

- Close every board except `Signboard Demo`.
- Keep the app window large enough to show three lists, the board header, and the Planner rail.
- Have Finder ready at the demo board folder:
  `/Users/cdevroe/Documents/Documents - Colin's MacBook Pro/signboards/Signboard Demo`
- Have Terminal ready for the CLI section.
- Have `MCP_README.md` or the in-app `Help > Copy MCP Config` action ready for the MCP section.
- Make a copy of the demo board before recording if you plan to create, archive, restore, move, or edit real cards on camera.

Current demo board state:

- Lists: `To-do` with 12 cards, `Doing` with 8 cards, `Done` with 7 cards.
- Labels: `Content`, `Social media`, `Launch`, `Overdue`, `New`.
- Color scheme: `rosewood`.
- Archive: contains archived cards and archived lists, so the archive browser is ready to show.
- Date data: most active card due dates are March/April 2026. For a recording made near May 23, 2026, refresh a few card and checklist dates so Planner and date filters show useful current examples.

Suggested date prep for the week of May 23, 2026:

- Set one active card due on `2026-05-23` so Today has content.
- Set one active card due on `2026-05-24` or `2026-05-25` so upcoming calendar/week views are not empty.
- Set one active card due before `2026-05-23` so Overdue has content.
- Add one incomplete checklist item with `(due: 2026-05-23)`.
- Add one checked checklist item with `(due: 2026-05-23)` so you can explain that completed task due markers keep history but no longer make a card actionable.
- Keep at least one dated card in `Done` to show completed-list hiding.

## Chapter Outline

### 1. Intro and Positioning

Action:

- Start on the demo board in Kanban view.
- Give the one-sentence promise: Signboard is a local-first desktop board app where boards are folders, lists are directories, and cards are Markdown files.
- Tell viewers this is a long video with chapters, so they can jump to the features they care about.

Talk track:

- "I am going to show Signboard as a real working app, not a slide deck."
- "The big idea is that the UI is friendly, but the data stays simple and portable."
- "Later I will show the same board from Finder, Terminal, and an agent through MCP."

### 2. Local-First Storage Model

Action:

- Switch to Finder.
- Open the `Signboard Demo` board folder.
- Show list folders such as `000-To-do-stock`, `001-Doing-stock`, `002-Done-stock`.
- Open one card Markdown file.
- Point out YAML frontmatter, `title`, `due`, `labels`, Markdown body, and task due markers.
- Show `board-settings.md`.
- Show `XXX-Archive`.

Talk track:

- "A board is a folder."
- "A list is a folder inside the board."
- "A card is a Markdown file."
- "Board settings live with the board."
- "This is why backup, sync, editor access, CLI access, and agent access all work naturally."

### 3. Opening Boards, Tabs, and Switching

Action:

- Return to Signboard.
- Show the active board tab.
- Open the quick board switcher with `Cmd + K`.
- Mention that multiple open boards use tabs and overflow into the switcher.
- If you want to make all-open-board Planner behavior visible, briefly open a second scratch board for this chapter and close it afterward.

Talk track:

- "Signboard can keep multiple boards open, but for this demo I am using one clean demo board."
- "The switcher searches currently open boards and is meant for fast keyboard-driven navigation."

### 4. Kanban Basics: Lists and Cards

Action:

- Show the three lists: To-do, Doing, Done.
- Create a temporary list or explain list creation from the list action menu.
- Rename a list title inline if using a copied demo board.
- Move a list left/right from the list action menu or drag it if safe.
- Create a new card with the list's add-card button.
- Drag a card between lists.

Talk track:

- "Kanban is the default board view."
- "List order and card order are stored through the numbered folder/file names."
- "Drag-and-drop updates the underlying files, not a private database."
- "The empty drop slot shows exactly where the card will land."

### 5. Card Editor Deep Dive

Action:

- Open a rich card, ideally one with labels, due date, body text, and checklist items.
- Edit the title.
- Add or change a due date.
- Add/remove labels.
- Add Markdown notes and checklist items.
- Right-click inside the title or body to show the native text editing menu.
- Use the list dropdown or next-list button to move the card.
- Duplicate a card.
- If using a backup copy, archive a disposable card.

Talk track:

- "The editor is a Markdown editor over a plain file."
- "Top-level card due dates and checklist item due dates are both understood by Signboard."
- "Checklist progress shows on cards."
- "Duplicating is useful for lightweight templates."
- "Archiving removes a card from the active board without deleting it."

### 6. Quick Add

Action:

- Press `Cmd + N`.
- Show board and list selectors.
- Create a card in a selected list.
- Demonstrate `Shift + Enter` to create, open, and focus the notes field.

Talk track:

- "Quick Add is the fastest way to capture work without navigating first."
- "When multiple boards are open, you can choose the target board and list before creating the card."
- "There is also an optional app-level global Quick Add shortcut while Signboard is running."

### 7. Search, Labels, and Date Filters

Action:

- Use `Cmd + F` to focus board search.
- Search for a visible term like `launch`, `content`, or `email`.
- Press `Enter` or `Arrow Down` to move from search into results.
- Open the filter popover.
- Filter by a label.
- Filter by Today or Overdue.
- Clear filters.

Talk track:

- "Search matches card titles and card bodies."
- "Filters combine with search, so you can narrow the board by text, labels, and due state."
- "Today and Overdue include open checklist item due dates, not just card due dates."
- "Completed checklist due markers and completed-list cards are treated as history by default."

### 8. Table View

Action:

- Open `Board menu > View > Table`.
- Show dense scanning of cards across the active board.
- Use search/filter in Table view.
- Move a card using the row list dropdown if safe.
- Open a card from the table.
- Return to Kanban with `Cmd + 1`.

Talk track:

- "Table is still the current board, just shown in a denser format."
- "It reuses the same search, labels, date filters, task badges, and completed-list rules as Kanban."
- "This is useful when a board has many cards and you want to scan or triage quickly."

### 9. Planner: Calendar, This Week, Day, Agenda

Action:

- Open Planner from the left rail or `Cmd + Shift + P`.
- Show Calendar.
- Switch to This Week.
- Switch to Day.
- Switch to Agenda.
- Show All Boards vs Current Board scope. With one board open, explain that all/current are equivalent for the demo.
- Use Planner search.
- Open the Planner filter menu.
- Toggle completed visibility if you have a dated card in `Done`.
- Click a Planner card to open the normal editor.

Talk track:

- "Planner is workspace-level. It looks across currently open boards."
- "It places both card due dates and open checklist item due dates onto dates."
- "Planner cards show their source board and list."
- "Completed-list cards are hidden by default so finished work does not look actionable."
- "You can still reveal completed dated cards when reviewing history."

### 10. Completed Workflow Rules

Action:

- Open Settings with `Cmd + ,`.
- Go to Workflow.
- Show completed-list auto-detection for names like Done, Completed, Closed, Shipped.
- Show manual override controls.
- Show board-level External Published Calendar inclusion.

Talk track:

- "Completed work keeps its due dates, but date-driven views do not treat it as actionable by default."
- "Each board can decide which lists count as completed."
- "This is also used by due reminders and the External Published Calendar feed."

### 11. Archive Browser and Restore

Action:

- Open Archive with `Cmd + Shift + A` or from the Board menu.
- Search archived cards.
- Select an archived card and show details.
- Restore a card into a destination list if safe.
- Show archived lists.
- Restore an archived list only if using a board copy.

Talk track:

- "Archive is not a trash can. It is active history."
- "Archived cards and lists live under `XXX-Archive`."
- "You can inspect details before restoring, and restore cards into the list you choose."

### 12. Settings Tour

Action:

- Show App Settings:
  - tooltips
  - daily due-date reminders
  - optional global Quick Add shortcut
  - External Published Calendar
- Show Board General:
  - rename board
  - move board folder
- Show Labels:
  - add, rename, color, remove labels
- Show Colors:
  - board color scheme
  - light/dark mode
  - apply to open boards
- Show Import:
  - Trello
  - Obsidian
  - Tasks.md

Talk track:

- "App settings apply across Signboard."
- "Board settings live with the board in `board-settings.md`."
- "Labels and colors are board-specific, so each project can have its own vocabulary."
- "Imports are additive. They copy data into Signboard and do not modify the source files."

### 13. External Published Calendar

Action:

- In App Settings, show External Published Calendar controls.
- Explain the `127.0.0.1` subscription URL.
- Show the board Workflow inclusion toggle again if useful.

Talk track:

- "This is opt-in and served locally while Signboard is running."
- "The feed includes card due dates and unchecked task item due dates."
- "It excludes checked task due markers, completed-list cards, and boards you opt out."
- "Due items are all-day events because Signboard due dates are date-only."

### 14. Keyboard Shortcuts and Accessibility

Action:

- Open the shortcut helper with `Cmd + /`.
- Show a few high-value shortcuts:
  - `Cmd + N` Quick Add
  - `Cmd + K` board switcher
  - `Cmd + 1` Kanban
  - `Cmd + Option + 1` Table
  - `Cmd + Shift + P` Planner
  - `Cmd + Shift + A` Archive
  - `Cmd + ,` Settings
- Mention keyboard navigation in board search, Planner search, Archive search, tabs, filters, and settings.

Talk track:

- "You do not need to memorize all of these. The helper is always available."
- "The app is designed so common workflows can be done from the keyboard."
- "There are also screen-reader status announcements, keyboard-only focus styling, reduced-motion support, and forced-colors support."

### 15. CLI for Scripts and Agents

Action:

- Switch to Terminal.
- Use the installed `signboard` command if available, or use the repo-local command while recording from the source checkout.
- Run read commands first.

Example commands:

```bash
DEMO_BOARD="/Users/cdevroe/Documents/Documents - Colin's MacBook Pro/signboards/Signboard Demo"

signboard lists --board "$DEMO_BOARD" --json
signboard cards --board "$DEMO_BOARD" --search launch --json
signboard cards --board "$DEMO_BOARD" --due this-week --sort due --json
signboard cards read --board "$DEMO_BOARD" --card "Script and storyboard homepage demo video"
signboard archive cards --board "$DEMO_BOARD" --json
signboard settings --board "$DEMO_BOARD" --json
```

Optional write examples if using a copied board:

```bash
signboard cards create --board "$DEMO_BOARD" --list "To-do" --title "Follow up from the demo" --dry-run --json
signboard cards create --board "$DEMO_BOARD" --list "To-do" --title "Follow up from the demo" --label Content
signboard cards notes add --board "$DEMO_BOARD" --card "Follow up from the demo" --text "Created from the CLI during the recording." --timestamp
signboard cards edit --board "$DEMO_BOARD" --card "Follow up from the demo" --move-to Doing
```

Talk track:

- "The CLI is useful for scripts, shell workflows, and agents that prefer command execution."
- "Use `--json` for machine-readable output."
- "Use `--board` so scripts do not depend on global state."
- "Use `--dry-run` before writes when you want to preview a change."
- "When the desktop app is open, external board edits can auto-refresh in the UI."

### 16. MCP for Agent Workflows

Action:

- In the app, show `Help > Copy MCP Config`.
- Open or reference `MCP_README.md`.
- Explain the core config fields:
  - executable path
  - `--mcp-server`
  - `SIGNBOARD_MCP_READ_ONLY`
  - `SIGNBOARD_MCP_ALLOWED_ROOTS`
- Describe a realistic agent flow.

Talk track:

- "MCP is the structured way for AI agents to work with Signboard."
- "It starts read-only by default."
- "Allowed roots control which board folders an agent can see or edit."
- "The app's trusted board roots are included, so boards you have opened in the desktop app can be resolved by MCP."
- "Agents can list boards, resolve a board by name, read lists and cards, create or update cards, duplicate cards, archive cards, move cards, read settings, update board settings, and run imports."
- "Card tool responses include task summary and task due-date metadata, which is useful for planning agents."
- "Dry-run writes let an agent show the intended card payload before touching files."

Example agent prompts to show or narrate:

```text
Using Signboard MCP, find overdue cards on the Signboard Demo board and group them by list.
```

```text
Using Signboard MCP, create a dry-run card in To-do titled "Review the demo recording" with a due date next week.
```

```text
Using Signboard MCP, add a timestamped note to the card "Script and storyboard homepage demo video" summarizing this review.
```

### 17. Direct Markdown Editing and Sync

Action:

- Open a card file in a text editor.
- Make a small body edit if using a copied board.
- Return to Signboard and show the external change reflected.
- If a card editor is open and clean, show that it refreshes after external edits.

Talk track:

- "Because cards are files, you can inspect and edit them outside the app."
- "Signboard watches trusted board roots and refreshes when files change."
- "This is what makes the CLI and MCP integrations feel native instead of bolted on."

### 18. Sponsorship, Updates, and Wrap

Action:

- Show the Sponsor pill or Board menu Sponsor action briefly.
- Mention automatic/manual updates if useful.
- End on the board or Planner.

Talk track:

- "Signboard is free for personal use, and sponsorship supports work use and future development."
- "The app has a normal desktop update flow."
- "The main takeaway is that Signboard gives you a visual board without trapping your work in a private database."

## Suggested YouTube Chapters

Adjust timestamps after recording.

```text
00:00 Intro
02:00 What Signboard is
05:00 Boards as folders and cards as Markdown
12:00 Opening boards, tabs, and quick switching
17:00 Kanban lists and card movement
27:00 Card editor, Markdown, labels, due dates, and checklists
40:00 Quick Add
47:00 Search, labels, and date filters
58:00 Table view
1:08:00 Planner: Calendar, This Week, Day, and Agenda
1:25:00 Completed workflow rules
1:33:00 Archive and restore
1:45:00 Settings
1:58:00 External Published Calendar
2:08:00 Keyboard shortcuts and accessibility
2:18:00 Signboard CLI
2:35:00 MCP and AI agent workflows
2:50:00 Direct Markdown edits and external sync
3:00:00 Sponsor, updates, and wrap
```

## Shorter Fallback Cut

If the full recording runs too long, keep these core sections:

1. Intro and local-first storage model.
2. Kanban basics.
3. Card editor with Markdown, labels, due dates, and checklists.
4. Search/filter.
5. Planner.
6. Archive.
7. Settings/imports.
8. CLI.
9. MCP.

