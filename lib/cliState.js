const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const CLI_STATE_FILE_NAME = 'cli-state.json';

function getCliConfigDir({
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
} = {}) {
  const overrideDir = String(env.SIGNBOARD_CLI_CONFIG_DIR || '').trim();
  if (overrideDir) {
    return path.resolve(overrideDir);
  }

  if (platform === 'win32') {
    const appDataDir = String(env.APPDATA || '').trim();
    if (appDataDir) {
      return path.join(appDataDir, 'Signboard');
    }
  }

  const xdgConfigHome = String(env.XDG_CONFIG_HOME || '').trim();
  if (xdgConfigHome) {
    return path.join(path.resolve(xdgConfigHome), 'signboard');
  }

  return path.join(path.resolve(homeDir), '.config', 'signboard');
}

function getCliStatePath(options = {}) {
  return path.join(getCliConfigDir(options), CLI_STATE_FILE_NAME);
}

async function readCliState(options = {}) {
  const statePath = getCliStatePath(options);

  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeCliState(state, options = {}) {
  const statePath = getCliStatePath(options);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
  return statePath;
}

async function ensureDirectoryExists(directoryPath, label) {
  let stats;

  try {
    stats = await fs.stat(directoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${directoryPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directoryPath}`);
  }
}

async function setCurrentBoard(boardRoot, options = {}) {
  const resolvedBoardRoot = path.resolve(String(boardRoot || '').trim());
  if (!resolvedBoardRoot || resolvedBoardRoot === path.sep) {
    throw new Error('Board path is required.');
  }

  await ensureDirectoryExists(resolvedBoardRoot, 'Board root');

  const currentState = await readCliState(options);
  const nextState = {
    ...currentState,
    currentBoard: resolvedBoardRoot,
  };
  const statePath = await writeCliState(nextState, options);

  return {
    currentBoard: resolvedBoardRoot,
    statePath,
  };
}

async function getCurrentBoard(options = {}) {
  const state = await readCliState(options);
  const currentBoard = String(state.currentBoard || '').trim();
  if (!currentBoard) {
    return '';
  }

  return path.resolve(currentBoard);
}

module.exports = {
  CLI_STATE_FILE_NAME,
  getCliConfigDir,
  getCliStatePath,
  readCliState,
  writeCliState,
  setCurrentBoard,
  getCurrentBoard,
};
