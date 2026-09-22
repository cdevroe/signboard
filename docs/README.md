# Signboard Documentation

Signboard stores boards as folders and cards as Markdown files. These guides describe the 1.7.x app and its automation interfaces.

## Choose a guide

| What you want to do | Start here |
| --- | --- |
| Use boards, cards, Planner, Appearance, or Obsidian integration | [Using Signboard](./using-signboard.md) |
| Work from a terminal or write scripts | [Signboard CLI](./signboard-cli.md) |
| Connect an AI agent and give it structured board tools | [MCP Server](../MCP_README.md) |
| Inspect card metadata, back up boards, or restore a copy | [File format and backups](./file-format.md) |

For installation and platform downloads, see the [main README](../readme.md#installation).

## Agents using Signboard

Use MCP when your client supports local stdio tools, or the CLI with `--json` for shell-based automation. Both guides cover board discovery, reading before changes, previews, and verifying writes.

The optional [Signboard MCP skill](../skills/signboard-mcp/SKILL.md) supplies a reusable agent workflow. An agent working with your boards does not need the source architecture documentation.

## Contributing to Signboard

People and coding agents changing the app should use the [contributor documentation](./codex/README.md), starting with [AGENTS.md](../AGENTS.md) and [CODEX.md](../CODEX.md). It covers architecture, the source map, testing, and build identity.

Public contributor docs describe reusable development practices. Machine access instructions, local research, QA reports, and handoff notes stay in ignored local directories.
