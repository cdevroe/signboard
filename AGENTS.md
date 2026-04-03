# Signboard Agent Guide

This repository keeps its primary Codex-specific instructions in [CODEX.md](./CODEX.md).

If you are an agent or tool that looks for `AGENTS.md`, use `CODEX.md` as the canonical source of repo guidance.

## Minimum Rules

- Read [CODEX.md](./CODEX.md) first.
- Read [docs/codex/PROJECT_CONTEXT.md](./docs/codex/PROJECT_CONTEXT.md) for architecture and behavior.
- Read [docs/codex/FILE_STRUCTURE.md](./docs/codex/FILE_STRUCTURE.md) for the repository map.
- Treat `app/signboard.js` as generated output; edit source modules in `app/**` and then run `./buildjs.sh`.
- Keep agent-facing docs up to date: [CODEX.md](./CODEX.md), [AGENTS.md](./AGENTS.md), [docs/codex/PROJECT_CONTEXT.md](./docs/codex/PROJECT_CONTEXT.md), and [docs/codex/FILE_STRUCTURE.md](./docs/codex/FILE_STRUCTURE.md).
- Keep release-facing docs up to date when user behavior or CLI behavior changes: [docs/README.md](./docs/README.md), [docs/using-signboard.md](./docs/using-signboard.md), [docs/signboard-cli.md](./docs/signboard-cli.md), [readme.md](./readme.md), and [MCP_README.md](./MCP_README.md) when relevant.

When in doubt, follow [CODEX.md](./CODEX.md).
