const { contextBridge, ipcRenderer, shell } = require('electron');
const fsNative = require('fs');
const fs = fsNative.promises;
const path = require('path');
const cardFrontmatter = require('./lib/cardFrontmatter');
const boardLabels = require('./lib/boardLabels');
const cardFileSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup'
});
const dueDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const BOARD_WATCH_RESCAN_DELAY_MS = 180;

const boardWatchState = {
  activeRoot: '',
  rootWatcher: null,
  listWatchers: new Map(),
  rescanTimeout: null,
  changeToken: 0,
};

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

function clearBoardRescanTimer() {
  if (boardWatchState.rescanTimeout) {
    clearTimeout(boardWatchState.rescanTimeout);
    boardWatchState.rescanTimeout = null;
  }
}

function clearListWatchers() {
  for (const watcher of boardWatchState.listWatchers.values()) {
    closeWatcher(watcher);
  }
  boardWatchState.listWatchers.clear();
}

function bumpBoardWatchToken() {
  boardWatchState.changeToken += 1;
}

function normalizeBoardRootForWatch(rootPath) {
  const input = String(rootPath || '').trim();
  if (!input) {
    return '';
  }

  return path.resolve(input);
}

function attachDirectoryWatcher(directoryPath, onChange) {
  try {
    const watcher = fsNative.watch(directoryPath, { persistent: false }, () => {
      onChange();
    });

    watcher.on('error', () => {
      // Ignore watch errors; rescan logic will naturally recover.
    });

    return watcher;
  } catch {
    return null;
  }
}

