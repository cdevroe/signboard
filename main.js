/*!
 * Signboard - A local-first Kanban app that writes Markdown
 * Copyright (c) 2025-2026 Colin Devroe - cdevroe.com
 * Licensed under the MIT License. See LICENSE file for details.
 */

const { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, Notification, ShareMenu, shell, powerSaveBlocker, nativeImage, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createHash, randomUUID } = require('crypto');
const fs = require('fs');
const fsPromises = fs.promises;
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const cardFrontmatter = require('./lib/cardFrontmatter');
const { readCardWithTimestamps } = require('./lib/cardTimestamps');
const { insertCardFileAtTop } = require('./lib/cardOrdering');
const { prepareNewCardFrontmatter } = require('./lib/cardLifecycle');
const {
  archiveCard,
  archiveList,
  listArchiveEntries,
  readArchiveEntry,
  recordCardListMove,
  restoreArchivedCard,
  restoreArchivedList,
} = require('./lib/archive');
const boardLabels = require('./lib/boardLabels');
const appSettings = require('./lib/appSettings');
const { buildExternalPublishedCalendarFeed } = require('./lib/externalPublishedCalendar');
const { importTrello, importObsidian, importTasksMd } = require('./lib/importers');
const obsidianIntegration = require('./lib/obsidianIntegration');
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
const LINKED_OBJECT_ICON_DIRECTORY = 'linked-object-icons';
const LINKED_OBJECT_ICON_MAX_BYTES = 256 * 1024;
const LINKED_OBJECT_ICON_FETCH_TIMEOUT_MS = 3500;
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

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
}

function formatDueDateValue(rawDateValue) {
  const dateString = String(rawDateValue || '').trim();
  if (!dateString) {
    return '';
  }

  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return dateString;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dateToDisplay = new Date(year, monthIndex, day);

  if (
    Number.isNaN(dateToDisplay.getTime()) ||
    dateToDisplay.getFullYear() !== year ||
    dateToDisplay.getMonth() !== monthIndex ||
    dateToDisplay.getDate() !== day
  ) {
    return dateString;
  }

  return dueDateFormatter.format(dateToDisplay);
}

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

  if (secondArg) {
    try {
      if (fs.statSync(secondArg).isDirectory()) {
        return argv.slice(2);
      }
    } catch {
      // Ignore values that are not filesystem paths.
    }
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
let pendingRendererContextMenuTimer = null;
let registeredQuickAddGlobalShortcut = '';
let quickAddGlobalShortcutStatus = {
  accelerator: '',
  registered: false,
  message: '',
};
let externalPublishedCalendarServer = null;
let externalPublishedCalendarSettings = appSettings.DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS();
let externalPublishedCalendarStatus = {
  enabled: false,
  running: false,
  port: externalPublishedCalendarSettings.port,
  url: '',
  message: 'Disabled',
};
let pendingSignboardProtocolUrl = '';

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

function storePendingSelection(sender, targetPath, kind = 'path') {
  const normalizedTargetPath = normalizeAbsolutePath(targetPath);
  if (!normalizedTargetPath) {
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
    path: normalizedTargetPath,
    kind,
    expiresAt: now + DIRECTORY_SELECTION_MAX_AGE_MS,
  });

  return token;
}

function consumePendingSelection(sender, token, expectedKinds = []) {
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

  const allowedKinds = Array.isArray(expectedKinds) ? expectedKinds : [];
  if (allowedKinds.length > 0 && !allowedKinds.includes(selection.kind)) {
    return '';
  }

  return normalizeAbsolutePath(selection.path);
}

function storePendingDirectorySelection(sender, directoryPath) {
  return storePendingSelection(sender, directoryPath, 'directory');
}

