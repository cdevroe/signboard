const fs = require('fs').promises;
const path = require('path');
const appSettingsSchema = require('../shared/appSettingsSchema');
const { atomicWriteFile } = require('./atomicFile');

const {
  APP_SETTINGS_FILE_NAME,
  DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT,
  DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_QUICK_ADD_SETTINGS,
  DEFAULT_TOOLTIPS_ENABLED,
  cloneDefaultAiSettings,
  cloneDefaultSmartCardActions,
  isObject,
  normalizeAiSettings,
  normalizeAppSettings,
  normalizeExternalPublishedCalendarPort,
  normalizeExternalPublishedCalendarSettings,
  normalizeGlobalShortcutAccelerator,
  normalizeNotificationSettings,
  normalizeOllamaModel,
  normalizeOllamaSettings,
  normalizeOllamaUrl,
  normalizeQuickAddSettings,
  normalizeSmartCardActionTarget,
  normalizeSmartCardActions,
  normalizeTooltipsEnabled,
} = appSettingsSchema;

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
  await atomicWriteFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
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

  if (Object.prototype.hasOwnProperty.call(partialSettings, 'ai')) {
    next.ai = normalizeAiSettings(partialSettings.ai);
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
  DEFAULT_AI_SETTINGS: cloneDefaultAiSettings,
  DEFAULT_SMART_CARD_ACTIONS: cloneDefaultSmartCardActions,
  normalizeAppSettings,
  normalizeAiSettings,
  normalizeExternalPublishedCalendarPort,
  normalizeExternalPublishedCalendarSettings,
  normalizeGlobalShortcutAccelerator,
  normalizeNotificationSettings,
  normalizeOllamaModel,
  normalizeOllamaSettings,
  normalizeOllamaUrl,
  normalizeQuickAddSettings,
  normalizeSmartCardActionTarget,
  normalizeSmartCardActions,
  normalizeTooltipsEnabled,
  readAppSettings,
  writeAppSettings,
  updateAppSettings,
  migrateAppSettingsFromBoardSettings,
};
