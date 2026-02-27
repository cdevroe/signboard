/*!
 * Signboard - A local-first Kanban app that writes Markdown
 * Copyright (c) 2025 Colin Devroe - cdevroe.com
 * Licensed under the MIT License. See LICENSE file for details.
 */

const { app, BrowserWindow, dialog, ipcMain, ShareMenu, shell } = require('electron');
const fs = require('fs').promises;
const path = require('path');

app.on('ready', () => {
  app.setName('SignBoard');
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 1024,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  const shouldOpenExternally = (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }

    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (shouldOpenExternally(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadFile('index.html');
}

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
  // returns an array, but single selection when openDirectory is used
  return result.filePaths[0] || null;
});

ipcMain.handle('share-file', async (event, filePath) => {
  const normalizedPath = typeof filePath === 'string' ? path.normalize(filePath) : '';
  if (!normalizedPath) {
    return { ok: false, error: 'INVALID_PATH' };
  }

  try {
    await fs.access(normalizedPath);
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
