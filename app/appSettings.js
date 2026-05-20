const DEFAULT_APP_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  time: '09:00',
});
const DEFAULT_APP_TOOLTIPS_ENABLED = true;
const DEFAULT_APP_QUICK_ADD_SETTINGS = Object.freeze({
  globalShortcut: '',
});

function getAppSettingsState() {
  if (!window.__signboardAppSettingsState) {
    window.__signboardAppSettingsState = {
      settingsLoaded: false,
      notificationSettings: { ...DEFAULT_APP_NOTIFICATION_SETTINGS },
      tooltipsEnabled: DEFAULT_APP_TOOLTIPS_ENABLED,
      quickAddSettings: { ...DEFAULT_APP_QUICK_ADD_SETTINGS },
      globalShortcutStatus: {
        accelerator: '',
        registered: false,
        message: '',
      },
      settingsSaveTimer: null,
      settingsSaveInFlight: Promise.resolve(),
    };
  }

  return window.__signboardAppSettingsState;
}

function normalizeAppNotificationTime(value) {
  const candidate = String(value || '').trim();
  if (/^(?:0[1-9]|1\d|2[0-4]):[0-5]\d$/.test(candidate)) {
    return candidate;
  }

  return DEFAULT_APP_NOTIFICATION_SETTINGS.time;
}

function normalizeAppNotificationSettings(notificationSettings) {
  const source = notificationSettings && typeof notificationSettings === 'object' && !Array.isArray(notificationSettings)
    ? notificationSettings
    : {};
  return {
    enabled: source.enabled === true,
    time: normalizeAppNotificationTime(source.time),
  };
}

function normalizeAppTooltipsEnabled(value) {
  return value === false ? false : DEFAULT_APP_TOOLTIPS_ENABLED;
}

function normalizeAppGlobalShortcutAccelerator(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, '');

  if (!candidate || candidate.length > 80) {
    return '';
  }

  return candidate;
}

function normalizeAppQuickAddSettings(quickAddSettings) {
  const source = quickAddSettings && typeof quickAddSettings === 'object' && !Array.isArray(quickAddSettings)
    ? quickAddSettings
    : {};

  return {
    globalShortcut: normalizeAppGlobalShortcutAccelerator(source.globalShortcut),
  };
}

function normalizeAppGlobalShortcutStatus(status) {
  const source = status && typeof status === 'object' && !Array.isArray(status)
    ? status
    : {};

  return {
    accelerator: normalizeAppGlobalShortcutAccelerator(source.accelerator),
    registered: source.registered === true,
    message: typeof source.message === 'string' ? source.message.trim() : '',
  };
}

function getAppNotificationSettings() {
  return normalizeAppNotificationSettings(getAppSettingsState().notificationSettings);
}

function setAppNotificationSettings(notificationSettings) {
  const state = getAppSettingsState();
  state.notificationSettings = normalizeAppNotificationSettings(notificationSettings);
}

function getAppTooltipsEnabled() {
  return normalizeAppTooltipsEnabled(getAppSettingsState().tooltipsEnabled);
}

function setAppTooltipsEnabled(value) {
  const state = getAppSettingsState();
  state.tooltipsEnabled = normalizeAppTooltipsEnabled(value);

  if (typeof setTooltipsEnabled === 'function') {
    setTooltipsEnabled(state.tooltipsEnabled);
  }
}

function getAppQuickAddSettings() {
  return normalizeAppQuickAddSettings(getAppSettingsState().quickAddSettings);
}

function setAppQuickAddSettings(quickAddSettings) {
  const state = getAppSettingsState();
  state.quickAddSettings = normalizeAppQuickAddSettings(quickAddSettings);
}

function getAppGlobalShortcutStatus() {
  return normalizeAppGlobalShortcutStatus(getAppSettingsState().globalShortcutStatus);
}

function setAppGlobalShortcutStatus(status) {
  const state = getAppSettingsState();
  state.globalShortcutStatus = normalizeAppGlobalShortcutStatus(status);
}

function applyAppSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  setAppNotificationSettings(source.notifications || DEFAULT_APP_NOTIFICATION_SETTINGS);
  setAppTooltipsEnabled(source.tooltipsEnabled);
  setAppQuickAddSettings(source.quickAdd || DEFAULT_APP_QUICK_ADD_SETTINGS);
  setAppGlobalShortcutStatus(source.globalShortcutStatus);
  getAppSettingsState().settingsLoaded = true;
}

