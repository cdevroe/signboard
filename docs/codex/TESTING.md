# Testing and release validation

Use disposable boards and isolated app/CLI profiles. Keep test installations separate from the user's release installation, and preserve any previous working development build until its replacement passes validation. Machine access and administration instructions belong in ignored `.local/codex/` files; consult them when present before using that test host.

## Choose relevant checks

- Run the focused Node tests for the code changed. For maintenance work, include `npm run test:maintenance`.
- Run `npm run test:playwright` on a configured Linux host's private Xvfb desktop for Electron behavior. See [Electron test setup](./PLAYWRIGHT_TESTING.md). Do not substitute a user's working desktop when the remote host is unavailable.
- Test native macOS behavior and packaging on a Mac when the change affects those paths. A local foreground UI run requires explicit permission for that run.
- After source changes, use a current [build identity](../build-identity.md) and the canonical `electron-builder.json` configuration. Packaged checks must validate the app, CLI, and MCP entrypoints before release. Test development-only surfaces when that branch provides them; Signboard 1.7.x has no TUI.
- After meaningful development checkpoints, refresh and smoke-test the separate development package. After publication, refresh the test host's public-release baseline. Documentation-only changes do not need a rebuild.

If the target host is unavailable, continue useful local work and identify the outstanding validation. Do not substitute timings from different hardware or claim a package was tested when only its source checkout was tested.

## Performance measurements

For startup, rendering, search, board management, storage, or interactive-terminal changes, compare the current work with a known baseline on the same hardware and supported fixture data. Use pristine synthetic boards of 100, 1,000, and 5,000 cards across five lists; reset copies before mutating samples.

Measure usable-board startup, board switching, search, card open/save/move, and reordering separately. Report first launch separately from at least five warm samples, with raw timings and median/range. Empty-window readiness and a whole benchmark session's duration are not usable-board startup measurements. Do not drop global caches or run competing builds/soaks during measurement.

Record the source fingerprint, build, lockfile, runtime versions, environment, load, and memory pressure locally. Track process-tree memory, CPU, open descriptors, and system file-table trends with a consistent method; summed RSS can count shared pages more than once. Investigate repeatable regressions rather than declaring a threshold from one noisy sample.

## Longer reliability checks

For watchers, editor autosave, file mutations, date rollover, and release candidates, run a short smoke followed by a bounded 2–6-hour session when the target host is available. Use the packaged candidate and disposable data, exercising card creation, edits, moves, archives, repeated board switching, and supported automation surfaces.

Verify final content and order, external refresh, and protection of an actively edited card. Sample resources at a modest interval such as once a minute, and check whether growth settles after work stops. Include an actual local-midnight transition when relevant; report whether it occurred. Do not change system time or induce suspend to manufacture that observation.

Bound logs and duration, stop on sustained growth or unresponsiveness, and clean up only test-owned processes. Report actual duration, operation counts, failures, integrity checks, and trends. Keep full reports and raw samples in ignored local directories; a PR can summarize relevant validation. This procedure does not authorize a scheduler, publication, or machine configuration changes.
