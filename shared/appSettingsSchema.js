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
  const APP_SETTINGS_VERSION = 9;
  const DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT = 48273;
  const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
  const DEFAULT_OLLAMA_MODEL = 'llama3.2';
  const DEFAULT_LM_STUDIO_URL = 'http://127.0.0.1:1234';
  const AI_PROVIDER_IDS = Object.freeze(['ollama', 'lm-studio', 'openai', 'gemini', 'anthropic']);
  const AI_PROFILE_IDS = Object.freeze(['normal', 'advanced']);
  const SMART_CARD_ACTION_LABEL_MAX_LENGTH = 80;
  const SMART_CARD_ACTION_PROMPT_MAX_LENGTH = 6000;
  const CUSTOM_SMART_CARD_ACTION_LIMIT = 12;
  const DEFAULT_SMART_CARD_ACTION_TARGET = 'content';
  const SMART_CARD_ACTION_TARGETS = Object.freeze(['title', 'labels', 'content', 'due', 'attachments']);
  const SMART_CARD_ACTION_TARGET_LABELS = Object.freeze({
    title: 'Title',
    labels: 'Labels',
    content: 'Content',
    due: 'Due Dates',
    attachments: 'Attachments',
  });
  const SMART_BOARD_ACTION_LABEL_MAX_LENGTH = 80;
  const SMART_BOARD_ACTION_DESCRIPTION_MAX_LENGTH = 240;
  const SMART_BOARD_ACTION_PROMPT_MAX_LENGTH = 8000;
  const CUSTOM_SMART_BOARD_ACTION_LIMIT = 12;
  const SMART_BOARD_ACTION_MODES = Object.freeze(['report', 'changes']);
  const SMART_BOARD_ACTION_MODE_LABELS = Object.freeze({
    report: 'Read-only report',
    changes: 'Propose changes',
  });
  const SMART_BOARD_ACTION_CAPABILITIES = Object.freeze([
    'create-card',
    'update-title',
    'append-content',
    'add-labels',
    'set-dates',
    'move-card',
    'archive-card',
  ]);
  const SMART_BOARD_ACTION_CAPABILITY_LABELS = Object.freeze({
    'create-card': 'Create cards',
    'update-title': 'Rename cards',
    'append-content': 'Append content',
    'add-labels': 'Add labels',
    'set-dates': 'Set dates',
    'move-card': 'Move cards',
    'archive-card': 'Archive cards',
  });
  const GLOBAL_SHORTCUT_MAX_LENGTH = 80;
  const DEFAULT_SMART_CARD_ACTIONS = Object.freeze([
    Object.freeze({
      id: 'generate-title',
      type: 'title',
      target: 'title',
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
      target: 'content',
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
      target: 'content',
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
      target: 'labels',
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
      target: 'content',
      label: 'Smart paste',
      prompt: [
        'Format the pasted information for this Signboard Markdown card.',
        'Preserve the complete useful information from the pasted text, including names, dates, decisions, links, and requirements.',
        'Use clear Markdown sections, a concise summary when helpful, task list items for follow-up work, and reference URLs when present.',
        'Do not invent facts.',
      ].join('\n'),
      builtIn: true,
    }),
    Object.freeze({
      id: 'quick-smart-action',
      type: 'quick',
      target: 'content',
      label: 'Quick Smart Action',
      prompt: '',
      builtIn: true,
      editable: false,
    }),
    Object.freeze({
      id: 'question-card',
      type: 'question',
      target: 'content',
      label: 'Question the Card',
      prompt: '',
      builtIn: true,
      editable: false,
    }),
  ]);
  const DEFAULT_SMART_BOARD_ACTIONS = Object.freeze([
    Object.freeze({
      id: 'ask-board',
      mode: 'report',
      label: 'Ask the Board',
      description: 'Ask a one-off question about the current board.',
      prompt: '',
      capabilities: Object.freeze([]),
      builtIn: true,
      editable: false,
      oneOff: true,
    }),
    Object.freeze({
      id: 'board-brief',
      mode: 'report',
      label: 'Board Brief',
      description: 'Summarize progress, risks, dates, and useful next steps.',
      prompt: [
        'Create a concise status brief for this board.',
        'Cover recent progress, overdue or approaching work, stalled or risky cards, and the three most useful next steps.',
        'Use the supplied activity timestamps and completed-list information for claims about completed work.',
        'Refer to relevant cards by title and list name in the report, and place each exact card ID only in the structured card reference.',
        'Do not invent facts or imply that checked tasks have completion timestamps.',
      ].join('\n'),
      capabilities: Object.freeze([]),
      builtIn: true,
    }),
    Object.freeze({
      id: 'quick-wins',
      mode: 'report',
      label: 'Find Quick Wins',
      description: 'Find small, useful pieces of work that may fit into about 15 minutes.',
      prompt: [
        'Find up to six useful cards or incomplete tasks that appear achievable in about 15 minutes.',
        'Prefer concrete, unblocked work with a small visible scope.',
        'Treat time estimates as estimates and explain the evidence for each one.',
        'Name every recommended card in the report, and place its exact card ID only in the structured card reference.',
      ].join('\n'),
      capabilities: Object.freeze([]),
      builtIn: true,
    }),
    Object.freeze({
      id: 'create-cards',
      mode: 'changes',
      label: 'Create Cards',
      description: 'Turn a goal or notes into proposed cards on the current board.',
      prompt: [
        'Turn the user request into a small set of useful new cards for this board.',
        'Use existing lists and labels only.',
        'Make titles concise and actionable, preserve supplied facts, and include useful Markdown notes or checklists when supported.',
        'Do not create duplicates of existing cards.',
      ].join('\n'),
      capabilities: Object.freeze(['create-card']),
      builtIn: true,
      oneOff: true,
    }),
    Object.freeze({
      id: 'clean-up-board',
      mode: 'changes',
      label: 'Clean Up Board',
      description: 'Propose focused improvements to unclear or poorly organized cards.',
      prompt: [
        'Review the board for vague titles, missing useful context, obviously missing existing labels or dates, misplaced cards, stale work, and likely duplicates.',
        'Propose only high-confidence, reversible improvements.',
        'Do not merge or delete cards. Use archive proposals only for cards that are clearly obsolete or exact duplicates and explain why.',
        'Keep appended content short and factual.',
      ].join('\n'),
      capabilities: Object.freeze(['update-title', 'append-content', 'add-labels', 'set-dates', 'move-card', 'archive-card']),
      builtIn: true,
    }),
    Object.freeze({
      id: 'label-board',
      mode: 'changes',
      label: 'Label Board',
      description: 'Suggest existing labels for cards that would benefit from them.',
      prompt: [
        'Suggest existing board labels for cards that are unlabeled or clearly missing a relevant label.',
        'Only add labels that already exist on this board.',
        'Do not remove labels, invent labels, or label a card when no existing label clearly fits.',
      ].join('\n'),
      capabilities: Object.freeze(['add-labels']),
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
    normal: Object.freeze({
      provider: 'ollama',
      model: DEFAULT_OLLAMA_MODEL,
    }),
    advanced: Object.freeze({
      enabled: false,
      provider: 'ollama',
      model: '',
    }),
    providers: Object.freeze({
      ollama: Object.freeze({ url: DEFAULT_OLLAMA_URL }),
      lmStudio: Object.freeze({ url: DEFAULT_LM_STUDIO_URL }),
      openai: Object.freeze({}),
      gemini: Object.freeze({}),
      anthropic: Object.freeze({}),
    }),
    smartCardActions: DEFAULT_SMART_CARD_ACTIONS,
    smartBoardActions: DEFAULT_SMART_BOARD_ACTIONS,
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
      normal: { ...DEFAULT_AI_SETTINGS.normal },
      advanced: { ...DEFAULT_AI_SETTINGS.advanced },
      providers: {
        ollama: { ...DEFAULT_AI_SETTINGS.providers.ollama },
        lmStudio: { ...DEFAULT_AI_SETTINGS.providers.lmStudio },
        openai: {},
        gemini: {},
        anthropic: {},
      },
      smartCardActions: cloneDefaultSmartCardActions(),
      smartBoardActions: cloneDefaultSmartBoardActions(),
    };
  }

  function cloneDefaultSmartBoardActions() {
    return DEFAULT_SMART_BOARD_ACTIONS.map((action) => ({
      ...action,
      capabilities: [...action.capabilities],
    }));
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
    const candidate = String(value || '').trim().toLowerCase();
    return AI_PROVIDER_IDS.includes(candidate)
      ? candidate
      : DEFAULT_AI_SETTINGS.normal.provider;
  }

  function getAiProviderSettingsKey(provider) {
    return normalizeAiProvider(provider) === 'lm-studio' ? 'lmStudio' : normalizeAiProvider(provider);
  }

  function normalizeAiModel(value, fallback = '') {
    const candidate = String(value || '').trim();
    if (!candidate || candidate.length > 240 || /[\x00-\x1F]/.test(candidate)) {
      return String(fallback || '').trim();
    }

    return candidate;
  }

  function normalizeOllamaUrl(value) {
    let candidate = String(value || '').trim();
    if (!candidate) {
      candidate = DEFAULT_OLLAMA_URL;
    }

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = `http://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return DEFAULT_OLLAMA_URL;
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
      return DEFAULT_OLLAMA_URL;
    }
  }

  function normalizeOllamaModel(value) {
    const candidate = String(value || '').trim();
    if (!candidate || candidate.length > 120 || /[\s\x00-\x1F]/.test(candidate)) {
      return DEFAULT_OLLAMA_MODEL;
    }

    return candidate;
  }

  function normalizeLmStudioUrl(value) {
    let candidate = String(value || '').trim();
    if (!candidate) {
      candidate = DEFAULT_LM_STUDIO_URL;
    }

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = `http://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return DEFAULT_LM_STUDIO_URL;
      }

      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';

      let basePath = parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.replace(/\/+$/, '')
        : '';
      if (basePath.toLowerCase() === '/v1') {
        basePath = '';
      }
      return `${parsed.origin}${basePath}`;
    } catch {
      return DEFAULT_LM_STUDIO_URL;
    }
  }

  function normalizeLmStudioModel(value) {
    const candidate = String(value || '').trim();
    if (!candidate || candidate.length > 240 || /[\x00-\x1F]/.test(candidate)) {
      return '';
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

  function normalizeSmartCardActionTarget(value, fallback = DEFAULT_SMART_CARD_ACTION_TARGET) {
    const candidate = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (SMART_CARD_ACTION_TARGETS.includes(candidate)) {
      return candidate;
    }

    if (candidate === 'custom' || candidate === 'summary' || candidate === 'tasks' || candidate === 'paste' || candidate === 'body' || candidate === 'markdown') {
      return 'content';
    }

    if (candidate === 'date' || candidate === 'dates' || candidate === 'due-date' || candidate === 'due-dates' || candidate === 'duedate' || candidate === 'duedates') {
      return 'due';
    }

    if (candidate === 'attachment' || candidate === 'linked-object' || candidate === 'linked-objects' || candidate === 'link') {
      return 'attachments';
    }

    return SMART_CARD_ACTION_TARGETS.includes(fallback) ? fallback : DEFAULT_SMART_CARD_ACTION_TARGET;
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
    const defaultActionsById = new Map(DEFAULT_SMART_CARD_ACTIONS.map((action) => [action.id, action]));
    const seenIds = new Set();

    let customCount = 0;
    for (const action of sourceActions) {
      if (!isObject(action)) {
        continue;
      }

      const sourceId = normalizeSmartCardActionId(action.id);
      const defaultAction = defaultActionsById.get(sourceId);
      if (defaultAction && !seenIds.has(defaultAction.id)) {
        const prompt = defaultAction.editable === false
          ? defaultAction.prompt
          : normalizeSmartCardActionPrompt(
            Object.prototype.hasOwnProperty.call(action, 'prompt')
              ? action.prompt
              : defaultAction.prompt,
            defaultAction.prompt,
          );
        normalizedActions.push({
          ...defaultAction,
          label: defaultAction.label,
          target: normalizeSmartCardActionTarget(defaultAction.target, DEFAULT_SMART_CARD_ACTION_TARGET),
          prompt,
          builtIn: true,
        });
        seenIds.add(defaultAction.id);
        continue;
      }

      if (action.builtIn === true) {
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
        target: normalizeSmartCardActionTarget(action.target || action.type),
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

    for (const defaultAction of DEFAULT_SMART_CARD_ACTIONS) {
      if (seenIds.has(defaultAction.id)) {
        continue;
      }

      normalizedActions.push({
        ...defaultAction,
        label: defaultAction.label,
        target: normalizeSmartCardActionTarget(defaultAction.target, DEFAULT_SMART_CARD_ACTION_TARGET),
        prompt: defaultAction.prompt,
        builtIn: true,
      });
      seenIds.add(defaultAction.id);
    }

    return normalizedActions;
  }

  function normalizeSmartBoardActionMode(value, fallback = 'report') {
    const candidate = String(value || '').trim().toLowerCase();
    return SMART_BOARD_ACTION_MODES.includes(candidate)
      ? candidate
      : (SMART_BOARD_ACTION_MODES.includes(fallback) ? fallback : 'report');
  }

  function normalizeSmartBoardActionCapabilities(value, mode = 'report') {
    if (normalizeSmartBoardActionMode(mode) !== 'changes') {
      return [];
    }

    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    return source
      .map((capability) => String(capability || '').trim().toLowerCase())
      .filter((capability) => SMART_BOARD_ACTION_CAPABILITIES.includes(capability) && !seen.has(capability) && seen.add(capability));
  }

  function normalizeSmartBoardActionDescription(value, fallback = '') {
    const candidate = String(value || '').replace(/\s+/g, ' ').trim();
    const normalizedFallback = String(fallback || '').replace(/\s+/g, ' ').trim();
    return (candidate || normalizedFallback).slice(0, SMART_BOARD_ACTION_DESCRIPTION_MAX_LENGTH).trim();
  }

  function normalizeSmartBoardActionPrompt(value, fallback = '') {
    const candidate = String(value || '').replace(/\r\n?/g, '\n').trim();
    const normalizedFallback = String(fallback || '').replace(/\r\n?/g, '\n').trim();
    return (candidate || normalizedFallback).slice(0, SMART_BOARD_ACTION_PROMPT_MAX_LENGTH).trim();
  }

  function upgradeLegacyBuiltInSmartBoardPrompt(actionId, prompt) {
    const replacements = {
      'board-brief': [
        'Reference relevant cards by their exact card IDs.',
        'Refer to relevant cards by title and list name in the report, and place each exact card ID only in the structured card reference.',
      ],
      'quick-wins': [
        'Reference every recommendation by its exact card ID.',
        'Name every recommended card in the report, and place its exact card ID only in the structured card reference.',
      ],
    };
    const replacement = replacements[actionId];
    return replacement ? String(prompt || '').replace(replacement[0], replacement[1]) : prompt;
  }

  function normalizeSmartBoardActions(rawActions) {
    const sourceActions = Array.isArray(rawActions) ? rawActions : [];
    const defaultsById = new Map(DEFAULT_SMART_BOARD_ACTIONS.map((action) => [action.id, action]));
    const normalizedActions = [];
    const seenIds = new Set();
    let customCount = 0;

    for (const action of sourceActions) {
      if (!isObject(action)) continue;
      const sourceId = normalizeSmartCardActionId(action.id);
      const defaultAction = defaultsById.get(sourceId);
      if (defaultAction && !seenIds.has(defaultAction.id)) {
        const normalizedPrompt = defaultAction.editable === false
          ? defaultAction.prompt
          : normalizeSmartBoardActionPrompt(
            Object.prototype.hasOwnProperty.call(action, 'prompt') ? action.prompt : defaultAction.prompt,
            defaultAction.prompt,
          );
        const prompt = upgradeLegacyBuiltInSmartBoardPrompt(defaultAction.id, normalizedPrompt);
        normalizedActions.push({
          ...defaultAction,
          description: defaultAction.description,
          prompt,
          capabilities: [...defaultAction.capabilities],
          builtIn: true,
        });
        seenIds.add(defaultAction.id);
        continue;
      }

      if (action.builtIn === true) continue;
      const label = normalizeSmartCardActionLabel(action.label);
      const description = normalizeSmartBoardActionDescription(action.description);
      const prompt = normalizeSmartBoardActionPrompt(action.prompt);
      if (!label || !prompt) continue;

      const mode = normalizeSmartBoardActionMode(action.mode);
      const fallbackId = `custom-board-${customCount + 1}`;
      let id = normalizeSmartCardActionId(action.id, fallbackId);
      if (DEFAULT_SMART_BOARD_ACTIONS.some((candidate) => candidate.id === id)) id = fallbackId;
      while (seenIds.has(id)) id = `custom-board-${customCount + 1}-${seenIds.size + 1}`;
      normalizedActions.push({
        id,
        mode,
        label,
        description,
        prompt,
        capabilities: normalizeSmartBoardActionCapabilities(action.capabilities, mode),
        builtIn: false,
      });
      seenIds.add(id);
      customCount += 1;
      if (customCount >= CUSTOM_SMART_BOARD_ACTION_LIMIT) break;
    }

    for (const action of DEFAULT_SMART_BOARD_ACTIONS) {
      if (seenIds.has(action.id)) continue;
      normalizedActions.push({ ...action, capabilities: [...action.capabilities] });
      seenIds.add(action.id);
    }
    return normalizedActions;
  }

  function normalizeOllamaSettings(rawOllamaSettings) {
    const source = isObject(rawOllamaSettings) ? rawOllamaSettings : {};
    return {
      url: normalizeOllamaUrl(source.url),
    };
  }

  function normalizeLmStudioSettings(rawLmStudioSettings) {
    const source = isObject(rawLmStudioSettings) ? rawLmStudioSettings : {};
    return {
      url: normalizeLmStudioUrl(source.url),
    };
  }

  function normalizeAiProfile(rawProfile, defaults = DEFAULT_AI_SETTINGS.normal, options = {}) {
    const source = isObject(rawProfile) ? rawProfile : {};
    const fallback = isObject(defaults) ? defaults : DEFAULT_AI_SETTINGS.normal;
    const modelFallback = Object.prototype.hasOwnProperty.call(source, 'model') ? '' : fallback.model;
    return {
      ...(options.allowDisabled ? { enabled: source.enabled === true } : {}),
      provider: normalizeAiProvider(source.provider || fallback.provider),
      model: normalizeAiModel(source.model, modelFallback),
    };
  }

  function normalizeAiProviders(rawProviders, legacySource = {}) {
    const source = isObject(rawProviders) ? rawProviders : {};
    const legacy = isObject(legacySource) ? legacySource : {};
    return {
      ollama: normalizeOllamaSettings(source.ollama || legacy.ollama),
      lmStudio: normalizeLmStudioSettings(source.lmStudio || legacy.lmStudio),
      openai: {},
      gemini: {},
      anthropic: {},
    };
  }

  function normalizeAiSettings(rawAiSettings) {
    const source = isObject(rawAiSettings) ? rawAiSettings : {};
    const legacyProvider = normalizeAiProvider(source.provider);
    const legacyProviderKey = getAiProviderSettingsKey(legacyProvider);
    const legacyProviderSettings = isObject(source[legacyProviderKey]) ? source[legacyProviderKey] : {};
    const normalSource = isObject(source.normal)
      ? source.normal
      : {
        provider: legacyProvider,
        ...(Object.prototype.hasOwnProperty.call(legacyProviderSettings, 'model')
          ? { model: legacyProviderSettings.model }
          : {}),
      };
    return {
      enabled: source.enabled === true,
      normal: normalizeAiProfile(normalSource, DEFAULT_AI_SETTINGS.normal),
      advanced: normalizeAiProfile(source.advanced, DEFAULT_AI_SETTINGS.advanced, { allowDisabled: true }),
      providers: normalizeAiProviders(source.providers, source),
      smartCardActions: normalizeSmartCardActions(source.smartCardActions || source.cardActions),
      smartBoardActions: normalizeSmartBoardActions(source.smartBoardActions || source.boardActions),
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
    AI_PROFILE_IDS,
    AI_PROVIDER_IDS,
    DEFAULT_AI_SETTINGS,
    DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_PORT,
    DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS,
    DEFAULT_NOTIFICATION_SETTINGS,
    DEFAULT_QUICK_ADD_SETTINGS,
    DEFAULT_SMART_CARD_ACTIONS,
    DEFAULT_SMART_BOARD_ACTIONS,
    DEFAULT_SMART_CARD_ACTION_TARGET,
    DEFAULT_TOOLTIPS_ENABLED,
    CUSTOM_SMART_CARD_ACTION_LIMIT,
    CUSTOM_SMART_BOARD_ACTION_LIMIT,
    GLOBAL_SHORTCUT_MAX_LENGTH,
    SMART_CARD_ACTION_LABEL_MAX_LENGTH,
    SMART_CARD_ACTION_PROMPT_MAX_LENGTH,
    SMART_CARD_ACTION_TARGETS,
    SMART_CARD_ACTION_TARGET_LABELS,
    SMART_BOARD_ACTION_LABEL_MAX_LENGTH,
    SMART_BOARD_ACTION_DESCRIPTION_MAX_LENGTH,
    SMART_BOARD_ACTION_PROMPT_MAX_LENGTH,
    SMART_BOARD_ACTION_MODES,
    SMART_BOARD_ACTION_MODE_LABELS,
    SMART_BOARD_ACTION_CAPABILITIES,
    SMART_BOARD_ACTION_CAPABILITY_LABELS,
    cloneDefaultAiSettings,
    cloneDefaultSmartCardActions,
    cloneDefaultSmartBoardActions,
    isObject,
    getAiProviderSettingsKey,
    normalizeAiModel,
    normalizeAiProfile,
    normalizeAiProviders,
    normalizeAiProvider,
    normalizeAiSettings,
    normalizeAppSettings,
    normalizeExternalPublishedCalendarPort,
    normalizeExternalPublishedCalendarSettings,
    normalizeExternalPublishedCalendarToken,
    normalizeGlobalShortcutAccelerator,
    normalizeNotificationSettings,
    normalizeNotificationTime,
    normalizeLmStudioModel,
    normalizeLmStudioSettings,
    normalizeLmStudioUrl,
    normalizeOllamaModel,
    normalizeOllamaSettings,
    normalizeOllamaUrl,
    normalizeQuickAddSettings,
    normalizeSmartCardActionId,
    normalizeSmartCardActionLabel,
    normalizeSmartCardActionPrompt,
    normalizeSmartCardActionTarget,
    normalizeSmartCardActions,
    normalizeSmartBoardActionMode,
    normalizeSmartBoardActionCapabilities,
    normalizeSmartBoardActionDescription,
    normalizeSmartBoardActionPrompt,
    normalizeSmartBoardActions,
    normalizeTooltipsEnabled,
  };
});
