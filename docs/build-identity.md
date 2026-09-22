# Build identity

The release version is `1.7.4`; build identity is separate from updater versions. Each prepared source snapshot gets a separate build such as `20260917.1`, using the UTC date and the next sequence after the previous stamp for that date. The Mac and Linux packages reuse the same stamp. Treat the build ID plus source fingerprint as the identity; different branches/checkouts can otherwise independently allocate the same daily sequence.

## Prepare once, build on every platform

1. Finish source changes and run `npm run build:stamp`. This regenerates the renderer and writes `config/build-info.json` atomically. It reuses the existing stamp when source, release version, and channel have not changed. `npm run build:stamp -- --new` deliberately allocates another build of the same source.
2. Commit or transfer the entire snapshot **including `config/build-info.json`**. The stamp is part of source control; it contains no credentials or machine identifiers. Preserve the generated renderer or regenerate it with `./buildjs.sh` on the destination.
3. Run `npm run build:check` and the normal `dist:*` command (or direct `electron-builder`). The `beforePack` hook rejects a missing or stale identity on every target. Do not stamp separately on the other computer merely to bypass a mismatch: compare the source trees first.
4. For a public release, prepare the shared snapshot with `npm run build:stamp -- --channel release` before platform builds. Commit the stamp alongside the release sources and copy it unchanged to all builders. The stored Git commit is the checkout context at stamping time; the fingerprint identifies the actual content, including uncommitted changes. Metadata-only commits do not change that fingerprint.

The fingerprint includes relative filenames and contents under app/bin/config/lib/shared/static/build/scripts plus package/lockfile, main/preload/index, the renderer build script, and packaging configuration. It includes new files even before `git add`. It excludes the stamp itself, transient lock files, source maps, `.DS_Store`, documentation, Git internals, dependencies, build output, `.env`, certificates, and user data. Known text formats normalize CRLF to LF for cross-platform checkouts. Binaries are hashed byte-for-byte. Build timestamps and absolute paths are not fingerprint inputs.

About shows the build, UTC date, and short fingerprint with a Copy Build Details button. The copy includes the full fingerprint and Git context. `signboard --version` / `-v` returns one plain-text line; `--version --json` includes version, buildId, channel, builtAt, sourceFingerprint, commit, and dirty. The 1.7.x maintenance series has no TUI. An unstamped or edited source checkout says “Unstamped source build”; runtime surfaces never allocate build numbers.

This is informational metadata. Native package versions, `app.getVersion()`, updater comparisons, artifact naming, and MCP protocol version fields continue to use the release version. It is not an installation identifier or telemetry.
