# Signboard MCP Server

Signboard includes a built-in Model Context Protocol (MCP) server mode so local LLM agents can read and update boards on your machine.

The MCP server runs through the Signboard executable with:

```bash
--mcp-server
```

## Why this exists

Most users install Signboard as a packaged desktop app. This MCP mode is designed to work from that packaged install, so users do not need a local source checkout to connect agents.

## Security defaults

By default, the server starts in read-only mode.

- `SIGNBOARD_MCP_READ_ONLY`:
  - default: `true`
  - set to `false` (or `0`) to allow write tools
- `SIGNBOARD_MCP_ALLOWED_ROOTS`:
  - optional allowlist of board root parent directories
  - uses your OS path delimiter (`:` on macOS/Linux, `;` on Windows)
  - when set, `boardRoot` arguments must resolve inside one of these paths

Example (macOS/Linux):

```bash
SIGNBOARD_MCP_READ_ONLY=false \
SIGNBOARD_MCP_ALLOWED_ROOTS="$HOME/Documents/signboards:$HOME/Test\ Board\ Colin/" \
"/Applications/Signboard.app/Contents/MacOS/Signboard" --mcp-server
```

Example (Windows PowerShell):

```powershell
$env:SIGNBOARD_MCP_READ_ONLY = "false"
$env:SIGNBOARD_MCP_ALLOWED_ROOTS = "C:\Users\you\Boards;D:\Work\Boards"
& "C:\Users\you\AppData\Local\Programs\Signboard\Signboard.exe" --mcp-server
```

## Running from source

```bash
npm run mcp:server
```

Print config JSON from source run:

```bash
npm run mcp:config
```

## Running from packaged Signboard

Typical executable locations:

- macOS: `/Applications/Signboard.app/Contents/MacOS/Signboard`
- Windows: `C:\Users\<you>\AppData\Local\Programs\Signboard\Signboard.exe`
- Linux AppImage: wherever you saved the `signboard_*.AppImage` file

Start MCP server mode by launching that executable with `--mcp-server`.

Print config JSON from packaged app:

```bash
"/Applications/Signboard.app/Contents/MacOS/Signboard" --mcp-config
```

## In-app config shortcut

Signboard includes a menu helper at `Help` -> `Copy MCP Config`.

- It copies a complete JSON config snippet to your clipboard.
- It sets `command` to Signboard's current executable path.
- It includes `SIGNBOARD_MCP_READ_ONLY=false` and a starter `SIGNBOARD_MCP_ALLOWED_ROOTS` value (`Documents/Boards`).

## Optional agent skill file

This repo includes a reusable skill file for agent behavior:

- `skills/signboard-mcp/SKILL.md`
- `skills/signboard-mcp/agents/openai.yaml`

Use it to standardize how agents call `signboard.*` tools (safety checks, read/write flow, and reporting style).

## MCP tools

The server currently exposes these tools:

- `signboard.get_config`
- `signboard.resolve_board_by_name`
- `signboard.list_lists`
- `signboard.list_cards`
- `signboard.read_card`
- `signboard.create_card` (write mode only)
- `signboard.update_card` (write mode only)
- `signboard.move_card` (write mode only)
- `signboard.create_list` (write mode only)
- `signboard.read_board_settings`
- `signboard.update_board_settings` (write mode only)

All tools take absolute `boardRoot` paths and reject path traversal.

## Board name lookup

If you do not want to manually type absolute board paths, use:

- `signboard.resolve_board_by_name`

This searches within `SIGNBOARD_MCP_ALLOWED_ROOTS` and returns absolute matches.
If `SIGNBOARD_MCP_ALLOWED_ROOTS` is not set, the resolver tool returns an error.

## Example client config snippets

### Claude Desktop (example)

```json
{
  "mcpServers": {
    "signboard": {
      "command": "/Applications/Signboard.app/Contents/MacOS/Signboard",
      "args": ["--mcp-server"],
      "env": {
        "SIGNBOARD_MCP_READ_ONLY": "false",
        "SIGNBOARD_MCP_ALLOWED_ROOTS": "/Users/you/Documents/Boards"
      }
    }
  }
}
```

### Codex-style MCP config (example)

```json
{
  "name": "signboard",
  "command": "/Applications/Signboard.app/Contents/MacOS/Signboard",
  "args": ["--mcp-server"],
  "env": {
    "SIGNBOARD_MCP_READ_ONLY": "false",
    "SIGNBOARD_MCP_ALLOWED_ROOTS": "/Users/you/Documents/Boards"
  }
}
```

## Behavior notes

- In MCP mode, Signboard does not open its desktop window.
- The process communicates over stdio (MCP JSON-RPC framing).
- Card reads/writes use Signboard's existing frontmatter logic (`lib/cardFrontmatter.js`).
- Board settings use Signboard's existing settings logic (`lib/boardLabels.js`).
