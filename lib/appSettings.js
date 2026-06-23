const fs = require('fs').promises;
const path = require('path');

const APP_SETTINGS_FILE_NAME = 'app-settings.json';
const APP_SETTINGS_VERSION = 4;
const DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT = 48273;
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';
const SMART_CARD_ACTION_LABEL_MAX_LENGTH = 80;
const SMART_CARD_ACTION_PROMPT_MAX_LENGTH = 6000;
const CUSTOM_SMART_CARD_ACTION_LIMIT = 12;
const DEFAULT_SMART_CARD_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'generate-title',
    type: 'title',
    label: 'Generate new title',
    prompt: [
      'Improve the card title using the current title and card body.',
      'Keep it concise, specific, and action-oriented.',
      'Preserve the original intent and do not add facts that are not supported by the card.',
    ].join('\n'),
    builtIn: true,
  }),
  Object.freeze({
    id: 'generate-task-list',
    type: 'tasks',
    label: 'Generate task list',
    prompt: [
      'Generate practical checklist items for this card.',
      'Infer common next actions from the title, body, board, list, and labels.',
      'Do not duplicate existing checklist items.',
      'Use short imperative task text.',
    ].join('\n'),
    builtIn: true,
  }),
  Object.freeze({
    id: 'smart-paste',
    type: 'paste',
    label: 'Smart paste',
    prompt: [
      'Format the pasted information for this Signboard Markdown card.',
      'Preserve the complete useful information from the pasted text, including names, dates, decisions, links, and requirements.',
      'Use clear Markdown sections, a concise summary when helpful, task list items for follow-up work, and reference URLs when present.',
      'Do not invent facts.',
    ].join('\n'),
    builtIn: true,
  }),
]);
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
const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: false,
  provider: 'ollama',
  ollama: Object.freeze({
    url: DEFAULT_OLLAMA_URL,
    model: DEFAULT_OLLAMA_MODEL,
    taskCount: 6,
  }),
  smartCardActions: DEFAULT_SMART_CARD_ACTIONS,
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

function normalizeAiProvider(value) {
  return value === 'ollama' ? 'ollama' : DEFAULT_AI_SETTINGS.provider;
}

function normalizeOllamaUrl(value) {
  let candidate = String(value || '').trim();
  if (!candidate) {
    candidate = DEFAULT_AI_SETTINGS.ollama.url;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_AI_SETTINGS.ollama.url;
    }

    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';

    const basePath = parsed.pathname && parsed.pathname !== '/'
      ? parsed.pathname.replace(/\/+$/, '')
      : '';
    return `${parsed.origin}${basePath}`;
  } catch {
    return DEFAULT_AI_SETTINGS.ollama.url;
  }
}

function normalizeOllamaModel(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 120 || /[\s\x00-\x1F]/.test(candidate)) {
    return DEFAULT_AI_SETTINGS.ollama.model;
  }

  return candidate;
}

function normalizeAiTaskCount(value) {
  const parsedCount = Number.parseInt(String(value || ''), 10);
  if (Number.isInteger(parsedCount) && parsedCount >= 3 && parsedCount <= 12) {
    return parsedCount;
  }

  return DEFAULT_AI_SETTINGS.ollama.taskCount;
}

function cloneDefaultSmartCardActions() {
  return DEFAULT_SMART_CARD_ACTIONS.map((action) => ({ ...action }));
}

function normalizeSmartCardActionLabel(value, fallback = '') {
  const candidate = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedFallback = String(fallback || '').trim();
  if (!candidate) {
    return normalizedFallback;
  }

  return candidate.slice(0, SMART_CARD_ACTION_LABEL_MAX_LENGTH).trim() || normalizedFallback;
}

