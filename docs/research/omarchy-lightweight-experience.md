# A Lightweight Signboard Experience for Omarchy

Status: recommendation for discussion  
Researched: 2026-09-04

## Recommendation

Build a cross-platform Signboard TUI as another interface to the existing local
Markdown model, exposed as `signboard tui`. Distribute it with Signboard's
existing Arch/Omarchy package and give it an application-launcher entry that
opens the TUI in the user's preferred terminal. Keep `signboard` CLI commands
stable for scripts and MCP stable for agents.

After the TUI is useful on its own, publish a small, separate Omarchy shell
plugin that uses the CLI's JSON output to show a due-card count and provide
shortcuts for Quick Add, opening the TUI, and opening the desktop app. The
plugin should be an optional convenience surface, not the implementation of the
TUI and not a requirement for using Signboard on Omarchy.

This gives users three intentionally different interfaces over the same files:

| Interface | Best for | Runs Electron's renderer? |
| --- | --- | --- |
| `signboard` CLI | scripts, composable commands, quick one-shot changes | No |
| `signboard tui` | daily keyboard-driven board work in a terminal | No |
| Signboard desktop | visual planning, drag/drop, settings, rich editing | Yes |
| Optional Omarchy plugin | glanceable status and launch/quick-capture actions | No, but it runs inside `omarchy-shell` |

Do not call the TUI an Omarchy plugin. In current Omarchy terminology, a plugin
is a QML extension loaded by the Quickshell-based desktop shell. Supported
plugin kinds are bar widget, panel, overlay, menu, service, and full bar. A TUI
is a terminal program. An app entry is simply a discoverable way to launch a
program, and can launch either the TUI in a terminal or the existing desktop
application.

## Why this direction fits Signboard

Signboard already has most of the non-visual product surface needed by a TUI:

- `lib/cliBoard.js` owns list/card discovery and mutations.
- `lib/boardDiscovery.js` knows current, trusted, and desktop-open boards.
- `lib/boardSnapshot.js` provides batched board reads.
- `lib/cardOrdering.js` provides transactional moves and ordering.
- The CLI already creates, searches, filters, edits, duplicates, moves,
  archives, restores, and imports cards.
- Existing `signboard://open-card` and `signboard://open-board` links provide a
  safe handoff to the desktop app.

The file-backed Markdown board remains the product boundary. The TUI should
call shared library functions directly rather than shelling out to the CLI for
every action, parsing human-readable CLI output, or independently reimplementing
frontmatter and filesystem rules. CLI, TUI, MCP, and Electron then remain peer
adapters over the same domain modules.

The installed CLI wrapper already starts the packaged executable with
`ELECTRON_RUN_AS_NODE`, so it does not create the Chromium renderer/window. The
first implementation can therefore ship inside the existing package without
requiring a second runtime. Measure it on target old hardware, but do not equate
the package's on-disk Electron size with the runtime cost of a renderer-free
Node process.

## Options considered

Scores are relative to Signboard's current CommonJS/Node architecture, with 5
being best.

| Option | Reuse | Runtime efficiency | Delivery simplicity | Long-term maintenance | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Improve CLI only | 5 | 5 | 5 | 5 | Valuable foundation, but not an interactive board experience |
| Node TUI in this repository | 5 | 4 | 5 | 4 | Recommended |
| Standalone Go/Bubble Tea TUI | 2 | 5 | 3 | 2 | Excellent binary, but duplicates or bridges business logic |
| Standalone Rust/Ratatui TUI | 2 | 5 | 2 | 2 | Same split-brain risk with a higher contribution barrier |
| Omarchy QML plugin as primary UI | 2 | 4 | 2 | 2 | Omarchy-only and coupled to shell/plugin APIs |
| Local web UI/PWA | 3 | 2 | 3 | 3 | Still pays browser costs and does not match the TUI goal |

### TUI library choice

Start with a short implementation spike using **Terminal Kit**, then commit to
it if the spike meets the acceptance gates below. It is CommonJS-friendly,
currently maintained, does not depend on ncurses, and includes keyboard input,
screen buffers, text input, menus, tables, and a document/widget model. That is
a closer fit to this repository than introducing React, JSX, ESM, and a second
build pipeline for Ink.

Bubble Tea is the strongest alternative if a future standalone, single-binary
TUI becomes more important than sharing Signboard's implementation. Its
Elm-style model/update/view architecture is production-proven, but a Go client
would either duplicate Signboard's parsing and mutation semantics or need a
persistent Node/MCP backend. Neither is justified for the first release.

Avoid the original `blessed` package for new work despite its efficient damage
buffer and useful widgets; its upstream project is much less active than the
other candidates. Ratatui and Cursive are capable Rust options, but neither
solves the domain-logic duplication problem.

