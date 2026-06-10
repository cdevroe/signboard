const fs = require('fs').promises;
const path = require('path');

const APP_SETTINGS_FILE_NAME = 'app-settings.json';
const APP_SETTINGS_VERSION = 3;
const DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT = 48273;
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  time: '09:00',
});
const DEFAULT_TOOLTIPS_ENABLED = true;
const DEFAULT_QUICK_ADD_SETTINGS = Object.freeze({
  globalShortcut: '',
});
const DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS = Object.freeze({
  enabled: false,
  port: DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT,
  token: '',
});
const GLOBAL_SHORTCUT_MAX_LENGTH = 80;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNotificationTime(value) {
  const candidate = String(value || '').trim();
  if (/^(?:0[1-9]|1\d|2[0-4]):[0-5]\d$/.test(candidate)) {
    return candidate;
  }

  return DEFAULT_NOTIFICATION_SETTINGS.time;
}

function normalizeNotificationSettings(rawNotificationSettings) {
  const source = isObject(rawNotificationSettings) ? rawNotificationSettings : {};
  return {
    enabled: source.enabled === true,
    time: normalizeNotificationTime(source.time),
  };
}

function normalizeTooltipsEnabled(value) {
  return value === false ? false : DEFAULT_TOOLTIPS_ENABLED;
}

function normalizeGlobalShortcutAccelerator(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, '');

  if (!candidate || candidate.length > GLOBAL_SHORTCUT_MAX_LENGTH) {
    return '';
  }

  return candidate;
}

function normalizeQuickAddSettings(rawQuickAddSettings) {
  const source = isObject(rawQuickAddSettings) ? rawQuickAddSettings : {};
  return {
    globalShortcut: normalizeGlobalShortcutAccelerator(source.globalShortcut),
  };
}

function normalizeExternalPublishedCalendarPort(value) {
  const parsedPort = Number.parseInt(String(value || ''), 10);
  if (Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535) {
    return parsedPort;
  }

  return DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS.port;
}

function normalizeExternalPublishedCalendarToken(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 160) {
    return '';
  }

  return /^[A-Za-z0-9._~-]+$/.test(candidate) ? candidate : '';
}

function normalizeExternalPublishedCalendarSettings(rawCalendarSettings) {
  const source = isObject(rawCalendarSettings) ? rawCalendarSettings : {};
  return {
    enabled: source.enabled === true,
    port: normalizeExternalPublishedCalendarPort(source.port),
    token: normalizeExternalPublishedCalendarToken(source.token),
  };
}

function normalizeAppSettings(rawSettings = {}) {
  const source = isObject(rawSettings) ? rawSettings : {};
  const migration = isObject(source.migration) ? source.migration : {};

  return {
    version: APP_SETTINGS_VERSION,
    notifications: normalizeNotificationSettings(source.notifications),
    tooltipsEnabled: normalizeTooltipsEnabled(source.tooltipsEnabled),
    quickAdd: normalizeQuickAddSettings(source.quickAdd),
    externalPublishedCalendar: normalizeExternalPublishedCalendarSettings(source.externalPublishedCalendar),
    migration: {
      boardSettingsMigrated: migration.boardSettingsMigrated === true,
      sourceBoardRoot: typeof migration.sourceBoardRoot === 'string' ? migration.sourceBoardRoot : '',
      migratedAt: typeof migration.migratedAt === 'string' ? migration.migratedAt : '',
    },
  };
}

function getAppSettingsPath(userDataPath) {
  return path.join(userDataPath, APP_SETTINGS_FILE_NAME);
}

async function readAppSettings(userDataPath) {
  const settingsPath = getAppSettingsPath(userDataPath);
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      settingsPath,
      ...normalizeAppSettings(parsed),
    };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to read app settings.', error);
    }

    return {
      settingsPath,
      ...normalizeAppSettings({}),
    };
  }
}

async function writeAppSettings(userDataPath, settings) {
  const settingsPath = getAppSettingsPath(userDataPath);
  const normalized = normalizeAppSettings(settings);
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return {
    settingsPath,
    ...normalized,
  };
}

async function updateAppSettings(userDataPath, partialSettings = {}) {
  const current = await readAppSettings(userDataPath);
  const next = {
    ...current,
    ...(isObject(partialSettings) ? partialSettings : {}),
  };

  if (Object.prototype.hasOwnProperty.call(partialSettings, 'notifications')) {
    next.notifications = normalizeNotificationSettings(partialSettings.notifications);
  }

  if (Object.prototype.hasOwnProperty.call(partialSettings, 'tooltipsEnabled')) {
    next.tooltipsEnabled = normalizeTooltipsEnabled(partialSettings.tooltipsEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(partialSettings, 'quickAdd')) {
    next.quickAdd = normalizeQuickAddSettings(partialSettings.quickAdd);
  }

  if (Object.prototype.hasOwnProperty.call(partialSettings, 'externalPublishedCalendar')) {
    next.externalPublishedCalendar = normalizeExternalPublishedCalendarSettings(partialSettings.externalPublishedCalendar);
  }

  if (Object.prototype.hasOwnProperty.call(partialSettings, 'migration')) {
    next.migration = {
      ...normalizeAppSettings(current).migration,
      ...normalizeAppSettings({ migration: partialSettings.migration }).migration,
    };
  }

  return writeAppSettings(userDataPath, next);
}

async function migrateAppSettingsFromBoardSettings(userDataPath, boardRoot, legacySettings = {}) {
  const current = await readAppSettings(userDataPath);
  if (current.migration && current.migration.boardSettingsMigrated) {
    return {
      migrated: false,
      settings: current,
    };
  }

  const nextSettings = await writeAppSettings(userDataPath, {
    ...current,
    notifications: normalizeNotificationSettings(legacySettings.notifications),
    tooltipsEnabled: normalizeTooltipsEnabled(legacySettings.tooltipsEnabled),
    migration: {
      boardSettingsMigrated: true,
      sourceBoardRoot: typeof boardRoot === 'string' ? boardRoot : '',
      migratedAt: new Date().toISOString(),
    },
  });

  return {
    migrated: true,
    settings: nextSettings,
  };
}

module.exports = {
  APP_SETTINGS_FILE_NAME,
  DEFAULT_NOTIFICATION_SETTINGS: () => ({ ...DEFAULT_NOTIFICATION_SETTINGS }),
  DEFAULT_TOOLTIPS_ENABLED,
  DEFAULT_QUICK_ADD_SETTINGS: () => ({ ...DEFAULT_QUICK_ADD_SETTINGS }),
  DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS: () => ({ ...DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS }),
  DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT,
  normalizeAppSettings,
  normalizeExternalPublishedCalendarPort,
  normalizeExternalPublishedCalendarSettings,
  normalizeGlobalShortcutAccelerator,
  normalizeNotificationSettings,
  normalizeQuickAddSettings,
  normalizeTooltipsEnabled,
  readAppSettings,
  writeAppSettings,
  updateAppSettings,
  migrateAppSettingsFromBoardSettings,
};
