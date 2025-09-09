/*!
 * Signboard - A local-first Kanban app that writes Markdown
 * Copyright (c) 2025 Colin Devroe - cdevroe.com
 * Licensed under the MIT License. See LICENSE file for details.
 */

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
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
      enableRemoteModule: false,
      nodeIntegration: true
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
      'openDirectory',     // pick a directory
      'createDirectory',   // allow creating a new folder
      // 'dontAddToRecent', // optional
    ],
  });
  if (result.canceled) return null;
  // returns an array, but single selection when openDirectory is used
  return result.filePaths[0] || null;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());