const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { sourceFingerprint, stampBuild, validateStamp } = require('./buildIdentity');
const { getBuildInfo, formatBuildInfo, buildInfoDetails } = require('../lib/buildInfo');
const { isCliInvocation } = require('../lib/cliApp');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-build-info-'));
  const source = path.join(root, 'source'); const copied = path.join(root, 'copy');
  try {
    await fs.mkdir(path.join(source, 'lib'), { recursive: true });
    await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    await fs.writeFile(path.join(source, 'lib/card.js'), 'first\n');
    assert.throws(() => validateStamp(source), /missing or stale/);
    const first = await stampBuild(source, { now: new Date('2026-09-17T14:00:00Z') });
    assert.equal(first.buildId, '20260917.1');
    assert.equal(validateStamp(source).buildId, first.buildId);
    assert.equal((await stampBuild(source)).buildId, first.buildId, 'unchanged snapshots reuse the shared stamp');
    await fs.cp(source, copied, { recursive: true });
    assert.deepEqual(validateStamp(copied), first, 'same identity in a transferred tree');
    await fs.writeFile(path.join(copied, 'lib/card.js'), 'first\r\n');
    assert.deepEqual(validateStamp(copied), first, 'Windows text line endings retain source identity');
    await fs.writeFile(path.join(source, 'notes.md'), 'Documentation does not alter runtime identity');
    assert.equal(sourceFingerprint(source).hash, first.sourceFingerprint);
    await fs.writeFile(path.join(source, 'lib/new-untracked.js'), 'new code\n');
    assert.throws(() => validateStamp(source), /missing or stale/);
    const second = await stampBuild(source, { now: new Date('2026-09-17T15:00:00Z') });
    assert.equal(second.buildId, '20260917.2');
    assert.notEqual(second.sourceFingerprint, first.sourceFingerprint);
    const release = await stampBuild(source, { channel: 'release', now: new Date('2026-09-18T01:00:00Z') });
    assert.equal(release.buildId, '20260918.1');
    assert.equal(release.version, '2.0.0');
    assert.equal(JSON.parse(await fs.readFile(path.join(source, 'package.json'))).version, '2.0.0');
    assert.equal(getBuildInfo(source).channel, 'release');
    assert.match(buildInfoDetails(getBuildInfo(source)), new RegExp(release.sourceFingerprint));
    // Linux system Node runs unpacked lib/config without an unpacked package.json.
    await fs.unlink(path.join(copied, 'package.json'));
    assert.equal(getBuildInfo(copied).buildId, first.buildId);
    await fs.mkdir(path.join(source, 'scripts'));
    await fs.writeFile(path.join(source, 'scripts/buildIdentity.js'), `module.exports = require(${JSON.stringify(__dirname + '/buildIdentity.js')});`);
    const latest = await stampBuild(source);
    assert.equal(getBuildInfo(source).buildId, latest.buildId);
    await fs.writeFile(path.join(source, 'lib/card.js'), 'changed without stamping\n');
    assert.equal(getBuildInfo(source).buildId, null);
    assert.match(formatBuildInfo(getBuildInfo(source)), /Unstamped source build/);
    assert.equal(isCliInvocation(['--version']), true);
    assert.equal(isCliInvocation(['-v']), true);
    const cli = path.resolve(__dirname, '../bin/signboard.js');
    const json = JSON.parse(execFileSync(process.execPath, [cli, '--version', '--json'], { encoding: 'utf8' }));
    assert.equal(json.version, require('../package.json').version);
    const text = execFileSync(process.execPath, [cli, '-v'], { encoding: 'utf8' });
    assert.equal(text.trim(), formatBuildInfo(json));
    assert(!text.includes('\x1b'));
    console.log('Build identity: shared stamps, dirty/untracked content, stale rejection, Linux unpacked runtime, and CLI reporting passed.');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