function consumePendingDirectorySelection(sender, token) {
  return consumePendingSelection(sender, token, ['directory']);
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

function requireWritablePath(sender, candidatePath, options = {}) {
  const normalizedPath = normalizeAbsolutePath(candidatePath);
  if (!normalizedPath) {
    throw new Error('INVALID_PATH');
  }

  const senderState = getSenderBoardAccessState(sender);
  if (senderState.activeBoardRoot && isPathInsideRoot(senderState.activeBoardRoot, normalizedPath)) {
    return normalizedPath;
  }

  if (options.allowTrusted === true) {
    const trustedRoots = readTrustedBoardRoots();
    for (const trustedRoot of trustedRoots) {
      if (isPathInsideRoot(trustedRoot, normalizedPath)) {
        return normalizedPath;
      }
    }
  }

  throw new Error('UNAUTHORIZED_PATH');
}

function requireActiveBoardRootForSender(sender) {
  const senderState = getSenderBoardAccessState(sender);
  const activeBoardRoot = typeof senderState.activeBoardRoot === 'string'
    ? senderState.activeBoardRoot
    : '';
  if (!activeBoardRoot) {
    throw new Error('UNAUTHORIZED_BOARD_ROOT');
  }

  return activeBoardRoot;
}

function resolveTrustedBoardRootForPath(sender, candidatePath) {
  const normalizedPath = normalizeAbsolutePath(candidatePath);
  if (!normalizedPath) {
    return '';
  }

  const senderState = getSenderBoardAccessState(sender);
  if (senderState.activeBoardRoot && isPathInsideRoot(senderState.activeBoardRoot, normalizedPath)) {
    return senderState.activeBoardRoot;
  }

  const trustedRoots = readTrustedBoardRoots();
  for (const trustedRoot of trustedRoots) {
    if (isPathInsideRoot(trustedRoot, normalizedPath)) {
      return trustedRoot;
    }
  }

  return '';
}

function requireWritableBoardCardPath(sender, candidateBoardRoot, candidatePath) {
  const normalizedPath = requireWritablePath(sender, candidatePath, { allowTrusted: true });
  const requestedBoardRoot = resolveReadableBoardRoot(sender, candidateBoardRoot);
  if (requestedBoardRoot && isPathInsideRoot(requestedBoardRoot, normalizedPath)) {
    return {
      boardRoot: requestedBoardRoot,
      filePath: normalizedPath,
    };
  }

  const resolvedBoardRoot = resolveTrustedBoardRootForPath(sender, normalizedPath);
  if (!resolvedBoardRoot) {
    throw new Error('UNAUTHORIZED_BOARD_ROOT');
  }

  return {
    boardRoot: resolvedBoardRoot,
    filePath: normalizedPath,
  };
}

function requireReadableBoardCardPath(sender, candidateBoardRoot, candidatePath) {
  const normalizedPath = requireReadablePath(sender, candidatePath);
  const requestedBoardRoot = resolveReadableBoardRoot(sender, candidateBoardRoot);
  if (requestedBoardRoot && isPathInsideRoot(requestedBoardRoot, normalizedPath)) {
    return {
      boardRoot: requestedBoardRoot,
      filePath: normalizedPath,
    };
  }

  const resolvedBoardRoot = resolveTrustedBoardRootForPath(sender, normalizedPath);
  if (!resolvedBoardRoot) {
    throw new Error('UNAUTHORIZED_BOARD_ROOT');
  }

  return {
    boardRoot: resolvedBoardRoot,
    filePath: normalizedPath,
  };
}

function normalizeLinkedObjectList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function getLinkedObjectKey(linkedObject = {}) {
  const type = String(linkedObject.type || '').trim();
  if (!type) {
    return '';
  }

  if (type === 'file' || type === 'folder') {
    return `${type}:${normalizeAbsolutePath(linkedObject.path)}`;
  }

  if (type === 'url') {
    return `url:${String(linkedObject.url || '').trim()}`;
  }

  if (type === 'app-link' || type === 'signboard-link') {
    return `${type}:${String(linkedObject.url || linkedObject.target || '').trim()}`;
  }

  if (type === 'obsidian-note') {
    return `obsidian-note:${normalizeAbsolutePath(linkedObject.path) || String(linkedObject.target || '').trim()}`;
  }

  return `${type}:${String(linkedObject.target || linkedObject.url || linkedObject.path || linkedObject.title || '').trim()}`;
}

function addLinkedObjectToList(existingObjects, nextObject) {
  const objects = normalizeLinkedObjectList(existingObjects);
  const nextKey = getLinkedObjectKey(nextObject);
  if (!nextKey) {
    return objects;
  }

  const filtered = objects.filter((object) => getLinkedObjectKey(object) !== nextKey);
  filtered.push(nextObject);
  return filtered;
}

function replaceLinkedObjectInList(existingObjects, previousObject, nextObject) {
  const objects = normalizeLinkedObjectList(existingObjects);
  const previousKey = getLinkedObjectKey(previousObject);
  const nextKey = getLinkedObjectKey(nextObject);
  if (!nextKey) {
    return objects;
  }

  const filtered = objects.filter((object) => {
    const objectKey = getLinkedObjectKey(object);
    return objectKey !== previousKey && objectKey !== nextKey;
  });
  filtered.push(nextObject);
  return filtered;
}

function getLinkedObjectIconCacheDir() {
  return path.join(app.getPath('userData'), LINKED_OBJECT_ICON_DIRECTORY);
}

function getUrlHash(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function getFaviconExtension(contentType = '') {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('svg')) return '.svg';
  if (normalized.includes('webp')) return '.webp';
  return '.ico';
}

async function fetchWithTimeout(url, options = {}) {
  if (typeof fetch !== 'function') {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINKED_OBJECT_ICON_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function tryCacheFaviconFromUrl(iconUrl, cacheBaseName) {
  let response = null;
  try {
    response = await fetchWithTimeout(iconUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
  } catch {
    return '';
  }

  if (!response || !response.ok) {
    return '';
  }

  const contentType = response.headers.get('content-type') || '';
  if (!/^image\//i.test(contentType) && !/icon/i.test(contentType)) {
    return '';
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > LINKED_OBJECT_ICON_MAX_BYTES) {
    return '';
  }

  const cacheDir = getLinkedObjectIconCacheDir();
  await fsPromises.mkdir(cacheDir, { recursive: true });
  const iconPath = path.join(cacheDir, `${cacheBaseName}${getFaviconExtension(contentType)}`);
  await fsPromises.writeFile(iconPath, Buffer.from(arrayBuffer));
  return iconPath;
}

async function cacheFaviconForUrl(url) {
  if (process.env.SIGNBOARD_TEST_DISABLE_FAVICON_FETCH === '1') {
    return '';
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(String(url || ''));
  } catch {
    return '';
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return '';
  }

  const cacheBaseName = getUrlHash(`${parsedUrl.protocol}//${parsedUrl.host}`).slice(0, 32);
  const cacheDir = getLinkedObjectIconCacheDir();
  try {
    const existingEntries = await fsPromises.readdir(cacheDir);
    const existingIcon = existingEntries.find((entry) => entry.startsWith(`${cacheBaseName}.`));
    if (existingIcon) {
      return path.join(cacheDir, existingIcon);
    }
  } catch {
    // Cache directory may not exist yet.
  }

  const candidates = [new URL('/favicon.ico', parsedUrl.origin).href];
  try {
    const pageResponse = await fetchWithTimeout(parsedUrl.href, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (pageResponse && pageResponse.ok && String(pageResponse.headers.get('content-type') || '').includes('html')) {
      const html = await pageResponse.text();
      const iconMatch = html.match(/<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/i);
      const hrefMatch = iconMatch && iconMatch[0].match(/\shref=["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        candidates.unshift(new URL(hrefMatch[1], parsedUrl.href).href);
      }
    }
  } catch {
    // Fall back to /favicon.ico.
  }

  for (const candidate of [...new Set(candidates)]) {
    const iconPath = await tryCacheFaviconFromUrl(candidate, cacheBaseName);
    if (iconPath) {
      return iconPath;
    }
  }

  return '';
}

function getDisplayNameForPath(targetPath) {
  const normalizedPath = normalizeAbsolutePath(targetPath);
  if (!normalizedPath) {
    return '';
  }

  return path.basename(normalizedPath.replace(/[\\/]+$/, '')) || normalizedPath;
}

function validateExternalAppUrl(rawUrl, { allowWeb = false } = {}) {
  const candidate = String(rawUrl || '').trim();
  if (!candidate) {
    return null;
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    return null;
  }

  const blockedProtocols = new Set(['file:', 'javascript:', 'data:']);
  if (blockedProtocols.has(parsedUrl.protocol)) {
    return null;
  }

  if (!allowWeb && ['http:', 'https:'].includes(parsedUrl.protocol)) {
    return null;
  }

  return parsedUrl;
}

function normalizeWebUrlCandidate(rawUrl) {
  const rawCandidate = String(rawUrl || '').trim();
  if (!rawCandidate) {
    return null;
  }

  const candidate = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawCandidate)
    ? rawCandidate
    : `https://${rawCandidate}`;

  try {
    const parsedUrl = new URL(candidate);
    return ['http:', 'https:'].includes(parsedUrl.protocol) ? parsedUrl : null;
  } catch {
    return null;
  }
}

async function buildLinkedObjectFromRendererInput(sender, input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const requestedType = String(source.type || '').trim();

  if (requestedType === 'file' || requestedType === 'folder') {
    let selectedPath = consumePendingSelection(sender, source.token, ['file', 'directory']);
    if (!selectedPath && process.env.SIGNBOARD_TEST_ALLOW_DIRECT_LINKED_OBJECT_PATHS === '1') {
      selectedPath = normalizeAbsolutePath(source.path);
    }
    if (!selectedPath) {
      throw new Error('INVALID_SELECTION_TOKEN');
    }

    const stats = await fsPromises.stat(selectedPath);
    const type = stats.isDirectory() ? 'folder' : 'file';
    return {
      type,
      title: String(source.title || '').trim() || getDisplayNameForPath(selectedPath),
      path: selectedPath,
    };
  }

  if (requestedType === 'url') {
    const parsedUrl = normalizeWebUrlCandidate(source.url);
    if (!parsedUrl) {
      throw new Error('INVALID_URL');
    }

    const faviconPath = await cacheFaviconForUrl(parsedUrl.href);
    return {
      type: 'url',
      title: String(source.title || '').trim() || parsedUrl.hostname || parsedUrl.href,
      url: parsedUrl.href,
      ...(faviconPath ? { faviconPath } : {}),
    };
  }

  if (requestedType === 'app-link' || requestedType === 'signboard-link') {
    const parsedUrl = validateExternalAppUrl(source.url || source.target, { allowWeb: false });
    if (!parsedUrl) {
      throw new Error('INVALID_URL');
    }

    const type = parsedUrl.protocol === 'signboard:' ? 'signboard-link' : 'app-link';
    return {
      type,
      title: String(source.title || '').trim() || (type === 'signboard-link' ? 'Signboard link' : parsedUrl.protocol.replace(/:$/, '')),
      url: parsedUrl.href,
    };
  }

  if (requestedType === 'obsidian-note') {
    let notePath = consumePendingSelection(sender, source.token, ['file']);
    if (!notePath && process.env.SIGNBOARD_TEST_ALLOW_DIRECT_LINKED_OBJECT_PATHS === '1') {
      notePath = normalizeAbsolutePath(source.path);
    }
    if (!notePath) {
      notePath = normalizeAbsolutePath(source.path);
    }
    const title = String(source.title || '').trim();
    return {
      type: 'obsidian-note',
      ...(title ? { title } : {}),
      target: String(source.target || '').trim(),
      ...(notePath ? { path: notePath } : {}),
    };
  }

  throw new Error('UNSUPPORTED_LINKED_OBJECT_TYPE');
}

async function buildLinkedObjectFromLocalPath(localPath) {
  const selectedPath = normalizeAbsolutePath(localPath);
  if (!selectedPath) {
    return null;
  }

  let stats = null;
  try {
    stats = await fsPromises.stat(selectedPath);
  } catch {
    return null;
  }

  const type = stats.isDirectory() ? 'folder' : 'file';
  return {
    type,
    title: getDisplayNameForPath(selectedPath),
    path: selectedPath,
  };
}

async function writeDroppedLinkedObjectsToCard(event, cardPath, droppedPaths) {
  const filePath = requireWritablePath(event.sender, cardPath, { allowTrusted: true });
  const normalizedPaths = Array.isArray(droppedPaths)
    ? droppedPaths.map((droppedPath) => normalizeAbsolutePath(droppedPath)).filter(Boolean)
    : [];

  if (normalizedPaths.length === 0) {
    return { ok: false, error: 'NO_DROPPED_FILES' };
  }

  const currentCard = await cardFrontmatter.readCard(filePath);
  let nextLinkedObjects = currentCard.frontmatter.linked_objects;
  const linkedObjects = [];

  for (const droppedPath of normalizedPaths.slice(0, 25)) {
    const linkedObject = await buildLinkedObjectFromLocalPath(droppedPath);
    if (!linkedObject) {
      continue;
    }

    nextLinkedObjects = addLinkedObjectToList(nextLinkedObjects, linkedObject);
    linkedObjects.push(linkedObject);
  }

  if (linkedObjects.length === 0) {
    return { ok: false, error: 'NO_SUPPORTED_DROPPED_FILES' };
  }

  const nextFrontmatter = normalizeCardFrontmatterForBoardPath(event.sender, filePath, {
    ...currentCard.frontmatter,
    linked_objects: normalizeLinkedObjectList(nextLinkedObjects),
  });

  await cardFrontmatter.writeCard(filePath, {
    frontmatter: nextFrontmatter,
    body: currentCard.body,
  });
  await autoSyncManagedObsidianBaseForCardPath(event.sender, filePath);

  return {
    ok: true,
    linkedObjects,
    frontmatter: nextFrontmatter,
  };
}

async function writeLinkedObjectToCard(event, cardPath, input) {
  const filePath = requireWritablePath(event.sender, cardPath, { allowTrusted: true });
  const linkedObject = await buildLinkedObjectFromRendererInput(event.sender, input);
  const currentCard = await cardFrontmatter.readCard(filePath);
  const nextFrontmatter = normalizeCardFrontmatterForBoardPath(event.sender, filePath, {
    ...currentCard.frontmatter,
    linked_objects: addLinkedObjectToList(currentCard.frontmatter.linked_objects, linkedObject),
  });

  await cardFrontmatter.writeCard(filePath, {
    frontmatter: nextFrontmatter,
    body: currentCard.body,
  });
  await autoSyncManagedObsidianBaseForCardPath(event.sender, filePath);

  return {
    ok: true,
    linkedObject,
    frontmatter: nextFrontmatter,
  };
}

async function openLinkedObjectFromRenderer(event, cardPath, input) {
  requireReadablePath(event.sender, cardPath);
  const linkedObject = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const type = String(linkedObject.type || '').trim();
  const skippedExternalOpen = process.env.SIGNBOARD_TEST_DISABLE_EXTERNAL_OPEN === '1';
  let openTarget = '';

  if (type === 'obsidian-note') {
    const relatedTarget = String(linkedObject.target || linkedObject.raw || '').trim();
    if (relatedTarget) {
      const resolvedNote = await obsidianIntegration.resolveObsidianRelatedNote({
        cardPath,
        related: relatedTarget,
      });
      if (resolvedNote.ok) {
        openTarget = resolvedNote.obsidianUri;
      } else {
        return resolvedNote;
      }
    }

    if (!openTarget) {
      const notePath = normalizeAbsolutePath(linkedObject.path);
      if (notePath) {
        try {
          await fsPromises.access(notePath);
          openTarget = obsidianIntegration.buildObsidianOpenUri(notePath);
        } catch {
          openTarget = '';
        }
      }
    }

    if (!openTarget) {
      return { ok: false, error: 'NOTE_NOT_FOUND' };
    }

    if (!skippedExternalOpen) {
      await shell.openExternal(openTarget);
    }
    return { ok: true, type, openTarget, skippedExternalOpen };
  }

  if (type === 'file' || type === 'folder') {
    const targetPath = normalizeAbsolutePath(linkedObject.path);
    if (!targetPath) {
      return { ok: false, error: 'INVALID_PATH' };
    }

    if (!skippedExternalOpen) {
      const errorMessage = await shell.openPath(targetPath);
      if (errorMessage) {
        return { ok: false, error: errorMessage };
      }
    }
    return { ok: true, type, openTarget: targetPath, skippedExternalOpen };
  }

  if (type === 'url') {
    const parsedUrl = validateExternalAppUrl(linkedObject.url, { allowWeb: true });
    if (!parsedUrl || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { ok: false, error: 'INVALID_URL' };
    }

    if (!skippedExternalOpen) {
      await shell.openExternal(parsedUrl.href);
    }
    return { ok: true, type, openTarget: parsedUrl.href, skippedExternalOpen };
  }

  if (type === 'app-link' || type === 'signboard-link') {
    const parsedUrl = validateExternalAppUrl(linkedObject.url || linkedObject.target, { allowWeb: false });
    if (!parsedUrl) {
      return { ok: false, error: 'INVALID_URL' };
    }

    if (parsedUrl.protocol === 'signboard:') {
      if (!skippedExternalOpen) {
        await dispatchSignboardProtocolUrl(parsedUrl.href);
      }
      return { ok: true, type: 'signboard-link', openTarget: parsedUrl.href, skippedExternalOpen };
    }

    if (!skippedExternalOpen) {
      await shell.openExternal(parsedUrl.href);
    }
    return { ok: true, type, openTarget: parsedUrl.href, skippedExternalOpen };
  }

  return { ok: false, error: 'UNSUPPORTED_LINKED_OBJECT_TYPE' };
}

async function getLinkedObjectStatusFromRenderer(event, cardPath, input) {
  requireReadablePath(event.sender, cardPath);
  const linkedObject = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const type = String(linkedObject.type || '').trim();

  if (type === 'obsidian-note') {
    const relatedTarget = String(linkedObject.target || linkedObject.raw || '').trim();
    if (relatedTarget) {
      const resolvedNote = await obsidianIntegration.resolveObsidianRelatedNote({
        cardPath,
        related: relatedTarget,
      });
      if (resolvedNote.ok) {
        return {
          ok: true,
          type,
          status: 'available',
          missing: false,
          notePath: resolvedNote.notePath,
          obsidianUri: resolvedNote.obsidianUri,
        };
      }

      return {
        ok: true,
        type,
        status: resolvedNote.error === 'NOTE_NOT_FOUND' ? 'missing' : 'unavailable',
        missing: resolvedNote.error === 'NOTE_NOT_FOUND',
        error: resolvedNote.error,
        notePath: resolvedNote.notePath || '',
        vaultRoot: resolvedNote.vaultRoot || '',
      };
    }

    const notePath = normalizeAbsolutePath(linkedObject.path);
    if (!notePath) {
      return { ok: true, type, status: 'missing', missing: true, error: 'NOTE_NOT_FOUND' };
    }

    try {
      await fsPromises.access(notePath);
      return {
        ok: true,
        type,
        status: 'available',
        missing: false,
        notePath,
        obsidianUri: obsidianIntegration.buildObsidianOpenUri(notePath),
      };
    } catch {
      return { ok: true, type, status: 'missing', missing: true, error: 'NOTE_NOT_FOUND', notePath };
    }
  }

  if (type === 'file' || type === 'folder') {
    const targetPath = normalizeAbsolutePath(linkedObject.path);
    if (!targetPath) {
      return { ok: true, type, status: 'missing', missing: true, error: 'INVALID_PATH' };
    }

    try {
      await fsPromises.access(targetPath);
      return { ok: true, type, status: 'available', missing: false, path: targetPath };
    } catch {
      return { ok: true, type, status: 'missing', missing: true, error: 'PATH_NOT_FOUND', path: targetPath };
    }
  }

  return { ok: true, type, status: 'unknown', missing: false };
}

async function getMissingObsidianNoteRecreatePath(cardPath, linkedObject) {
  const relatedTarget = String(linkedObject.target || linkedObject.raw || '').trim();
  if (relatedTarget) {
    const resolvedNote = await obsidianIntegration.resolveObsidianRelatedNote({
      cardPath,
      related: relatedTarget,
    });
    if (resolvedNote.ok) {
      return {
        ok: false,
        error: 'NOTE_ALREADY_EXISTS',
        notePath: resolvedNote.notePath,
        linkTarget: relatedTarget,
      };
    }
    if (resolvedNote.error === 'NOTE_NOT_FOUND' && resolvedNote.notePath) {
      return {
        ok: true,
        notePath: resolvedNote.notePath,
        linkTarget: relatedTarget,
      };
    }
    return {
      ok: false,
      error: resolvedNote.error || 'NOTE_NOT_FOUND',
      notePath: resolvedNote.notePath || '',
    };
  }

  const notePath = normalizeAbsolutePath(linkedObject.path);
  if (!notePath) {
    return { ok: false, error: 'NOTE_NOT_FOUND', notePath: '' };
  }

  try {
    await fsPromises.access(notePath);
    return { ok: false, error: 'NOTE_ALREADY_EXISTS', notePath };
  } catch {
    return { ok: true, notePath, linkTarget: '' };
  }
}

async function recreateLinkedObsidianNoteFromRenderer(event, boardRootInput, cardPathInput, input) {
  const { boardRoot, filePath } = requireWritableBoardCardPath(event.sender, boardRootInput, cardPathInput);
  const linkedObject = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (String(linkedObject.type || '').trim() !== 'obsidian-note') {
    return { ok: false, error: 'UNSUPPORTED_LINKED_OBJECT_TYPE' };
  }

  const card = await cardFrontmatter.readCard(filePath);
  const recreateTarget = await getMissingObsidianNoteRecreatePath(filePath, linkedObject);
  if (!recreateTarget.ok) {
    return recreateTarget;
  }

  const result = await obsidianIntegration.createLinkedObsidianNoteAtPath({
    boardRoot,
    cardPath: filePath,
    card,
    notePath: recreateTarget.notePath,
  });
  if (!result.ok) {
    return result;
  }

  const linkTarget = recreateTarget.linkTarget || result.linkTarget;
  const nextLinkedObject = await buildLinkedObjectFromRendererInput(event.sender, {
    type: 'obsidian-note',
    target: linkTarget,
    path: result.notePath,
  });
  const nextRelated = obsidianIntegration.addUniqueStringListValue(card.frontmatter.related, linkTarget);
  const nextFrontmatter = obsidianIntegration.normalizeSignboardCardFrontmatter({
    boardRoot,
    cardPath: filePath,
    frontmatter: {
      ...card.frontmatter,
      linked_objects: replaceLinkedObjectInList(card.frontmatter.linked_objects, linkedObject, nextLinkedObject),
      related: nextRelated,
    },
  });

  await cardFrontmatter.writeCard(filePath, {
    frontmatter: nextFrontmatter,
    body: card.body,
  });
  await autoSyncManagedObsidianBaseForBoard(boardRoot);

  return {
    ...result,
    ok: true,
    linkedObject: nextLinkedObject,
    frontmatter: nextFrontmatter,
  };
}

async function relinkObsidianNoteFromRenderer(event, boardRootInput, cardPathInput, previousInput, nextInput) {
  const { boardRoot, filePath } = requireWritableBoardCardPath(event.sender, boardRootInput, cardPathInput);
  const previousObject = previousInput && typeof previousInput === 'object' && !Array.isArray(previousInput) ? previousInput : {};
  const nextSource = nextInput && typeof nextInput === 'object' && !Array.isArray(nextInput) ? nextInput : {};
  if (String(previousObject.type || '').trim() !== 'obsidian-note') {
    return { ok: false, error: 'UNSUPPORTED_LINKED_OBJECT_TYPE' };
  }

  const notePath = consumePendingSelection(event.sender, nextSource.token, ['file'])
    || (process.env.SIGNBOARD_TEST_ALLOW_DIRECT_LINKED_OBJECT_PATHS === '1' ? normalizeAbsolutePath(nextSource.path) : '');
  if (!notePath) {
    return { ok: false, error: 'INVALID_SELECTION_TOKEN' };
  }
  if (path.extname(notePath).toLowerCase() !== '.md') {
    return { ok: false, error: 'INVALID_OBSIDIAN_NOTE' };
  }

  const vaultRoot = await obsidianIntegration.findObsidianVaultRoot(filePath);
  if (!vaultRoot) {
    return { ok: false, error: 'NOT_IN_OBSIDIAN_VAULT' };
  }
  if (!isPathInsideRoot(vaultRoot, notePath)) {
    return { ok: false, error: 'NOTE_OUTSIDE_OBSIDIAN_VAULT' };
  }

  const linkTarget = `[[${obsidianIntegration.toObsidianLinkTarget(vaultRoot, notePath)}]]`;
  const nextLinkedObject = await buildLinkedObjectFromRendererInput(event.sender, {
    type: 'obsidian-note',
    title: String(nextSource.title || path.basename(notePath, path.extname(notePath)) || '').trim(),
    target: linkTarget,
    path: notePath,
  });
  const currentCard = await cardFrontmatter.readCard(filePath);
  const nextRelated = obsidianIntegration.normalizeStringList(currentCard.frontmatter.related)
    .filter((item) => item !== previousObject.target && item !== previousObject.raw);
  if (!nextRelated.includes(linkTarget)) {
    nextRelated.push(linkTarget);
  }

  const nextFrontmatter = obsidianIntegration.normalizeSignboardCardFrontmatter({
    boardRoot,
    cardPath: filePath,
    frontmatter: {
      ...currentCard.frontmatter,
      linked_objects: replaceLinkedObjectInList(currentCard.frontmatter.linked_objects, previousObject, nextLinkedObject),
      related: nextRelated,
    },
  });

  await cardFrontmatter.writeCard(filePath, {
    frontmatter: nextFrontmatter,
    body: currentCard.body,
  });
  await autoSyncManagedObsidianBaseForBoard(boardRoot);

  return {
    ok: true,
    linkedObject: nextLinkedObject,
    frontmatter: nextFrontmatter,
    notePath,
    linkTarget,
  };
}

function isBoardCardPath(boardRoot, candidatePath) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  const normalizedPath = normalizeAbsolutePath(candidatePath);
  if (!normalizedBoardRoot || !normalizedPath || !normalizedPath.endsWith('.md')) {
    return false;
  }

  if (!isPathInsideRoot(normalizedBoardRoot, normalizedPath)) {
    return false;
  }

  const parentDirectory = path.dirname(normalizedPath);
  if (parentDirectory === normalizedBoardRoot) {
    return false;
  }

  return path.basename(normalizedPath) !== 'board-settings.md';
}

function normalizeCardFrontmatterForBoardPath(sender, cardPath, frontmatter = {}) {
  const boardRoot = resolveTrustedBoardRootForPath(sender, cardPath);
  if (!isBoardCardPath(boardRoot, cardPath)) {
    return frontmatter;
  }

  return obsidianIntegration.normalizeSignboardCardFrontmatter({
    boardRoot,
    cardPath,
    frontmatter,
  });
}

async function refreshCardSignboardMetadata(boardRoot, cardPath) {
  if (!isBoardCardPath(boardRoot, cardPath)) {
    return null;
  }

  const card = await cardFrontmatter.readCard(cardPath);
  const nextFrontmatter = obsidianIntegration.normalizeSignboardCardFrontmatter({
    boardRoot,
    cardPath,
    frontmatter: card.frontmatter,
  });

  await cardFrontmatter.writeCard(cardPath, {
    frontmatter: nextFrontmatter,
    body: card.body,
  });

  return nextFrontmatter;
}

async function refreshBoardSignboardMetadata(boardRoot) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  if (!normalizedBoardRoot) {
    return { cardsUpdated: 0 };
  }

  const listNames = await listBoardDirectories(normalizedBoardRoot);
  let cardsUpdated = 0;

  for (const listName of listNames) {
    const listPath = path.join(normalizedBoardRoot, listName);
    const cardFileNames = await listMarkdownCardFileNames(listPath);
    for (const cardFileName of cardFileNames) {
      await refreshCardSignboardMetadata(normalizedBoardRoot, path.join(listPath, cardFileName));
      cardsUpdated += 1;
    }
  }

  return { cardsUpdated };
}

async function syncManagedObsidianBaseForBoard(boardRoot, options = {}) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  if (!normalizedBoardRoot) {
    return { ok: false, error: 'INVALID_BOARD_ROOT' };
  }

  const settings = await boardLabels.readBoardSettings(normalizedBoardRoot, { ensureFile: true });
  const metadataResult = options.refreshMetadata === true
    ? await refreshBoardSignboardMetadata(normalizedBoardRoot)
    : { cardsUpdated: 0 };
  const baseResult = await obsidianIntegration.writeManagedObsidianBaseFile(normalizedBoardRoot, {
    force: options.force === true,
    managedHash: settings.obsidianBase && settings.obsidianBase.managedHash,
  });

  if (
    baseResult.inVault &&
    baseResult.managedHash &&
    baseResult.reason !== 'USER_MODIFIED' &&
    (!settings.obsidianBase || settings.obsidianBase.managedHash !== baseResult.managedHash)
  ) {
    await boardLabels.updateBoardSettings(normalizedBoardRoot, {
      obsidianBase: {
        managedHash: baseResult.managedHash,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return {
    ...baseResult,
    ...metadataResult,
  };
}

async function syncManagedObsidianBaseForCardPath(sender, cardPath, options = {}) {
  const boardRoot = resolveTrustedBoardRootForPath(sender, cardPath);
  if (!isBoardCardPath(boardRoot, cardPath)) {
    return { ok: false, error: 'NOT_BOARD_CARD' };
  }

  return syncManagedObsidianBaseForBoard(boardRoot, options);
}

async function autoSyncManagedObsidianBaseForBoard(boardRoot, options = {}) {
  try {
    return await syncManagedObsidianBaseForBoard(boardRoot, options);
  } catch (error) {
    console.error('Failed to sync managed Obsidian Base.', error);
    return { ok: false, error: 'OBSIDIAN_BASE_SYNC_FAILED' };
  }
}

async function autoSyncManagedObsidianBaseForCardPath(sender, cardPath, options = {}) {
  try {
    return await syncManagedObsidianBaseForCardPath(sender, cardPath, options);
  } catch (error) {
    console.error('Failed to sync managed Obsidian Base for card.', error);
    return { ok: false, error: 'OBSIDIAN_BASE_SYNC_FAILED' };
  }
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

async function listMarkdownCardFileNames(listPath) {
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

function isSignboardProtocolUrl(candidateUrl) {
  try {
    return new URL(String(candidateUrl || '')).protocol === 'signboard:';
  } catch {
    return false;
  }
}

function parseSignboardProtocolUrl(candidateUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(String(candidateUrl || ''));
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'signboard:') {
    return null;
  }

  const action = parsedUrl.hostname || parsedUrl.pathname.replace(/^\/+/, '');
  if (action === 'open-card') {
    const cardId = String(parsedUrl.searchParams.get('id') || '').trim();
    if (!cardId || !/^[A-Za-z0-9]{5,64}$/.test(cardId)) {
      return null;
    }

    return {
      action,
      cardId,
    };
  }

  if (action === 'open-board') {
    const boardPath = normalizeBoardRootPath(parsedUrl.searchParams.get('path') || '');
    if (!boardPath || !path.isAbsolute(boardPath)) {
      return null;
    }

    return {
      action,
      boardPath,
    };
  }

  return null;
}

async function pathLooksLikeSignboardBoardRoot(boardRoot) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  if (!normalizedBoardRoot) {
    return false;
  }

  let entries = [];
  try {
    const stats = await fsPromises.stat(normalizedBoardRoot);
    if (!stats.isDirectory()) {
      return false;
    }
    entries = await fsPromises.readdir(normalizedBoardRoot, { withFileTypes: true });
  } catch {
    return false;
  }

  const hasBoardSettings = entries.some((entry) => entry.isFile() && entry.name === 'board-settings.md');
  if (hasBoardSettings) {
    return true;
  }

  return entries.some((entry) => (
    entry.isDirectory() &&
    (/^\d{3}-.+/.test(entry.name) || entry.name === 'XXX-Archive')
  ));
}

async function confirmOpenBoardProtocolTarget(boardRoot) {
  if (process.env.SIGNBOARD_TEST_AUTO_CONFIRM_OPEN_BOARD_PROTOCOL === '1') {
    return true;
  }

  const parentWindow = getMainWindow();
  const result = await dialog.showMessageBox(parentWindow || undefined, {
    type: 'question',
    buttons: ['Open Board', 'Cancel'],
    cancelId: 1,
    defaultId: 0,
    title: 'Open Signboard Board?',
    message: 'Open this folder in Signboard?',
    detail: `Signboard was asked to open this board folder:\n\n${boardRoot}\n\nIf you continue, this folder will be added to Signboard's trusted boards so the app can read and write cards in it.`,
    noLink: true,
  });

  return result.response === 0;
}

async function resolveSignboardOpenBoardProtocolLink(boardPath) {
  const boardRoot = normalizeBoardRootPath(boardPath);
  if (!boardRoot) {
    return { ok: false, action: 'open-board', error: 'INVALID_BOARD_ROOT' };
  }

  const trustedRoots = readTrustedBoardRoots();
  if (trustedRoots.has(boardRoot)) {
    return {
      ok: true,
      action: 'open-board',
      boardRoot,
      alreadyTrusted: true,
    };
  }

  if (!await pathLooksLikeSignboardBoardRoot(boardRoot)) {
    return {
      ok: false,
      action: 'open-board',
      boardRoot,
      error: 'NOT_SIGNBOARD_BOARD',
    };
  }

  const vaultRoot = await obsidianIntegration.findObsidianVaultRoot(boardRoot);
  if (!vaultRoot) {
    return {
      ok: false,
      action: 'open-board',
      boardRoot,
      error: 'NOT_IN_OBSIDIAN_VAULT',
    };
  }

  if (!await confirmOpenBoardProtocolTarget(boardRoot)) {
    return {
      ok: false,
      action: 'open-board',
      boardRoot,
      error: 'USER_CANCELLED',
    };
  }

  addTrustedBoardRoot(boardRoot);

  return {
    ok: true,
    action: 'open-board',
    boardRoot,
    vaultRoot,
    addedTrustedRoot: true,
  };
}

async function findCardInBoardRootBySignboardId(boardRoot, cardId) {
  const normalizedBoardRoot = normalizeBoardRootPath(boardRoot);
  const normalizedCardId = String(cardId || '').trim();
  if (!normalizedBoardRoot || !normalizedCardId) {
    return null;
  }

  let listEntries = [];
  try {
    listEntries = await fsPromises.readdir(normalizedBoardRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const listEntry of listEntries) {
    if (!listEntry.isDirectory()) {
      continue;
    }

    const listPath = path.join(normalizedBoardRoot, listEntry.name);
    let cardEntries = [];
    try {
      cardEntries = await fsPromises.readdir(listPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const filenameMatch = cardEntries.find((cardEntry) => (
      cardEntry.isFile() &&
      cardEntry.name.endsWith('.md') &&
      obsidianIntegration.getCardFileId(cardEntry.name) === normalizedCardId
    ));

    if (filenameMatch) {
      return {
        boardRoot: normalizedBoardRoot,
        cardPath: path.join(listPath, filenameMatch.name),
      };
    }
  }

  for (const listEntry of listEntries) {
    if (!listEntry.isDirectory()) {
      continue;
    }

    const listPath = path.join(normalizedBoardRoot, listEntry.name);
    let cardEntries = [];
    try {
      cardEntries = await fsPromises.readdir(listPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const cardEntry of cardEntries) {
      if (!cardEntry.isFile() || !cardEntry.name.endsWith('.md')) {
        continue;
      }

      const cardPath = path.join(listPath, cardEntry.name);
      try {
        const card = await cardFrontmatter.readCard(cardPath);
        if (String(card.frontmatter.signboard_id || '').trim() === normalizedCardId) {
          return {
            boardRoot: normalizedBoardRoot,
            cardPath,
          };
        }
      } catch {
        // Ignore malformed cards while resolving a deep link.
      }
    }
  }

  return null;
}

async function resolveSignboardProtocolLink(candidateUrl) {
  const parsed = parseSignboardProtocolUrl(candidateUrl);
  if (!parsed) {
    return null;
  }

  if (parsed.action === 'open-board') {
    return resolveSignboardOpenBoardProtocolLink(parsed.boardPath);
  }

  const trustedRoots = Array.from(readTrustedBoardRoots());
  for (const boardRoot of trustedRoots) {
    const match = await findCardInBoardRootBySignboardId(boardRoot, parsed.cardId);
    if (match) {
      return {
        ok: true,
        ...match,
        cardId: parsed.cardId,
      };
    }
  }

  return {
    ok: false,
    action: 'open-card',
    error: 'CARD_NOT_FOUND',
    cardId: parsed.cardId,
  };
}

async function dispatchSignboardProtocolUrl(candidateUrl) {
  const win = getMainWindow();
  if (!win || win.isDestroyed() || !candidateUrl) {
    pendingSignboardProtocolUrl = candidateUrl || pendingSignboardProtocolUrl;
    return;
  }

  const resolved = await resolveSignboardProtocolLink(candidateUrl);
  if (!resolved) {
    return;
  }

  if (win.webContents.isLoading()) {
    pendingSignboardProtocolUrl = candidateUrl;
    return;
  }

  if (resolved.action === 'open-board') {
    win.webContents.send('open-signboard-board-link', resolved);
    return;
  }

  win.webContents.send('open-signboard-card-link', resolved);
}

function queueSignboardProtocolUrl(candidateUrl) {
  if (!isSignboardProtocolUrl(candidateUrl)) {
    return false;
  }

  pendingSignboardProtocolUrl = String(candidateUrl || '');
  return true;
}

async function flushPendingSignboardProtocolUrl() {
  const nextUrl = pendingSignboardProtocolUrl;
  pendingSignboardProtocolUrl = '';
  if (nextUrl) {
    await dispatchSignboardProtocolUrl(nextUrl);
  }
}

function findSignboardProtocolUrlInArgs(argv = []) {
  return (Array.isArray(argv) ? argv : []).find((arg) => isSignboardProtocolUrl(arg)) || '';
}

function registerSignboardProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    return app.setAsDefaultProtocolClient('signboard', process.execPath, [path.resolve(process.argv[1])]);
  }

  return app.setAsDefaultProtocolClient('signboard');
}

if (!isCliMode && !isMcpServerMode && !isMcpConfigMode) {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv = []) => {
      const protocolUrl = findSignboardProtocolUrlInArgs(argv);
      if (protocolUrl) {
        dispatchSignboardProtocolUrl(protocolUrl).catch((error) => {
          console.error('Failed to handle signboard:// URL from second instance.', error);
        });
      }
      ensureMainWindowVisible();
    });
  }
}

app.on('open-url', (event, protocolUrl) => {
  if (!isSignboardProtocolUrl(protocolUrl)) {
    return;
  }

  event.preventDefault();
  if (!app.isReady()) {
    queueSignboardProtocolUrl(protocolUrl);
    return;
  }

  dispatchSignboardProtocolUrl(protocolUrl).catch((error) => {
    console.error('Failed to handle signboard:// URL.', error);
  });
});

app.on('ready', () => {
  app.setName('Signboard');

  if (!isCliMode && !isMcpServerMode && !isMcpConfigMode) {
    try {
      registerSignboardProtocolClient();
    } catch (error) {
      console.error('Failed to register signboard:// protocol handler.', error);
    }
  }

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

function getContextMenuEditFlag(editFlags, key, fallback = false) {
  if (!editFlags || typeof editFlags !== 'object') {
    return fallback;
  }

  if (Object.prototype.hasOwnProperty.call(editFlags, key)) {
    return Boolean(editFlags[key]);
  }

  return fallback;
}

function buildRendererContextMenuTemplate(params = {}) {
  const editFlags = params && typeof params.editFlags === 'object' ? params.editFlags : {};
  const isEditable = Boolean(params.isEditable);
  const hasSelection = Boolean(String(params.selectionText || '').trim());
  const linkURL = String(params.linkURL || '').trim();

  if (isEditable) {
    return [
      { role: 'undo', enabled: getContextMenuEditFlag(editFlags, 'canUndo') },
      { role: 'redo', enabled: getContextMenuEditFlag(editFlags, 'canRedo') },
      { type: 'separator' },
      { role: 'cut', enabled: getContextMenuEditFlag(editFlags, 'canCut') },
      { role: 'copy', enabled: getContextMenuEditFlag(editFlags, 'canCopy') },
      { role: 'paste', enabled: getContextMenuEditFlag(editFlags, 'canPaste') },
      ...(process.platform === 'darwin'
        ? [{ role: 'pasteAndMatchStyle', enabled: getContextMenuEditFlag(editFlags, 'canPaste') }]
        : []),
      { role: 'delete', enabled: getContextMenuEditFlag(editFlags, 'canDelete') },
      { type: 'separator' },
      { role: 'selectAll', enabled: getContextMenuEditFlag(editFlags, 'canSelectAll', true) },
    ];
  }

  const template = [];

  if (hasSelection) {
    template.push({ role: 'copy', enabled: getContextMenuEditFlag(editFlags, 'canCopy', true) });
  }

  if (linkURL) {
    if (template.length > 0) {
      template.push({ type: 'separator' });
    }

    template.push({
      label: 'Copy Link',
      click: () => {
        clipboard.writeText(linkURL);
      },
    });
  }

  return template;
}

function showRendererContextMenu(win, params = {}) {
  if (!win || win.isDestroyed()) {
    return;
  }

  const template = buildRendererContextMenuTemplate(params).filter(Boolean);
  if (template.length === 0) {
    return;
  }

  const menu = Menu.buildFromTemplate(template);
  const popupOptions = {
    x: Number.isFinite(params.x) ? params.x : undefined,
    y: Number.isFinite(params.y) ? params.y : undefined,
  };

  if (pendingRendererContextMenuTimer) {
    clearTimeout(pendingRendererContextMenuTimer);
    pendingRendererContextMenuTimer = null;
  }

  pendingRendererContextMenuTimer = setTimeout(() => {
    pendingRendererContextMenuTimer = null;

    if (!win || win.isDestroyed() || isAppQuitting) {
      return;
    }

    try {
      menu.popup({
        window: win,
        ...popupOptions,
      });
    } catch (error) {
      console.error('Unable to show renderer context menu.', error);
    }
  }, 0);
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
      return ['http:', 'https:', 'mailto:', 'obsidian:', 'signboard:'].includes(parsed.protocol);
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
      if (isSignboardProtocolUrl(url)) {
        dispatchSignboardProtocolUrl(url).catch((error) => {
          console.error('Failed to handle signboard:// URL from renderer.', error);
        });
        return { action: 'deny' };
      }
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
      if (isSignboardProtocolUrl(url)) {
        dispatchSignboardProtocolUrl(url).catch((error) => {
          console.error('Failed to handle signboard:// URL from renderer navigation.', error);
        });
        return;
      }
      shell.openExternal(url);
    }
  });

  win.webContents.on('context-menu', (_event, params) => {
    showRendererContextMenu(win, params);
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

  win.webContents.once('did-finish-load', () => {
    flushPendingSignboardProtocolUrl().catch((error) => {
      console.error('Failed to dispatch pending signboard:// URL.', error);
    });
  });

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

  ensureApplicationMenu();

  if (win.isMinimized()) {
    win.restore();
  }

  if (!win.isVisible()) {
    win.show();
  }

  win.focus();
  return win;
}

function sendToMainWindow(channel, ...args) {
  const win = ensureMainWindowVisible();
  if (!win || win.isDestroyed()) {
    return;
  }

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    });
    return;
  }

  win.webContents.send(channel, ...args);
}

function getQuickAddGlobalShortcutStatus() {
  return { ...quickAddGlobalShortcutStatus };
}

function unregisterQuickAddGlobalShortcut() {
  if (!registeredQuickAddGlobalShortcut || !globalShortcut) {
    registeredQuickAddGlobalShortcut = '';
    return;
  }

  try {
    globalShortcut.unregister(registeredQuickAddGlobalShortcut);
  } catch (error) {
    console.error('Failed to unregister quick add global shortcut.', error);
  } finally {
    registeredQuickAddGlobalShortcut = '';
  }
}

function applyQuickAddGlobalShortcut(settings = {}) {
  const normalizedSettings = appSettings.normalizeAppSettings(settings);
  const accelerator = normalizedSettings.quickAdd.globalShortcut;

  if (
    accelerator &&
    registeredQuickAddGlobalShortcut === accelerator &&
    quickAddGlobalShortcutStatus.registered
  ) {
    return getQuickAddGlobalShortcutStatus();
  }

  if (registeredQuickAddGlobalShortcut) {
    unregisterQuickAddGlobalShortcut();
  }

  quickAddGlobalShortcutStatus = {
    accelerator,
    registered: false,
    message: '',
  };

  if (!accelerator || isMcpServerMode || isMcpConfigMode || isCliMode) {
    return getQuickAddGlobalShortcutStatus();
  }

  try {
    const registered = globalShortcut.register(accelerator, () => {
      sendToMainWindow('open-quick-add-card');
    });

    if (!registered) {
      quickAddGlobalShortcutStatus = {
        accelerator,
        registered: false,
        message: 'Shortcut unavailable',
      };
      return getQuickAddGlobalShortcutStatus();
    }

    registeredQuickAddGlobalShortcut = accelerator;
    quickAddGlobalShortcutStatus = {
      accelerator,
      registered: true,
      message: '',
    };
  } catch (error) {
    quickAddGlobalShortcutStatus = {
      accelerator,
      registered: false,
      message: 'Shortcut unavailable',
    };
    console.error('Failed to register quick add global shortcut.', error);
  }

  return getQuickAddGlobalShortcutStatus();
}

function getExternalPublishedCalendarUrl(settings = externalPublishedCalendarSettings) {
  const normalizedSettings = appSettings.normalizeExternalPublishedCalendarSettings(settings);
  if (!normalizedSettings.enabled || !normalizedSettings.token) {
    return '';
  }

  return `http://127.0.0.1:${normalizedSettings.port}/external-published-calendar/${encodeURIComponent(normalizedSettings.token)}.ics`;
}

function getExternalPublishedCalendarStatus() {
  return {
    ...externalPublishedCalendarStatus,
    url: getExternalPublishedCalendarUrl(externalPublishedCalendarSettings),
  };
}

function withRuntimeAppSettings(settings) {
  return {
    ...settings,
    globalShortcutStatus: getQuickAddGlobalShortcutStatus(),
    externalPublishedCalendarStatus: getExternalPublishedCalendarStatus(),
  };
}

async function stopExternalPublishedCalendarServer() {
  if (!externalPublishedCalendarServer) {
    return;
  }

  const server = externalPublishedCalendarServer;
  externalPublishedCalendarServer = null;

  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function createExternalPublishedCalendarFeed() {
  const boardRoots = Array.from(readTrustedBoardRoots());
  return buildExternalPublishedCalendarFeed({
    boardRoots,
    readBoardSettings: (boardRoot) => boardLabels.readBoardSettings(boardRoot, { ensureFile: false }),
    listLists: (boardRoot) => listBoardDirectories(boardRoot),
    listCards: (listPath) => listMarkdownCardFileNames(listPath),
    readCard: (cardPath) => cardFrontmatter.readCard(cardPath),
    getBoardName: (boardRoot) => path.basename(String(boardRoot || '').replace(/[\\/]+$/, '')),
  });
}

async function handleExternalPublishedCalendarRequest(request, response) {
  const settings = appSettings.normalizeExternalPublishedCalendarSettings(externalPublishedCalendarSettings);
  const expectedPath = settings.token
    ? `/external-published-calendar/${encodeURIComponent(settings.token)}.ics`
    : '';

  try {
    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${settings.port}`);
    if (requestUrl.pathname !== expectedPath) {
      response.writeHead(requestUrl.pathname.startsWith('/external-published-calendar/') ? 403 : 404, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Not found');
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Method not allowed');
      return;
    }

    const feed = request.method === 'HEAD' ? '' : await createExternalPublishedCalendarFeed();
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="signboard-external-published-calendar.ics"',
      'Content-Type': 'text/calendar; charset=utf-8',
    });
    response.end(feed);
  } catch (error) {
    console.error('Failed to serve External Published Calendar feed.', error);
    response.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end('Unable to build calendar feed');
  }
}

async function startExternalPublishedCalendarServer(settings) {
  const normalizedSettings = appSettings.normalizeExternalPublishedCalendarSettings(settings);
  if (
    externalPublishedCalendarServer &&
    externalPublishedCalendarStatus.running &&
    externalPublishedCalendarSettings.port === normalizedSettings.port &&
    externalPublishedCalendarSettings.token === normalizedSettings.token
  ) {
    externalPublishedCalendarSettings = normalizedSettings;
    externalPublishedCalendarStatus = {
      enabled: true,
      running: true,
      port: normalizedSettings.port,
      url: getExternalPublishedCalendarUrl(normalizedSettings),
      message: 'Publishing',
    };
    return;
  }

  await stopExternalPublishedCalendarServer();
  externalPublishedCalendarSettings = normalizedSettings;

  await new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      handleExternalPublishedCalendarRequest(request, response);
    });

    server.on('error', (error) => {
      if (externalPublishedCalendarServer === server) {
        externalPublishedCalendarServer = null;
      }
      externalPublishedCalendarStatus = {
        enabled: true,
        running: false,
        port: normalizedSettings.port,
        url: getExternalPublishedCalendarUrl(normalizedSettings),
        message: error && error.code === 'EADDRINUSE'
          ? 'Port unavailable'
          : 'Unable to publish',
      };
      console.error('Failed to start External Published Calendar server.', error);
      resolve();
    });

    server.listen(normalizedSettings.port, '127.0.0.1', () => {
      externalPublishedCalendarServer = server;
      externalPublishedCalendarStatus = {
        enabled: true,
        running: true,
        port: normalizedSettings.port,
        url: getExternalPublishedCalendarUrl(normalizedSettings),
        message: 'Publishing',
      };
      resolve();
    });
  });
}

async function applyExternalPublishedCalendarSettings(settings = {}) {
  const normalizedSettings = appSettings.normalizeAppSettings(settings).externalPublishedCalendar;
  externalPublishedCalendarSettings = normalizedSettings;

  if (!normalizedSettings.enabled) {
    await stopExternalPublishedCalendarServer();
    externalPublishedCalendarStatus = {
      enabled: false,
      running: false,
      port: normalizedSettings.port,
      url: '',
      message: 'Disabled',
    };
    return;
  }

  await startExternalPublishedCalendarServer(normalizedSettings);
}

async function ensureExternalPublishedCalendarToken(settings = {}) {
  const normalizedSettings = appSettings.normalizeAppSettings(settings);
  if (
    !normalizedSettings.externalPublishedCalendar.enabled ||
    normalizedSettings.externalPublishedCalendar.token
  ) {
    return normalizedSettings;
  }

  return appSettings.updateAppSettings(app.getPath('userData'), {
    externalPublishedCalendar: {
      ...normalizedSettings.externalPublishedCalendar,
      token: randomUUID(),
    },
  });
}

async function readAppSettingsWithRuntimeStatus() {
  const rawSettings = await appSettings.readAppSettings(app.getPath('userData'));
  const settings = await ensureExternalPublishedCalendarToken(rawSettings);
  return withRuntimeAppSettings(settings);
}

async function updateAppSettingsWithRuntimeStatus(partialSettings = {}) {
  const rawSettings = await appSettings.updateAppSettings(app.getPath('userData'), partialSettings);
  const settings = await ensureExternalPublishedCalendarToken(rawSettings);
  applyQuickAddGlobalShortcut(settings);
  await applyExternalPublishedCalendarSettings(settings);
  return withRuntimeAppSettings(settings);
}

async function initializeAppRuntimeSettings() {
  const rawSettings = await appSettings.readAppSettings(app.getPath('userData'));
  const settings = await ensureExternalPublishedCalendarToken(rawSettings);
  applyQuickAddGlobalShortcut(settings);
  await applyExternalPublishedCalendarSettings(settings);
}

function buildMcpConfigTemplate() {
  const command = process.execPath;
  const args = app.isPackaged ? [MCP_SERVER_ARG] : [app.getAppPath(), MCP_SERVER_ARG];
  const env = {
    SIGNBOARD_MCP_READ_ONLY: 'false',
  };
  let defaultAllowedRoot = '';
  const trustedRoots = Array.from(readTrustedBoardRoots());

  if (trustedRoots.length > 0) {
    defaultAllowedRoot = trustedRoots.join(path.delimiter);
  } else {
    try {
      defaultAllowedRoot = path.join(app.getPath('documents'), 'Boards');
    } catch {
      try {
        defaultAllowedRoot = path.join(app.getPath('home'), 'Boards');
      } catch {
        defaultAllowedRoot = path.join(process.cwd(), 'Boards');
      }
    }
  }

  env.SIGNBOARD_MCP_ALLOWED_ROOTS = defaultAllowedRoot;

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

function exitCliProcess(exitCode) {
  const code = Number.isInteger(exitCode) ? exitCode : 0;
  let didExit = false;
  const finish = () => {
    if (didExit) {
      return;
    }
    didExit = true;
    process.exit(code);
  };

  const fallbackTimer = setTimeout(finish, 250);
  if (typeof fallbackTimer.unref === 'function') {
    fallbackTimer.unref();
  }

  try {
    process.stdout.write('', () => {
      process.stderr.write('', () => {
        clearTimeout(fallbackTimer);
        finish();
      });
    });
  } catch {
    clearTimeout(fallbackTimer);
    finish();
  }
}

function runCliMode() {
  runCli(signboardArgs, {
    commandName: app.isPackaged ? 'Signboard' : 'signboard',
    stdout: process.stdout,
    stderr: process.stderr,
  }).then((exitCode) => {
    exitCliProcess(exitCode);
  }).catch((error) => {
    console.error(error.message || error);
    exitCliProcess(1);
  });
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

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripReleaseNotesSection(notes, headingText) {
  const source = typeof notes === 'string' ? notes.trim() : '';
  const heading = String(headingText || '').trim();
  if (!source || !heading) {
    return source;
  }

  const sectionPattern = new RegExp(
    `(?:^|\\n)##\\s+${escapeRegExp(heading)}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`,
    'i'
  );

  return source
    .replace(sectionPattern, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatReleaseNotesForDialog(info) {
  const notes = stripReleaseNotesSection(extractReleaseNotes(info), 'Downloads');

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
  const createDocumentationMenuItem = () => ({
    label: 'Documentation',
    click: () => shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}#documentation`),
  });
  const createKeyboardShortcutsMenuItem = () => ({
    label: 'Keyboard Shortcuts',
    accelerator: 'CmdOrCtrl+/',
    click: () => {
      sendToMainWindow('open-keyboard-shortcuts');
    },
  });
  const createBoardSwitcherMenuItem = () => ({
    label: 'Switch Board...',
    accelerator: 'CmdOrCtrl+K',
    click: () => {
      sendToMainWindow('open-board-switcher');
    },
  });
  const createBoardSettingsMenuItem = () => ({
    label: 'Settings...',
    accelerator: 'CmdOrCtrl+,',
    click: () => {
      sendToMainWindow('open-board-settings');
    },
  });
  const createToggleThemeMenuItem = () => ({
    label: 'Toggle Light/Dark Mode',
    accelerator: 'CmdOrCtrl+Shift+D',
    click: () => {
      sendToMainWindow('toggle-theme-mode');
    },
  });
  const createKanbanViewMenuItem = () => ({
    label: 'Kanban View',
    accelerator: 'CmdOrCtrl+1',
    click: () => {
      sendToMainWindow('switch-board-view', 'kanban');
    },
  });
  const createTableViewMenuItem = () => ({
    label: 'Table View',
    accelerator: 'CmdOrCtrl+Alt+1',
    click: () => {
      sendToMainWindow('switch-board-view', 'table');
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
        createBoardSwitcherMenuItem(),
        createBoardSettingsMenuItem(),
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
    submenu: isMac
      ? [{ role: 'close' }]
      : [createBoardSwitcherMenuItem(), createBoardSettingsMenuItem(), { type: 'separator' }, { role: 'quit' }],
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
    submenu: [
      createKanbanViewMenuItem(),
      createTableViewMenuItem(),
      { type: 'separator' },
      createToggleThemeMenuItem(),
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])],
  });

  template.push({
    label: 'Help',
    submenu: [
      !isMac ? createAboutSignboardMenuItem() : null,
      !isMac ? createCheckForUpdatesMenuItem() : null,
      createDocumentationMenuItem(),
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

function applicationMenuHasRequiredActions(menu = Menu.getApplicationMenu()) {
  if (!menu || !Array.isArray(menu.items)) {
    return false;
  }

  const requiredLabels = new Set([
    'About Signboard',
    'Copy MCP Config',
    'Keyboard Shortcuts',
    'Kanban View',
    'Table View',
  ]);
  const seenLabels = new Set();
  const visitItems = (items = []) => {
    for (const item of items) {
      if (!item) {
        continue;
      }

      if (typeof item.label === 'string' && item.label) {
        seenLabels.add(item.label);
      }

      if (item.submenu && Array.isArray(item.submenu.items)) {
        visitItems(item.submenu.items);
      }
    }
  };

  visitItems(menu.items);
  for (const label of requiredLabels) {
    if (!seenLabels.has(label)) {
      return false;
    }
  }

  return true;
}

function ensureApplicationMenu() {
  if (!applicationMenuHasRequiredActions()) {
    buildApplicationMenu();
  }
}

ipcMain.handle('board-call', async (event, payload = {}) => {
  const operation = typeof payload.op === 'string' ? payload.op : '';
  const args = Array.isArray(payload.args) ? payload.args : [];

  switch (operation) {
    case 'authorizeBoardSelection': {
      const result = authorizeBoardSelectionForSender(event.sender, args[0]);
      if (result && result.ok && result.boardRoot) {
        await autoSyncManagedObsidianBaseForBoard(result.boardRoot, { refreshMetadata: true });
      }
      return result;
    }

    case 'adoptLegacyBoardRoots':
      return adoptLegacyBoardRootsForSender(event.sender, args[0]);

    case 'setActiveBoardRoot': {
      const result = authorizeTrustedBoardRootForSender(event.sender, args[0]);
      if (result && result.ok && result.boardRoot) {
        await autoSyncManagedObsidianBaseForBoard(result.boardRoot, { refreshMetadata: true });
      }
      return result;
    }

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
      return listMarkdownCardFileNames(listPath);
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
      return formatDueDateValue(args[0]);
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

    case 'openCardDefault': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const errorMessage = await shell.openPath(filePath);
      return errorMessage ? { ok: false, error: errorMessage } : { ok: true };
    }

    case 'openCardInObsidian': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const obsidianUri = obsidianIntegration.buildObsidianOpenUri(filePath);
      if (!obsidianUri) {
        return { ok: false, error: 'INVALID_PATH' };
      }
      await shell.openExternal(obsidianUri);
      return { ok: true, obsidianUri };
    }

    case 'openRelatedObsidianNote': {
      const { boardRoot, filePath } = requireReadableBoardCardPath(event.sender, args[0], args[1]);
      const related = String(args[2] || '');
      const resolvedNote = await obsidianIntegration.resolveObsidianRelatedNote({
        boardRoot,
        cardPath: filePath,
        related,
      });
      if (!resolvedNote.ok) {
        return resolvedNote;
      }

      const skippedExternalOpen = process.env.SIGNBOARD_TEST_DISABLE_EXTERNAL_OPEN === '1';
      if (!skippedExternalOpen) {
        await shell.openExternal(resolvedNote.obsidianUri);
      }

      return {
        ...resolvedNote,
        skippedExternalOpen,
      };
    }

    case 'addLinkedObject': {
      return writeLinkedObjectToCard(event, args[0], args[1]);
    }

    case 'addDroppedLinkedObjects': {
      return writeDroppedLinkedObjectsToCard(event, args[0], args[1]);
    }

    case 'openLinkedObject': {
      return openLinkedObjectFromRenderer(event, args[0], args[1]);
    }

    case 'getLinkedObjectStatus': {
      return getLinkedObjectStatusFromRenderer(event, args[0], args[1]);
    }

    case 'recreateLinkedObsidianNote': {
      return recreateLinkedObsidianNoteFromRenderer(event, args[0], args[1], args[2]);
    }

    case 'relinkLinkedObsidianNote': {
      return relinkObsidianNoteFromRenderer(event, args[0], args[1], args[2], args[3]);
    }

    case 'copyCardObsidianUri': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const obsidianUri = obsidianIntegration.buildObsidianOpenUri(filePath);
      clipboard.writeText(obsidianUri);
      return { ok: true, obsidianUri };
    }

    case 'copyCardSignboardUri': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const card = await cardFrontmatter.readCard(filePath);
      const cardId = obsidianIntegration.getSignboardCardId(filePath, card.frontmatter);
      const signboardUri = obsidianIntegration.buildSignboardCardUri(cardId);
      clipboard.writeText(signboardUri);
      return { ok: true, signboardUri };
    }

    case 'getCardExternalLinks': {
      const filePath = requireReadablePath(event.sender, args[0]);
      const card = await cardFrontmatter.readCard(filePath);
      const cardId = obsidianIntegration.getSignboardCardId(filePath, card.frontmatter);
      const vaultRoot = await obsidianIntegration.findObsidianVaultRoot(filePath);
      return {
        ok: true,
        obsidianUri: obsidianIntegration.buildObsidianOpenUri(filePath),
        signboardUri: obsidianIntegration.buildSignboardCardUri(cardId),
        inObsidianVault: Boolean(vaultRoot),
        vaultRoot,
      };
    }

    case 'readCard': {
      const filePath = requireReadablePath(event.sender, args[0]);
      return readCardWithTimestamps(filePath);
    }

    case 'listArchiveEntries': {
      const boardRoot = requireActiveBoardRootForSender(event.sender);
      return listArchiveEntries(boardRoot);
    }

    case 'readArchiveEntry': {
      const boardRoot = requireActiveBoardRootForSender(event.sender);
      const entryPath = requireReadablePath(event.sender, args[0]);
      return readArchiveEntry(boardRoot, entryPath);
    }

    case 'writeCard': {
      const filePath = requireWritablePath(event.sender, args[0]);
      const card = args[1] && typeof args[1] === 'object' ? args[1] : {};
      await cardFrontmatter.writeCard(filePath, {
        ...card,
        frontmatter: normalizeCardFrontmatterForBoardPath(event.sender, filePath, card.frontmatter),
      });
      await autoSyncManagedObsidianBaseForCardPath(event.sender, filePath);
      return { ok: true };
    }

    case 'updateFrontmatter': {
      const filePath = requireWritablePath(event.sender, args[0], { allowTrusted: true });
      const currentCard = await cardFrontmatter.readCard(filePath);
      const nextFrontmatter = normalizeCardFrontmatterForBoardPath(event.sender, filePath, {
        ...currentCard.frontmatter,
        ...(args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]) ? args[1] : {}),
      });
      await cardFrontmatter.writeCard(filePath, {
        frontmatter: nextFrontmatter,
        body: currentCard.body,
      });
      await autoSyncManagedObsidianBaseForCardPath(event.sender, filePath);
      return cardFrontmatter.normalizeFrontmatter(nextFrontmatter);
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
      const filePath = requireWritablePath(event.sender, args[0], { allowTrusted: true });
      const content = String(args[1] || '');
      const lines = content.split(/\r?\n/);
      const title = (lines.shift() || '').trim();
      const body = lines.join('\n').replace(/^\n+/, '');
      const frontmatter = normalizeCardFrontmatterForBoardPath(event.sender, filePath, prepareNewCardFrontmatter({
        title: title || 'Untitled',
      }));

      await cardFrontmatter.writeCard(filePath, {
        frontmatter,
        body,
      });
      await autoSyncManagedObsidianBaseForCardPath(event.sender, filePath);

      return { ok: true };
    }

    case 'generateObsidianBase': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0], { allowTrusted: true });
      return syncManagedObsidianBaseForBoard(boardRoot, {
        force: true,
        refreshMetadata: true,
      });
    }

    case 'openObsidianBase': {
      const boardRoot = requireReadableBoardRoot(event.sender, args[0]);
      const baseResult = await syncManagedObsidianBaseForBoard(boardRoot, { refreshMetadata: true });
      if (!baseResult.inVault) {
        return {
          ...baseResult,
          ok: false,
          error: 'NOT_IN_OBSIDIAN_VAULT',
        };
      }
      const basePath = baseResult.basePath || path.join(boardRoot, obsidianIntegration.DEFAULT_BASE_FILE_NAME);
      const obsidianUri = obsidianIntegration.buildObsidianOpenUri(basePath);
      await shell.openExternal(obsidianUri);
      return { ...baseResult, ok: true, basePath, obsidianUri };
    }

    case 'createLinkedObsidianNote': {
      const { boardRoot, filePath } = requireWritableBoardCardPath(event.sender, args[0], args[1]);
      const card = await cardFrontmatter.readCard(filePath);
      const result = await obsidianIntegration.createLinkedObsidianNote({
        boardRoot,
        cardPath: filePath,
        card,
      });
      const linkedObject = await buildLinkedObjectFromRendererInput(event.sender, {
        type: 'obsidian-note',
        target: result.linkTarget,
        path: result.notePath,
      });
      const nextRelated = obsidianIntegration.addUniqueStringListValue(card.frontmatter.related, result.linkTarget);
      const nextFrontmatter = obsidianIntegration.normalizeSignboardCardFrontmatter({
        boardRoot,
        cardPath: filePath,
        frontmatter: {
          ...card.frontmatter,
          linked_objects: addLinkedObjectToList(card.frontmatter.linked_objects, linkedObject),
          related: nextRelated,
        },
      });

      await cardFrontmatter.writeCard(filePath, {
        frontmatter: nextFrontmatter,
        body: card.body,
      });
      await autoSyncManagedObsidianBaseForBoard(boardRoot);

      return {
        ...result,
        linkedObject,
      };
    }

    case 'archiveCard': {
      const filePath = requireWritablePath(event.sender, args[0]);
      const senderState = getSenderBoardAccessState(event.sender);
      return archiveCard(senderState.activeBoardRoot, filePath);
    }

    case 'archiveList': {
      const listPath = requireWritablePath(event.sender, args[0]);
      const senderState = getSenderBoardAccessState(event.sender);
      return archiveList(senderState.activeBoardRoot, listPath);
    }

    case 'restoreArchivedCard': {
      const boardRoot = requireActiveBoardRootForSender(event.sender);
      const archivedCardPath = requireWritablePath(event.sender, args[0]);
      const targetListPath = requireWritablePath(event.sender, args[1]);
      return restoreArchivedCard(boardRoot, archivedCardPath, targetListPath);
    }

    case 'restoreArchivedList': {
      const boardRoot = requireActiveBoardRootForSender(event.sender);
      const archivedListPath = requireWritablePath(event.sender, args[0]);
      const restoredDirectoryName = typeof args[1] === 'string' ? args[1] : '';
      return restoreArchivedList(boardRoot, archivedListPath, restoredDirectoryName);
    }

    case 'recordCardListMove': {
      const boardRoot = requireActiveBoardRootForSender(event.sender);
      const cardPath = requireWritablePath(event.sender, args[0]);
      const fromListPath = requireWritablePath(event.sender, args[1]);
      const toListPath = requireWritablePath(event.sender, args[2]);
      return recordCardListMove(boardRoot, cardPath, fromListPath, toListPath);
    }

    case 'moveCardToTop': {
      const boardRoot = requireActiveBoardRootForSender(event.sender);
      const sourcePath = requireWritablePath(event.sender, args[0]);
      const targetListPath = requireWritablePath(event.sender, args[1]);
      const sourceListPath = path.dirname(sourcePath);
      const archiveRoot = path.join(boardRoot, 'XXX-Archive');

      if (sourcePath === boardRoot || sourceListPath === boardRoot || targetListPath === boardRoot) {
        throw new Error('INVALID_CARD_MOVE_PATH');
      }

      if (targetListPath === archiveRoot || isPathInsideRoot(archiveRoot, targetListPath)) {
        throw new Error('TARGET_LIST_CANNOT_BE_ARCHIVE');
      }

      if (sourceListPath === archiveRoot || isPathInsideRoot(archiveRoot, sourceListPath)) {
        throw new Error('SOURCE_CARD_CANNOT_BE_ARCHIVED');
      }

      if (!sourcePath.endsWith('.md')) {
        throw new Error('INVALID_CARD_FILE');
      }

      const sourceStats = await fsPromises.stat(sourcePath);
      if (!sourceStats.isFile()) {
        throw new Error('INVALID_CARD_FILE');
      }

      const targetStats = await fsPromises.stat(targetListPath);
      if (!targetStats.isDirectory()) {
        throw new Error('INVALID_TARGET_LIST');
      }

      const movedCardFile = await insertCardFileAtTop(targetListPath, sourcePath, path.basename(sourcePath));
      const movedCardPath = path.join(targetListPath, movedCardFile);

      if (sourceListPath !== targetListPath) {
        await recordCardListMove(boardRoot, movedCardPath, sourceListPath, targetListPath);
      }

      await refreshCardSignboardMetadata(boardRoot, movedCardPath);
      await autoSyncManagedObsidianBaseForBoard(boardRoot);

      return {
        ok: true,
        cardFile: movedCardFile,
        cardPath: movedCardPath,
      };
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
        await autoSyncManagedObsidianBaseForBoard(destinationPath, { refreshMetadata: true });
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

    case 'importTrello': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0]);
      const sourcePath = consumePendingSelection(event.sender, args[1], ['file']);
      if (!sourcePath) {
        throw new Error('INVALID_SELECTION_TOKEN');
      }

      const result = await importTrello({
        boardRoot,
        sourcePath,
      });
      await autoSyncManagedObsidianBaseForBoard(boardRoot, { refreshMetadata: true });
      return result;
    }

    case 'importObsidian': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0]);
      const selectionTokens = Array.isArray(args[1]) ? args[1] : [];
      const sourcePaths = selectionTokens
        .map((token) => consumePendingSelection(event.sender, token, ['file', 'directory']))
        .filter(Boolean);

      if (sourcePaths.length === 0) {
        throw new Error('INVALID_SELECTION_TOKEN');
      }

      const result = await importObsidian({
        boardRoot,
        sourcePaths,
      });
      await autoSyncManagedObsidianBaseForBoard(boardRoot, { refreshMetadata: true });
      return result;
    }

    case 'importTasksMd': {
      const boardRoot = requireWritableBoardRoot(event.sender, args[0]);
      const selectionTokens = Array.isArray(args[1]) ? args[1] : [];
      const sourcePaths = selectionTokens
        .map((token) => consumePendingSelection(event.sender, token, ['file', 'directory']))
        .filter(Boolean);

      if (sourcePaths.length === 0) {
        throw new Error('INVALID_SELECTION_TOKEN');
      }

      const result = await importTasksMd({
        boardRoot,
        sourcePaths,
      });
      await autoSyncManagedObsidianBaseForBoard(boardRoot, { refreshMetadata: true });
      return result;
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

ipcMain.handle('pick-linked-objects', async (event, { mode, defaultPath } = {}) => {
  const normalizedMode = mode === 'folder' ? 'folder' : 'file';
  const result = await dialog.showOpenDialog({
    title: normalizedMode === 'folder' ? 'Select linked folder' : 'Select linked files',
    buttonLabel: 'Link',
    defaultPath,
    properties: normalizedMode === 'folder'
      ? ['openDirectory', 'multiSelections']
      : ['openFile', 'multiSelections'],
  });

  if (result.canceled) {
    return null;
  }

  const selections = [];
  for (const rawPath of result.filePaths || []) {
    const selectedPath = normalizeAbsolutePath(rawPath);
    if (!selectedPath) {
      continue;
    }

    let stats = null;
    try {
      stats = await fsPromises.stat(selectedPath);
    } catch {
      continue;
    }

    const kind = stats.isDirectory() ? 'directory' : 'file';
    selections.push({
      path: selectedPath,
      kind: kind === 'directory' ? 'folder' : 'file',
      token: storePendingSelection(event.sender, selectedPath, kind),
    });
  }

  return selections;
});

ipcMain.handle('pick-import-sources', async (event, { importer, defaultPath } = {}) => {
  const normalizedImporter = importer === 'trello'
    ? 'trello'
    : importer === 'tasksmd'
      ? 'tasksmd'
      : 'obsidian';
  const dialogOptions = normalizedImporter === 'trello'
    ? {
        title: 'Select Trello JSON export',
        buttonLabel: 'Choose JSON',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      }
    : normalizedImporter === 'tasksmd'
      ? {
          title: 'Select Tasks.md project folder and optional config files',
          buttonLabel: 'Choose Sources',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openDirectory', 'openFile', 'multiSelections'],
        }
      : {
          title: 'Select Obsidian files or folder',
          buttonLabel: 'Choose Sources',
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
          properties: ['openFile', 'openDirectory', 'multiSelections'],
        };
  const result = await dialog.showOpenDialog({
    defaultPath,
    ...dialogOptions,
  });

  if (result.canceled) {
    return null;
  }

  const selections = [];
  for (const rawPath of result.filePaths || []) {
    const selectedPath = normalizeAbsolutePath(rawPath);
    if (!selectedPath) {
      continue;
    }

    let stats = null;
    try {
      stats = await fsPromises.stat(selectedPath);
    } catch {
      continue;
    }

    const kind = stats.isDirectory() ? 'directory' : 'file';
    selections.push({
      path: selectedPath,
      kind,
      token: storePendingSelection(event.sender, selectedPath, kind),
    });
  }

  return selections;
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

  if (!['http:', 'https:', 'mailto:', 'obsidian:', 'signboard:'].includes(parsedUrl.protocol)) {
    return { ok: false, error: 'UNSUPPORTED_PROTOCOL' };
  }

  try {
    if (parsedUrl.protocol === 'signboard:') {
      await dispatchSignboardProtocolUrl(parsedUrl.href);
      return { ok: true };
    }
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

ipcMain.handle('read-app-settings', async () => (
  readAppSettingsWithRuntimeStatus()
));

ipcMain.handle('update-app-settings', async (_event, partialSettings = {}) => (
  updateAppSettingsWithRuntimeStatus(partialSettings)
));

ipcMain.handle('get-global-shortcut-status', async () => getQuickAddGlobalShortcutStatus());

ipcMain.handle('copy-text-to-clipboard', async (_event, text = '') => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});

ipcMain.handle('migrate-app-settings-from-board', async (event, boardRoot) => {
  const normalizedBoardRoot = requireReadableBoardRoot(event.sender, boardRoot);
  const legacySettings = await boardLabels.readLegacyBoardAppSettings(normalizedBoardRoot);
  const migrationResult = await appSettings.migrateAppSettingsFromBoardSettings(
    app.getPath('userData'),
    normalizedBoardRoot,
    legacySettings,
  );

  await boardLabels.readBoardSettings(normalizedBoardRoot, { ensureFile: true });
  return {
    ...migrationResult,
    settings: withRuntimeAppSettings(migrationResult.settings),
  };
});

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

if (isCliMode) {
  runCliMode();
} else {
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
        trustedBoardRoots: Array.from(readTrustedBoardRoots()),
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

    await loadUpdatePreferences();
    await initializeAppRuntimeSettings();
    queueSignboardProtocolUrl(findSignboardProtocolUrlInArgs(process.argv));
    createWindow();
    buildApplicationMenu();
    setupAutoUpdater();
  });
}

app.on('activate', () => {
  if (isCliMode) {
    return;
  }

  const win = ensureMainWindowVisible();
  if (win) {
    return;
  }
});

app.on('browser-window-focus', () => {
  if (isCliMode || isMcpServerMode || isMcpConfigMode) {
    return;
  }

  ensureApplicationMenu();
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

  if (externalPublishedCalendarServer) {
    externalPublishedCalendarServer.close();
    externalPublishedCalendarServer = null;
  }
});

app.on('will-quit', () => {
  unregisterQuickAddGlobalShortcut();
});

app.on('window-all-closed', () => {
  if (isMcpServerMode || isCliMode) {
    return;
  }

  app.quit();
});
