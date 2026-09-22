# Contributor documentation

These documents help people and coding agents change Signboard's source safely. The `codex` directory name reflects their origin; the architecture, source map, and test procedures apply to any contributor.

- [Project context](./PROJECT_CONTEXT.md): architecture, file storage, and behavior that changes must preserve.
- [Source map](./FILE_STRUCTURE.md): where features and shared helpers live.
- [Testing](./TESTING.md): isolated validation, packaged builds, performance, and reliability checks.
- [Electron test setup](./PLAYWRIGHT_TESTING.md): configure a Linux test host or run an explicitly authorized native check.
- [Build identity](../build-identity.md): prepare one source stamp for all release platforms.

Start with the repository's [AGENTS.md](../../AGENTS.md) and [CODEX.md](../../CODEX.md) when modifying code. Agents using Signboard boards should start with [MCP Server](../../MCP_README.md) or [Signboard CLI](../signboard-cli.md).

Hostnames, machine administration instructions, setup inventories, research, QA reports, and handoff notes belong in ignored `.local/` or `output/` directories. They are not part of public contributor documentation. When present, consult `.local/codex/` for the current computer's test-host instructions before using that host.
