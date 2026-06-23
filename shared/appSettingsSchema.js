(function initializeAppSettingsSchema(root, factory) {
  const schema = factory();
  if (typeof window === 'undefined' && typeof module === 'object' && module.exports) {
    module.exports = schema;
  }
  if (root) {
    root.SignboardAppSettingsSchema = schema;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAppSettingsSchema() {
  const APP_SETTINGS_FILE_NAME = 'app-settings.json';
  const APP_SETTINGS_VERSION = 5;
  const DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT = 48273;
  const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
  const DEFAULT_OLLAMA_MODEL = 'llama3.2';
  const SMART_CARD_ACTION_LABEL_MAX_LENGTH = 80;
  const SMART_CARD_ACTION_PROMPT_MAX_LENGTH = 6000;
  const CUSTOM_SMART_CARD_ACTION_LIMIT = 12;
  const GLOBAL_SHORTCUT_MAX_LENGTH = 80;
  const DEFAULT_SMART_CARD_ACTIONS = Object.freeze([
    Object.freeze({
      id: 'generate-title',
      type: 'title',
      label: 'Generate new card title',
      prompt: [
        'Improve the card title using the current title and card body as inspiration.',
        'Keep it concise, specific, and action-oriented.',
        'Preserve the original intent and do not add facts that are not supported by the card.',
      ].join('\n'),
      builtIn: true,
    }),
    Object.freeze({
      id: 'generate-summary',
      type: 'summary',
      label: 'Generate card summary',
      prompt: [
        'Inspect the card title and body contents and write a summary.',
        'Keep the summary a short paragraph or two at most (preferably one).',
        'Do not be overly detailed but make sure the summary is informative.',
        'Do not invent facts.',
      ].join('\n'),
      builtIn: true,
    }),
    Object.freeze({
      id: 'generate-task-list',
      type: 'tasks',
      label: 'Generate task list',
      prompt: [
        'Generate 6 practical checklist items for this card.',
        'Infer common tasks that would help complete the goal of the card from the title, body, board, list, and labels.',
        'Do not duplicate existing checklist items.',
        'Use short imperative task text.',
        'Do not include checkbox prefixes.',
      ].join('\n'),
      builtIn: true,
    }),
    Object.freeze({
      id: 'auto-label-card',
      type: 'labels',
      label: 'Auto-label card',
      prompt: [
        'Choose labels for this card from the existing board labels only.',
        'Use the card title, body, list, current labels, start date, due date, and available board labels.',
        'Do not suggest labels that are already assigned to the card.',
        'Do not invent new labels.',
        'Return only labels that clearly fit the card.',
        'Return no labels if none of the existing labels clearly fit.',
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
    }),
    smartCardActions: DEFAULT_SMART_CARD_ACTIONS,
  });

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneDefaultSmartCardActions() {
    return DEFAULT_SMART_CARD_ACTIONS.map((action) => ({ ...action }));
  }

  function cloneDefaultAiSettings() {
    return {
      ...DEFAULT_AI_SETTINGS,
      ollama: { ...DEFAULT_AI_SETTINGS.ollama },
      smartCardActions: cloneDefaultSmartCardActions(),
    };
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

  return {
    APP_SETTINGS_FILE_NAME,
    APP_SETTINGS_VERSION,
    DEFAULT_AI_SETTINGS,
    DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT,
    DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS,
    DEFAULT_NOTIFICATION_SETTINGS,
    DEFAULT_QUICK_ADD_SETTINGS,
    DEFAULT_SMART_CARD_ACTIONS,
    DEFAULT_TOOLTIPS_ENABLED,
    CUSTOM_SMART_CARD_ACTION_LIMIT,
    GLOBAL_SHORTCUT_MAX_LENGTH,
    SMART_CARD_ACTION_LABEL_MAX_LENGTH,
    SMART_CARD_ACTION_PROMPT_MAX_LENGTH,
    cloneDefaultAiSettings,
    cloneDefaultSmartCardActions,
    isObject,
    normalizeAiProvider,
    normalizeAiSettings,
    normalizeAppSettings,
    normalizeExternalPublishedCalendarPort,
    normalizeExternalPublishedCalendarSettings,
    normalizeExternalPublishedCalendarToken,
    normalizeGlobalShortcutAccelerator,
    normalizeNotificationSettings,
    normalizeNotificationTime,
    normalizeOllamaModel,
    normalizeOllamaSettings,
    normalizeOllamaUrl,
    normalizeQuickAddSettings,
    normalizeSmartCardActionId,
    normalizeSmartCardActionLabel,
    normalizeSmartCardActionPrompt,
    normalizeSmartCardActions,
    normalizeTooltipsEnabled,
  };
});
