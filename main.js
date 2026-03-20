/*!
 * Signboard - A local-first Kanban app that writes Markdown
 * Copyright (c) 2025 Colin Devroe - cdevroe.com
 * Licensed under the MIT License. See LICENSE file for details.
 */

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, ShareMenu, shell, powerSaveBlocker, nativeImage, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const { randomUUID } = require('crypto');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { pathToFileURL } = require('url');
const cardFrontmatter = require('./lib/cardFrontmatter');
const boardLabels = require('./lib/boardLabels');
const { startSignboardMcpServer } = require('./lib/mcpServer');
const { isCliInvocation, runCli } = require('./lib/cliApp');
const { installCliForCurrentUser } = require('./lib/cliInstall');

const GITHUB_OWNER = 'cdevroe';
const GITHUB_REPO = 'signboard';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_PREFS_FILE = 'update-preferences.json';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 860;
const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 680;
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 250;
const MCP_SERVER_ARG = '--mcp-server';
const MCP_CONFIG_ARG = '--mcp-config';
const RUNTIME_APP_ICON_PATH = path.join(__dirname, 'build', 'icon-macos.png');
const SIGNBOARD_USER_DATA_DIR = String(process.env.SIGNBOARD_USER_DATA_DIR || '').trim();
const APP_ENTRY_URL = pathToFileURL(path.join(__dirname, 'index.html'));
const TRUSTED_BOARD_ROOTS_FILE = 'trusted-board-roots.json';
const DIRECTORY_SELECTION_MAX_AGE_MS = 5 * 60 * 1000;
const BOARD_WATCH_RESCAN_DELAY_MS = 180;
const SUPPORTS_RECURSIVE_WATCH = process.platform === 'darwin' || process.platform === 'win32';
const APP_AUTHOR_NAME = 'Colin Devroe';
const APP_AUTHOR_URL = 'https://cdevroe.com/';
const APP_COPYRIGHT = '© 2025-2026 Colin Devroe';
const APP_LICENSE = 'MIT';
const APP_WEBSITE_URL = 'https://cdevroe.com/signboard/';
const dueDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

if (SIGNBOARD_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(SIGNBOARD_USER_DATA_DIR));
}

function getUserArgsFromProcessArgv(argv = process.argv) {
  if (!Array.isArray(argv) || argv.length <= 1) {
    return [];
  }

  if (process.defaultApp) {
    return argv.slice(2);
  }

  const secondArg = String(argv[1] || '');
  const secondArgBaseName = path.basename(secondArg).toLowerCase();
  if (secondArgBaseName === 'main.js') {
    return argv.slice(2);
  }

  return argv.slice(1);
}

const signboardArgs = getUserArgsFromProcessArgv();
const isMcpServerMode = signboardArgs.includes(MCP_SERVER_ARG);
const isMcpConfigMode = signboardArgs.includes(MCP_CONFIG_ARG);
const isCliMode = isCliInvocation(signboardArgs);
let mainWindow = null;
let isAppQuitting = false;
let mcpPowerSaveBlockerId = null;
let unresponsiveDialogVisible = false;

function isMcpPowerSaveBlockerActive() {
  return Number.isInteger(mcpPowerSaveBlockerId) && powerSaveBlocker.isStarted(mcpPowerSaveBlockerId);
}

const updateState = {
  checkInProgress: false,
  activeCheckIsManual: false,
  downloadInProgress: false,
  reminderByVersion: {},
  checkIntervalId: null,
};

const pendingDirectorySelectionsBySender = new Map();
const boardAccessStateBySender = new Map();
const senderCleanupRegistered = new Set();
let trustedBoardRootsCache = null;

function normalizeAbsolutePath(rawPath) {
  const input = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!input) {
    return '';
  }

  return path.resolve(input);
}

function normalizeBoardRootPath(rawPath) {
  return normalizeAbsolutePath(rawPath);
}

