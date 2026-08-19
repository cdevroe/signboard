# Signboard

Signboard is a local-first desktop kanban app that stores your lists as directories and cards as Markdown files on disk.

Signboard is free for personal use. If you are using Signboard for your work, it would be appreciated if you make the commercial-use sponsorship payment to support future development. See the app's "Sponsor" button.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/cdevroe/signboard)](https://github.com/cdevroe/signboard/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/cdevroe/signboard)](https://github.com/cdevroe/signboard/pulls)
[![Donate](https://img.shields.io/badge/Donate-388307)](https://cdevroe.com/donate)

---

## ✨ Highlights
- 📂 Cards saved as Markdown files
- 💎 Full Obsidian support
- 🖌️ Color scheme per board (several to choose from!)
- 🌙 Light and dark mode variants for all color schemes
- 🏷 Custom labels per board
- 🗓 Compact calendar controls for card and task list item start/due dates
- 📋 Bottom view dock for Planner, Kanban, and Table, including card age columns, sorting, list filtering, and bulk actions in Table
- 🗂 Planner workspace view for actionable dated work across open boards, with automatic local-day rollover while Signboard stays open
- 📆 Optional local External Published Calendar feed for calendar app subscriptions
- 🔮 Obsidian-friendly properties, Bases generation, linked objects, linked-object counts, and `signboard://` card links
- 🎨 Board-colored source pills in Planner date views
- ✅ Completed-list workflow settings that preserve due-date history
- ✅ Progress counters on cards
- 🔎 Live search
- 🗄️ Linked files and URLs on cards
- ✨ Optional Smart Card and Smart Board Actions through Ollama, LM Studio, OpenAI, Gemini, or Anthropic, with independently configured Normal and Advanced models, board reports and reviewed change proposals, drag-reorderable custom actions, and portable action sharing
- 🧲 Drag-and-drop card movement
- ⚡ Unlimited open boards with overflow tabs and a quick switcher
- 🧬 Board duplication from Settings with fresh copied-card IDs
- ⌨️ Keyboard shortcuts
- ♿ Keyboard, screen reader, reduced-motion, and forced-colors improvements
- 🤖 MCP server
- 💻 CLI

---

## Installation

1. Go to the [Releases page](https://github.com/cdevroe/signboard/releases).
2. On the latest release, use the curated download links in the release body:
   - `Download for macOS (Universal)`
   - `Download for Windows`
   - Linux packages grouped by package type with explicit `x64` and `ARM64` labels

On Arch Linux or Omarchy, download the matching `.pacman` package and install it with:

```bash
sudo pacman -U ./signboard_VERSION_linux_x64.pacman
```

The package installs Signboard, its launcher entry, its `signboard://` URL handler, and its icon together. It does not require FUSE. Use the `linux_aarch64.pacman` package on an ARM machine. The AppImage remains available for other distributions.

For standard releases, Signboard intentionally promotes a smaller public download set:

- macOS: universal build
- Windows: single installer
- Linux: separate `x64` and `ARM64` AppImage, deb, and Arch/Omarchy packages

### Arch Linux (AUR)

On Arch Linux and Arch-based distributions, Signboard is available on the [Arch User Repository](https://aur.archlinux.org/packages/signboard-appimage) as `signboard-appimage` for `x86_64` and `aarch64`. The package is maintained in the community [`missing-aur`](https://github.com/Cleboost/missing-aur) project and kept up to date with upstream releases.

Install with your preferred AUR helper:

```bash
yay -S signboard-appimage
# or
paru -S signboard-appimage
```

On Omarchy, open `Settings > General` and choose `Follow Omarchy theme` to use the active Omarchy palette and follow future theme changes. The choice appears only when Signboard detects Omarchy. Selecting a non-default board color scheme keeps that board's deliberate palette.

## Documentation

- [Documentation hub](./docs/README.md)
- [Using Signboard](./docs/using-signboard.md)
- [Signboard CLI](./docs/signboard-cli.md)
- [MCP Server](./MCP_README.md)

### Keyboard Shortcuts

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

Board tabs, list actions, label/filter popovers, and Settings sections support arrow-key navigation. `Home` and `End` jump to the edges, `Esc` closes popovers, and `Delete` / `Backspace` closes a focused board tab.

When a card is open, workspace-level shortcuts such as create, board switcher, Planner/view switching, Settings, Archive, and search close the card first. Card-specific shortcuts such as moving or archiving the open card still act on that card.
Use the header `Card` button or `Cmd/Ctrl + N` to open Quick Add. In the Quick Add card modal, choose the board and list before creating the card. `Shift + Enter` creates the card, opens it immediately, and focuses the notes field. App Settings can also register an optional global Quick Add shortcut that works while Signboard is open.

You can also open the shortcut helper from `Help > Keyboard Shortcuts`.

Editable fields, including the card title and body editor, support the native right-click text editing menu for cut, copy, paste, delete, and select all.

Raw `http://`, `https://`, and `www.` URLs typed in the card body are visually marked in the editor. Use the inline open-link control or Cmd/Ctrl-click the URL to open it in your default browser without changing the card's Markdown.

Cards, list actions, and dialogs are keyboard-operable, with screen-reader status announcements for common actions. Focus indicators appear for keyboard navigation without adding persistent outlines to the card editor for pointer users.

## 🤖 MCP Server

Signboard includes a built-in MCP server so agents can interact with local boards.

- Dedicated instructions: [MCP_README.md](./MCP_README.md)
- To copy config: `Help` -> `Copy MCP Config`
- MCP uses `signboard_list_boards` plus both explicit allowed roots and Signboard's desktop trusted/open board state for board lookup.
- Optional agent skill: `skills/signboard-mcp/SKILL.md`

## 💻 CLI

Signboard includes a terminal CLI for direct board management without going through MCP.

- Full guide: [docs/signboard-cli.md](./docs/signboard-cli.md)

- In the desktop app on macOS/Linux: `Help` -> `Install Signboard CLI`
- Use `signboard boards list --json` to list known boards before choosing one
- Use `signboard use /Path/to/Board` once to remember the active board for later commands
- Use `signboard boards create /Path/to/NewBoard --use` to create and select a new board from the terminal
- The installed `signboard` wrapper runs the bundled CLI in Electron's Node mode, avoiding desktop app startup for terminal commands.
- CLI-created, duplicated, edited, and moved cards keep the same flat Signboard/Obsidian properties as cards written in the desktop app, so they remain visible in managed Obsidian Bases.

Examples:

```bash
# Select a board once
signboard boards list --json
signboard use /Path/to/Board

# Create a board
signboard boards create /Path/to/NewBoard --use

# Lists
signboard lists
signboard lists create "Waiting"
signboard lists rename "Waiting" "Blocked"

# Cards
signboard cards --due next:7
signboard cards "To do"
signboard cards --label Urgent --search launch
signboard cards create --list "To do" --title "Ship release notes" --start 2026-03-18 --due 2026-03-20
signboard cards edit --card ab123 --due none --move-to Doing
signboard cards duplicate --card ab123 --list Leads --remove-label Template --dry-run --json
signboard cards create --from-card ab123 --list Leads --title "New lead"
signboard cards notes add --card ab123 --text "Emailed follow-up" --timestamp
signboard cards read --list Doing --card ab123

# Imports
signboard import trello --file ~/Downloads/trello-export.json
signboard import obsidian --source ~/Vault/Kanban.md --source ~/Vault/Boards/
signboard import tasksmd --source ~/TasksWorkspace/tasks/Project-A

# Or run through the packaged app executable
/Applications/Signboard.app/Contents/MacOS/Signboard use /Path/to/Board
/Applications/Signboard.app/Contents/MacOS/Signboard cards --due next:7
```

Interesting card listing filters:

- `--due today`
- `--due tomorrow`
- `--due overdue`
- `--due this-week`
- `--due next:7` / `next:14` / `next:30`
- `--due-source card|task|any`
- `--label <name-or-id>` (repeatable)
- `--label-mode any|all`
- `--search <query>`
- `--sort list|due|title|updated|updated-oldest|updated-newest|created-oldest|created-newest`
- `--json` for scripting output

Import options:

- `signboard import trello --file <export.json> [--board <path>] [--json]`
- `signboard import obsidian --source <path> [--source <path> ...] [--board <path>] [--json]`
- `signboard import tasksmd --source <path> [--board <path>] [--json]`

## Obsidian Integration

Signboard boards can live inside an Obsidian vault. A good layout is `Vault/Project/Signboard/<Board Name>/`; avoid making a board a nested Obsidian vault with its own `.obsidian` folder. You can move an existing board into a vault with `Settings > General > Move Board`.

If the board is inside a detected vault, the card's Open With menu shows Obsidian actions for opening the card and copying an Obsidian URI.

Use the paperclip control next to labels to link Obsidian notes, local files, folders, web URLs, app deep links, and `signboard://` links. You can also drag local files onto the open card editor to link them to that card.

Inside a vault, Signboard automatically creates `Signboard Board.base` for Obsidian Bases and keeps it current while it is still Signboard-managed. If you customize the Base in Obsidian, Signboard leaves it alone until you choose Settings > Obsidian > Generate Base again.

An optional desktop-only Obsidian companion plugin lives in `obsidian-plugin/`. Enable it to open/copy Signboard links, attach active Obsidian notes to Signboard cards, handle `obsidian://signboard?cardId=...`, and right-click a folder to `Create Signboard`.

Example task checklist syntax:

```md
- [ ] Draft update
- [ ] (start: 2026-03-18) Outline proposal
- [x ] (due: 2026-03-20) Send proposal
- [ ] (scheduled: 2026-03-21) Follow up
- [ X] Confirm scope
- [ x ] Share notes
```

## 🔄 Automatic Updates

- The Signboard app can check for updates automatically.
- You can manually check any time from `Check for Updates...`:
  - macOS: Signboard app menu
  - Windows/Linux: Help menu
- Update dialogs convert GitHub release HTML or Markdown into readable plain text and omit the download-link section. Use `View changelog` for the complete release page.
- On Ubuntu, Signboard validates a downloaded `.deb` before requesting administrator access.
- On Arch Linux and Omarchy, Signboard recognizes the downloaded `.pacman`, validates it with `pacman -Qp`, and installs it with `pkexec pacman -U`. It never runs a database-only `pacman -Sy` refresh.
- Invalid downloads or package-manager failures leave the installed version unchanged and offer a shortcut to the release Downloads page.

---

## 🛠 Development

```bash
git clone https://github.com/cdevroe/signboard.git
cd signboard
npm install
npm start
```

### Tests

```bash
npm run test:frontmatter
npm run test:board-labels
npm run test:board-snapshot
npm run test:board-duplication
npm run test:app-settings
npm run test:ai-task-suggestions
npm run test:smart-board-actions
npm run test:smart-action-sharing
npm run test:board-card-metadata
npm run test:due-notifications
npm run test:task-list
npm run test:obsidian-integration
npm run test:mcp
npm run test:cli
npm run test:cli-install
npm run test:desktop-cli
npm run test:card-ordering
npm run test:board-views
npm run test:card-timestamps
npm run test:timestamp
npm run test:external-calendar
npm run test:archive
npm run test:playwright
npm run test:import-trello
npm run test:import-obsidian
npm run test:import-tasksmd
npm run test:obsidian-plugin
npm run release:verify
```

Playwright Electron tests do not explicitly bring the Signboard window to the foreground by default. Set `SIGNBOARD_PLAYWRIGHT_FOREGROUND=1` before `npm run test:playwright` when you want the app focused while debugging.

---

## 📦 Distribution Builds

### macOS

```bash
# Default public macOS release build
npm run dist:mac

# Optional: specific macOS architectures for troubleshooting
npm run dist:mac:universal
npm run dist:mac:arm64
npm run dist:mac:x64

# Optional: build every macOS variant
npm run dist:mac:all
```

### Windows (NSIS installer)

```bash
# Default public Windows release build
npm run dist:win

# Alias for the default Windows release build
npm run dist:win:all

# Optional: specific Windows architectures for troubleshooting
npm run dist:win:x64
npm run dist:win:arm64
```

### Linux (AppImage, deb, Arch/Omarchy)

```bash
# Specific Linux architecture
npm run dist:linux:x64
npm run dist:linux:arm64

# Build both Linux architectures
npm run dist:linux:all

# Optional: RPM-only builds (requires rpmbuild in PATH)
npm run dist:linux:rpm:x64
npm run dist:linux:rpm:arm64
npm run dist:linux:rpm:all

# Optional: Arch/Omarchy-only builds
npm run dist:linux:pacman:x64
npm run dist:linux:pacman:arm64
npm run dist:linux:pacman:all
```

### Build everything

```bash
# Public release matrix: macOS universal, Windows installer, Linux x64 + ARM64
npm run dist:all
```

Notes:
- `--publish never` is used for local builds so these commands package artifacts without attempting to publish releases.
- Standard public downloads are: macOS universal, one Windows installer, and Linux `AppImage`/`deb`/Arch packages for `x64` and `ARM64`.
- The GitHub release body should be treated as the curated download surface. Link the public download set there instead of expecting users to interpret the raw asset list.
- Copy `.env-sample` to `.env` and fill in your credentials before running signing/notarization builds.
- macOS signing/notarization uses environment variables from `.env` (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`).

---

## 🤝 Contributing

Contributions in all forms are welcome!  

- **Report bugs**: Open an [Issue](https://github.com/cdevroe/signboard/issues).
- **Suggest features**: Open an [Issue](https://github.com/cdevroe/signboard/issues) with the `enhancement` label.
- **Submit fixes or features**: Fork the repo, make your changes, and open a [Pull Request](https://github.com/cdevroe/signboard/pulls).

### Contribution Guidelines
- Keep PRs focused: one change per PR makes reviews faster.
- Be respectful and constructive in discussions.

---

## 💖 Sponsor the Project

Signboard now includes an in-app sponsorship modal with two options:

- Personal use: free, with an optional tip in any amount
- Commercial use: requested one-time payment

---

## 📜 License

The source code in this repository is licensed under the [MIT](./LICENSE) license.

[MIT](./LICENSE) © 2025-2026 Colin Devroe - https://cdevroe.com

Important clarification:

- The MIT license allows personal and commercial use of the source code.
- The in-app `$49` commercial-use payment is currently a sponsorship request and honor-system purchase model for packaged app users.
- The optional personal-use tip is also a sponsorship mechanism, not a separate software license.

# Third-Party Notices

My thanks to [John Gruber](https://daringfireball.net/) for creating [Markdown](https://daringfireball.net/projects/markdown/) and to [Steph Ango](https://stephango.com/), CEO of [Obsidian](https://obsidian.md/), for his [File over app philosophy](https://stephango.com/file-over-app).

Signboard includes static versions of the following open source libraries:

- [Turndown](https://github.com/mixmark-io/turndown) – [MIT License](https://github.com/mixmark-io/turndown/blob/master/LICENSE)
- [OverType](https://github.com/panphora/overtype) - [MIT License](https://github.com/panphora/overtype/blob/main/LICENSE)
- [SortableJS](https://github.com/SortableJS/Sortable) – [MIT License](https://github.com/SortableJS/Sortable/blob/master/LICENSE)
- [Feather Icons](https://github.com/feathericons/feather) – [MIT License](https://github.com/feathericons/feather/blob/master/LICENSE)
- [fDatepicker](https://github.com/liedekef/fdatepicker) – [MIT License](https://github.com/liedekef/fdatepicker/blob/master/LICENSE.md)
