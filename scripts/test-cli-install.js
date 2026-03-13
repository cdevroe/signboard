const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  CLI_WRAPPER_MARKER,
  PROFILE_BLOCK_START,
  installCliForCurrentUser,
} = require('../lib/cliInstall');

async function readFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function testZshInstall() {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-install-zsh-'));
  const result = await installCliForCurrentUser({
    executablePath: '/Applications/Signboard.app/Contents/MacOS/Signboard',
    appPath: '/Applications/Signboard.app/Contents/Resources/app.asar',
    isPackaged: true,
    platform: 'darwin',
    shellPath: '/bin/zsh',
    homeDir,
  });

  const scriptPath = path.join(homeDir, '.local', 'bin', 'signboard');
  const profilePath = path.join(homeDir, '.zprofile');
  const script = await readFile(scriptPath);
  const profile = await readFile(profilePath);

  assert.strictEqual(result.scriptPath, scriptPath);
  assert.ok(script.includes(CLI_WRAPPER_MARKER));
  assert.ok(script.includes("/Applications/Signboard.app/Contents/MacOS/Signboard"));
  assert.ok(profile.includes(PROFILE_BLOCK_START));
  assert.ok(profile.includes('export PATH="$HOME/.local/bin:$PATH"'));

  const secondResult = await installCliForCurrentUser({
    executablePath: '/Applications/Signboard.app/Contents/MacOS/Signboard',
    appPath: '/Applications/Signboard.app/Contents/Resources/app.asar',
    isPackaged: true,
    platform: 'darwin',
    shellPath: '/bin/zsh',
    homeDir,
  });
  const secondProfile = await readFile(profilePath);

  assert.ok(
    secondResult.updatedProfiles.includes(profilePath) ||
    secondResult.untouchedProfiles.includes(profilePath)
  );
  assert.strictEqual(secondProfile.match(/Signboard CLI/g).length, 2);
}

async function testFishInstall() {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-install-fish-'));
  await installCliForCurrentUser({
    executablePath: '/opt/Signboard/Signboard',
    appPath: '/opt/Signboard/resources/app.asar',
    isPackaged: true,
    platform: 'linux',
    shellPath: '/usr/bin/fish',
    homeDir,
  });

  const profilePath = path.join(homeDir, '.config', 'fish', 'config.fish');
  const profile = await readFile(profilePath);

  assert.ok(profile.includes('fish_add_path "$HOME/.local/bin"'));
}

async function main() {
  await testZshInstall();
  await testFishInstall();
  console.log('CLI install tests passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
