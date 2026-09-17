# Signboard 1.7.3 GitHub draft preparation

The requested release draft is [Signboard 1.7.3](https://github.com/cdevroe/signboard/releases). It remains unpublished. The maintenance branch is `codex/release-1.7.3`; the active 2.0 working tree was not changed.

## Build provenance and checks

Application changes are in `36868b7aaaf88f429c804ca5914c971616b17166`. Later commits add CI packaging checks and release documentation; they do not change packaged runtime source.

- **macOS universal:** signed with the existing Developer ID identity and notarized by Apple. `codesign --verify --deep --strict`, Gatekeeper assessment (`Notarized Developer ID`), and stapled-ticket validation passed. The app contains both x86_64 and arm64 slices. The packaged desktop/CLI/MCP launch gate passed on the Apple Silicon host after signing and notarization. ZIP integrity and DMG checksums passed. One hundred tracked packaged source files plus the generated renderer matched the local maintenance source. No Intel Mac runtime test is claimed.
- **Windows:** combined x64/ARM64 NSIS installer built on a native Windows runner, from `4a84b9ebffe38d4f16e3ea1f972f3e992a3df37d`. The packaged desktop/CLI/MCP launch gate passed on the x64 runner. [Build and test run](https://github.com/cdevroe/signboard/actions/runs/35173912703). The local cross-build could not run its cached Wine binary on this Mac; the attached files come from the successful native runner. No Windows ARM64 runtime test is claimed.
- **Linux:** AppImage, deb, and pacman packages built on native x64 and ARM64 runners from `37028366f38addaa953c9f149398dfa8bd30dce7`. Both passed packaged desktop/CLI/MCP launch checks under Xvfb. [Build and test run](https://github.com/cdevroe/signboard/actions/runs/35174092942). These replace the earlier unpacked candidate as the final-source packaged entrypoint evidence.

`npm run release:verify` passed for the complete set, including package structure, minimum sizes, metadata versions, file sizes, and SHA-512 integrity. Per-file SHA-256 hashes and sizes are retained in [release-assets.json](1.7.3-validation/release-assets.json).

The release includes the nine standard distribution artifacts, three differential-update blockmaps, four updater metadata files, and `SHA256SUMS`. The normal download list shows the universal Mac DMG, combined Windows installer, and both Linux architectures; the Mac ZIP remains attached for updater use.

## Remaining pre-publication validation

Babu's two-hour disposable-board soak is still running as `signboard-173-soak-20260917.service`. At approximately 27 minutes it had completed 26 create/edit/move/archive and editor-refresh cycles without an assertion failure; this is not a completed soak result. Read `soak-long/result.json` and review its observations before publishing. The soak artifact precedes the final MCP Archive activity correction; that correction has focused regression coverage, and final-source packaged checks now pass on the native build runners.

The draft does not certify a full installed upgrade from 1.7.2 on every platform or physical desktop integration on every architecture. The legacy app ID and signing identity remain intact. Keep the release unpublished until the remaining release checks have been reviewed.
