# Signboard 1.7.3 implementation and validation

Status: implementation prepared on `codex/release-1.7.3`, based on public `1.7.2` (`255427f3dc38399a8f9a23e2217ade357a1bccef`). Public release publication is not part of this implementation checkpoint. The active `beta/2.0.0` checkout and its uncommitted multi-window work remain untouched.

## Included work

Both community PRs were cherry-picked with original authorship preserved: #55 (`d5d199f`) and #56 (`1e002e4`). The latter gained pointer-cancellation, lost-button, blur, outside-release, no-overflow, and ignored-input coverage. The wrapping test now includes wide unbroken preview text.

The approved maintenance scope is implemented: bounded shared reads and partial-read warnings; exact CLI filename lookup and one-pass task parsing; canonical MCP path checks; consistent MCP destination metadata and strict dates; existing POSIX permission-bit preservation; standalone MCP launch; numbering beyond 999; rollback-aware list/board metadata reconciliation; and deep-link startup/window lifecycle fixes. There are no 2.0 product features or dependency upgrades in this branch.

Closing the last window already quits 1.7.x. Coverage therefore tests a subsequent cold-start link, alongside hidden/minimized-window and closed trusted-board scenarios. It does not change that quit behavior.

## Completed checks

- 32 Node suites passed. The per-suite result is in `1.7.3-validation/node-suites.json`.
- All 88 Electron desktop regressions passed in 2.3 minutes, including panning/drag interactions, wrapping, partial-read warnings/recovery, and deep links.
- The maintenance suite passed with both hard and soft file-descriptor limits set to 256.
- Final focused maintenance/MCP regressions passed after preserving the legacy Archive move activity behavior and extending symlink-write/metadata coverage.
- Final macOS arm64 unpacked build passed packaged desktop, CLI help, generated MCP configuration, and MCP initialization tests. This is an ad-hoc signed, unnotarized candidate, not a distribution-ready signed universal artifact.
- Babu's Linux x64 unpacked candidate passed the desktop packaged launch test and an 18-second, one-cycle desktop/CLI synchronization smoke. The first launch attempt lacked DISPLAY and failed before app startup; setting the existing `DISPLAY=:0` resolved that environment issue.
- `git diff --check` passed.

Local dependencies were installed from the lockfile with `npm ci`. The Electron installer did not finish downloading a runtime, so the already installed matching Electron 40.10.1 runtime was reused. Babu's final unpacked candidate used its own clean locked dependency tree (`npm ci --ignore-scripts`) and the matching existing Linux Electron runtime. The first remote build using a symlinked dependency tree is not a validated artifact.

## Babu measurements

Babu is a MacBookPro8,1 running Arch/Omarchy, kernel 7.2.3-arch1-3, Node 26.8.1. Source helper measurements ran sequentially before the soak. Baseline is the public 1.7.2 source; candidate is the isolated maintenance source. Fixtures contain 100, 1,000, or 5,000 cards across five lists, each with notes, one incomplete dated task, one completed dated task, and a fixture label. Raw samples include fixture hashes, a separate first sample, and five subsequent samples. First does not mean cold disk.

| Cards | Snapshot 1.7.2 median | Snapshot candidate median | Exact lookup 1.7.2 median | Exact lookup candidate median | Exact lookup reads before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | 37.90 ms | 38.92 ms | 24.47 ms | 11.87 ms | 22 → 3 |
| 1,000 | 205.87 ms | 202.45 ms | 80.56 ms | 11.94 ms | 202 → 3 |
| 5,000 | 865.21 ms | 797.78 ms | 271.32 ms | 13.43 ms | 1,002 → 3 |

These measure source helper work, not full CLI startup or desktop responsiveness. Every measured operation returned without read errors. Snapshot gains are modest and workload dependent; bounded reads primarily correct reliability under descriptor pressure. Timing ranges, raw samples, and environment data are retained in `1.7.3-validation/`. Thermal/load conditions were not captured comprehensively, so do not treat these results as a complete desktop performance certification.

## Long soak and remaining release gates

A bounded two-hour desktop/CLI soak is running as the transient Babu user unit `signboard-173-soak-20260917.service`, with a 7,500-second runtime limit and 2 GiB memory limit. It uses only disposable boards and profiles under `/home/cdevroe/.local/share/signboard-lab/review-1.7.3-20260917/soak-long`. It exercises create/edit/move/archive, board switching, unchanged-editor refresh, and content counts while recording summed process-tree RSS, lifetime-average CPU, descriptors, and the system file table once per cycle. No TUI exists in 1.7.x.

**The two-hour soak result is pending; it is not a passed check.** Its packaged artifact is `build-clean/linux-unpacked/signboard`. It precedes the final MCP Archive activity correction; after this run, rebuild the final Linux source and rerun its packaged desktop/CLI/MCP gate. Do not build or benchmark concurrently with the soak. Read `soak-long/result.json` and retain observations before reporting completion. The current harness does not certify local-midnight rollover or an idle settling period, and dirty-editor protection remains covered by desktop regressions rather than this soak.

Before publishing: review the final soak; verify final Linux packaged entrypoints; build/sign/notarize the normal macOS universal release and test its launch/update path; build Windows plus both Linux architectures and the standard AppImage/deb/pacman matrix; run `npm run release:verify`; add verified download links to `docs/release-notes-1.7.3.md`. No GitHub release, tag, merge, or public comment was made here.

Bring applicable shared fixes forward to 2.0 after coordinating with the active multi-window changes. The current 2.0 working tree was deliberately not rewritten by this release branch.
