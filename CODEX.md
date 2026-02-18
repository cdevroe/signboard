# Codex Quick Context - Signboard

Start here before opening source files.

- Read `docs/codex/PROJECT_CONTEXT.md` for architecture, data model, and behavior.
- Read `docs/codex/FILE_STRUCTURE.md` for an annotated map of the repository.
- Treat `app/signboard.js` as generated output; edit the source modules in `app/**` and then run `./buildjs.sh`.
- Board tabs/session state live in renderer localStorage: `boardTabs` (open tab order) and `boardPath` (active board root fallback).
- Board label definitions are managed in `board-settings.md` files inside each board folder (runtime data, not repo source).
- Skip heavy/generated content unless explicitly needed: `node_modules/`, `dist/`, `static/vendor/`, and usually `package-lock.json`.
- Always update Codex markdown docs when behavior/architecture/tooling changes (`CODEX.md`, `docs/codex/PROJECT_CONTEXT.md`, `docs/codex/FILE_STRUCTURE.md`).
