# Signboard 1.7.4 draft preparation

[Draft PR #60](https://github.com/cdevroe/signboard/pull/60) and the [unpublished release draft](https://github.com/cdevroe/signboard/releases) are prepared. Marcus Holtz is credited in the README, release notes, PR, and co-authored implementation commit. The PR remains a draft; no merge or release publication has occurred.

## Source identity

All packaged runtime/build sources come from `6b727a1a9b067725146f6b56c84487548d55915c`. Shared release build: **20260921.1**; fingerprint: `87088b1449418b3efcde5b96798e95735ab8f991ea78cf870e7fbbd9d792a2a9`. The stamp records the Git context before its commit; its content fingerprint includes all source changes. Later test/documentation commits do not change this fingerprint or require rebuilding.

The packaging worktree is `/private/tmp/signboard-174-dist-20260921`. It has its own locked dependencies and output directory. The main checkout remains on `codex/release-1.7.4`; unrelated files and the saved 2.0 checklist edit remain preserved.

## Platform evidence

- Linux x64 and ARM64: native AppImage, deb, and pacman builds passed packaged desktop/CLI/MCP launch checks, including matching build identity. [GitHub build](https://github.com/cdevroe/signboard/actions/runs/35647777074). Downloaded package structures, sizes, and updater SHA-512 metadata pass `release:verify:partial`. All six Linux packages and two metadata files are attached to the release draft.
- Windows: the combined x64/ARM64 installer passed the packaged desktop/CLI/MCP gate on the native x64 runner. The initial artifact finalization failed with GitHub HTTP 403; rerunning succeeded. [GitHub build](https://github.com/cdevroe/signboard/actions/runs/35647765374). The installer, blockmap, and updater metadata pass local verification and are attached to the draft. No Windows ARM64 runtime test is claimed.
- macOS: the universal application is locally signed with the existing Developer ID and legacy application ID. Deep/strict codesign validation and both x86_64/arm64 slices are verified; packaged CLI build reporting matches the shared stamp. A failed temporary-keychain import was avoided by using the existing login-keychain identity. No notarization submission or GUI launch check has occurred. The signed app is `dist/mac-universal/Signboard.app` in the packaging worktree; it is not yet a distribution-ready Mac download.

Per-file SHA-256 hashes and sizes for available release assets are in [release-assets.json](1.7.4-validation/release-assets.json). The manifest remains marked incomplete until Mac packages are added and the complete `release:verify` gate passes.

## Tests and outstanding gates

The final-source Babu/Xvfb run passed **95 of 96** tests in 5.9 minutes. The only failure was the existing eight-lap, slow-drag test reaching its 60-second budget (also reproduced on unchanged 1.7.3 earlier). It now has a two-minute budget without removing any health samples/assertions. The focused rerun passed About/build reporting, then lost SSH when Babu became unreachable; no completed drag result is claimed. Both Bonjour names and a bounded current-LAN SSH scan failed to locate Babu by its saved host key. The two-hour packaged soak and Babu candidate/build refresh are outstanding.

Build identity, CLI, maintenance, packaging configuration, release-artifact validation, update notes, and previous appearance/palette/board/Omarchy checks passed. The earlier focused Appearance/Planner/shortcut run passed all 11 tests. Native platform package checks are separate from physical desktop tests.

Automatic approval review rejected the planned Apple notarization upload because the user had not explicitly authorized sending the application to Apple. Explicit approval was requested for that upload and separately for the native Mac packaged launch/Appearance/menu/Planner test run, as required by the repository's focus-interruption policy. These approvals remain pending. Finish notarization, final Mac packaging/launch checks, checksum generation, complete asset verification, and draft attachments before treating the download set as complete. Keep the release a draft until the remaining tests and soak are reviewed.
