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

## Downloads

- [Download for macOS (Universal)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_mac_universal.dmg)
- [Download for Windows](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_win.exe)
- [Linux AppImage (x64)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_linux_x86_64.AppImage)
- [Linux AppImage (ARM64)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_linux_arm64.AppImage)
- [Linux deb (x64)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_linux_amd64.deb)
- [Linux deb (ARM64)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_linux_arm64.deb)
- [Arch/Omarchy package (x64)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_linux_x64.pacman)
- [Arch/Omarchy package (ARM64)](https://github.com/cdevroe/signboard/releases/download/1.7.3/signboard_1.7.3_linux_aarch64.pacman)
