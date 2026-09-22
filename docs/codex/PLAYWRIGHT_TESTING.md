# Isolated Electron tests

`npm run test:playwright` runs the Electron suite on a configured Linux host over SSH, inside a separate Xvfb desktop with Openbox. No Electron process starts on the calling computer. The virtual display stays separate from the host's normal desktop.

```bash
# Choose your Linux test host
export SIGNBOARD_PLAYWRIGHT_HOST=user@linux-host

# Full suite, on the configured host
npm run test:playwright

# Focused tests; normal Playwright arguments are forwarded literally
npm run test:playwright -- --grep 'Appearance|Planner'

# Discovery only: stays local and never launches Electron
npm run test:playwright -- --list

# Runner safety checks: Node only, no Electron
npm run test:playwright:runner
```

The runner builds the renderer, copies the current working tree (including uncommitted and new source files), verifies file hashes on the host, and runs one test worker. It copies a matching Linux dependency cache into the disposable run, or installs from the lockfile when needed. It does not transfer macOS `node_modules`, `.git`, `.env`, signing keys, app profiles, or board folders outside the source allowlist. API mocks and disposable boards remain the suite's fixtures. Remote test processes have a separate home, temporary directory, D-Bus session, and app profiles.

Each run prints its local results directory under `output/playwright/remote/<run-id>/`: `run.log`, `source.json` (commit, dirty state, file hashes, arguments), and retrieved `artifacts/`, including the JSON test report and available failure attachments. The remote source and results remain under `~/.local/share/signboard-lab/playwright/runs/<run-id>/` for diagnosis; disposable dependencies and profiles are removed after execution. Old completed run folders can be removed when their results are no longer needed. The dependency cache is shared only within the test lab.

Runs are serialized and supervised by a transient systemd user service with a 25-minute ceiling, lower CPU priority, and whole-process-tree cleanup. Ctrl+C/disconnection requests cancellation; systemd stops remaining children when the worker exits or reaches its deadline. Test processes have core dumps disabled to avoid expensive crash-dump work on the test host. If the host is unavailable, prerequisites are missing, or another run holds the lock, the command fails visibly. It never falls back to running Electron on the calling computer. A failed artifact download leaves the remote files available and reports their location. This source-test workflow does not replace installed release/development builds or overwrite an existing remote source tree. Follow [Testing and release validation](./TESTING.md) separately for packaged builds, benchmarks, and soaks; avoid competing workloads during measurements.

## Deliberate native checks

Electron windows and native menu/focus tests can activate the OS desktop even when `page.bringToFront()` is omitted. The former `SIGNBOARD_PLAYWRIGHT_FOREGROUND` switch never provided background isolation. Xvfb is the Linux solution recommended by [Electron](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci) and [Playwright](https://playwright.dev/docs/ci).

Linux tests do not validate macOS AppKit menus, native select tracking, Dock activation, or macOS packaging. Schedule those checks explicitly on an available Mac. **Agents must obtain explicit permission for a local foreground UI run on the user's working Mac; ordinary requests to implement or test changes are not permission to interrupt that desktop.** When such a run is authorized:

```bash
npm run test:playwright:local -- --grep 'installs native application menu actions'
```

Direct `npx playwright test` is blocked by the configuration unless the run uses the wrapper, a Linux virtual-desktop marker, or the explicit `SIGNBOARD_PLAYWRIGHT_ALLOW_LOCAL=1` opt-in. `--list` and `--help` remain safe to use without opting in. There is no background/headless promise for the local command. Do not set the local override permanently in a shell profile or use it to bypass the user's consent.

## Host setup

The calling computer needs Node, installed project dependencies, `ssh`, and `rsync`, plus key-based SSH access. Set `SIGNBOARD_PLAYWRIGHT_HOST=user@host` for your own test host; the built-in fallback targets the maintainer's local lab. The default remote root is home-relative `.local/share/signboard-lab/playwright`; override it with `SIGNBOARD_PLAYWRIGHT_REMOTE_ROOT=/path/to/test-lab` when needed. Remote paths must contain only letters, digits, underscores, dots, slashes, and hyphens, without `..` components.

The Linux host needs Node/npm, rsync, flock, an available systemd user manager, Electron's Linux runtime libraries, Xvfb/xvfb-run, xauth, xprop, Openbox, and dbus-run-session. Virtual-display programs can be installed normally or unpacked under `<test-lab>/tools/root/usr`; the runner checks both that prefix and PATH. Never substitute the user's normal `DISPLAY` when a prerequisite is missing. Private profiles use a short systemd-managed runtime directory because Chromium's Unix socket paths must stay below the OS path-length limit. The Electron test launcher passes `--ozone-platform=x11` for virtual-display runs; the private environment selects Openbox/GTK instead of inheriting the user's Wayland session or portal preferences.

A dependency cache seed must have a matching lockfile hash. Set `SIGNBOARD_PLAYWRIGHT_DEPENDENCY_SEED` in the remote user service environment to select a source tree with Linux dependencies; otherwise a lockfile-based `npm ci` populates a new cache. The cache identity includes lockfile hash, Node major version, and architecture. For launch diagnostics, set `SIGNBOARD_PLAYWRIGHT_DEBUG=1` on the calling computer to include Playwright's browser-process logs in that run.

The worker sets `SHARP_IGNORE_GLOBAL_LIBVIPS=1` when installing dependencies so Sharp uses its bundled binary rather than an unrelated system libvips build.