Before adding a dependency, the spike should verify:

- Ghostty, Kitty, and Alacritty behavior on Omarchy.
- Clean recovery after `Ctrl+C`, crashes, terminal resize, and suspend/resume.
- Unicode, narrow-window, 16-color, true-color, and `NO_COLOR` behavior.
- Keyboard-only operation and a usable screen-reader/plain-output fallback.
- Idle CPU, initial board load time, keystroke latency, and peak RSS against
  both the current packaged CLI and the Electron desktop app.
- Packaging inside `app.asar` and launch through the installed CLI shim.

If Terminal Kit fails those gates, use Ink as the second Node candidate. Do not
start a Go or Rust rewrite until a measured Node prototype fails the resource
budget.

## Proposed TUI experience

The default layout should feel familiar to both Signboard and Omarchy users:

```text
 Signboard  Work Board                         / search   ? help   o desktop
 ┌ Backlog ──────────┐ ┌ Doing ────────────┐ ┌ Done ──────────────┐
 │ Write announcement│ │ Test package       │ │ Publish notes       │
 │ Fix launch issue  │ │                    │ │                     │
 │                   │ │                    │ │                     │
 └───────────────────┘ └────────────────────┘ └─────────────────────┘
  j/k select   h/l list   Enter open   a add   m move   e edit   q quit
```

MVP interactions:

- Start with `signboard tui`; accept `--board <path>` and the stored CLI board.
- Switch among known boards without leaving the TUI.
- Render Kanban columns from one board snapshot, degrading to a single-list
  layout on narrow terminals.
- Navigate with arrows and `hjkl`; show all bindings behind `?`.
- Search/filter cards, open a detail view, create cards, edit title/body/dates,
  move cards, and archive with confirmation.
- Use `$EDITOR` for substantial Markdown editing. Restore the terminal and
  reload the card after the editor exits.
- Press `o` to open the selected card in the desktop app through its trusted
  `signboard://` deep link. If the desktop application is not installed, show a
  useful message and leave the TUI running.
- Detect external file changes and refresh without overwriting an active edit.
- Follow the active Omarchy palette when available, with terminal-default and
  monochrome fallbacks. Board-specific palettes remain deliberate overrides.

The first release should not reproduce Planner, Table bulk actions, Settings,
imports, Smart Actions, linked-object management, or every editor affordance.
Those remain in the desktop app or existing CLI until usage shows which belong
in the TUI.

## Architecture

Introduce a thin TUI adapter and continue extracting reusable operations from
`lib/cliApp.js` when necessary:

```text
 Markdown board folders
          │
 shared domain modules in lib/
   ├── Electron IPC / desktop renderer
   ├── CLI command parser and text/JSON presenter
   ├── MCP JSON-RPC presenter
   └── TUI state, events, and terminal renderer
```

Suggested source layout:

```text
bin/signboard.js              # route `tui` to the TUI entry point
lib/tuiApp.js                 # lifecycle and top-level state transitions
lib/tui/
  model.js                    # selection, mode, viewport, dirty state
  actions.js                  # calls shared Signboard domain operations
  keys.js                     # key map and help descriptions
  theme.js                    # terminal/Omarchy color negotiation
  views/                      # board, card, editor, picker, help
scripts/test-tui-*.js         # reducer/action/render snapshots + PTY smoke test
```

Keep state transitions and layout calculations pure where possible so most TUI
tests do not require a real terminal. Put filesystem mutations behind the same
atomic and transactional helpers used by desktop, CLI, and MCP. Treat external
edit refresh with the same no-overwrite principle as the desktop editor.

## Omarchy integration

### Package and launcher

The existing `.pacman` artifact should install both interfaces. Add a
`Signboard TUI.desktop` entry that launches `signboard tui` through
`xdg-terminal-exec`, with a distinct app ID/title so Omarchy/Hyprland can apply
window rules. Keep the existing `Signboard.desktop` entry for Electron. The app
launcher can then offer “Signboard” and “Signboard TUI” without forcing users to
learn a command first.

Add an optional documented Hyprland binding, but do not overwrite user
bindings. A suggested default is only appropriate if Omarchy accepts Signboard
upstream; until then, document a copyable binding.

### Optional marketplace plugin

Build the plugin later in a dedicated public repository such as
`omarchy-signboard-plugin`. The current marketplace expects one plugin at a
repository root with `manifest.json`, README, license, safe install/removal
instructions, and a globally unique ID. Keeping it separate also lets Omarchy's
plugin updater clone it into `~/.config/omarchy/plugins/<id>` as intended.

A restrained first plugin could provide:

