const DEFAULT_APP_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  time: '09:00',
});
const DEFAULT_APP_TOOLTIPS_ENABLED = true;

function getAppSettingsState() {
  if (!window.__signboardAppSettingsState) {
    window.__signboardAppSettingsState = {
      settingsLoaded: false,
      notificationSettings: { ...DEFAULT_APP_NOTIFICATION_SETTINGS },
      tooltipsEnabled: DEFAULT_APP_TOOLTIPS_ENABLED,
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

function applyAppSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  setAppNotificationSettings(source.notifications || DEFAULT_APP_NOTIFICATION_SETTINGS);
  setAppTooltipsEnabled(source.tooltipsEnabled);
  getAppSettingsState().settingsLoaded = true;
}

async function loadAppSettings() {
  if (!window.electronAPI || typeof window.electronAPI.readAppSettings !== 'function') {
    applyAppSettings({});
    return {
      notifications: getAppNotificationSettings(),
      tooltipsEnabled: getAppTooltipsEnabled(),
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
  const notifications = getAppNotificationSettings();

  if (tooltipsToggle) {
    tooltipsToggle.checked = getAppTooltipsEnabled();
  }

  if (notificationsToggle) {
    notificationsToggle.checked = notifications.enabled;
  }

  if (notificationsTimeInput) {
    notificationsTimeInput.value = notifications.time;
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
