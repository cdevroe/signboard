const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const TRUSTED_BOARD_ROOTS_FILE = 'trusted-board-roots.json';
const OPEN_BOARDS_STATE_FILE = 'open-boards.json';
const DEFAULT_BOARD_SCAN_DEPTH = 2;
const DEFAULT_BOARD_SCAN_LIMIT = 100;
const MAX_BOARD_SCAN_DEPTH = 8;
const MAX_BOARD_SCAN_LIMIT = 500;
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.svn', '.hg', 'node_modules']);

const boardSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function normalizeAbsolutePath(rawPath) {
  const input = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!input) {
    return '';
  }

  const resolved = path.resolve(input);
  return path.isAbsolute(resolved) ? resolved : '';
}

function normalizePathList(paths) {
  const seen = new Set();
  const normalizedPaths = [];

  for (const rawPath of Array.isArray(paths) ? paths : []) {
    const normalizedPath = normalizeAbsolutePath(rawPath);
    if (!normalizedPath || seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    normalizedPaths.push(normalizedPath);
  }

  return normalizedPaths;
}

function isPathInside(parentPath, childPath) {
  const normalizedParent = normalizeAbsolutePath(parentPath);
  const normalizedChild = normalizeAbsolutePath(childPath);
  if (!normalizedParent || !normalizedChild) {
    return false;
  }

  const relativePath = path.relative(normalizedParent, normalizedChild);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isPathInsideAnyRoot(rootPaths, childPath) {
  return normalizePathList(rootPaths).some((rootPath) => isPathInside(rootPath, childPath));
}

function normalizeInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

async function pathExistsAsDirectory(directoryPath) {
  try {
    const stats = await fs.stat(directoryPath);
    return stats.isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function pathLooksLikeSignboardBoardRoot(directoryPath) {
  const boardRoot = normalizeAbsolutePath(directoryPath);
  if (!boardRoot) {
    return false;
  }

  if (!await pathExistsAsDirectory(boardRoot)) {
    return false;
  }

  let entries = [];
  try {
    entries = await fs.readdir(boardRoot, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => {
    if (entry.isFile() && entry.name === 'board-settings.md') {
      return true;
    }

    if (!entry.isDirectory()) {
      return false;
    }

    return entry.name === 'XXX-Archive' || /^\d{3}-/.test(entry.name);
  });
}

function normalizeOpenBoardsState(rawState = {}) {
  const openBoardRoots = normalizePathList(
    rawState.openBoardRoots || rawState.openBoardPaths || rawState.boards || []
  );
  const activeBoardRoot = normalizeAbsolutePath(rawState.activeBoardRoot || rawState.activeBoardPath || '');

  return {
    openBoardRoots,
    activeBoardRoot,
  };
}

function getDefaultDesktopUserDataDir({
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
  userDataDir = '',
} = {}) {
  const explicitUserDataDir = normalizeAbsolutePath(userDataDir);
  if (explicitUserDataDir) {
    return explicitUserDataDir;
  }

  const envUserDataDir = normalizeAbsolutePath(env.SIGNBOARD_DESKTOP_USER_DATA_DIR || '');
  if (envUserDataDir) {
    return envUserDataDir;
  }

  const resolvedHomeDir = normalizeAbsolutePath(homeDir);
  if (platform === 'win32') {
    const appDataDir = normalizeAbsolutePath(env.APPDATA || '');
    if (appDataDir) {
      return path.join(appDataDir, 'Signboard');
    }
  }

  if (platform === 'darwin') {
    return resolvedHomeDir
      ? path.join(resolvedHomeDir, 'Library', 'Application Support', 'Signboard')
      : '';
  }

  const xdgConfigHome = normalizeAbsolutePath(env.XDG_CONFIG_HOME || '');
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, 'Signboard');
  }

  return resolvedHomeDir ? path.join(resolvedHomeDir, '.config', 'Signboard') : '';
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if ((error && error.code === 'ENOENT') || error instanceof SyntaxError) {
      return fallbackValue;
    }
    throw error;
  }
}

async function readDesktopTrustedBoardRoots(options = {}) {
  const userDataDir = getDefaultDesktopUserDataDir(options);
  if (!userDataDir) {
    return [];
  }

  const parsed = await readJsonFile(path.join(userDataDir, TRUSTED_BOARD_ROOTS_FILE), []);
  return normalizePathList(Array.isArray(parsed) ? parsed : []);
}

async function readDesktopOpenBoardsState(options = {}) {
  const userDataDir = getDefaultDesktopUserDataDir(options);
  if (!userDataDir) {
    return normalizeOpenBoardsState();
  }

  const parsed = await readJsonFile(path.join(userDataDir, OPEN_BOARDS_STATE_FILE), {});
  return normalizeOpenBoardsState(parsed && typeof parsed === 'object' ? parsed : {});
}

function addBoardCandidate(candidateMap, rawBoardRoot, source, orderHint) {
  const boardRoot = normalizeAbsolutePath(rawBoardRoot);
  if (!boardRoot) {
    return null;
  }

  let candidate = candidateMap.get(boardRoot);
  if (!candidate) {
    candidate = {
      boardRoot,
      sources: new Set(),
      order: Number.isFinite(orderHint) ? orderHint : candidateMap.size + 1000,
    };
    candidateMap.set(boardRoot, candidate);
  }

  candidate.sources.add(source);
  if (Number.isFinite(orderHint)) {
    candidate.order = Math.min(candidate.order, orderHint);
  }

  return candidate;
}

async function scanAllowedRootForBoards(allowedRoot, options = {}) {
  const rootPath = normalizeAbsolutePath(allowedRoot);
  if (!rootPath || !await pathExistsAsDirectory(rootPath)) {
    return [];
  }

  const maxDepth = normalizeInteger(
    options.maxDepth,
    DEFAULT_BOARD_SCAN_DEPTH,
    0,
    MAX_BOARD_SCAN_DEPTH,
  );
  const limit = normalizeInteger(
    options.limit,
    DEFAULT_BOARD_SCAN_LIMIT,
    1,
    MAX_BOARD_SCAN_LIMIT,
  );
  const matches = [];
  const seen = new Set([rootPath]);

  if (await pathLooksLikeSignboardBoardRoot(rootPath)) {
    return [rootPath];
  }

  const queue = [{ directoryPath: rootPath, depth: 0 }];
  while (queue.length > 0 && matches.length < limit) {
    const current = queue.shift();

    let entries = [];
    try {
      entries = await fs.readdir(current.directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => boardSortCollator.compare(left.name, right.name));

    for (const entry of entries) {
      if (matches.length >= limit) {
        break;
      }

      if (!entry.isDirectory() || SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const candidatePath = path.resolve(current.directoryPath, entry.name);
      if (
        seen.has(candidatePath) ||
        !isPathInside(current.directoryPath, candidatePath)
      ) {
        continue;
      }

      seen.add(candidatePath);
      if (await pathLooksLikeSignboardBoardRoot(candidatePath)) {
        matches.push(candidatePath);
        continue;
      }

      if (current.depth < maxDepth) {
        queue.push({
          directoryPath: candidatePath,
          depth: current.depth + 1,
        });
      }
    }
  }

  return matches;
}

async function buildBoardRecord(candidate, context) {
  const sources = Array.from(candidate.sources).sort();
  const boardRoot = candidate.boardRoot;
  const exists = await pathExistsAsDirectory(boardRoot);
  const isBoardRoot = exists ? await pathLooksLikeSignboardBoardRoot(boardRoot) : false;

  return {
    name: path.basename(boardRoot),
    boardRoot,
    sources,
    isOpen: sources.includes('desktop-open'),
    isActive: boardRoot === context.activeBoard,
    isCurrent: boardRoot === context.currentBoard,
    isTrusted: context.trustedBoardRootSet.has(boardRoot),
    isAllowed: context.allowedRoots.length === 0
      ? context.allowWhenNoAllowedRoots
      : isPathInsideAnyRoot(context.allowedRoots, boardRoot),
    exists,
    isBoardRoot,
    order: candidate.order,
  };
}

async function discoverBoards(options = {}) {
  const allowedRoots = normalizePathList(options.allowedRoots);
  const trustedBoardRoots = normalizePathList(options.trustedBoardRoots);
  const openBoardState = normalizeOpenBoardsState({
    openBoardRoots: options.openBoardRoots,
    activeBoardRoot: options.activeBoardRoot,
  });
  const currentBoard = normalizeAbsolutePath(options.currentBoardRoot || '');
  const activeBoard = openBoardState.activeBoardRoot || currentBoard || openBoardState.openBoardRoots[0] || '';
  const includeAllowedRootScan = options.includeAllowedRootScan !== false;
  const maxDepth = normalizeInteger(
    options.maxDepth,
    DEFAULT_BOARD_SCAN_DEPTH,
    0,
    MAX_BOARD_SCAN_DEPTH,
  );
  const limit = normalizeInteger(
    options.limit,
    DEFAULT_BOARD_SCAN_LIMIT,
    1,
    MAX_BOARD_SCAN_LIMIT,
  );
  const candidateMap = new Map();

  if (openBoardState.activeBoardRoot) {
    addBoardCandidate(candidateMap, openBoardState.activeBoardRoot, 'desktop-active', 0);
  }

  if (currentBoard) {
    addBoardCandidate(candidateMap, currentBoard, 'cli-current', 1);
  }

  openBoardState.openBoardRoots.forEach((boardRoot, index) => {
    addBoardCandidate(candidateMap, boardRoot, 'desktop-open', 10 + index);
  });

  trustedBoardRoots.forEach((boardRoot, index) => {
    addBoardCandidate(candidateMap, boardRoot, 'desktop-trusted', 200 + index);
  });

  if (includeAllowedRootScan) {
    let scanOrder = 1000;
    for (const allowedRoot of allowedRoots) {
      const matches = await scanAllowedRootForBoards(allowedRoot, { maxDepth, limit });
      for (const match of matches) {
        const source = match === allowedRoot ? 'mcp-allowed-root' : 'mcp-allowed-root-scan';
        addBoardCandidate(candidateMap, match, source, scanOrder);
        scanOrder += 1;
        if (candidateMap.size >= limit) {
          break;
        }
      }
    }
  }

  const context = {
    activeBoard,
    currentBoard,
    trustedBoardRootSet: new Set(trustedBoardRoots),
    allowedRoots,
    allowWhenNoAllowedRoots: options.allowWhenNoAllowedRoots === true,
  };
  const boards = await Promise.all(
    Array.from(candidateMap.values()).map((candidate) => buildBoardRecord(candidate, context))
  );

  boards.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    if (left.isOpen !== right.isOpen) {
      return left.isOpen ? -1 : 1;
    }

    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }

    if (left.order !== right.order) {
      return left.order - right.order;
    }

    const byName = boardSortCollator.compare(left.name, right.name);
    return byName !== 0 ? byName : left.boardRoot.localeCompare(right.boardRoot);
  });

  for (const board of boards) {
    delete board.order;
  }

  return {
    ok: true,
    activeBoard,
    currentBoard,
    openBoardRoots: openBoardState.openBoardRoots,
    trustedBoardRoots,
    allowedRoots,
    boards: boards.slice(0, limit),
    boardCount: Math.min(boards.length, limit),
  };
}

module.exports = {
  TRUSTED_BOARD_ROOTS_FILE,
  OPEN_BOARDS_STATE_FILE,
  DEFAULT_BOARD_SCAN_DEPTH,
  DEFAULT_BOARD_SCAN_LIMIT,
  MAX_BOARD_SCAN_DEPTH,
  MAX_BOARD_SCAN_LIMIT,
  normalizeAbsolutePath,
  normalizePathList,
  normalizeOpenBoardsState,
  getDefaultDesktopUserDataDir,
  readDesktopTrustedBoardRoots,
  readDesktopOpenBoardsState,
  pathLooksLikeSignboardBoardRoot,
  discoverBoards,
};
