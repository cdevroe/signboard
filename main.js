/*!
 * Signboard - A local-first Kanban app that writes Markdown
 * Copyright (c) 2025 Colin Devroe - cdevroe.com
 * Licensed under the MIT License. See LICENSE file for details.
 */

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, ShareMenu, shell, powerSaveBlocker, nativeImage, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
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
      sandbox: false,
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