function isPathInsideRoot(rootPath, targetPath) {
  const normalizedRoot = normalizeBoardRootPath(rootPath);
  const normalizedTarget = normalizeAbsolutePath(targetPath);
  if (!normalizedRoot || !normalizedTarget) {
    return false;
  }

  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getTrustedBoardRootsPath() {
  return path.join(app.getPath('userData'), TRUSTED_BOARD_ROOTS_FILE);
}

function readTrustedBoardRoots() {
  if (trustedBoardRootsCache) {
    return new Set(trustedBoardRootsCache);
  }

  try {
    const raw = fs.readFileSync(getTrustedBoardRootsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const normalizedRoots = Array.isArray(parsed)
      ? parsed.map((boardRoot) => normalizeBoardRootPath(boardRoot)).filter(Boolean)
      : [];
    trustedBoardRootsCache = new Set(normalizedRoots);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to read trusted board roots.', error);
    }
    trustedBoardRootsCache = new Set();
  }

  return new Set(trustedBoardRootsCache);
}

function writeTrustedBoardRoots(roots) {
  const normalizedRoots = [...new Set(
    Array.from(roots || [])
      .map((boardRoot) => normalizeBoardRootPath(boardRoot))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));

  trustedBoardRootsCache = new Set(normalizedRoots);

  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(
      getTrustedBoardRootsPath(),
      JSON.stringify(normalizedRoots, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Failed to write trusted board roots.', error);
  }
}

function addTrustedBoardRoot(boardRoot) {
  const normalizedRoot = normalizeBoardRootPath(boardRoot);
  if (!normalizedRoot) {
    return '';
  }

  const trustedRoots = readTrustedBoardRoots();
  trustedRoots.add(normalizedRoot);
  writeTrustedBoardRoots(trustedRoots);
  return normalizedRoot;
}

function replaceTrustedBoardRoot(previousRoot, nextRoot) {
  const normalizedPreviousRoot = normalizeBoardRootPath(previousRoot);
  const normalizedNextRoot = normalizeBoardRootPath(nextRoot);
  if (!normalizedPreviousRoot || !normalizedNextRoot) {
    return;
  }

  const trustedRoots = readTrustedBoardRoots();
  trustedRoots.delete(normalizedPreviousRoot);
  trustedRoots.add(normalizedNextRoot);
  writeTrustedBoardRoots(trustedRoots);
}

function createBoardWatchState() {
  return {
    activeRoot: '',
    rootWatcher: null,
    listWatchers: new Map(),
    rescanTimeout: null,
    changeToken: 0,
    usingRecursiveRootWatch: false,
  };
}

function registerSenderCleanup(sender) {
  const senderId = sender && Number.isInteger(sender.id) ? sender.id : null;
  if (senderId == null || senderCleanupRegistered.has(senderId) || typeof sender.once !== 'function') {
    return;
  }

  senderCleanupRegistered.add(senderId);
  sender.once('destroyed', () => {
    senderCleanupRegistered.delete(senderId);
    cleanupSenderBoardState(senderId);
  });
}

function getSenderBoardAccessState(sender) {
  registerSenderCleanup(sender);
  const senderId = sender.id;
  let state = boardAccessStateBySender.get(senderId);
  if (!state) {
    state = {
      activeBoardRoot: '',
      watchState: createBoardWatchState(),
    };
    boardAccessStateBySender.set(senderId, state);
  }

  return state;
}

function getSenderPendingSelections(sender) {
  registerSenderCleanup(sender);
  const senderId = sender.id;
  let selections = pendingDirectorySelectionsBySender.get(senderId);
  if (!selections) {
    selections = new Map();
    pendingDirectorySelectionsBySender.set(senderId, selections);
  }

  return selections;
}

function closeWatcher(watcher) {
  if (!watcher || typeof watcher.close !== 'function') {
    return;
  }

  try {
    watcher.close();
  } catch {
    // Ignore close failures from stale/unavailable watch handles.
  }
}

function clearBoardRescanTimer(watchState) {
  if (watchState && watchState.rescanTimeout) {
    clearTimeout(watchState.rescanTimeout);
    watchState.rescanTimeout = null;
  }
}

function clearListWatchers(watchState) {
  if (!watchState) {
    return;
  }

  for (const watcher of watchState.listWatchers.values()) {
    closeWatcher(watcher);
  }
  watchState.listWatchers.clear();
}

function bumpBoardWatchToken(watchState) {
  if (watchState) {
    watchState.changeToken += 1;
  }
}

function attachDirectoryWatcher(directoryPath, onChange, options = {}) {
  const watchOptions = {
    persistent: false,
  };

  if (options.recursive === true) {
    watchOptions.recursive = true;
  }

  try {
    const watcher = fs.watch(directoryPath, watchOptions, () => {
      onChange();
    });

    watcher.on('error', () => {
      if (typeof options.onError === 'function') {
        options.onError();
      }
    });

    return watcher;
  } catch {
    return null;
  }
}

async function refreshBoardListWatchers(watchState) {
  if (!watchState || !watchState.activeRoot || watchState.usingRecursiveRootWatch) {
    return;
  }

  let entries = [];
  try {
    entries = await fsPromises.readdir(watchState.activeRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const expectedListPaths = new Set(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizeAbsolutePath(path.join(watchState.activeRoot, entry.name))),
  );

  for (const [listPath, watcher] of watchState.listWatchers.entries()) {
    if (!expectedListPaths.has(listPath)) {
      closeWatcher(watcher);
      watchState.listWatchers.delete(listPath);
    }
  }

  for (const listPath of expectedListPaths) {
    if (watchState.listWatchers.has(listPath)) {
      continue;
    }

    const watcher = attachDirectoryWatcher(listPath, () => {
      bumpBoardWatchToken(watchState);
    });

    if (watcher) {
      watchState.listWatchers.set(listPath, watcher);
    }
  }
}

function scheduleBoardWatchRescan(watchState) {
  if (!watchState || watchState.usingRecursiveRootWatch) {
    return;
  }

  clearBoardRescanTimer(watchState);
  watchState.rescanTimeout = setTimeout(() => {
    watchState.rescanTimeout = null;
    refreshBoardListWatchers(watchState).catch(() => {
      // Ignore failed rescans; a later fs event will retry.
    });
  }, BOARD_WATCH_RESCAN_DELAY_MS);
}

async function stopBoardWatchForState(watchState) {
  if (!watchState) {
    return { ok: true };
  }

  clearBoardRescanTimer(watchState);
  clearListWatchers(watchState);
  closeWatcher(watchState.rootWatcher);
  watchState.rootWatcher = null;
  watchState.activeRoot = '';
  watchState.changeToken = 0;
  watchState.usingRecursiveRootWatch = false;
  return { ok: true };
}

async function stopBoardWatchForSender(sender) {
  const state = getSenderBoardAccessState(sender);
  return stopBoardWatchForState(state.watchState);
}

async function startBoardWatchForSender(sender, boardRoot) {
  const normalizedRoot = normalizeBoardRootPath(boardRoot);
  const state = getSenderBoardAccessState(sender);
  const watchState = state.watchState;

  if (!normalizedRoot || state.activeBoardRoot !== normalizedRoot) {
    return { ok: false, error: 'UNAUTHORIZED_BOARD_ROOT' };
  }

  if (watchState.activeRoot === normalizedRoot && watchState.rootWatcher) {
    return { ok: true, boardRoot: normalizedRoot };
  }

  await stopBoardWatchForState(watchState);

  watchState.activeRoot = normalizedRoot;
  const onRootWatchChange = () => {
    bumpBoardWatchToken(watchState);
    scheduleBoardWatchRescan(watchState);
  };

  let rootWatcher = null;
  watchState.usingRecursiveRootWatch = false;

  if (SUPPORTS_RECURSIVE_WATCH) {
    rootWatcher = attachDirectoryWatcher(normalizedRoot, onRootWatchChange, {
      recursive: true,
      onError: onRootWatchChange,
    });

    if (rootWatcher) {
      watchState.usingRecursiveRootWatch = true;
    }
  }

  if (!rootWatcher) {
    rootWatcher = attachDirectoryWatcher(normalizedRoot, onRootWatchChange, {
      onError: onRootWatchChange,
    });
  }

  if (!rootWatcher) {
    watchState.activeRoot = '';
    watchState.usingRecursiveRootWatch = false;
    return { ok: false, error: 'WATCH_START_FAILED' };
  }

  watchState.rootWatcher = rootWatcher;

  if (watchState.usingRecursiveRootWatch) {
    clearListWatchers(watchState);
  } else {
    await refreshBoardListWatchers(watchState);
  }

  bumpBoardWatchToken(watchState);

  return { ok: true, boardRoot: normalizedRoot };
}

function cleanupSenderBoardState(senderId) {
  const state = boardAccessStateBySender.get(senderId);
  if (state) {
    stopBoardWatchForState(state.watchState).catch(() => {
      // Ignore cleanup failures while tearing down a renderer.
    });
  }

  boardAccessStateBySender.delete(senderId);
  pendingDirectorySelectionsBySender.delete(senderId);
}

function storePendingDirectorySelection(sender, directoryPath) {
  const normalizedDirectory = normalizeAbsolutePath(directoryPath);
  if (!normalizedDirectory) {
    return '';
  }

  const token = randomUUID();
  const selections = getSenderPendingSelections(sender);
  const now = Date.now();

  for (const [existingToken, selection] of selections.entries()) {
    if (!selection || selection.expiresAt <= now) {
      selections.delete(existingToken);
    }
  }

  selections.set(token, {
    path: normalizedDirectory,
    expiresAt: now + DIRECTORY_SELECTION_MAX_AGE_MS,
  });

  return token;
}

function consumePendingDirectorySelection(sender, token) {
  const selectionToken = typeof token === 'string' ? token.trim() : '';
  if (!selectionToken) {
    return '';
  }

  const selections = getSenderPendingSelections(sender);
  const selection = selections.get(selectionToken);
  selections.delete(selectionToken);

  if (!selection || selection.expiresAt <= Date.now()) {
    return '';
  }

  return normalizeAbsolutePath(selection.path);
}

function resolveReadableBoardRoot(sender, boardRoot) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  if (!normalizedBoardRoot) {
    return '';
  }

  const senderState = getSenderBoardAccessState(sender);
  if (senderState.activeBoardRoot && senderState.activeBoardRoot === normalizedBoardRoot) {
    return normalizedBoardRoot;
  }

  const trustedRoots = readTrustedBoardRoots();
  return trustedRoots.has(normalizedBoardRoot) ? normalizedBoardRoot : '';
}

function requireReadableBoardRoot(sender, boardRoot) {
  const normalizedBoardRoot = resolveReadableBoardRoot(sender, boardRoot);
  if (!normalizedBoardRoot) {
    throw new Error('UNAUTHORIZED_BOARD_ROOT');
  }

  return normalizedBoardRoot;
}

function requireWritableBoardRoot(sender, boardRoot, options = {}) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  const senderState = getSenderBoardAccessState(sender);
  if (normalizedBoardRoot && senderState.activeBoardRoot === normalizedBoardRoot) {
    return normalizedBoardRoot;
  }

  if (options.allowTrusted === true) {
    const trustedRoots = readTrustedBoardRoots();
    if (normalizedBoardRoot && trustedRoots.has(normalizedBoardRoot)) {
      return normalizedBoardRoot;
    }
  }

  throw new Error('UNAUTHORIZED_BOARD_ROOT');
}

function requireReadablePath(sender, candidatePath) {
  const normalizedPath = normalizeAbsolutePath(candidatePath);
  if (!normalizedPath) {
    throw new Error('INVALID_PATH');
  }

  const senderState = getSenderBoardAccessState(sender);
  if (senderState.activeBoardRoot && isPathInsideRoot(senderState.activeBoardRoot, normalizedPath)) {
    return normalizedPath;
  }

  const trustedRoots = readTrustedBoardRoots();
  for (const trustedRoot of trustedRoots) {
    if (isPathInsideRoot(trustedRoot, normalizedPath)) {
      return normalizedPath;
    }
  }

  throw new Error('UNAUTHORIZED_PATH');
}

function requireWritablePath(sender, candidatePath) {
  const normalizedPath = normalizeAbsolutePath(candidatePath);
  if (!normalizedPath) {
    throw new Error('INVALID_PATH');
  }

  const senderState = getSenderBoardAccessState(sender);
  if (senderState.activeBoardRoot && isPathInsideRoot(senderState.activeBoardRoot, normalizedPath)) {
    return normalizedPath;
  }

  throw new Error('UNAUTHORIZED_PATH');
}

function authorizeTrustedBoardRootForSender(sender, boardRoot) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  const trustedRoots = readTrustedBoardRoots();
  if (!normalizedBoardRoot || !trustedRoots.has(normalizedBoardRoot)) {
    return { ok: false, error: 'UNTRUSTED_BOARD_ROOT' };
  }

  const state = getSenderBoardAccessState(sender);
  state.activeBoardRoot = normalizedBoardRoot;
  return { ok: true, boardRoot: normalizedBoardRoot };
}

