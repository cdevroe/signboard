const { contextBridge, ipcRenderer } = require('electron');

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
  shareCard: async (filePath) => ipcRenderer.invoke('share-file', filePath),
  readCard: async (filePath) => invokeBoard('readCard', filePath),
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
  moveCard: async (src, dst) => invokeBoard('moveCard', src, dst),
  moveList: async (src, dst) => invokeBoard('moveList', src, dst),
  createList: async (listPath) => invokeBoard('createList', listPath),
  deleteList: async (listPath) => invokeBoard('deleteList', listPath),
  importFromTrello: async (boardRoot) => invokeBoard('importFromTrello', boardRoot),
  copyExternal: async () => {
    throw new Error('UNSUPPORTED_OPERATION');
  },
});

contextBridge.exposeInMainWorld('chooser', {
  pickDirectory: (opts = {}) => ipcRenderer.invoke('choose-directory', opts),
});

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
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
});
