const { contextBridge, ipcRenderer, webUtils } = require('electron');

function invokeBoard(op, ...args) {
  return ipcRenderer.invoke('board-call', { op, args });
}

function getNormalizedBaseName(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }

  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function getPathForDroppedFile(file) {
  if (!file || !webUtils || typeof webUtils.getPathForFile !== 'function') {
    return typeof file?.path === 'string' ? file.path : '';
  }

  try {
    return webUtils.getPathForFile(file) || (typeof file.path === 'string' ? file.path : '');
  } catch {
    return typeof file?.path === 'string' ? file.path : '';
  }
}

function getDroppedFilePaths(files) {
  const sourceFiles = Array.isArray(files)
    ? files
    : (files && typeof files.length === 'number' ? Array.from(files) : [files]);

  return sourceFiles
    .map(getPathForDroppedFile)
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean);
}

contextBridge.exposeInMainWorld('board', {
  authorizeBoardSelection: async (selectionToken) => invokeBoard('authorizeBoardSelection', selectionToken),
  adoptLegacyBoardRoots: async (boardRoots) => invokeBoard('adoptLegacyBoardRoots', boardRoots),
  setActiveBoardRoot: async (boardRoot) => invokeBoard('setActiveBoardRoot', boardRoot),
  clearActiveBoardRoot: async () => invokeBoard('clearActiveBoardRoot'),
  listLists: async (root) => invokeBoard('listLists', root),
  listCards: async (listPath) => invokeBoard('listCards', listPath),
  countCards: async (listPath) => invokeBoard('countCards', listPath),
  getBoardName: (filePath) => getNormalizedBaseName(filePath),
  getCardID: (filePath) => {
    const cardFileName = getNormalizedBaseName(filePath);
    return cardFileName.slice(cardFileName.length - 8, cardFileName.length - 3);
  },
  getCardTitle: async (filePath) => invokeBoard('getCardTitle', filePath),
  formatDueDate: async (dateString) => invokeBoard('formatDueDate', dateString),
  getCardFileName: (filePath) => getNormalizedBaseName(filePath),
  getListDirectoryName: (filePath) => getNormalizedBaseName(filePath),
  listDirectories: async (root) => invokeBoard('listDirectories', root),
  startBoardWatch: async (boardRoot) => invokeBoard('startBoardWatch', boardRoot),
  stopBoardWatch: async () => invokeBoard('stopBoardWatch'),
  getBoardWatchToken: async () => invokeBoard('getBoardWatchToken'),
  openCard: async (filePath) => invokeBoard('openCard', filePath),
  openCardDefault: async (filePath) => invokeBoard('openCardDefault', filePath),
  openCardInObsidian: async (filePath) => invokeBoard('openCardInObsidian', filePath),
  openRelatedObsidianNote: async (boardRoot, filePath, related) =>
    invokeBoard('openRelatedObsidianNote', boardRoot, filePath, related),
  addLinkedObject: async (filePath, linkedObject) => invokeBoard('addLinkedObject', filePath, linkedObject),
  openLinkedObject: async (filePath, linkedObject) => invokeBoard('openLinkedObject', filePath, linkedObject),
  copyCardObsidianUri: async (filePath) => invokeBoard('copyCardObsidianUri', filePath),
  copyCardSignboardUri: async (filePath) => invokeBoard('copyCardSignboardUri', filePath),
  getCardExternalLinks: async (filePath) => invokeBoard('getCardExternalLinks', filePath),
  shareCard: async (filePath) => ipcRenderer.invoke('share-file', filePath),
  readCard: async (filePath) => invokeBoard('readCard', filePath),
  listArchiveEntries: async () => invokeBoard('listArchiveEntries'),
  readArchiveEntry: async (entryPath) => invokeBoard('readArchiveEntry', entryPath),
  writeCard: async (filePath, card) => invokeBoard('writeCard', filePath, card),
  updateFrontmatter: async (filePath, partialFrontmatter) =>
    invokeBoard('updateFrontmatter', filePath, partialFrontmatter),
  normalizeFrontmatter: async (frontmatter) => invokeBoard('normalizeFrontmatter', frontmatter),
  readBoardSettings: async (boardRoot) => invokeBoard('readBoardSettings', boardRoot),
  updateBoardLabels: async (boardRoot, labels) => invokeBoard('updateBoardLabels', boardRoot, labels),
  updateBoardThemeOverrides: async (boardRoot, themeOverrides) =>
    invokeBoard('updateBoardThemeOverrides', boardRoot, themeOverrides),
  updateBoardSettings: async (boardRoot, partialSettings) =>
    invokeBoard('updateBoardSettings', boardRoot, partialSettings),
  createCard: async (filePath, content) => invokeBoard('createCard', filePath, content),
  generateObsidianBase: async (boardRoot) => invokeBoard('generateObsidianBase', boardRoot),
  openObsidianBase: async (boardRoot) => invokeBoard('openObsidianBase', boardRoot),
  createLinkedObsidianNote: async (boardRoot, filePath) =>
    invokeBoard('createLinkedObsidianNote', boardRoot, filePath),
  archiveCard: async (filePath) => invokeBoard('archiveCard', filePath),
  archiveList: async (listPath) => invokeBoard('archiveList', listPath),
  restoreArchivedCard: async (archivedCardPath, targetListPath) =>
    invokeBoard('restoreArchivedCard', archivedCardPath, targetListPath),
  restoreArchivedList: async (archivedListPath, restoredDirectoryName) =>
    invokeBoard('restoreArchivedList', archivedListPath, restoredDirectoryName),
  recordCardListMove: async (cardPath, fromListPath, toListPath) =>
    invokeBoard('recordCardListMove', cardPath, fromListPath, toListPath),
  moveCardToTop: async (cardPath, targetListPath) => invokeBoard('moveCardToTop', cardPath, targetListPath),
  moveCard: async (src, dst) => invokeBoard('moveCard', src, dst),
  moveList: async (src, dst) => invokeBoard('moveList', src, dst),
  createList: async (listPath) => invokeBoard('createList', listPath),
  deleteList: async (listPath) => invokeBoard('deleteList', listPath),
  importTrello: async (boardRoot, selectionToken) => invokeBoard('importTrello', boardRoot, selectionToken),
  importObsidian: async (boardRoot, selectionTokens) => invokeBoard('importObsidian', boardRoot, selectionTokens),
  importTasksMd: async (boardRoot, selectionTokens) => invokeBoard('importTasksMd', boardRoot, selectionTokens),
  copyExternal: async () => {
    throw new Error('UNSUPPORTED_OPERATION');
  },
});