function authorizeBoardSelectionForSender(sender, selectionToken) {
  const selectedPath = consumePendingDirectorySelection(sender, selectionToken);
  const normalizedBoardRoot = normalizeBoardRootPath(selectedPath);
  if (!normalizedBoardRoot) {
    return { ok: false, error: 'INVALID_SELECTION_TOKEN' };
  }

  addTrustedBoardRoot(normalizedBoardRoot);
  const state = getSenderBoardAccessState(sender);
  state.activeBoardRoot = normalizedBoardRoot;

  return { ok: true, boardRoot: normalizedBoardRoot };
}

async function adoptLegacyBoardRootsForSender(sender, boardRoots) {
  const trustedRoots = readTrustedBoardRoots();
  if (trustedRoots.size > 0) {
    return {
      ok: true,
      adoptedRoots: Array.from(trustedRoots),
      migrated: false,
    };
  }

  const candidateRoots = Array.isArray(boardRoots) ? boardRoots : [];
  const adoptedRoots = [];

  for (const candidateRoot of candidateRoots) {
    const normalizedRoot = normalizeBoardRootPath(candidateRoot);
    if (!normalizedRoot) {
      continue;
    }

    try {
      const stats = await fsPromises.stat(normalizedRoot);
      if (!stats.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    trustedRoots.add(normalizedRoot);
    adoptedRoots.push(normalizedRoot);
  }

  if (trustedRoots.size > 0) {
    writeTrustedBoardRoots(trustedRoots);
  }

  return {
    ok: true,
    adoptedRoots,
    migrated: adoptedRoots.length > 0,
  };
}

async function listBoardDirectories(boardRoot, options = {}) {
  const includeArchive = options.includeArchive === true;
  const entries = await fsPromises.readdir(boardRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((entryName) => includeArchive || entryName !== 'XXX-Archive');
}

function sanitizeImportedName(value) {
  return String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'untitled';
}

async function sanitizeImportedCardFileName(rawName) {
  const source = String(rawName || '');
  const lastDot = source.lastIndexOf('.');
  const ext = lastDot !== -1 ? source.slice(lastDot) : '';
  const base = lastDot !== -1 ? source.slice(0, lastDot) : source;

  const cleanedBase = base
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[^\p{L}\p{N}_\-.\s]/gu, '')
    .trim();

  const maxTotal = 100;
  const maxBase = Math.max(0, maxTotal - [...ext].length);
  const truncatedBase = [...cleanedBase].slice(0, maxBase).join('');
  const finalBase = truncatedBase.replace(/[ .]+$/g, '');
  const finalName = finalBase.slice(0, 25) + ext;

  return finalName || '999-untitled.md';
}

function importedRandomSuffix() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(5)]
    .map(() => alphabet.charAt(Math.floor(Math.random() * alphabet.length)))
    .join('');
}

