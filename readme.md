# Signboard

A local-first kanban desktop app built with HTML, CSS, and JavaScript. Signboard stores your lists as directories and cards as Markdown files on disk.

Signboard is free for personal use. If you are using Signboard for your work it would be appreciated if you purchase a commercial license to sponsor future development. See the app's "Sponsor" button.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/cdevroe/signboard)](../../issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/cdevroe/signboard)](../../pulls)
[![Donate](https://img.shields.io/badge/Donate-388307)](https://cdevroe.com/donate)

---

## ✨ Highlights
- 📂 Cards saved as Markdown files
- 🖌️ Color scheme per board (several to choose from!)
- 🌙 Light and dark mode variants for all color schemes
- 🏷 Custom labels per board
- 🗓 Card due dates and task list item due dates
- 📅 Calendar and "This Week" views
- 🗂 Planner overlay for actionable dated work across open boards
- 🎨 Board-colored source pills in Planner date views
- ✅ Completed-list workflow settings that preserve due-date history
- ✅ Progress counters on cards
- 🔎 Live search
- 🧲 Drag-and-drop card movement
- ⚡ Quick board switcher for open boards
- ⌨️ Keyboard shortcuts
- 🤖 MCP server
- 💻 CLI

---

## Installation

1. Go to the [Releases page](../../releases).
2. On the latest release, use the curated download links in the release body:
   - `Download for macOS (Universal)`
   - `Download for Windows`
   - Linux packages grouped by package type with explicit `x64` and `ARM64` labels

For standard releases, Signboard intentionally promotes a smaller public download set:

- macOS: universal build
- Windows: single installer
- Linux: separate `x64` and `ARM64` packages

## Documentation

- [Documentation hub](./docs/README.md)
- [Using Signboard](./docs/using-signboard.md)
- [Signboard CLI](./docs/signboard-cli.md)
- [MCP Server](./MCP_README.md)

### Keyboard Shortcuts

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
In the new-card modal, `Shift + Enter` creates the card, opens it immediately, and focuses the notes field.

You can also open the shortcut helper from `Help > Keyboard Shortcuts`.

Editable fields, including the card title and body editor, support the native right-click text editing menu for cut, copy, paste, delete, and select all.

## 🤖 MCP Server

Signboard includes a built-in MCP server so agents can interact with local boards.

- Dedicated instructions: [MCP_README.md](./MCP_README.md)
- To copy config: `Help` -> `Copy MCP Config`
- MCP uses both explicit allowed roots and Signboard's desktop trusted board roots for board lookup.
- Optional agent skill: `skills/signboard-mcp/SKILL.md`

## 💻 CLI

Signboard includes a terminal CLI for direct board management without going through MCP.

- Full guide: [docs/signboard-cli.md](./docs/signboard-cli.md)

- In the desktop app on macOS/Linux: `Help` -> `Install Signboard CLI`
- Use `signboard use /Path/to/Board` once to remember the active board for later commands
- Packaged desktop app executable also accepts CLI commands directly:
  - macOS: `/Applications/Signboard.app/Contents/MacOS/Signboard <command>`
  - Windows: `Signboard.exe <command>`
  - Linux AppImage: `./signboard_*.AppImage <command>`

Examples:

```bash
# Select a board once
signboard use /Path/to/Board

# Lists
signboard lists
signboard lists create "Waiting"
signboard lists rename "Waiting" "Blocked"

# Cards
signboard cards --due next:7
signboard cards "To do"
signboard cards --label Urgent --search launch
signboard cards create --list "To do" --title "Ship release notes" --due 2026-03-20
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
- `--sort list|due|title|updated`
- `--json` for scripting output

Import options:

- `signboard import trello --file <export.json> [--board <path>] [--json]`
- `signboard import obsidian --source <path> [--source <path> ...] [--board <path>] [--json]`
- `signboard import tasksmd --source <path> [--board <path>] [--json]`

Example task checklist syntax:

```md
- [ ] Draft update
- [x ] (due: 2026-03-20) Send proposal
- [ X] Confirm scope
- [ x ] Share notes
```

## 🔄 Automatic Updates

- The Signboard app can check for updates automatically.
- You can manually check any time from `Check for Updates...`:
  - macOS: Signboard app menu
  - Windows/Linux: Help menu

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
npm run test:app-settings
npm run test:board-card-metadata
npm run test:due-notifications
npm run test:task-list
npm run test:mcp
npm run test:cli
npm run test:cli-install
npm run test:desktop-cli
npm run test:playwright
```

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

### Linux (AppImage, deb)

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
```

### Build everything

```bash
# Public release matrix: macOS universal, Windows installer, Linux x64 + ARM64
npm run dist:all
```

Notes:
- `--publish never` is used for local builds so these commands package artifacts without attempting to publish releases.
- Standard public downloads are: macOS universal, one Windows installer, and Linux `AppImage`/`deb` builds for `x64` and `ARM64`.
- The GitHub release body should be treated as the curated download surface. Link the public download set there instead of expecting users to interpret the raw asset list.
- Copy `.env-sample` to `.env` and fill in your credentials before running signing/notarization builds.
- macOS signing/notarization uses environment variables from `.env` (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`).

---

## 🤝 Contributing

Contributions in all forms are welcome!  

- **Report bugs**: Open an [Issue](../../issues).  
- **Suggest features**: Open an [Issue](../../issues) with the `enhancement` label.  
- **Submit fixes or features**: Fork the repo, make your changes, and open a [Pull Request](../../pulls).  

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
