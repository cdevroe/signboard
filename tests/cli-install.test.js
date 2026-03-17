import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  CLI_WRAPPER_MARKER,
  PROFILE_BLOCK_START,
  installCliForCurrentUser,
} = require('../lib/cliInstall');

async function readFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

describe('cliInstall', () => {
  describe('zsh install', () => {
    let homeDir;

    beforeAll(async () => {
      homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-install-zsh-'));
    });

    afterAll(async () => {
      await fs.rm(homeDir, { recursive: true, force: true });
    });

    it('should install CLI wrapper and update zprofile', async () => {
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

      expect(result.scriptPath).toBe(scriptPath);
      expect(script).toContain(CLI_WRAPPER_MARKER);
      expect(script).toContain('/Applications/Signboard.app/Contents/MacOS/Signboard');
      expect(profile).toContain(PROFILE_BLOCK_START);
      expect(profile).toContain('export PATH="$HOME/.local/bin:$PATH"');

      const secondResult = await installCliForCurrentUser({
        executablePath: '/Applications/Signboard.app/Contents/MacOS/Signboard',
        appPath: '/Applications/Signboard.app/Contents/Resources/app.asar',
        isPackaged: true,
        platform: 'darwin',
        shellPath: '/bin/zsh',
        homeDir,
      });
      const secondProfile = await readFile(profilePath);

      expect(
        secondResult.updatedProfiles.includes(profilePath) ||
        secondResult.untouchedProfiles.includes(profilePath)
      ).toBeTruthy();
      expect(secondProfile.match(/Signboard CLI/g).length).toBe(2);
    });
  });

  describe('fish install', () => {
    let homeDir;

    beforeAll(async () => {
      homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-install-fish-'));
    });

    afterAll(async () => {
      await fs.rm(homeDir, { recursive: true, force: true });
    });

    it('should install CLI wrapper and update fish config', async () => {
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

      expect(profile).toContain('fish_add_path "$HOME/.local/bin"');
    });
  });
});
