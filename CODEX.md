# Codex Quick Context - Signboard

Start here before opening source files.

- Read `docs/codex/PROJECT_CONTEXT.md` for architecture, data model, and behavior.
- Read `docs/codex/FILE_STRUCTURE.md` for an annotated map of the repository.
- Treat `app/signboard.js` as generated output; edit the source modules in `app/**` and then run `./buildjs.sh`.
- Tooltip UI is implemented in `app/ui/tooltips.js` and reads existing control labels (`title` / `aria-label` / `alt`) to keep tooltip copy centralized in markup.
- App updates are handled in `main.js` via `electron-updater` (GitHub releases), with menu-triggered/manual checks and remind-later state in `update-preferences.json` under Electron `userData`.
- `main.js` also supports headless MCP mode via `--mcp-server` for local agent integration over stdio; implementation lives in `lib/mcpServer.js`.
- `main.js` supports `--mcp-config` to print a ready-to-paste MCP config JSON snippet and exit.
- `Help` menu includes `Copy MCP Config`, which copies a ready-to-paste MCP server config snippet to clipboard.
- In dev/unpackaged builds, `Help` includes updater preview dialogs so update UI can be tested without publishing a release.
- Release assets for updater compatibility are validated by `scripts/verify-release-assets.js` (`npm run release:verify`).
- Dedicated user-facing MCP setup docs are in `MCP_README.md`.
- Reusable agent skill for MCP usage lives at `skills/signboard-mcp/SKILL.md`.
- Skill UI metadata lives at `skills/signboard-mcp/agents/openai.yaml`.
- Board tabs/session state live in renderer localStorage: `boardTabs` (open tab order) and `boardPath` (active board root fallback).
- Board label definitions are managed in `board-settings.md` files inside each board folder (runtime data, not repo source).
- Skip heavy/generated content unless explicitly needed: `node_modules/`, `dist/`, `static/vendor/`, and usually `package-lock.json`.
- Always update Codex markdown docs when behavior/architecture/tooling changes (`CODEX.md`, `docs/codex/PROJECT_CONTEXT.md`, `docs/codex/FILE_STRUCTURE.md`).