function escapeMarkdownTitle(text) {
  return String(text || '').replace(/([#*_`\[\]])/g, '\\$1');
}

app.on('ready', () => {
  app.setName('SignBoard');

  if (process.platform === 'darwin' && app.dock && fs.existsSync(RUNTIME_APP_ICON_PATH)) {
    const dockIcon = nativeImage.createFromPath(RUNTIME_APP_ICON_PATH);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function normalizeWindowBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  if (![x, y, width, height].every(Number.isFinite)) {
    return null;
  }

  if (width < 320 || height < 240) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function getDefaultWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const minWidth = Math.min(MIN_WINDOW_WIDTH, workArea.width);
  const minHeight = Math.min(MIN_WINDOW_HEIGHT, workArea.height);
  const width = Math.min(
    DEFAULT_WINDOW_WIDTH,
    Math.max(Math.round(workArea.width * 0.9), minWidth)
  );
  const height = Math.min(
    DEFAULT_WINDOW_HEIGHT,
    Math.max(Math.round(workArea.height * 0.9), minHeight)
  );

  return {
    x: Math.round(workArea.x + ((workArea.width - width) / 2)),
    y: Math.round(workArea.y + ((workArea.height - height) / 2)),
    width,
    height,
  };
}

function constrainWindowBounds(bounds) {
  const normalizedBounds = normalizeWindowBounds(bounds);
  if (!normalizedBounds) {
    return getDefaultWindowBounds();
  }

  const targetDisplay = screen.getDisplayMatching(normalizedBounds) || screen.getPrimaryDisplay();
  const { workArea } = targetDisplay;
  const minWidth = Math.min(MIN_WINDOW_WIDTH, workArea.width);
  const minHeight = Math.min(MIN_WINDOW_HEIGHT, workArea.height);
  const width = clamp(normalizedBounds.width, minWidth, workArea.width);
  const height = clamp(normalizedBounds.height, minHeight, workArea.height);
  const x = clamp(normalizedBounds.x, workArea.x, workArea.x + workArea.width - width);
  const y = clamp(normalizedBounds.y, workArea.y, workArea.y + workArea.height - height);

  return {
    x,
    y,
    width,
    height,
  };
}

function readWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const bounds = constrainWindowBounds(parsed.bounds);

    return {
      bounds,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to read window state.', error);
    }

    return {
      bounds: getDefaultWindowBounds(),
      isMaximized: false,
    };
  }
}

function getWindowStateSnapshot(win) {
  if (!win || win.isDestroyed()) {
    return null;
  }

  return {
    bounds: constrainWindowBounds(win.getNormalBounds()),
    isMaximized: win.isMaximized(),
  };
}

function writeWindowState(windowState) {
  if (!windowState || !windowState.bounds) {
    return;
  }

  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(
      getWindowStatePath(),
      JSON.stringify(windowState, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Failed to write window state.', error);
  }
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    return mainWindow;
  }

  const windowState = readWindowState();
  const initialDisplay = screen.getDisplayMatching(windowState.bounds) || screen.getPrimaryDisplay();
  const minWindowWidth = Math.min(MIN_WINDOW_WIDTH, initialDisplay.workArea.width);
  const minWindowHeight = Math.min(MIN_WINDOW_HEIGHT, initialDisplay.workArea.height);
  let pendingWindowStateWrite = null;
  let pendingWindowStateTimer = null;

  const saveWindowState = () => {
    if (!pendingWindowStateWrite) {
      return;
    }

    const stateToWrite = pendingWindowStateWrite;
    pendingWindowStateWrite = null;
    writeWindowState(stateToWrite);
  };

  const queueWindowStateSave = (win) => {
    pendingWindowStateWrite = getWindowStateSnapshot(win);
    if (!pendingWindowStateWrite) {
      return;
    }

    if (pendingWindowStateTimer) {
      clearTimeout(pendingWindowStateTimer);
    }

    pendingWindowStateTimer = setTimeout(() => {
      pendingWindowStateTimer = null;
      saveWindowState();
    }, WINDOW_STATE_SAVE_DEBOUNCE_MS);
  };

  const flushWindowStateSave = (win) => {
    pendingWindowStateWrite = getWindowStateSnapshot(win);
    if (pendingWindowStateTimer) {
      clearTimeout(pendingWindowStateTimer);
      pendingWindowStateTimer = null;
    }

    saveWindowState();
  };

  const win = new BrowserWindow({
    ...windowState.bounds,
    minWidth: minWindowWidth,
    minHeight: minWindowHeight,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow = win;

  const shouldOpenExternally = (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const isTrustedAppNavigation = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === APP_ENTRY_URL.protocol
        && parsed.pathname === APP_ENTRY_URL.pathname;
    } catch {
      return false;
    }
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }

    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppNavigation(url)) {
      return;
    }

    event.preventDefault();

    if (shouldOpenExternally(url)) {
      shell.openExternal(url);
    }
  });

  win.webContents.on('unresponsive', async () => {
    if (isAppQuitting || unresponsiveDialogVisible || win.isDestroyed()) {
      return;
    }

    unresponsiveDialogVisible = true;

    try {
      const choice = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Signboard Is Not Responding',
        message: 'Signboard stopped responding.',
        detail: 'You can force reload the app window now, wait, or quit Signboard.',
        buttons: ['Force Reload', 'Wait', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (win.isDestroyed()) {
        return;
      }

      if (choice.response === 0) {
        win.webContents.reloadIgnoringCache();
        return;
      }

      if (choice.response === 2) {
        app.quit();
      }
    } catch (error) {
      console.error('Failed while handling unresponsive window.', error);
    } finally {
      unresponsiveDialogVisible = false;
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process exited unexpectedly.', details);

    if (isAppQuitting || isMcpServerMode || isMcpConfigMode) {
      return;
    }

    if (!win.isDestroyed()) {
      win.destroy();
    }

    mainWindow = null;
    createWindow();
  });

  win.on('resize', () => {
    queueWindowStateSave(win);
  });

  win.on('move', () => {
    queueWindowStateSave(win);
  });

  win.on('maximize', () => {
    queueWindowStateSave(win);
  });

  win.on('unmaximize', () => {
    queueWindowStateSave(win);
  });

  win.on('close', () => {
    flushWindowStateSave(win);
  });

  win.on('closed', () => {
    if (pendingWindowStateTimer) {
      clearTimeout(pendingWindowStateTimer);
      pendingWindowStateTimer = null;
    }

    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (windowState.isMaximized) {
    win.maximize();
  }

  win.loadFile('index.html');
  return win;
}

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  return BrowserWindow.getAllWindows()[0] || null;
}

function showDockIcon() {
  if (process.platform === 'darwin' && app.dock && typeof app.dock.show === 'function') {
    app.dock.show();
  }
}

function ensureMainWindowVisible() {
  showDockIcon();

  const win = createWindow();
  if (!win || win.isDestroyed()) {
    return null;
  }

  if (!Menu.getApplicationMenu()) {
    buildApplicationMenu();
  }

  if (win.isMinimized()) {
    win.restore();
  }

  if (!win.isVisible()) {
    win.show();
  }

  win.focus();
  return win;
}

function sendToMainWindow(channel) {
  const win = ensureMainWindowVisible();
  if (!win || win.isDestroyed()) {
    return;
  }

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel);
      }
    });
    return;
  }

  win.webContents.send(channel);
}