async function loadAppSettings() {
  if (!window.electronAPI || typeof window.electronAPI.readAppSettings !== 'function') {
    applyAppSettings({});
    return {
      notifications: getAppNotificationSettings(),
      tooltipsEnabled: getAppTooltipsEnabled(),
      quickAdd: getAppQuickAddSettings(),
      globalShortcutStatus: getAppGlobalShortcutStatus(),
    };
  }

  const settings = await window.electronAPI.readAppSettings();
  applyAppSettings(settings);
  renderAppSettingsControls();
  return settings;
}

async function migrateAppSettingsFromOpenBoards() {
  if (
    !window.electronAPI ||
    typeof window.electronAPI.migrateAppSettingsFromBoard !== 'function' ||
    typeof getStoredOpenBoards !== 'function'
  ) {
    await loadAppSettings();
    return;
  }

  const openBoards = getStoredOpenBoards();
  const sourceBoardRoot = Array.isArray(openBoards) && openBoards.length > 0
    ? openBoards[0]
    : '';

  if (sourceBoardRoot) {
    try {
      let migratedSettings = null;
      for (const boardRoot of openBoards) {
        const result = await window.electronAPI.migrateAppSettingsFromBoard(boardRoot);
        if (!migratedSettings && result && result.settings) {
          migratedSettings = result.settings;
        }
      }

      if (migratedSettings) {
        applyAppSettings(migratedSettings);
        renderAppSettingsControls();
        return;
      }
    } catch (error) {
      console.warn('Unable to migrate app settings from board settings.', error);
    }
  }

  await loadAppSettings();
}

function renderAppSettingsControls() {
  const tooltipsToggle = document.getElementById('boardSettingsTooltipsToggle');
  const notificationsToggle = document.getElementById('boardSettingsNotificationsToggle');
  const notificationsTimeInput = document.getElementById('boardSettingsNotificationsTime');
  const quickAddShortcutInput = document.getElementById('boardSettingsQuickAddShortcut');
  const quickAddShortcutStatus = document.getElementById('boardSettingsQuickAddShortcutStatus');
  const notifications = getAppNotificationSettings();
  const quickAdd = getAppQuickAddSettings();
  const globalShortcutStatus = getAppGlobalShortcutStatus();

  if (tooltipsToggle) {
    tooltipsToggle.checked = getAppTooltipsEnabled();
  }

  if (notificationsToggle) {
    notificationsToggle.checked = notifications.enabled;
  }

  if (notificationsTimeInput) {
    notificationsTimeInput.value = notifications.time;
  }

  if (quickAddShortcutInput) {
    quickAddShortcutInput.value = quickAdd.globalShortcut;
  }

  if (quickAddShortcutStatus) {
    const shortcut = quickAdd.globalShortcut;
    quickAddShortcutStatus.classList.remove('is-success', 'is-warning');

    if (!shortcut) {
      quickAddShortcutStatus.textContent = 'Disabled';
    } else if (globalShortcutStatus.accelerator === shortcut && globalShortcutStatus.registered) {
      quickAddShortcutStatus.textContent = 'Registered';
      quickAddShortcutStatus.classList.add('is-success');
    } else if (globalShortcutStatus.accelerator === shortcut && globalShortcutStatus.message) {
      quickAddShortcutStatus.textContent = globalShortcutStatus.message;
      quickAddShortcutStatus.classList.add('is-warning');
    } else {
      quickAddShortcutStatus.textContent = 'Saved';
    }
  }
}

function scheduleAppSettingsSave() {
  const state = getAppSettingsState();
  if (state.settingsSaveTimer) {
    clearTimeout(state.settingsSaveTimer);
  }

  state.settingsSaveTimer = setTimeout(() => {
    state.settingsSaveTimer = null;
    persistAppSettings();
  }, 250);
}

function persistAppSettings() {
  const state = getAppSettingsState();

  state.settingsSaveInFlight = state.settingsSaveInFlight
    .then(async () => {
      if (!window.electronAPI || typeof window.electronAPI.updateAppSettings !== 'function') {
        return;
      }

      const result = await window.electronAPI.updateAppSettings({
        notifications: getAppNotificationSettings(),
        tooltipsEnabled: getAppTooltipsEnabled(),
        quickAdd: getAppQuickAddSettings(),
      });
      applyAppSettings(result);
      renderAppSettingsControls();
    })
    .catch((error) => {
      console.error('Unable to save app settings.', error);
    });

  return state.settingsSaveInFlight;
}

async function flushAppSettingsSave() {
  const state = getAppSettingsState();
  if (state.settingsSaveTimer) {
    clearTimeout(state.settingsSaveTimer);
    state.settingsSaveTimer = null;
    await persistAppSettings();
    return;
  }

  await state.settingsSaveInFlight;
}