contextBridge.exposeInMainWorld('chooser', {
  pickDirectory: (opts = {}) => ipcRenderer.invoke('choose-directory', opts),
  pickImportSources: (opts = {}) => ipcRenderer.invoke('pick-import-sources', opts),
  pickLinkedObjects: (opts = {}) => ipcRenderer.invoke('pick-linked-objects', opts),
  linkDroppedObjects: (cardPath, files) => {
    const droppedPaths = getDroppedFilePaths(files);
    return invokeBoard('addDroppedLinkedObjects', cardPath, droppedPaths);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  readAppSettings: () => ipcRenderer.invoke('read-app-settings'),
  updateAppSettings: (partialSettings) => ipcRenderer.invoke('update-app-settings', partialSettings),
  getGlobalShortcutStatus: () => ipcRenderer.invoke('get-global-shortcut-status'),
  migrateAppSettingsFromBoard: (boardRoot) => ipcRenderer.invoke('migrate-app-settings-from-board', boardRoot),
  copyTextToClipboard: (text) => ipcRenderer.invoke('copy-text-to-clipboard', text),
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  notifyDueCards: (payload) => ipcRenderer.invoke('notify-due-cards', payload),
  onOpenAboutSignboard: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('open-about-signboard', listener);
    return () => {
      ipcRenderer.removeListener('open-about-signboard', listener);
    };
  },
  onOpenKeyboardShortcuts: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('open-keyboard-shortcuts', listener);
    return () => {
      ipcRenderer.removeListener('open-keyboard-shortcuts', listener);
    };
  },
  onOpenBoardSwitcher: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('open-board-switcher', listener);
    return () => {
      ipcRenderer.removeListener('open-board-switcher', listener);
    };
  },
  onOpenBoardSettings: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('open-board-settings', listener);
    return () => {
      ipcRenderer.removeListener('open-board-settings', listener);
    };
  },
  onOpenQuickAddCard: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('open-quick-add-card', listener);
    return () => {
      ipcRenderer.removeListener('open-quick-add-card', listener);
    };
  },
  onOpenSignboardCardLink: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on('open-signboard-card-link', listener);
    return () => {
      ipcRenderer.removeListener('open-signboard-card-link', listener);
    };
  },
  onOpenSignboardBoardLink: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on('open-signboard-board-link', listener);
    return () => {
      ipcRenderer.removeListener('open-signboard-board-link', listener);
    };
  },
  onToggleThemeMode: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('toggle-theme-mode', listener);
    return () => {
      ipcRenderer.removeListener('toggle-theme-mode', listener);
    };
  },
  onSwitchBoardView: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, viewId) => {
      callback(viewId);
    };

    ipcRenderer.on('switch-board-view', listener);
    return () => {
      ipcRenderer.removeListener('switch-board-view', listener);
    };
  },
});
