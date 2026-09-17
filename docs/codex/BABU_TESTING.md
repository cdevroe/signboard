# Babu: older-hardware Signboard validation

User decision (2026-09-09): make performance and long-running reliability on Babu part of normal Signboard development. Keep the latest public release and the current development build available side by side, including unreleased TUI work.

## When to use Babu

- After meaningful development/testing checkpoints, refresh and smoke-test the development build. After a public release, refresh the release baseline. A documentation-only change does not require a rebuild.
- For startup, rendering, board management, search, storage, or TUI performance changes, capture comparable before/after measurements on Babu before claiming a performance improvement.
- For watchers, editor autosave, filesystem mutations, lifecycle/date rollover, or release candidates, include a bounded longer session with desktop/TUI/CLI working on disposable data. Run a short smoke first; a two-second idle sample is not a soak test.
- If Babu is unavailable, continue useful local work and explicitly report target validation/build freshness as outstanding. Do not claim it was tested, silently substitute Mac timings, or block unrelated work.

## Access and administration

SSH: `ssh cdevroe@babu.local`. Machine administration rules and the detailed operating procedure live in:

- `/Users/cdevroe/Sites/projects/Omarchy-Admin/AGENTS.md`
- `/Users/cdevroe/Sites/projects/Omarchy-Admin/docs/signboard-lab.md`

Read those before remote changes. Preserve SSH, loopback-only WayVNC, the fixed `VNC-1` output, and the enabled `LVDS-1` recovery display. Prefer the stable hostname, not a historical IP. Keep the laptop plugged in with its lid open. Do not change sleep/display/network policy or reboot it for benchmarks.

## Channels and isolation

- `signboard-release` / **Signboard Release**: existing public AppImage installation and normal release profile.
- `signboard-dev` / **Signboard Development**: independent unpacked development desktop.
- `signboard-dev-cli` / **Signboard Development TUI**: development CLI; use `signboard-dev-cli tui` for the TUI. The `signboard-dev tui` shorthand delegates to this launcher before starting Electron, avoiding desktop Chromium startup diagnostics in the terminal.
- Lab artifacts, profiles, disposable boards, and reports: `/home/cdevroe/.local/share/signboard-lab/`.
- Current development artifact: `development-current` symlink inside that lab root. Build each refresh into a new `builds/` directory and promote only after validation; preserve the previous working artifact.
- Remote source staging: `/home/cdevroe/src/signboard-codex-test` (a transferred tree, not a Git checkout). Verify source hashes against the Mac revision/working tree instead of trusting the package version. Preserve remote edits during refresh.

Never install a development package over the release. Do not change the production app ID to achieve separation. Development launchers set `SIGNBOARD_USER_DATA_DIR`, `SIGNBOARD_DESKTOP_USER_DATA_DIR`, and `SIGNBOARD_CLI_CONFIG_DIR` to their own profiles. Do not copy credentials, license data, or real boards into the lab. Use separate profiles and board copies for benchmark runs on both channels; the normal Release launcher is for manual use, not an isolated benchmark profile.

Before promotion, regenerate the renderer bundle and build the Linux x64 unpacked artifact with `--publish never`; run the existing packaged app/TUI launch check, relevant focused tests, and an interactive TUI smoke. Record version, commit/dirty state or source manifest, lockfile hash, runtime versions, artifact path, and validation outcome. Label unavailable release features (currently the TUI) as unavailable rather than comparing against a fabricated release implementation. This workflow does not authorize publishing releases.

## Measurement contract

Use synthetic fixtures of 100, 1,000, and 5,000 cards across five lists. Preserve pristine fixture copies and hashes; reset copies for mutating samples. Record notes/tasks/labels/date distribution and measurement date/timezone. Use identical supported data and conditions for release/development comparisons.

Measure desktop launch-to-usable-board, board switching, search, card open/save/move, list reorder, and supported view changes. Separately measure TUI first usable frame, navigation/edit latency, and plain rendering. Do not label empty-window readiness or whole-session duration as usable-board startup.

Report first launch separately, followed by at least five warm samples with raw values, median/range, and errors. First launch is not proof of a cold disk. Never drop global caches. Run one timed workload at a time; no concurrent builds or soak loads. Record kernel/Omarchy, Node/Electron, display/VNC state, load, memory/swap pressure, and thermal conditions when available. Application timing and VNC-visible latency are different measurements.

Track process-tree RSS, CPU, open descriptors, and system file-table trend. Summed RSS can double-count shared pages; retain a consistent method. Investigate repeatable regressions against the public release and previous development baseline, rather than setting pass/fail thresholds from one noisy run.

The existing `npm run benchmark:tui` is the starting tool. `--cards` is per list: use `--lists 5 --cards 20`, `200`, or `1000` for the three fixture sizes. Generate only into fresh disposable directories. CLI and plain-TUI `elapsedMs` measure complete command duration. Interactive `elapsedMs` includes the harness's deliberate wait before quit; it is not startup time. Its frequent `/proc` sampling adds overhead, and its two-second idle CPU window does not establish long-term stability.

## Soak contract

Use a bounded 2–6-hour session for relevant work when Babu is available, sharing a disposable development board between desktop, TUI, and periodic CLI operations. Exercise create/edit/move/archive and repeated board switching. Verify final content/order and refresh behavior, including protection of an active editor. Sample memory, CPU, descriptors, and system file-table use at a modest interval such as one minute, and check whether growth settles after work stops.

Include real local-midnight rollover when relevant; record whether it actually occurred. Never change system time or induce suspend for this check. Bound logs and duration, stop on sustained resource growth or unresponsiveness, and clean up only test-owned processes. Report actual duration, operation counts, errors, integrity checks, and trends. No daily scheduler or unattended mutation service is installed merely by adopting this policy.

## Initial inventory

On 2026-09-09 the existing public AppImage was verified as 1.7.2 against GitHub's SHA-256. The remote 2.0.0 source matched 189 source/build files from Mac commit `abf213cc36870ec441725e1626214eefcab25d59`; the old packaged output was stale, prompting a separate fresh build. Consult the Omarchy Admin dated setup report for completed verification. Treat these versions as historical observations, not hardcoded future targets.
