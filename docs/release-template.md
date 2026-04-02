# Signboard Release Body Template

Signboard's in-app updater reads the GitHub release notes/body into the "what's new" dialog.

The updater strips a `## Downloads` section before rendering the in-app dialog, but the top of the release body should still be changelog-first.

Use this structure:

## What's New

- Short, user-facing changelog bullets
- Keep the most important changes near the top

## Downloads

- Download for macOS (Universal)
- Download for Windows
- Linux AppImage (x64)
- Linux AppImage (ARM64)
- Linux deb (x64)
- Linux deb (ARM64)

## Notes

- Do not promote architecture-specific macOS downloads in standard releases.
- Do not promote Windows architecture-specific installers in standard releases.
- Keep the top section short and task-oriented so the updater dialog stays readable.
- Put curated downloads after the changelog, not before it.
- Upload all updater metadata and supporting artifacts required by `npm run release:verify`, even if they are not linked from the release body.

## Example Skeleton

```md
## What's New

- Added ...
- Improved ...
- Fixed ...

## Downloads

- Download for macOS (Universal)
- Download for Windows
- Linux AppImage (x64)
- Linux AppImage (ARM64)
- Linux deb (x64)
- Linux deb (ARM64)
```
