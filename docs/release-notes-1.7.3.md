# Signboard 1.7.3

## What's New

- Drag an empty area of a wide board to scroll horizontally with a mouse.
- Long card titles and preview text now wrap within their columns.
- Large boards load cards with bounded file reads, and incomplete reads show a warning instead of silently hiding affected cards.
- CLI commands that select an exact card filename avoid reading every card in the list.
- MCP starts without opening the desktop app, handles card metadata consistently, rejects impossible dates, and respects allowed roots when symbolic links are present.
- Card and list numbering continues correctly beyond 999.
- List renames update card properties and completed-list settings; board renames and moves update affected card properties.
- Atomic saves preserve existing file permission bits.
- Signboard card links reveal the app and open the requested card after workspace restoration.

Thanks to amali for the text-wrapping and board-panning contributions in PRs #55 and #56.

<!-- Release preparation: add the verified curated Downloads section immediately before publishing. This file is draft release copy, not a published release. -->
