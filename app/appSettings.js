const DEFAULT_APP_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  time: '09:00',
});
const DEFAULT_APP_TOOLTIPS_ENABLED = true;
const DEFAULT_APP_QUICK_ADD_SETTINGS = Object.freeze({
  globalShortcut: '',
});
const DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS = Object.freeze({
  enabled: false,
  port: 48273,
  token: '',
});
const DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_STATUS = Object.freeze({
  enabled: false,
  running: false,
  port: 48273,
  url: '',
  message: 'Disabled',
});

function getAppSettingsState() {
  if (!window.__signboardAppSettingsState) {
    window.__signboardAppSettingsState = {
      settingsLoaded: false,
      notificationSettings: { ...DEFAULT_APP_NOTIFICATION_SETTINGS },
      tooltipsEnabled: DEFAULT_APP_TOOLTIPS_ENABLED,
      quickAddSettings: { ...DEFAULT_APP_QUICK_ADD_SETTINGS },
      externalPublishedCalendarSettings: { ...DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS },
      externalPublishedCalendarStatus: { ...DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_STATUS },
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

function normalizeAppExternalPublishedCalendarPort(value) {
  const parsedPort = Number.parseInt(String(value || ''), 10);
  if (Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535) {
    return parsedPort;
  }

  return DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS.port;
}

function normalizeAppExternalPublishedCalendarToken(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 160) {
    return '';
  }

  return /^[A-Za-z0-9._~-]+$/.test(candidate) ? candidate : '';
}

function normalizeAppExternalPublishedCalendarSettings(calendarSettings) {
  const source = calendarSettings && typeof calendarSettings === 'object' && !Array.isArray(calendarSettings)
    ? calendarSettings
    : {};

  return {
    enabled: source.enabled === true,
    port: normalizeAppExternalPublishedCalendarPort(source.port),
    token: normalizeAppExternalPublishedCalendarToken(source.token),
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

function normalizeAppExternalPublishedCalendarStatus(status) {
  const source = status && typeof status === 'object' && !Array.isArray(status)
    ? status
    : {};

  return {
    enabled: source.enabled === true,
    running: source.running === true,
    port: normalizeAppExternalPublishedCalendarPort(source.port),
    url: typeof source.url === 'string' ? source.url.trim() : '',
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

function getAppExternalPublishedCalendarSettings() {
  return normalizeAppExternalPublishedCalendarSettings(getAppSettingsState().externalPublishedCalendarSettings);
}

function setAppExternalPublishedCalendarSettings(calendarSettings) {
  const state = getAppSettingsState();
  state.externalPublishedCalendarSettings = normalizeAppExternalPublishedCalendarSettings(calendarSettings);
}

function getAppGlobalShortcutStatus() {
  return normalizeAppGlobalShortcutStatus(getAppSettingsState().globalShortcutStatus);
}

function setAppGlobalShortcutStatus(status) {
  const state = getAppSettingsState();
  state.globalShortcutStatus = normalizeAppGlobalShortcutStatus(status);
}

function getAppExternalPublishedCalendarStatus() {
  return normalizeAppExternalPublishedCalendarStatus(getAppSettingsState().externalPublishedCalendarStatus);
}

function setAppExternalPublishedCalendarStatus(status) {
  const state = getAppSettingsState();
  state.externalPublishedCalendarStatus = normalizeAppExternalPublishedCalendarStatus(status);
}

function applyAppSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  setAppNotificationSettings(source.notifications || DEFAULT_APP_NOTIFICATION_SETTINGS);
  setAppTooltipsEnabled(source.tooltipsEnabled);
  setAppQuickAddSettings(source.quickAdd || DEFAULT_APP_QUICK_ADD_SETTINGS);
  setAppExternalPublishedCalendarSettings(source.externalPublishedCalendar || DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS);
  setAppGlobalShortcutStatus(source.globalShortcutStatus);
  setAppExternalPublishedCalendarStatus(source.externalPublishedCalendarStatus);
  getAppSettingsState().settingsLoaded = true;
}

async function loadAppSettings() {
  if (!window.electronAPI || typeof window.electronAPI.readAppSettings !== 'function') {
    applyAppSettings({});
    return {
      notifications: getAppNotificationSettings(),
      tooltipsEnabled: getAppTooltipsEnabled(),
      quickAdd: getAppQuickAddSettings(),
      externalPublishedCalendar: getAppExternalPublishedCalendarSettings(),
      globalShortcutStatus: getAppGlobalShortcutStatus(),
      externalPublishedCalendarStatus: getAppExternalPublishedCalendarStatus(),
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
  const notificationsDetails = document.getElementById('boardSettingsNotificationsDetails');
  const notificationsTimeInput = document.getElementById('boardSettingsNotificationsTime');
  const quickAddShortcutInput = document.getElementById('boardSettingsQuickAddShortcut');
  const quickAddShortcutStatus = document.getElementById('boardSettingsQuickAddShortcutStatus');
  const externalCalendarToggle = document.getElementById('boardSettingsExternalCalendarToggle');
  const externalCalendarPortGroup = document.getElementById('boardSettingsExternalCalendarPortGroup');
  const externalCalendarPortInput = document.getElementById('boardSettingsExternalCalendarPort');
  const externalCalendarUrlGroup = document.getElementById('boardSettingsExternalCalendarUrlGroup');
  const externalCalendarUrlInput = document.getElementById('boardSettingsExternalCalendarUrl');
  const externalCalendarCopyButton = document.getElementById('btnCopyExternalCalendarUrl');
  const externalCalendarStatus = document.getElementById('boardSettingsExternalCalendarStatus');
  const notifications = getAppNotificationSettings();
  const quickAdd = getAppQuickAddSettings();
  const externalCalendar = getAppExternalPublishedCalendarSettings();
  const externalCalendarRuntime = getAppExternalPublishedCalendarStatus();
  const globalShortcutStatus = getAppGlobalShortcutStatus();

  if (tooltipsToggle) {
    tooltipsToggle.checked = getAppTooltipsEnabled();
  }

  if (notificationsToggle) {
    notificationsToggle.checked = notifications.enabled;
  }

  if (notificationsDetails) {
    notificationsDetails.classList.toggle('hidden', !notifications.enabled);
    notificationsDetails.setAttribute('aria-hidden', notifications.enabled ? 'false' : 'true');
  }

  if (notificationsTimeInput) {
    notificationsTimeInput.value = notifications.time;
  }

  if (quickAddShortcutInput) {
    quickAddShortcutInput.value = quickAdd.globalShortcut;
  }

  if (externalCalendarToggle) {
    externalCalendarToggle.checked = externalCalendar.enabled;
  }

  if (externalCalendarPortGroup) {
    externalCalendarPortGroup.classList.toggle('hidden', !externalCalendar.enabled);
    externalCalendarPortGroup.setAttribute('aria-hidden', externalCalendar.enabled ? 'false' : 'true');
  }

  if (externalCalendarPortInput) {
    externalCalendarPortInput.value = String(externalCalendar.port);
  }

  const externalCalendarUrl = externalCalendar.enabled ? externalCalendarRuntime.url : '';
  if (externalCalendarUrlGroup) {
    externalCalendarUrlGroup.classList.toggle('hidden', !externalCalendar.enabled);
    externalCalendarUrlGroup.setAttribute('aria-hidden', externalCalendar.enabled ? 'false' : 'true');
  }

  if (externalCalendarUrlInput) {
    externalCalendarUrlInput.value = externalCalendarUrl;
    externalCalendarUrlInput.disabled = !externalCalendarUrl;
  }

  if (externalCalendarCopyButton) {
    externalCalendarCopyButton.disabled = !externalCalendarUrl;
  }

  if (externalCalendarStatus) {
    externalCalendarStatus.classList.remove('is-success', 'is-warning');
    if (!externalCalendar.enabled) {
      externalCalendarStatus.textContent = 'Disabled';
    } else if (externalCalendarRuntime.running) {
      externalCalendarStatus.textContent = 'Publishing';
      externalCalendarStatus.classList.add('is-success');
    } else {
      externalCalendarStatus.textContent = externalCalendarRuntime.message || 'Not running';
      externalCalendarStatus.classList.add('is-warning');
    }
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
        externalPublishedCalendar: getAppExternalPublishedCalendarSettings(),
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
