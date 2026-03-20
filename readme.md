# Signboard

A local-first kanban desktop app built with HTML, CSS, and JavaScript. Signboard stores your lists as directories and cards as Markdown files on disk, so you own your data.

Signboard is free for personal use. If you are using Signboard for your work it would be appreciated if you purchase a commercial license to support future development. See the app's "support" area.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/cdevroe/signboard)](../../issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/cdevroe/signboard)](../../pulls)
[![Donate](https://img.shields.io/badge/Donate-388307)](https://cdevroe.com/donate)

---

## ✨ Highlights
- 📂 Cards saved as Markdown files (portable & future-proof)
- 🖌️ Custom color scheme per board
- 🏷 Per-card labels with light/dark colors
- 📅 Due dates
- 📅 Calendar and "This Week" views
- ✅ Task progress counters on cards (`completed/total`)
- 🗓 Per-task due dates that feed Calendar and This Week views
- 🔎 Live search across
- 🖥 Runs as a desktop app
- 🪶 Minimal dependencies 😅, just plain JavaScript + Electron

---

## Installation

1. Go to the [Releases page](../../releases).
2. On the latest release, download the correct file for your operating system.

## ⌨️ Keyboard Shortcuts

- `Cmd/Ctrl + /`: open the keyboard shortcuts helper
- `Cmd/Ctrl + N`: add card
- `Cmd/Ctrl + Shift + N`: add list
- `Cmd/Ctrl + 1`, `2`, `3`: switch board views
- `Esc`: close open modals
- In app: `Help` -> `Keyboard Shortcuts`

## 🤖 MCP Server

Signboard includes a built-in MCP server so agents can interact with local boards.

- Dedicated instructions: [MCP_README.md](./MCP_README.md)
- Run from source: `npm run mcp:server`
- Print ready-to-paste config JSON: `npm run mcp:config`
- Run from packaged app: launch Signboard executable with `--mcp-server`
- In app: `Help` -> `Copy MCP Config`
- Board creation tool: `signboard.create_board`
- Board-name lookup tool: `signboard.resolve_board_by_name`
- Optional agent skill: `skills/signboard-mcp/SKILL.md`

## 💻 CLI

Signboard includes a terminal CLI for direct board management without going through MCP.

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
signboard cards read --list Doing --card ab123

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

## ✅ Task List Items

- Card counters now use `completed/total` task checklist totals and stay visible while tasks exist.
- Counter badges turn green when all tasks on a card are complete.
- Task list lines can include a task-level due date marker at the start of the task content:
  - `(due: YYYY-MM-DD)`
- Cards appear in Calendar and This Week for both card due dates and task due markers.

Example checklist syntax:

```md
- [ ] Draft update
- [x ] (due: 2026-03-20) Send proposal
- [ X] Confirm scope
- [ x ] Share notes
```

## 🔄 Automatic Updates

- Packaged Signboard builds can check GitHub releases for updates automatically.
- When a release is available, Signboard shows release notes and lets you:
  - install immediately,
  - remind later,
  - or view the release changelog on GitHub.
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
# Current host architecture
npm run dist

# Specific macOS architectures
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:mac:universal

# Build all macOS variants
npm run dist:mac:all
```

### Windows (NSIS installer)

```bash
# Specific Windows architecture
npm run dist:win:x64
npm run dist:win:arm64

# Build both Windows architectures
npm run dist:win:all
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
npm run dist:all
```

Notes:
- `--publish never` is used for local builds so these commands package artifacts without attempting to publish releases.
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

## 💖 Support the Project

Signboard now includes an in-app support modal with two options:

- Personal use: free, with an optional tip in any amount.
- Commercial use: requested one-time payment

If you are using Signboard in a paid or commercial context, the app asks you to support development through that one-time payment. If you are using it for personal projects, you can keep using it for free and optionally leave a tip.

---

## 📜 License

The source code in this repository is licensed under the [MIT](./LICENSE) license.

[MIT](./LICENSE) © 2025-2026 Colin Devroe - https://cdevroe.com

Important clarification:

- The MIT license allows personal and commercial use of the source code.
- The in-app `$49` commercial-use payment is currently a support request and honor-system purchase model for packaged app users.
- The optional personal-use tip is also a support mechanism, not a separate software license.

# Third-Party Notices

My thanks to [John Gruber](https://daringfireball.net/) for creating [Markdown](https://daringfireball.net/projects/markdown/) and to [Steph Ango](https://stephango.com/), CEO of [Obsidian](https://obsidian.md/), for his [File over app philosophy](https://stephango.com/file-over-app).

Signboard includes static versions of the following open source libraries:

- [Turndown](https://github.com/mixmark-io/turndown) – [MIT License](https://github.com/mixmark-io/turndown/blob/master/LICENSE)
- [OverType](https://github.com/panphora/overtype) - [MIT License](https://github.com/panphora/overtype/blob/main/LICENSE)
- [SortableJS](https://github.com/SortableJS/Sortable) – [MIT License](https://github.com/SortableJS/Sortable/blob/master/LICENSE)
- [Feather Icons](https://github.com/feathericons/feather) – [MIT License](https://github.com/feathericons/feather/blob/master/LICENSE)
- [fDatepicker](https://github.com/liedekef/fdatepicker) – [MIT License](https://github.com/liedekef/fdatepicker/blob/master/LICENSE.md)