function buildMcpConfigTemplate() {
  const command = process.execPath;
  const args = app.isPackaged ? [MCP_SERVER_ARG] : [app.getAppPath(), MCP_SERVER_ARG];
  const env = {
    SIGNBOARD_MCP_READ_ONLY: 'false',
  };

  try {
    env.SIGNBOARD_MCP_ALLOWED_ROOTS = path.join(app.getPath('documents'), 'Boards');
  } catch {
    env.SIGNBOARD_MCP_ALLOWED_ROOTS = '';
  }

  return {
    mcpServers: {
      signboard: {
        command,
        args,
        env,
      },
    },
  };
}

async function copyMcpConfigToClipboard() {
  const win = getMainWindow();
  const config = buildMcpConfigTemplate();
  const asText = JSON.stringify(config, null, 2);

  clipboard.writeText(asText);

  if (!win) {
    return;
  }

  await dialog.showMessageBox(win, {
    type: 'info',
    title: 'MCP Config Copied',
    message: 'Signboard MCP config was copied to your clipboard.',
    detail: 'Paste it into your MCP client config and adjust SIGNBOARD_MCP_ALLOWED_ROOTS for your board locations.',
    buttons: ['OK'],
    noLink: true,
  });
}

async function installCliFromApp() {
  const win = getMainWindow();
  if (!win) {
    return;
  }

  try {
    const result = await installCliForCurrentUser({
      executablePath: process.execPath,
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
    });

    const profileLines = [...result.updatedProfiles, ...result.untouchedProfiles]
      .map((profilePath) => `- ${profilePath}`)
      .join('\n');

    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Signboard CLI Installed',
      message: 'The `signboard` command is ready for new Terminal sessions.',
      detail: [
        `Command: ${result.commandPreview}`,
        `Shim: ${result.scriptPath}`,
        '',
        'Updated shell profile(s):',
        profileLines || '- none',
        '',
        'Open a new Terminal window, then run `signboard help`.',
      ].join('\n'),
      buttons: ['OK'],
      noLink: true,
    });
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Install Signboard CLI Failed',
      message: 'Signboard could not install the terminal command.',
      detail: String(error?.message || error || 'Unknown error'),
      buttons: ['OK'],
      noLink: true,
    });
  }
}

function printMcpConfigToStdout() {
  const config = buildMcpConfigTemplate();
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}

function getUpdatePreferencesPath() {
  return path.join(app.getPath('userData'), UPDATE_PREFS_FILE);
}

async function loadUpdatePreferences() {
  const prefsPath = getUpdatePreferencesPath();

  try {
    const raw = await fsPromises.readFile(prefsPath, 'utf8');
    const parsed = JSON.parse(raw);
    updateState.reminderByVersion =
      parsed && typeof parsed === 'object' && parsed.reminderByVersion && typeof parsed.reminderByVersion === 'object'
        ? parsed.reminderByVersion
        : {};
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn('Failed to load update preferences.', error);
    }
    updateState.reminderByVersion = {};
  }
}

async function saveUpdatePreferences() {
  const prefsPath = getUpdatePreferencesPath();
  const payload = {
    reminderByVersion: updateState.reminderByVersion,
  };
  await fsPromises.writeFile(prefsPath, JSON.stringify(payload, null, 2), 'utf8');
}

function isReminderExpired(version) {
  const remindAt = Number(updateState.reminderByVersion[String(version)] || 0);
  return !remindAt || remindAt <= Date.now();
}

async function remindLater(version) {
  if (!version) {
    return;
  }

  updateState.reminderByVersion[String(version)] = Date.now() + UPDATE_REMINDER_DELAY_MS;
  await saveUpdatePreferences();
}

async function clearReminder(version) {
  if (!version) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(updateState.reminderByVersion, String(version))) {
    delete updateState.reminderByVersion[String(version)];
    await saveUpdatePreferences();
  }
}