function normalizeSmartCardActionPrompt(value, fallback = '') {
  const candidate = String(value || '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const normalizedFallback = String(fallback || '').trim();
  if (!candidate) {
    return normalizedFallback;
  }

  return candidate.slice(0, SMART_CARD_ACTION_PROMPT_MAX_LENGTH).trim() || normalizedFallback;
}

function normalizeSmartCardActionId(value, fallback = '') {
  const candidate = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const normalizedFallback = String(fallback || '').trim();
  return candidate || normalizedFallback;
}

function normalizeSmartCardActions(rawActions) {
  const sourceActions = Array.isArray(rawActions) ? rawActions : [];
  const normalizedActions = [];
  const seenIds = new Set();

  for (const defaultAction of DEFAULT_SMART_CARD_ACTIONS) {
    const sourceAction = sourceActions.find((action) => (
      isObject(action) && String(action.id || '') === defaultAction.id
    ));

    normalizedActions.push({
      ...defaultAction,
      label: defaultAction.label,
      prompt: normalizeSmartCardActionPrompt(
        sourceAction && Object.prototype.hasOwnProperty.call(sourceAction, 'prompt')
          ? sourceAction.prompt
          : defaultAction.prompt,
        defaultAction.prompt,
      ),
      builtIn: true,
    });
    seenIds.add(defaultAction.id);
  }

  let customCount = 0;
  for (const action of sourceActions) {
    if (!isObject(action) || action.builtIn === true) {
      continue;
    }

    const label = normalizeSmartCardActionLabel(action.label);
    const prompt = normalizeSmartCardActionPrompt(action.prompt);
    if (!label || !prompt) {
      continue;
    }

    const fallbackId = `custom-${customCount + 1}`;
    let id = normalizeSmartCardActionId(action.id, fallbackId);
    if (DEFAULT_SMART_CARD_ACTIONS.some((defaultAction) => defaultAction.id === id)) {
      id = fallbackId;
    }
    while (seenIds.has(id)) {
      id = `custom-${customCount + 1}-${seenIds.size + 1}`;
    }

    normalizedActions.push({
      id,
      type: 'custom',
      label,
      prompt,
      builtIn: false,
    });
    seenIds.add(id);
    customCount += 1;
    if (customCount >= CUSTOM_SMART_CARD_ACTION_LIMIT) {
      break;
    }
  }

  return normalizedActions;
}

function normalizeOllamaSettings(rawOllamaSettings) {
  const source = isObject(rawOllamaSettings) ? rawOllamaSettings : {};
  return {
    url: normalizeOllamaUrl(source.url),
    model: normalizeOllamaModel(source.model),
    taskCount: normalizeAiTaskCount(source.taskCount),
  };
}

function normalizeAiSettings(rawAiSettings) {
  const source = isObject(rawAiSettings) ? rawAiSettings : {};
  return {
    enabled: source.enabled === true,
    provider: normalizeAiProvider(source.provider),
    ollama: normalizeOllamaSettings(source.ollama),
    smartCardActions: normalizeSmartCardActions(source.smartCardActions || source.cardActions),
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
    ai: normalizeAiSettings(source.ai),
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
  DEFAULT_AI_SETTINGS: () => ({
    ...DEFAULT_AI_SETTINGS,
    ollama: { ...DEFAULT_AI_SETTINGS.ollama },
    smartCardActions: cloneDefaultSmartCardActions(),
  }),
  DEFAULT_SMART_CARD_ACTIONS: cloneDefaultSmartCardActions,
  normalizeAppSettings,
  normalizeAiSettings,
  normalizeAiTaskCount,
  normalizeExternalPublishedCalendarPort,
  normalizeExternalPublishedCalendarSettings,
  normalizeGlobalShortcutAccelerator,
  normalizeNotificationSettings,
  normalizeOllamaModel,
  normalizeOllamaSettings,
  normalizeOllamaUrl,
  normalizeQuickAddSettings,
  normalizeSmartCardActions,
  normalizeTooltipsEnabled,
  readAppSettings,
  writeAppSettings,
  updateAppSettings,
  migrateAppSettingsFromBoardSettings,
};
