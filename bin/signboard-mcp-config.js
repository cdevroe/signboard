#!/usr/bin/env node

const os = require('os');
const path = require('path');
const {
  getDefaultDesktopUserDataDir,
  readDesktopTrustedBoardRoots,
} = require('../lib/boardDiscovery');
const { buildMcpConfigTemplate } = require('../lib/mcpLaunch');

async function printMcpConfig() {
  const appPath = path.resolve(__dirname, '..');
  const desktopUserDataDir = getDefaultDesktopUserDataDir();
  const trustedBoardRoots = await readDesktopTrustedBoardRoots({ userDataDir: desktopUserDataDir });
  const defaultAllowedRoot = trustedBoardRoots.length > 0
    ? trustedBoardRoots.join(path.delimiter)
    : path.join(os.homedir(), 'Documents', 'Boards');
  const config = buildMcpConfigTemplate({
    executablePath: process.execPath,
    appPath,
    allowedRoots: defaultAllowedRoot,
    desktopUserDataDir,
    readOnly: false,
  });

  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}

if (require.main === module) {
  printMcpConfig().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  printMcpConfig,
};
