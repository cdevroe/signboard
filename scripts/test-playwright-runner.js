const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { stageSource, remoteSettings, quote } = require('./run-playwright');
const { assertPlaywrightLaunchAllowed } = require('./playwright-safety');

for (const platform of ['darwin', 'win32', 'linux']) {
  assert.throws(() => assertPlaywrightLaunchAllowed({ platform, env: {}, args: ['test'] }), /can take over/);
  assert.doesNotThrow(() => assertPlaywrightLaunchAllowed({ platform, env: {}, args: ['test', '--list'] }));
  assert.doesNotThrow(() => assertPlaywrightLaunchAllowed({ platform, env: { SIGNBOARD_PLAYWRIGHT_ALLOW_LOCAL: '1' }, args: [] }));
  assert.throws(() => assertPlaywrightLaunchAllowed({ platform, env: { SIGNBOARD_PLAYWRIGHT_FOREGROUND: '1' }, args: [] }));
  assert.throws(() => assertPlaywrightLaunchAllowed({ platform, env: {}, args: ['--list', '--ui'] }));
}
assert.throws(() => assertPlaywrightLaunchAllowed({ platform: 'darwin', env: { SIGNBOARD_PLAYWRIGHT_VIRTUAL_DESKTOP: '1' }, args: [] }));
assert.doesNotThrow(() => assertPlaywrightLaunchAllowed({ platform: 'linux', env: { SIGNBOARD_PLAYWRIGHT_VIRTUAL_DESKTOP: '1' }, args: [] }));

const env = { ...process.env };
delete env.SIGNBOARD_PLAYWRIGHT_ALLOW_LOCAL;
delete env.SIGNBOARD_PLAYWRIGHT_VIRTUAL_DESKTOP;
const blockedConfig = spawnSync(process.execPath, ['-e', "require('./playwright.config')"], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
assert.equal(blockedConfig.status, 1);
assert.match(blockedConfig.stderr, /can take over your desktop/);

assert.equal(remoteSettings({}).host, 'cdevroe@babu.local');
assert.throws(() => remoteSettings({ SIGNBOARD_PLAYWRIGHT_HOST: '-oProxyCommand=bad' }));
assert.throws(() => remoteSettings({ SIGNBOARD_PLAYWRIGHT_REMOTE_ROOT: '../user-board' }));
const literal = "a ' quote; $(never-run) `never-run`\n--argument";
assert.equal(spawnSync('sh', ['-c', `printf %s ${quote(literal)}`], { encoding: 'utf8' }).stdout, literal);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'signboard-runner-test-'));
try {
  const root = path.join(temporary, 'root');
  const stage = path.join(temporary, 'stage');
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'boards'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app/new-uncommitted.js'), 'source-v1');
  fs.writeFileSync(path.join(root, 'app/.env'), 'secret');
  fs.writeFileSync(path.join(root, 'app/signing.p12'), 'secret');
  fs.writeFileSync(path.join(root, '.env'), 'secret');
  fs.writeFileSync(path.join(root, 'boards/personal.md'), 'personal');
  const first = stageSource(root, stage);
  assert.deepEqual(first.files.map((file) => file.path), ['app/new-uncommitted.js']);
  fs.writeFileSync(path.join(root, 'app/new-uncommitted.js'), 'source-v2');
  const second = stageSource(root, stage);
  assert.notEqual(first.sha256, second.sha256);
  assert.equal(fs.readFileSync(path.join(stage, 'app/new-uncommitted.js'), 'utf8'), 'source-v2');
  fs.symlinkSync(path.join(root, 'boards'), path.join(root, 'app/linked-board'));
  assert.throws(() => stageSource(root, stage), /source symlink/);

  // Exercise the real entry point with a failed transport, without network/GUI.
  const fakeBin = path.join(temporary, 'bin');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, 'ssh'), '#!/bin/sh\nexit 23\n', { mode: 0o755 });
  const unavailable = spawnSync(process.execPath, [path.join(__dirname, 'run-playwright.js'), '--grep', 'transport-test'], {
    env: { ...env, PATH: `${fakeBin}${path.delimiter}${env.PATH}`, SIGNBOARD_PLAYWRIGHT_HOST: 'unavailable.invalid' },
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /Remote host unavailable\. No local Electron test was started/);
  assert.doesNotMatch(unavailable.stdout, /Local Electron run/);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log('Playwright runner safety, literal arguments, and isolated working-tree snapshot checks passed.');
