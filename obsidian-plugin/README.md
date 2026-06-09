# Signboard Companion for Obsidian

This optional Obsidian plugin helps a vault talk to the Signboard desktop app while keeping Signboard's normal file-first format.

## Features

- Open Signboard cards from Obsidian when a note has `signboard_uri`, `signboard_id`, or `signboard_card_id`.
- Copy a Signboard card link from the command palette or file context menu.
- Right-click a folder and choose `Create Signboard` to turn that folder into a Signboard board and open it in Signboard.
- Attach the active Obsidian note to a Signboard card by pasting a `signboard://open-card?id=...` link or card ID.
- Handle `obsidian://signboard?cardId=...` links so Signboard can ask Obsidian to open a card by ID.

## Install During Development

1. Copy or symlink this `obsidian-plugin` folder into your vault as `.obsidian/plugins/signboard-companion`.
2. In Obsidian, open `Settings > Community plugins`.
3. Turn off Restricted mode if needed.
4. Enable `Signboard Companion`.

When symlinked from this repository, Obsidian loads `main.js` directly from the checkout, so plugin edits are picked up after disabling/enabling the plugin or reloading Obsidian.

The plugin is desktop-only because folder conversion and Signboard app launching require local filesystem paths.

## Folder Conversion

`Create Signboard` asks for confirmation before it changes anything. It adds `board-settings.md`, creates Signboard list folders when needed, treats existing direct child folders as lists, moves top-level Markdown notes into `000-To-do-stock`, adds Signboard frontmatter to cards, and opens the folder with `signboard://open-board?path=...`.

No content is deleted. Existing child folders are not renamed.
