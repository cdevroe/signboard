#!/usr/bin/env node

const packageJson = require('../package.json');
const {
  readDesktopOpenBoardsState,
  readDesktopTrustedBoardRoots,
} = require('../lib/boardDiscovery');
const { startSignboardMcpServer } = require('../lib/mcpServer');

async function runMcpServer() {
  const [trustedBoardRoots, desktopOpenBoardsState] = await Promise.all([
    readDesktopTrustedBoardRoots(),
    readDesktopOpenBoardsState(),
  ]);

  await startSignboardMcpServer({
    appVersion: packageJson.version,
    trustedBoardRoots,
    desktopOpenBoardsState,
  });
}

if (require.main === module) {
  runMcpServer().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  runMcpServer,
};