async function refreshBoardListWatchers() {
  if (!boardWatchState.activeRoot) {
    return;
  }

  let entries = [];
  try {
    entries = await fs.readdir(boardWatchState.activeRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const expectedListPaths = new Set(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.resolve(path.join(boardWatchState.activeRoot, entry.name))),
  );

  for (const [listPath, watcher] of boardWatchState.listWatchers.entries()) {
    if (!expectedListPaths.has(listPath)) {
      closeWatcher(watcher);
      boardWatchState.listWatchers.delete(listPath);
    }
  }

  for (const listPath of expectedListPaths) {
    if (boardWatchState.listWatchers.has(listPath)) {
      continue;
    }

    const watcher = attachDirectoryWatcher(listPath, () => {
      bumpBoardWatchToken();
    });

    if (watcher) {
      boardWatchState.listWatchers.set(listPath, watcher);
    }
  }
}

function scheduleBoardWatchRescan() {
  clearBoardRescanTimer();
  boardWatchState.rescanTimeout = setTimeout(() => {
    boardWatchState.rescanTimeout = null;
    refreshBoardListWatchers().catch(() => {
      // Ignore failed rescans; a later fs event will retry.
    });
  }, BOARD_WATCH_RESCAN_DELAY_MS);
}

async function startBoardWatch(boardRoot) {
  const normalizedRoot = normalizeBoardRootForWatch(boardRoot);
  if (!normalizedRoot) {
    return { ok: false, error: 'INVALID_BOARD_ROOT' };
  }

  if (boardWatchState.activeRoot === normalizedRoot && boardWatchState.rootWatcher) {
    return { ok: true, boardRoot: normalizedRoot };
  }

  await stopBoardWatch();

  boardWatchState.activeRoot = normalizedRoot;

  const rootWatcher = attachDirectoryWatcher(normalizedRoot, () => {
    bumpBoardWatchToken();
    scheduleBoardWatchRescan();
  });

  if (!rootWatcher) {
    boardWatchState.activeRoot = '';
    return { ok: false, error: 'WATCH_START_FAILED' };
  }

  boardWatchState.rootWatcher = rootWatcher;
  await refreshBoardListWatchers();
  bumpBoardWatchToken();

  return { ok: true, boardRoot: normalizedRoot };
}

async function stopBoardWatch() {
  clearBoardRescanTimer();
  clearListWatchers();
  closeWatcher(boardWatchState.rootWatcher);
  boardWatchState.rootWatcher = null;
  boardWatchState.activeRoot = '';
  boardWatchState.changeToken = 0;
  return { ok: true };
}

contextBridge.exposeInMainWorld('board', {
  listLists: async (root) => {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    let directories = dirs.filter(d => d.isDirectory()).map(d => d.name);
    directories = directories.filter(d => d !== 'XXX-Archive'); // Removes the archive directory from the list
    return directories;
  },

  listCards: async (listPath) => {
    const files = await fs.readdir(listPath, { withFileTypes: true });

    let sortedFiles = files.filter(f => f.isFile() && f.name.endsWith('.md')).map(f => f.name);

    sortedFiles.sort((a, b) => cardFileSortCollator.compare(a, b));

    return sortedFiles;
  },

  countCards: async (listPath) => { // Reduce code by reusing listCards()?
    const files = await fs.readdir(listPath, { withFileTypes: true });
    return files.filter(f => f.isFile() && f.name.endsWith('.md'))
                .map(f => f.name).length;
  },

  getBoardName: async (filePath) => {
    return path.basename(path.normalize(filePath));
  },

  getCardID: async (filePath) => {
    const cardFileName = path.basename(path.normalize(filePath));
    return cardFileName.slice(cardFileName.length - 8, cardFileName.length - 3);
  },

  getCardTitle: async (filePath) => {
    const card = await cardFrontmatter.readCard(filePath);
    return card.frontmatter.title;
  },

  formatDueDate: async (dateString) => { // 2025-10-06 > Oct 6
    const [year, month, day] = dateString.split("-").map(Number);
    const dateToDisplay = new Date(year, month -1, day);
    return dueDateFormatter.format(dateToDisplay);
  },

  getCardFileName: (filePath) => path.basename(path.normalize(filePath)),

  getListDirectoryName: (filePath) => path.basename(path.normalize(filePath)),

  listDirectories: async (root) => {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    let directories = dirs.filter(d => d.isDirectory()).map(d => d.name);
    return directories;
  },

  startBoardWatch: async (boardRoot) => await startBoardWatch(boardRoot),

  stopBoardWatch: async () => await stopBoardWatch(),

  getBoardWatchToken: async () => boardWatchState.changeToken,

  openCard: async (filePath) => await shell.showItemInFolder(filePath),

  shareCard: async (filePath) => ipcRenderer.invoke('share-file', filePath),

  readCard: async (filePath) => await cardFrontmatter.readCard(filePath),

  writeCard: async (filePath, card) => await cardFrontmatter.writeCard(filePath, card),

  updateFrontmatter: async (filePath, partialFrontmatter) =>
    await cardFrontmatter.updateFrontmatter(filePath, partialFrontmatter),

  normalizeFrontmatter: async (frontmatter) => cardFrontmatter.normalizeFrontmatter(frontmatter),

  readBoardSettings: async (boardRoot) => await boardLabels.readBoardSettings(boardRoot),

  updateBoardLabels: async (boardRoot, labels) => await boardLabels.updateBoardLabels(boardRoot, labels),

  updateBoardThemeOverrides: async (boardRoot, themeOverrides) =>
    await boardLabels.updateBoardThemeOverrides(boardRoot, themeOverrides),

  updateBoardSettings: async (boardRoot, partialSettings) =>
    await boardLabels.updateBoardSettings(boardRoot, partialSettings),

  createCard: async (filePath, content) => {
    const asString = String(content || '');
    const lines = asString.split(/\r?\n/);
    const title = (lines.shift() || '').trim();
    const body = lines.join('\n').replace(/^\n+/, '');

    await cardFrontmatter.writeCard(filePath, {
      frontmatter: { title: title || 'Untitled' },
      body,
    });
  },

  moveCard: async (src, dst) => await fs.rename(src, dst),

  moveList: async (src, dst) => await fs.rename(src, dst),

  createList: async (listPath) => await fs.mkdir(listPath),

  deleteList: async (listPath) => await fs.rmdir(listPath),

  importFromTrello: async function(filePath) {

    const importedFromTrello = localStorage.getItem('importedFromTrello');

    if ( importedFromTrello ) { // Only import once
      return;
    }

    const jsonPath = filePath + '/trello.json';
    const outRoot = filePath;

    try {
      await fs.access(jsonPath, fsNative.constants.F_OK);
    } catch {
      return;
    }

    const raw = await fs.readFile(jsonPath, 'utf8');

    const data = await JSON.parse(raw);

    const listMap = {};          // id -> name
    const cardsByList = {};      // listName -> [card, …]

    if (!Array.isArray(data.cards) || !Array.isArray(data.lists)) {
      console.error('Export JSON must contain "cards" and "lists" arrays.');
    }

    for (const list of data.lists) {
      listMap[list.id] = list.name;
    }

    for (const card of data.cards) {
      const listName = listMap[card.idList] || 'UnknownList';
      if (!cardsByList[listName]) cardsByList[listName] = [];
      cardsByList[listName].push(card);
    }

    let listNumber = '0';
    let listCount = 0;

    for (const [listName, cards] of Object.entries(cardsByList)) {

      listNumber = listCount.toString().padStart(3,'0');

      const folder = path.join(outRoot, listNumber + '-' + sanitize(listName) + '-trelo');
      await fs.mkdir(folder, { recursive: true });

      listCount++;

      // Sort cards by their Trello position
      cards.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

      // Write each card as a markdown file
      for (const [idx, card] of cards.entries()) {
        const number = String(idx + 1).padStart(3, '0');   // 001‑999
        const fileName = `${number}-${await importsanitizeFileName(card.name)}-${await importrand5()}.md`;
        const filePath = path.join(folder, fileName);

        await cardFrontmatter.writeCard(filePath, {
          frontmatter: { title: escapeMarkdown(card.name) },
          body: card.desc || '',
        });
      }
    }
    await fs.mkdir(filePath + '/XXX-Archive');
    localStorage.setItem('importedFromTrello',true);
  },

  copyExternal: async (src, dstDir) => {
    const dst = path.join(dstDir, path.basename(src));
    await fs.copyFile(src, dst);
    return dst;
  }
});

contextBridge.exposeInMainWorld('chooser', {
  pickDirectory: (opts = {}) => ipcRenderer.invoke('choose-directory', opts),
});

contextBridge.exposeInMainWorld("electronAPI", {
  openExternal: (url) => shell.openExternal(url),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});

// Remove characters that are not allowed in filenames
function sanitize(str) {
  return str.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'untitled';
}

async function importsanitizeFileName(rawName) {
  // 1. Split into base name + extension (if any)
  const lastDot = rawName.lastIndexOf('.');
  const ext = (lastDot !== -1) ? rawName.slice(lastDot) : '';
  const base = (lastDot !== -1) ? rawName.slice(0, lastDot) : rawName;

  // 2. Remove unsafe chars
  // Allowed: letters, digits, space, underscore, hyphen, dot (only as separator)
  const allowed = /^[\p{L}\p{N}_\-.\s]+$/u;      // Unicode aware
  const cleanedBase = base
    .replace(/[\\\/:*?"<>|]/g, '')     // common Windows forbidden chars
    .replace(/[^\p{L}\p{N}_\-.\s]/gu, '') // remove everything else
    .trim();                          // strip leading/trailing whitespace

  // 3. Truncate to 100 chars *including* the extension
  const maxTotal = 100;
  const maxBase = Math.max(0, maxTotal - [...ext].length);

  // Use spread [...str] to safely cut by code‑points (not UTF‑16 surrogates)
  const truncatedBase = [...cleanedBase].slice(0, maxBase).join('');

  // 4. Windows forbids names ending in '.' or ' ' – strip those
  const finalBase = truncatedBase.replace(/[ .]+$/g, '');

  // 5. Return combined result
  const finalName = finalBase.slice(0,25) + ext;
  return finalName || '999-untitled.md'; // fallback if everything was stripped
}

async function importrand5() {
  return [...Array(5)]
      .map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 60)))
        .join('');
}

// Escape Markdown special characters in titles (optional)
function escapeMarkdown(text) {
  return text.replace(/([#*_`\[\]])/g, '\\$1');
}