function getReleaseUrl(info) {
  const releaseName = typeof info?.releaseName === 'string' ? info.releaseName.trim() : '';
  if (releaseName && !releaseName.includes(' ')) {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${encodeURIComponent(releaseName)}`;
  }
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
}

function extractReleaseNotes(info) {
  const releaseNotes = info?.releaseNotes;

  if (typeof releaseNotes === 'string') {
    return releaseNotes.trim();
  }

  if (Array.isArray(releaseNotes)) {
    const notes = releaseNotes
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry && typeof entry.note === 'string') {
          const entryVersion = typeof entry.version === 'string' ? entry.version.trim() : '';
          const heading = entryVersion ? `Version ${entryVersion}\n` : '';
          return `${heading}${entry.note.trim()}`.trim();
        }
        return '';
      })
      .filter(Boolean);

    return notes.join('\n\n');
  }

  return '';
}

function formatReleaseNotesForDialog(info) {
  const notes = extractReleaseNotes(info);

  if (!notes) {
    return 'No changelog details were provided in the release metadata.';
  }

  const maxChars = 1600;
  if (notes.length <= maxChars) {
    return notes;
  }

  return `${notes.slice(0, maxChars).trim()}\n\n...`;
}

async function openChangelog(info) {
  const url = getReleaseUrl(info);
  await shell.openExternal(url);
}

async function showUpdateAvailableDialog(info) {
  const win = getMainWindow();
  if (!win) {
    return;
  }

  if (updateState.downloadInProgress) {
    return;
  }

  const nextVersion = typeof info?.version === 'string' ? info.version : 'latest';
  const detail = [
    `Current version: ${app.getVersion()}`,
    `New version: ${nextVersion}`,
    '',
    formatReleaseNotesForDialog(info),
    '',
    'Choose Install now to download and apply this update.',
  ].join('\n');

  while (true) {
    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Available',
      message: `Signboard ${nextVersion} is available.`,
      detail,
      buttons: ['Install now', 'Remind me later', 'View changelog'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (choice.response === 2) {
      await openChangelog(info);
      continue;
    }

    if (choice.response === 1) {
      await remindLater(info?.version);
      return;
    }

    break;
  }

  try {
    updateState.downloadInProgress = true;
    win.setProgressBar(2);
    await autoUpdater.downloadUpdate();
  } catch (error) {
    win.setProgressBar(-1);
    updateState.downloadInProgress = false;
    console.error('Failed to download update.', error);
    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Download Failed',
      message: 'Signboard could not download the update.',
      detail: String(error?.message || error || 'Unknown error'),
      buttons: ['OK'],
      noLink: true,
    });
  }
}

async function showUpdateReadyDialog(info) {
  const win = getMainWindow();
  if (!win) {
    return;
  }

  while (true) {
    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Ready',
      message: `Signboard ${info?.version || ''} has been downloaded.`,
      detail: 'Choose Install and Relaunch to finish the update now.',
      buttons: ['Install and Relaunch', 'Remind me later', 'View changelog'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (choice.response === 2) {
      await openChangelog(info);
      continue;
    }

    if (choice.response === 1) {
      await remindLater(info?.version);
      return;
    }

    await clearReminder(info?.version);
    autoUpdater.quitAndInstall();
    return;
  }
}

async function showUpdatePreviewDialog(type) {
  const win = getMainWindow();
  if (!win) {
    return;
  }

  const previewInfo = {
    version: '9.9.9',
    releaseName: 'v9.9.9',
    releaseNotes: [
      '### What is new',
      '- Added self-update support via GitHub Releases.',
      '- Added release-note changelog links.',
      '- Added remind-later and install-now choices.',
    ].join('\n'),
  };

  if (type === 'available') {
    while (true) {
      const choice = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update Available (Preview)',
        message: `Signboard ${previewInfo.version} is available.`,
        detail: [
          `Current version: ${app.getVersion()}`,
          `New version: ${previewInfo.version}`,
          '',
          formatReleaseNotesForDialog(previewInfo),
          '',
          'This is a preview only. No files will be downloaded.',
        ].join('\n'),
        buttons: ['Install now', 'Remind me later', 'View changelog'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (choice.response === 2) {
        await openChangelog(previewInfo);
        continue;
      }

      if (choice.response === 0) {
        await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Preview',
          message: 'Preview complete.',
          detail: 'In a real update, Signboard would start downloading now.',
          buttons: ['OK'],
          noLink: true,
        });
      }
      return;
    }
  }

  while (true) {
    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Ready (Preview)',
      message: `Signboard ${previewInfo.version} has been downloaded.`,
      detail: 'This is a preview only. Install and Relaunch will not restart the app.',
      buttons: ['Install and Relaunch', 'Remind me later', 'View changelog'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (choice.response === 2) {
      await openChangelog(previewInfo);
      continue;
    }

    if (choice.response === 0) {
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Preview',
        message: 'Preview complete.',
        detail: 'In a real update, Signboard would quit and install now.',
        buttons: ['OK'],
        noLink: true,
      });
    }
    return;
  }
}

async function checkForUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) {
      const win = getMainWindow();
      if (win) {
        await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Check for Updates',
          message: 'Updates are only available in packaged Signboard builds.',
          buttons: ['OK'],
          noLink: true,
        });
      }
    }
    return;
  }

  if (updateState.checkInProgress) {
    if (manual) {
      const win = getMainWindow();
      if (win) {
        await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Check for Updates',
          message: 'An update check is already running.',
          buttons: ['OK'],
          noLink: true,
        });
      }
    }
    return;
  }

  updateState.checkInProgress = true;
  updateState.activeCheckIsManual = manual;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Update check failed.', error);
    if (manual) {
      const win = getMainWindow();
      if (win) {
        await dialog.showMessageBox(win, {
          type: 'error',
          title: 'Check for Updates',
          message: 'Signboard could not check for updates.',
          detail: String(error?.message || error || 'Unknown error'),
          buttons: ['OK'],
          noLink: true,
        });
      }
    }
  } finally {
    updateState.checkInProgress = false;
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', async (info) => {
    const manual = updateState.activeCheckIsManual;
    const version = info?.version;

    if (!manual && version && !isReminderExpired(version)) {
      return;
    }

    await showUpdateAvailableDialog(info);
  });

  autoUpdater.on('update-not-available', async () => {
    const manual = updateState.activeCheckIsManual;
    if (!manual) {
      return;
    }

    const win = getMainWindow();
    if (!win) {
      return;
    }

    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Check for Updates',
      message: `You're up to date.`,
      detail: `Signboard ${app.getVersion()} is the latest version available.`,
      buttons: ['OK'],
      noLink: true,
    });
  });

  autoUpdater.on('download-progress', ({ percent }) => {
    const win = getMainWindow();
    if (!win) {
      return;
    }

    win.setProgressBar(Math.max(0, Math.min(1, Number(percent || 0) / 100)));
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updateState.downloadInProgress = false;
    const win = getMainWindow();
    if (win) {
      win.setProgressBar(-1);
    }
    await showUpdateReadyDialog(info);
  });

  autoUpdater.on('error', async (error) => {
    updateState.downloadInProgress = false;
    const win = getMainWindow();
    if (win) {
      win.setProgressBar(-1);
    }

    console.error('Updater error.', error);

    if (!updateState.activeCheckIsManual) {
      return;
    }

    if (!win) {
      return;
    }

    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Updater Error',
      message: 'Signboard encountered an updater error.',
      detail: String(error?.message || error || 'Unknown error'),
      buttons: ['OK'],
      noLink: true,
    });
  });

  // Check shortly after launch and then periodically while running.
  setTimeout(() => {
    checkForUpdates({ manual: false });
  }, 10000);
  updateState.checkIntervalId = setInterval(() => {
    checkForUpdates({ manual: false });
  }, UPDATE_CHECK_INTERVAL_MS);
}

function buildApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const isPreviewMode = !app.isPackaged || process.env.SIGNBOARD_DEBUG_UPDATER === '1';
  const createCheckForUpdatesMenuItem = () => ({
    label: 'Check for Updates...',
    click: () => {
      checkForUpdates({ manual: true });
    },
  });
  const createCopyMcpConfigMenuItem = () => ({
    label: 'Copy MCP Config',
    click: async () => {
      try {
        await copyMcpConfigToClipboard();
      } catch (error) {
        const win = getMainWindow();
        if (!win) {
          return;
        }

        await dialog.showMessageBox(win, {
          type: 'error',
          title: 'Copy MCP Config Failed',
          message: 'Signboard could not copy MCP config to the clipboard.',
          detail: String(error?.message || error || 'Unknown error'),
          buttons: ['OK'],
          noLink: true,
        });
      }
    },
  });
  const createInstallCliMenuItem = () => ({
    label: 'Install Signboard CLI',
    enabled: process.platform === 'darwin' || process.platform === 'linux',
    click: async () => {
      await installCliFromApp();
    },
  });
  const createKeyboardShortcutsMenuItem = () => ({
    label: 'Keyboard Shortcuts',
    accelerator: 'CmdOrCtrl+/',
    click: () => {
      sendToMainWindow('open-keyboard-shortcuts');
    },
  });
  const createAboutSignboardMenuItem = () => ({
    label: 'About Signboard',
    click: () => {
      sendToMainWindow('open-about-signboard');
    },
  });

  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        createAboutSignboardMenuItem(),
        { type: 'separator' },
        createCheckForUpdatesMenuItem(),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'File',
    submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }] : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
    ],
  });

  template.push({
    label: 'View',
    submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
  });

  template.push({
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])],
  });

  template.push({
    role: 'help',
    submenu: [
      !isMac ? createAboutSignboardMenuItem() : null,
      !isMac ? createCheckForUpdatesMenuItem() : null,
      createInstallCliMenuItem(),
      createCopyMcpConfigMenuItem(),
      createKeyboardShortcutsMenuItem(),
      isPreviewMode
        ? {
            label: 'Preview Update Available...',
            click: () => {
              showUpdatePreviewDialog('available');
            },
          }
        : null,
      isPreviewMode
        ? {
            label: 'Preview Update Ready...',
            click: () => {
              showUpdatePreviewDialog('ready');
            },
          }
        : null,
      {
        label: 'Signboard Releases',
        click: () => shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`),
      },
    ].filter(Boolean),
  });

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('board-call', async (event, payload = {}) => {
  const operation = typeof payload.op === 'string' ? payload.op : '';
  const args = Array.isArray(payload.args) ? payload.args : [];

  switch (operation) {
    case 'authorizeBoardSelection':
      return authorizeBoardSelectionForSender(event.sender, args[0]);

    case 'adoptLegacyBoardRoots':
      return adoptLegacyBoardRootsForSender(event.sender, args[0]);

    case 'setActiveBoardRoot':
      return authorizeTrustedBoardRootForSender(event.sender, args[0]);

    case 'clearActiveBoardRoot': {
      await stopBoardWatchForSender(event.sender);
      const state = getSenderBoardAccessState(event.sender);
      state.activeBoardRoot = '';
      return { ok: true };
    }

    case 'listLists': {
      const boardRoot = requireReadableBoardRoot(event.sender, args[0]);
      return listBoardDirectories(boardRoot);
    }

    case 'listCards': {
      const listPath = requireReadablePath(event.sender, args[0]);
      const entries = await fsPromises.readdir(listPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: 'base',
          ignorePunctuation: true,
        }));
    }

    case 'countCards': {
      const listPath = requireReadablePath(event.sender, args[0]);
      const entries = await fsPromises.readdir(listPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length;
    }

    case 'getBoardName': {
      const filePath = requireReadablePath(event.sender, args[0]);
      return path.basename(filePath);
    }

    case 'getCardID': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const cardFileName = path.basename(filePath);
      return cardFileName.slice(cardFileName.length - 8, cardFileName.length - 3);
    }

    case 'getCardTitle': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const card = await cardFrontmatter.readCard(filePath);
      return card.frontmatter.title;
    }

    case 'formatDueDate': {
      const dateString = String(args[0] || '');
      const [year, month, day] = dateString.split('-').map(Number);
      const dateToDisplay = new Date(year, month - 1, day);
      return dueDateFormatter.format(dateToDisplay);
    }

    case 'getCardFileName': {
      const filePath = requireReadablePath(event.sender, args[0]);
      return path.basename(filePath);
    }

    case 'getListDirectoryName': {
      const filePath = requireReadablePath(event.sender, args[0]);
      return path.basename(filePath);
    }

    case 'listDirectories': {
      const boardRoot = requireReadableBoardRoot(event.sender, args[0]);
      return listBoardDirectories(boardRoot, { includeArchive: true });
    }

    case 'startBoardWatch':
      return startBoardWatchForSender(event.sender, args[0]);

    case 'stopBoardWatch':
      return stopBoardWatchForSender(event.sender);

    case 'getBoardWatchToken':
      return getSenderBoardAccessState(event.sender).watchState.changeToken;

    case 'openCard': {
      const filePath = requireReadablePath(event.sender, args[0]);
      shell.showItemInFolder(filePath);
      return { ok: true };
    }

    case 'readCard': {
      const filePath = requireReadablePath(event.sender, args[0]);
      return cardFrontmatter.readCard(filePath);
    }

    case 'writeCard': {
      const filePath = requireWritablePath(event.sender, args[0]);
      const card = args[1] && typeof args[1] === 'object' ? args[1] : {};
      await cardFrontmatter.writeCard(filePath, card);
      return { ok: true };
    }

    case 'updateFrontmatter': {
      const filePath = requireWritablePath(event.sender, args[0]);
      return cardFrontmatter.updateFrontmatter(filePath, args[1]);
    }

    case 'normalizeFrontmatter':
      return cardFrontmatter.normalizeFrontmatter(args[0]);

    case 'readBoardSettings': {
      const boardRoot = requireReadableBoardRoot(event.sender, args[0]);
      return boardLabels.readBoardSettings(boardRoot);
    }

    case 'updateBoardLabels': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0], { allowTrusted: true });
      return boardLabels.updateBoardLabels(boardRoot, args[1]);
    }

    case 'updateBoardThemeOverrides': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0], { allowTrusted: true });
      return boardLabels.updateBoardThemeOverrides(boardRoot, args[1]);
    }

    case 'updateBoardSettings': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0], { allowTrusted: true });
      return boardLabels.updateBoardSettings(boardRoot, args[1]);
    }

    case 'createCard': {
      const filePath = requireWritablePath(event.sender, args[0]);
      const content = String(args[1] || '');
      const lines = content.split(/\r?\n/);
      const title = (lines.shift() || '').trim();
      const body = lines.join('\n').replace(/^\n+/, '');

      await cardFrontmatter.writeCard(filePath, {
        frontmatter: { title: title || 'Untitled' },
        body,
      });

      return { ok: true };
    }

    case 'moveCard':
    case 'moveList': {
      const sourcePath = requireWritablePath(event.sender, args[0]);
      const destinationPath = normalizeAbsolutePath(args[1]);
      if (!destinationPath) {
        throw new Error('INVALID_PATH');
      }

      const senderState = getSenderBoardAccessState(event.sender);
      const activeBoardRoot = senderState.activeBoardRoot;
      const movingBoardRoot = sourcePath === activeBoardRoot;

      if (!movingBoardRoot && !isPathInsideRoot(activeBoardRoot, destinationPath)) {
        throw new Error('UNAUTHORIZED_PATH');
      }

      await fsPromises.rename(sourcePath, destinationPath);

      if (movingBoardRoot) {
        replaceTrustedBoardRoot(sourcePath, destinationPath);
        senderState.activeBoardRoot = destinationPath;
        await stopBoardWatchForSender(event.sender);
      }

      return { ok: true };
    }

    case 'createList': {
      const listPath = requireWritablePath(event.sender, args[0]);
      await fsPromises.mkdir(listPath);
      return { ok: true };
    }

    case 'deleteList': {
      const listPath = requireWritablePath(event.sender, args[0]);
      await fsPromises.rmdir(listPath);
      return { ok: true };
    }

    case 'importFromTrello': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0]);
      const entries = await fsPromises.readdir(boardRoot, { withFileTypes: true });
      if (entries.some((entry) => entry.isDirectory())) {
        return { ok: true, imported: false };
      }

      const jsonPath = path.join(boardRoot, 'trello.json');
      try {
        await fsPromises.access(jsonPath, fs.constants.F_OK);
      } catch {
        return { ok: true, imported: false };
      }

      const raw = await fsPromises.readFile(jsonPath, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.cards) || !Array.isArray(data.lists)) {
        throw new Error('INVALID_TRELLO_EXPORT');
      }

      const listMap = {};
      const cardsByList = {};

      for (const list of data.lists) {
        listMap[list.id] = list.name;
      }

      for (const card of data.cards) {
        const listName = listMap[card.idList] || 'UnknownList';
        if (!cardsByList[listName]) {
          cardsByList[listName] = [];
        }
        cardsByList[listName].push(card);
      }

      let listCount = 0;
      for (const [listName, cards] of Object.entries(cardsByList)) {
        const listNumber = listCount.toString().padStart(3, '0');
        const folder = path.join(boardRoot, `${listNumber}-${sanitizeImportedName(listName)}-trelo`);
        await fsPromises.mkdir(folder, { recursive: true });
        listCount += 1;

        cards.sort((left, right) => (left.pos ?? 0) - (right.pos ?? 0));

        for (const [index, card] of cards.entries()) {
          const number = String(index + 1).padStart(3, '0');
          const fileName = `${number}-${await sanitizeImportedCardFileName(card.name)}-${importedRandomSuffix()}.md`;
          const filePath = path.join(folder, fileName);

          await cardFrontmatter.writeCard(filePath, {
            frontmatter: { title: escapeMarkdownTitle(card.name) },
            body: card.desc || '',
          });
        }
      }

      await fsPromises.mkdir(path.join(boardRoot, 'XXX-Archive'), { recursive: true });
      return { ok: true, imported: true };
    }

    default:
      throw new Error(`UNKNOWN_BOARD_OPERATION:${operation}`);
  }
});

ipcMain.handle('choose-directory', async (event, { defaultPath } = {}) => {
  const result = await dialog.showOpenDialog({
    title: 'Select a folder',
    buttonLabel: 'Choose',
    defaultPath,
    properties: [
      'openDirectory',
      'createDirectory',
      // 'dontAddToRecent', // optional
    ],
  });
  if (result.canceled) return null;

  const selectedPath = normalizeAbsolutePath(result.filePaths[0] || '');
  if (!selectedPath) {
    return null;
  }

  return {
    path: selectedPath,
    token: storePendingDirectorySelection(event.sender, selectedPath),
  };
});

ipcMain.handle('share-file', async (event, filePath) => {
  let normalizedPath = '';
  try {
    normalizedPath = requireReadablePath(event.sender, filePath);
  } catch {
    return { ok: false, error: 'INVALID_PATH' };
  }

  try {
    await fsPromises.access(normalizedPath);
  } catch {
    return { ok: false, error: 'FILE_NOT_FOUND' };
  }

  if (typeof ShareMenu !== 'function') {
    return { ok: false, error: 'UNSUPPORTED' };
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return { ok: false, error: 'NO_WINDOW' };
  }

  try {
    const shareMenu = new ShareMenu({ filePaths: [normalizedPath] });
    shareMenu.popup({ window: win });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'SHARE_FAILED' };
  }
});

ipcMain.handle('open-external-url', async (_event, rawUrl) => {
  const candidate = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!candidate) {
    return { ok: false, error: 'INVALID_URL' };
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    return { ok: false, error: 'INVALID_URL' };
  }

  if (!['http:', 'https:', 'mailto:'].includes(parsedUrl.protocol)) {
    return { ok: false, error: 'UNSUPPORTED_PROTOCOL' };
  }

  try {
    await shell.openExternal(parsedUrl.href);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'OPEN_EXTERNAL_FAILED' };
  }
});

ipcMain.handle('get-app-info', async () => ({
  appName: app.getName(),
  appVersion: app.getVersion(),
  authorName: APP_AUTHOR_NAME,
  authorUrl: APP_AUTHOR_URL,
  copyright: APP_COPYRIGHT,
  license: APP_LICENSE,
  websiteUrl: APP_WEBSITE_URL,
}));

ipcMain.handle('notify-due-cards', async (_event, payload = {}) => {
  if (typeof Notification.isSupported === 'function' && !Notification.isSupported()) {
    return { ok: false, error: 'UNSUPPORTED' };
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'Signboard';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (!body) {
    return { ok: false, error: 'INVALID_BODY' };
  }

  try {
    const notification = new Notification({
      title,
      body,
      silent: false,
    });

    notification.show();
    return { ok: true };
  } catch (error) {
    console.error('Failed to show due-card notification.', error);
    return { ok: false, error: error?.message || 'NOTIFICATION_FAILED' };
  }
});

ipcMain.handle('check-for-updates', async () => {
  await checkForUpdates({ manual: true });
  return { ok: true };
});

app.whenReady().then(async () => {
  if (isMcpConfigMode) {
    printMcpConfigToStdout();
    app.quit();
    return;
  }

  if (isMcpServerMode) {
    if (!isMcpPowerSaveBlockerActive()) {
      mcpPowerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    }

    if (app.dock && typeof app.dock.hide === 'function') {
      app.dock.hide();
    }

    await startSignboardMcpServer({
      appVersion: app.getVersion(),
      onStop: () => {
        if (isMcpPowerSaveBlockerActive()) {
          powerSaveBlocker.stop(mcpPowerSaveBlockerId);
        }
        mcpPowerSaveBlockerId = null;
        app.quit();
      },
    });
    return;
  }

  if (isCliMode) {
    if (app.dock && typeof app.dock.hide === 'function') {
      app.dock.hide();
    }

    let exitCode = 0;
    try {
      exitCode = await runCli(signboardArgs, {
        commandName: app.isPackaged ? 'Signboard' : 'signboard',
        stdout: process.stdout,
        stderr: process.stderr,
      });
    } catch (error) {
      console.error(error.message || error);
      exitCode = 1;
    }

    app.exit(Number.isInteger(exitCode) ? exitCode : 0);
    return;
  }

  await loadUpdatePreferences();
  createWindow();
  buildApplicationMenu();
  setupAutoUpdater();
});

app.on('activate', () => {
  if (isCliMode) {
    return;
  }

  const win = ensureMainWindowVisible();
  if (win) {
    return;
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;

  if (isMcpPowerSaveBlockerActive()) {
    powerSaveBlocker.stop(mcpPowerSaveBlockerId);
  }
  mcpPowerSaveBlockerId = null;

  if (updateState.checkIntervalId) {
    clearInterval(updateState.checkIntervalId);
    updateState.checkIntervalId = null;
  }
});

app.on('window-all-closed', () => {
  if (isMcpServerMode || isCliMode) {
    return;
  }

  app.quit();
});