- A `bar-widget` with today's actionable-card count.
- A small `panel` with overdue/today cards from `signboard cards --json`.
- Actions to launch the TUI, invoke a focused Quick Add flow, or open Electron.
- A configurable board scope and polling interval, with manual refresh.

Follow the Basecamp plugin precedent: depend on an installed CLI, consume its
JSON contract, keep credentials/content out of plugin storage, and document
every command invoked. The plugin must degrade clearly when `signboard` is not
installed. Avoid a persistent polling service in the first version on the very
machines this effort is intended to help.

Omarchy warns that plugins execute unsandboxed inside `omarchy-shell`. The
plugin should remain small, never mutate arbitrary shell configuration, and
avoid install hooks or privileged operations.

## Delivery plan

### Phase 0 — benchmark and prototype

1. Record cold start, board-ready time, idle CPU, and peak RSS for Electron,
   one-shot CLI, and a read-only Node TUI prototype on an older target machine.
2. Test a large synthetic board and a representative real board.
3. Validate Terminal Kit and packaging against the acceptance gates above.
4. Set budgets from the measurements. A reasonable initial target is board
   ready in under 500 ms on the target machine, idle CPU effectively zero, and
   peak RSS below 100 MB, but measured baselines should decide final thresholds.

### Phase 1 — useful read/write TUI

Ship board selection, Kanban navigation, search, detail, add, edit via
`$EDITOR`, move, archive, refresh, help, and desktop handoff. Include CLI docs,
man/help text, packaged launch smoke tests, and terminal recovery tests.

### Phase 2 — Omarchy polish

Add the launcher entry, active-theme mapping, install documentation, optional
shortcut recipe, and resource comparison. Ask Omarchy users to test Ghostty,
Kitty, Alacritty, small screens, and older Intel/AMD hardware.

### Phase 3 — optional shell plugin

Only after the CLI/TUI JSON contracts and launch commands are stable, create
and submit the separate plugin. Keep the plugin versioned independently and
compatible with a declared minimum Signboard CLI version.

### Phase 4 — evidence-led expansion

Use feedback to choose among Planner/Agenda, task toggling, labels, quick date
editing, and Smart Actions. Do not chase desktop feature parity as a goal by
itself.

## Release and compatibility requirements

- Preserve the current Markdown/frontmatter format and atomic writes.
- Preserve CLI output; add JSON fields compatibly and version any future plugin
  contract that needs breaking changes.
- Preserve the legacy desktop application ID and existing deep-link validation.
- Keep `bin/**`, `shared/**`, and any new TUI runtime roots in
  `electron-builder.json`.
- Make non-interactive CLI behavior unchanged: `signboard` must not enter a TUI
  unless `tui` is explicitly requested and stdin/stdout are TTYs.
- On non-TTY input, exit with guidance or provide a deliberate read-only/plain
  mode; never emit terminal control sequences into pipes or CI logs.
- Document that concurrent desktop/TUI use is supported through filesystem
  refresh, while active local edits win until saved or discarded.

## Decision checkpoints

Proceed from Phase 0 to Phase 1 only if the prototype is materially lighter
than Electron on old hardware and terminal recovery is reliable. Proceed to a
separate native implementation only if the Node runtime misses an agreed
resource target after profiling. Proceed to the Omarchy plugin only when the
TUI works without it and at least one glanceable/plugin workflow has clear user
demand.

## Sources

- [Omarchy shell plugin reference](https://github.com/omacom/omarchy/blob/quattro/shell/README.md#plugin-system): plugin kinds, manifests, lifecycle, install behavior, IPC, and unsandboxed-code warning.
- [Omarchy Plugin Marketplace publishing guide](https://plugins.omarchy.org/publish.html): repository, manifest, documentation, validation, and submission requirements.
- [Omarchy manual: TUIs](https://learn.omacom.io/books/2/pages/59): first-party user experience and keyboard-launch precedents for terminal applications.
- [Basecamp's Omarchy plugin](https://github.com/basecamp/omarchy-basecamp-plugin): a maintained example of a QML plugin consuming an existing CLI JSON interface.
- [Terminal Kit](https://www.npmjs.com/package/terminal-kit): current Node terminal features, dependency model, and release information.
- [Ink](https://github.com/vadimdemedes/ink): React-based interactive CLI model, input handling, terminal suspension, and non-interactive behavior.
- [Bubble Tea](https://github.com/charmbracelet/bubbletea): Go TUI framework and Elm-style architecture.
- [Ratatui](https://github.com/ratatui/ratatui): Rust TUI framework and ecosystem.
- [Cursive](https://github.com/gyscos/cursive): Rust TUI library and terminal compatibility goals.
- [Blessed](https://github.com/chjj/blessed): Node terminal widget and damage-buffer design.
