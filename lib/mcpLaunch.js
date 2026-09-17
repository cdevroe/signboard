const path = require('path');

const MCP_ENTRY_RELATIVE_PATH = path.join('bin', 'signboard-mcp.js');

function buildMcpConfigTemplate({
  executablePath,
  appPath,
  allowedRoots,
  desktopUserDataDir,
  readOnly = false,
} = {}) {
  const rawExecutablePath = String(executablePath || '').trim();
  const rawAppPath = String(appPath || '').trim();

  if (!rawExecutablePath || !rawAppPath) {
    throw new Error('MCP launch config requires executablePath and appPath.');
  }

  const command = path.resolve(rawExecutablePath);
  const resolvedAppPath = path.resolve(rawAppPath);

  const env = {
    ELECTRON_RUN_AS_NODE: '1',
    SIGNBOARD_MCP_READ_ONLY: readOnly ? 'true' : 'false',
    SIGNBOARD_MCP_ALLOWED_ROOTS: String(allowedRoots || ''),
  };
  const normalizedUserDataDir = String(desktopUserDataDir || '').trim();
  if (normalizedUserDataDir) {
    env.SIGNBOARD_DESKTOP_USER_DATA_DIR = path.resolve(normalizedUserDataDir);
  }

  return {
    mcpServers: {
      signboard: {
        command,
        args: [path.join(resolvedAppPath, MCP_ENTRY_RELATIVE_PATH)],
        env,
      },
    },
  };
}

module.exports = {
  MCP_ENTRY_RELATIVE_PATH,
  buildMcpConfigTemplate,
};
