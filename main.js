/*!
 * Signboard - A local-first Kanban app that writes Markdown
 * Copyright (c) 2025 Colin Devroe - cdevroe.com
 * Licensed under the MIT License. See LICENSE file for details.
 */

const { app, BrowserWindow, dialog, ipcMain, Menu, ShareMenu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs').promises;
const path = require('path');

const GITHUB_OWNER = 'cdevroe';
const GITHUB_REPO = 'signboard';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_PREFS_FILE = 'update-preferences.json';

const updateState = {
  checkInProgress: false,
  activeCheckIsManual: false,
  downloadInProgress: false,
  reminderByVersion: {},
  checkIntervalId: null,
};

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

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0] || null;
}

function getUpdatePreferencesPath() {
  return path.join(app.getPath('userData'), UPDATE_PREFS_FILE);
}

async function loadUpdatePreferences() {
  const prefsPath = getUpdatePreferencesPath();

  try {
    const raw = await fs.readFile(prefsPath, 'utf8');
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
  await fs.writeFile(prefsPath, JSON.stringify(payload, null, 2), 'utf8');
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

  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
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
      !isMac ? createCheckForUpdatesMenuItem() : null,
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

ipcMain.handle('check-for-updates', async () => {
  await checkForUpdates({ manual: true });
  return { ok: true };
});

app.whenReady().then(async () => {
  await loadUpdatePreferences();
  createWindow();
  buildApplicationMenu();
  setupAutoUpdater();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (updateState.checkIntervalId) {
    clearInterval(updateState.checkIntervalId);
    updateState.checkIntervalId = null;
  }
});

app.on('window-all-closed', () => app.quit());
