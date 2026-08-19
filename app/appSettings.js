const APP_SETTINGS_SCHEMA = typeof SignboardAppSettingsSchema !== 'undefined'
  ? SignboardAppSettingsSchema
  : null;

if (!APP_SETTINGS_SCHEMA) {
  throw new Error('SignboardAppSettingsSchema must be loaded before app/appSettings.js.');
}

const DEFAULT_APP_NOTIFICATION_SETTINGS = APP_SETTINGS_SCHEMA.DEFAULT_NOTIFICATION_SETTINGS;
const DEFAULT_APP_TOOLTIPS_ENABLED = APP_SETTINGS_SCHEMA.DEFAULT_TOOLTIPS_ENABLED;
const DEFAULT_APP_QUICK_ADD_SETTINGS = APP_SETTINGS_SCHEMA.DEFAULT_QUICK_ADD_SETTINGS;
const DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS = APP_SETTINGS_SCHEMA.DEFAULT_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS;
const APP_SMART_CARD_ACTION_LABEL_MAX_LENGTH = APP_SETTINGS_SCHEMA.SMART_CARD_ACTION_LABEL_MAX_LENGTH;
const APP_SMART_CARD_ACTION_PROMPT_MAX_LENGTH = APP_SETTINGS_SCHEMA.SMART_CARD_ACTION_PROMPT_MAX_LENGTH;
const APP_CUSTOM_SMART_CARD_ACTION_LIMIT = APP_SETTINGS_SCHEMA.CUSTOM_SMART_CARD_ACTION_LIMIT;
const DEFAULT_APP_SMART_CARD_ACTIONS = APP_SETTINGS_SCHEMA.DEFAULT_SMART_CARD_ACTIONS;
const DEFAULT_APP_SMART_CARD_ACTION_TARGET = APP_SETTINGS_SCHEMA.DEFAULT_SMART_CARD_ACTION_TARGET;
const APP_SMART_CARD_ACTION_TARGETS = APP_SETTINGS_SCHEMA.SMART_CARD_ACTION_TARGETS;
const APP_SMART_CARD_ACTION_TARGET_LABELS = APP_SETTINGS_SCHEMA.SMART_CARD_ACTION_TARGET_LABELS;
const APP_SMART_BOARD_ACTION_LABEL_MAX_LENGTH = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_LABEL_MAX_LENGTH;
const APP_SMART_BOARD_ACTION_DESCRIPTION_MAX_LENGTH = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_DESCRIPTION_MAX_LENGTH;
const APP_SMART_BOARD_ACTION_PROMPT_MAX_LENGTH = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_PROMPT_MAX_LENGTH;
const APP_CUSTOM_SMART_BOARD_ACTION_LIMIT = APP_SETTINGS_SCHEMA.CUSTOM_SMART_BOARD_ACTION_LIMIT;
const DEFAULT_APP_SMART_BOARD_ACTIONS = APP_SETTINGS_SCHEMA.DEFAULT_SMART_BOARD_ACTIONS;
const APP_SMART_BOARD_ACTION_MODES = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_MODES;
const APP_SMART_BOARD_ACTION_MODE_LABELS = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_MODE_LABELS;
const APP_SMART_BOARD_ACTION_CAPABILITIES = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_CAPABILITIES;
const APP_SMART_BOARD_ACTION_CAPABILITY_LABELS = APP_SETTINGS_SCHEMA.SMART_BOARD_ACTION_CAPABILITY_LABELS;
const DEFAULT_APP_AI_SETTINGS = APP_SETTINGS_SCHEMA.cloneDefaultAiSettings();
const cloneDefaultAppSmartCardActions = APP_SETTINGS_SCHEMA.cloneDefaultSmartCardActions;
const cloneDefaultAppSmartBoardActions = APP_SETTINGS_SCHEMA.cloneDefaultSmartBoardActions;
const normalizeAppNotificationSettings = APP_SETTINGS_SCHEMA.normalizeNotificationSettings;
const normalizeAppTooltipsEnabled = APP_SETTINGS_SCHEMA.normalizeTooltipsEnabled;
const normalizeAppGlobalShortcutAccelerator = APP_SETTINGS_SCHEMA.normalizeGlobalShortcutAccelerator;
const normalizeAppQuickAddSettings = APP_SETTINGS_SCHEMA.normalizeQuickAddSettings;
const normalizeAppExternalPublishedCalendarPort = APP_SETTINGS_SCHEMA.normalizeExternalPublishedCalendarPort;
const normalizeAppExternalPublishedCalendarSettings = APP_SETTINGS_SCHEMA.normalizeExternalPublishedCalendarSettings;
const normalizeAppSmartCardActionLabel = APP_SETTINGS_SCHEMA.normalizeSmartCardActionLabel;
const normalizeAppSmartCardActionPrompt = APP_SETTINGS_SCHEMA.normalizeSmartCardActionPrompt;
const normalizeAppSmartCardActionId = APP_SETTINGS_SCHEMA.normalizeSmartCardActionId;
const normalizeAppSmartCardActionTarget = APP_SETTINGS_SCHEMA.normalizeSmartCardActionTarget;
const normalizeAppSmartCardActions = APP_SETTINGS_SCHEMA.normalizeSmartCardActions;
const normalizeAppSmartBoardActionMode = APP_SETTINGS_SCHEMA.normalizeSmartBoardActionMode;
const normalizeAppSmartBoardActionCapabilities = APP_SETTINGS_SCHEMA.normalizeSmartBoardActionCapabilities;
const normalizeAppSmartBoardActions = APP_SETTINGS_SCHEMA.normalizeSmartBoardActions;
const normalizeAppAiSettings = APP_SETTINGS_SCHEMA.normalizeAiSettings;
const DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_STATUS = Object.freeze({
  enabled: false,
  running: false,
  port: 48273,
  url: '',
  message: 'Disabled',
});
const DEFAULT_APP_AI_MODEL_STATUS = Object.freeze({
  checked: false,
  checking: false,
  ok: false,
  url: '',
  models: Object.freeze([]),
  message: 'Not checked',
});

function getAppSettingsState() {
  if (!window.__signboardAppSettingsState) {
    window.__signboardAppSettingsState = {
      settingsLoaded: false,
      notificationSettings: { ...DEFAULT_APP_NOTIFICATION_SETTINGS },
      tooltipsEnabled: DEFAULT_APP_TOOLTIPS_ENABLED,
      quickAddSettings: { ...DEFAULT_APP_QUICK_ADD_SETTINGS },
      externalPublishedCalendarSettings: { ...DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS },
      aiSettings: {
        ...DEFAULT_APP_AI_SETTINGS,
        normal: { ...DEFAULT_APP_AI_SETTINGS.normal },
        advanced: { ...DEFAULT_APP_AI_SETTINGS.advanced },
        providers: {
          ollama: { ...DEFAULT_APP_AI_SETTINGS.providers.ollama },
          lmStudio: { ...DEFAULT_APP_AI_SETTINGS.providers.lmStudio },
          openai: {},
          gemini: {},
          anthropic: {},
        },
        smartCardActions: cloneDefaultAppSmartCardActions(),
        smartBoardActions: cloneDefaultAppSmartBoardActions(),
      },
      aiCredentialStatus: { openai: false, gemini: false, anthropic: false },
      externalPublishedCalendarStatus: { ...DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_STATUS },
      aiModelStatuses: {
        normal: { ...DEFAULT_APP_AI_MODEL_STATUS, models: [] },
        advanced: { ...DEFAULT_APP_AI_MODEL_STATUS, models: [] },
      },
      aiModelStatusRequestIds: { normal: 0, advanced: 0 },
      globalShortcutStatus: {
        accelerator: '',
        registered: false,
        message: '',
      },
      expandedSmartCardActionIds: new Set(),
      expandedSmartBoardActionIds: new Set(),
      activeSmartActionScope: 'card',
      pendingSmartCardActionFocusId: '',
      smartCardActionsSortable: null,
      smartBoardActionsSortable: null,
      settingsSaveTimer: null,
      settingsSaveInFlight: Promise.resolve(),
    };
  }

  return window.__signboardAppSettingsState;
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

function normalizeAppAiModelEntry(model) {
  const source = model && typeof model === 'object' && !Array.isArray(model)
    ? model
    : {};
  const name = String(source.name || source.model || '').trim();
  if (!name) {
    return null;
  }

  return {
    name,
    model: String(source.model || name).trim() || name,
    modifiedAt: typeof source.modifiedAt === 'string'
      ? source.modifiedAt
      : (typeof source.modified_at === 'string' ? source.modified_at : ''),
    size: Number.isFinite(source.size) ? source.size : 0,
    digest: typeof source.digest === 'string' ? source.digest : '',
    details: source.details && typeof source.details === 'object' && !Array.isArray(source.details)
      ? { ...source.details }
      : {},
  };
}

function normalizeAppAiModels(models) {
  const sourceModels = Array.isArray(models) ? models : [];
  const seen = new Set();
  const normalizedModels = [];

  for (const model of sourceModels) {
    const normalized = normalizeAppAiModelEntry(model);
    if (!normalized || seen.has(normalized.name)) {
      continue;
    }
    seen.add(normalized.name);
    normalizedModels.push(normalized);
  }

  return normalizedModels.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeAppAiModelStatus(status) {
  const source = status && typeof status === 'object' && !Array.isArray(status)
    ? status
    : {};

  return {
    checked: source.checked === true,
    checking: source.checking === true,
    ok: source.ok === true,
    url: typeof source.url === 'string' ? source.url.trim() : '',
    models: normalizeAppAiModels(source.models),
    message: typeof source.message === 'string' && source.message.trim()
      ? source.message.trim()
      : DEFAULT_APP_AI_MODEL_STATUS.message,
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

function getAppAiSettings() {
  return normalizeAppAiSettings(getAppSettingsState().aiSettings);
}

function setAppAiSettings(aiSettings) {
  const state = getAppSettingsState();
  state.aiSettings = normalizeAppAiSettings(aiSettings);
}

function getAppAiProviderLabel(provider) {
  return {
    ollama: 'Ollama',
    'lm-studio': 'LM Studio',
    openai: 'OpenAI',
    gemini: 'Gemini',
    anthropic: 'Anthropic',
  }[provider] || 'AI provider';
}

function getAppAiProviderConfig(aiSettings = getAppAiSettings(), profileId = 'normal') {
  const settings = normalizeAppAiSettings(aiSettings);
  const normalizedProfileId = profileId === 'advanced' ? 'advanced' : 'normal';
  const profile = settings[normalizedProfileId];
  const provider = profile.provider;
  const key = APP_SETTINGS_SCHEMA.getAiProviderSettingsKey(provider);
  return {
    id: provider,
    key,
    label: getAppAiProviderLabel(provider),
    profileId: normalizedProfileId,
    profile,
    settings: settings.providers[key] || {},
    isCloud: ['openai', 'gemini', 'anthropic'].includes(provider),
  };
}

function normalizeAppAiCredentialStatus(status) {
  const source = status && typeof status === 'object' && !Array.isArray(status) ? status : {};
  return {
    openai: source.openai === true,
    gemini: source.gemini === true,
    anthropic: source.anthropic === true,
  };
}

function getAppAiCredentialStatus() {
  return normalizeAppAiCredentialStatus(getAppSettingsState().aiCredentialStatus);
}

function setAppAiCredentialStatus(status) {
  getAppSettingsState().aiCredentialStatus = normalizeAppAiCredentialStatus(status);
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

function getAppAiModelStatus(profileId = 'normal') {
  const id = profileId === 'advanced' ? 'advanced' : 'normal';
  return normalizeAppAiModelStatus(getAppSettingsState().aiModelStatuses[id]);
}

function setAppAiModelStatus(profileId, status) {
  const id = profileId === 'advanced' ? 'advanced' : 'normal';
  const state = getAppSettingsState();
  state.aiModelStatuses[id] = normalizeAppAiModelStatus(status);
}

function resetAppAiModelStatus(profileId = 'normal', message = DEFAULT_APP_AI_MODEL_STATUS.message) {
  const id = profileId === 'advanced' ? 'advanced' : 'normal';
  const state = getAppSettingsState();
  state.aiModelStatusRequestIds[id] += 1;
  setAppAiModelStatus(id, {
    ...DEFAULT_APP_AI_MODEL_STATUS,
    models: [],
    message,
  });
}

function resetAppAiProviderModelStatuses(provider, message = DEFAULT_APP_AI_MODEL_STATUS.message) {
  const settings = getAppAiSettings();
  for (const profileId of ['normal', 'advanced']) {
    if (settings[profileId].provider === provider) {
      resetAppAiModelStatus(profileId, message);
    }
  }
}

function refreshAppAiProfilesUsingProvider(provider) {
  const settings = getAppAiSettings();
  if (!settings.enabled) {
    return;
  }
  for (const profileId of ['normal', 'advanced']) {
    if (
      settings[profileId].provider === provider &&
      (profileId !== 'advanced' || settings.advanced.enabled)
    ) {
      refreshAppAiModels(profileId);
    }
  }
}

function applyAppSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  setAppNotificationSettings(source.notifications || DEFAULT_APP_NOTIFICATION_SETTINGS);
  setAppTooltipsEnabled(source.tooltipsEnabled);
  setAppQuickAddSettings(source.quickAdd || DEFAULT_APP_QUICK_ADD_SETTINGS);
  setAppExternalPublishedCalendarSettings(source.externalPublishedCalendar || DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS);
  setAppAiSettings(source.ai || DEFAULT_APP_AI_SETTINGS);
  setAppAiCredentialStatus(source.aiCredentialStatus);
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
      ai: getAppAiSettings(),
      globalShortcutStatus: getAppGlobalShortcutStatus(),
      externalPublishedCalendarStatus: getAppExternalPublishedCalendarStatus(),
    };
  }

  const settings = await window.electronAPI.readAppSettings();
  applyAppSettings(settings);
  renderAppSettingsControls();
  if (getAppAiSettings().enabled) {
    refreshConfiguredAppAiModels();
  }
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
        if (getAppAiSettings().enabled) {
          refreshConfiguredAppAiModels();
        }
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
  const aiToggle = document.getElementById('boardSettingsAiToggle');
  const aiDisabledState = document.getElementById('boardSettingsAiDisabledState');
  const aiDetails = document.getElementById('boardSettingsAiDetails');
  const aiNormalProfile = document.getElementById('boardSettingsAiNormalProfile');
  const aiAdvancedProfile = document.getElementById('boardSettingsAiAdvancedProfile');
  const aiActionsList = document.getElementById('boardSettingsAiActionsList');
  const aiAddActionButton = document.getElementById('btnAddAiSmartCardAction');
  const aiBoardActionsList = document.getElementById('boardSettingsAiBoardActionsList');
  const aiAddBoardActionButton = document.getElementById('btnAddAiSmartBoardAction');
  const cardScopeTab = document.getElementById('boardSettingsSmartActionsCardTab');
  const boardScopeTab = document.getElementById('boardSettingsSmartActionsBoardTab');
  const cardScopePanel = document.getElementById('boardSettingsSmartActionsCardPanel');
  const boardScopePanel = document.getElementById('boardSettingsSmartActionsBoardPanel');
  const notifications = getAppNotificationSettings();
  const quickAdd = getAppQuickAddSettings();
  const externalCalendar = getAppExternalPublishedCalendarSettings();
  const externalCalendarRuntime = getAppExternalPublishedCalendarStatus();
  const globalShortcutStatus = getAppGlobalShortcutStatus();
  const aiSettings = getAppAiSettings();

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

  if (aiToggle) {
    aiToggle.checked = aiSettings.enabled;
  }

  if (aiDetails) {
    aiDetails.classList.toggle('hidden', !aiSettings.enabled);
    aiDetails.setAttribute('aria-hidden', aiSettings.enabled ? 'false' : 'true');
  }

  if (aiDisabledState) {
    aiDisabledState.classList.toggle('hidden', aiSettings.enabled);
    aiDisabledState.setAttribute('aria-hidden', aiSettings.enabled ? 'true' : 'false');
  }

  renderAppAiProfileEditor(aiNormalProfile, 'normal', aiSettings);
  renderAppAiProfileEditor(aiAdvancedProfile, 'advanced', aiSettings);

  if (aiActionsList) {
    renderAppSmartCardActionSettings(aiActionsList, aiSettings.smartCardActions);
  }

  if (aiAddActionButton) {
    aiAddActionButton.disabled = !aiSettings.enabled;
  }

  if (aiBoardActionsList) {
    renderAppSmartBoardActionSettings(aiBoardActionsList, aiSettings.smartBoardActions);
  }

  if (aiAddBoardActionButton) {
    aiAddBoardActionButton.disabled = !aiSettings.enabled;
  }

  const smartActionScope = getAppSettingsState().activeSmartActionScope === 'board' ? 'board' : 'card';
  [[cardScopeTab, 'card'], [boardScopeTab, 'board']].forEach(([tab, scope]) => {
    if (!tab) return;
    const active = smartActionScope === scope;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  [[cardScopePanel, 'card'], [boardScopePanel, 'board']].forEach(([panel, scope]) => {
    if (!panel) return;
    const active = smartActionScope === scope;
    panel.classList.toggle('hidden', !active);
    panel.setAttribute('aria-hidden', String(!active));
  });

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

  if (typeof renderCardEditorSmartActionControls === 'function') {
    renderCardEditorSmartActionControls();
  }
  if (typeof renderSmartBoardActionControls === 'function') {
    renderSmartBoardActionControls();
  }
}

function setAppSmartActionSettingsScope(scope) {
  getAppSettingsState().activeSmartActionScope = scope === 'board' ? 'board' : 'card';
  renderAppSettingsControls();
}

function renderAppAiProfileEditor(container, profileId, aiSettings = getAppAiSettings()) {
  if (!container) {
    return;
  }
  const settings = normalizeAppAiSettings(aiSettings);
  const isAdvanced = profileId === 'advanced';
  const profile = settings[profileId];
  const providerConfig = getAppAiProviderConfig(settings, profileId);
  const modelStatus = getAppAiModelStatus(profileId);
  const credentialStatus = getAppAiCredentialStatus();
  const profileEnabled = settings.enabled && (!isAdvanced || profile.enabled);
  const idPrefix = `boardSettingsAi${isAdvanced ? 'Advanced' : 'Normal'}`;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'board-settings-ai-profile-header';
  const headingWrap = document.createElement('div');
  const heading = document.createElement('h4');
  heading.textContent = isAdvanced ? 'Advanced model' : 'Normal model';
  const hint = document.createElement('p');
  hint.className = 'boardSettingsHint';
  hint.textContent = isAdvanced
    ? 'Optional model for harder work. It can run locally or in the cloud.'
    : 'The default model used by Smart Card Actions.';
  headingWrap.append(heading, hint);
  header.appendChild(headingWrap);
  if (isAdvanced) {
    const switchLabel = document.createElement('label');
    switchLabel.className = 'board-settings-switch';
    switchLabel.title = 'Enable Advanced model';
    const toggle = document.createElement('input');
    toggle.id = `${idPrefix}Enabled`;
    toggle.type = 'checkbox';
    toggle.role = 'switch';
    toggle.checked = profile.enabled;
    toggle.setAttribute('aria-label', 'Enable Advanced model');
    const track = document.createElement('span');
    track.className = 'board-settings-switch-track';
    track.setAttribute('aria-hidden', 'true');
    switchLabel.append(toggle, track);
    header.appendChild(switchLabel);
    toggle.addEventListener('change', () => {
      const current = getAppAiSettings();
      setAppAiSettings({
        ...current,
        advanced: { ...current.advanced, enabled: toggle.checked },
      });
      resetAppAiModelStatus('advanced', toggle.checked ? 'Not checked' : 'Disabled');
      renderAppSettingsControls();
      scheduleAppSettingsSave();
      if (toggle.checked) {
        refreshAppAiModels('advanced');
      }
    });
  }
  container.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'board-settings-ai-profile-fields';
  fields.classList.toggle('is-disabled', !profileEnabled);

  const providerLabel = document.createElement('label');
  providerLabel.setAttribute('for', `${idPrefix}Provider`);
  providerLabel.textContent = 'Provider';
  const providerSelect = document.createElement('select');
  providerSelect.id = `${idPrefix}Provider`;
  providerSelect.disabled = !profileEnabled;
  for (const provider of APP_SETTINGS_SCHEMA.AI_PROVIDER_IDS) {
    const option = document.createElement('option');
    option.value = provider;
    option.textContent = getAppAiProviderLabel(provider);
    providerSelect.appendChild(option);
  }
  providerSelect.value = providerConfig.id;
  fields.append(providerLabel, providerSelect);

  providerSelect.addEventListener('change', async () => {
    const selectedProvider = providerSelect.value;
    const current = getAppAiSettings();
    setAppAiSettings({
      ...current,
      [profileId]: { ...current[profileId], provider: selectedProvider, model: '' },
    });
    resetAppAiModelStatus(profileId, 'Not checked');
    scheduleAppSettingsSave();
    const shouldRender = typeof waitForNativeSelectChangeToSettle !== 'function' ||
      await waitForNativeSelectChangeToSettle(providerSelect, selectedProvider);
    if (shouldRender) {
      renderAppSettingsControls();
      refreshAppAiModels(profileId);
    }
  });

  if (!providerConfig.isCloud) {
    const urlLabel = document.createElement('label');
    urlLabel.setAttribute('for', `${idPrefix}Url`);
    urlLabel.textContent = `${providerConfig.label} URL`;
    const urlInput = document.createElement('input');
    urlInput.id = `${idPrefix}Url`;
    urlInput.type = 'url';
    urlInput.value = providerConfig.settings.url || '';
    urlInput.placeholder = providerConfig.id === 'lm-studio' ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434';
    urlInput.spellcheck = false;
    urlInput.autocomplete = 'off';
    urlInput.disabled = !profileEnabled;
    fields.append(urlLabel, urlInput);
    urlInput.addEventListener('change', () => {
      const current = getAppAiSettings();
      setAppAiSettings({
        ...current,
        providers: {
          ...current.providers,
          [providerConfig.key]: { ...current.providers[providerConfig.key], url: urlInput.value },
        },
      });
      resetAppAiProviderModelStatuses(providerConfig.id, 'Not checked');
      renderAppSettingsControls();
      scheduleAppSettingsSave();
      refreshAppAiProfilesUsingProvider(providerConfig.id);
    });
  } else {
    const keyLabel = document.createElement('label');
    keyLabel.setAttribute('for', `${idPrefix}ApiKey`);
    keyLabel.textContent = `${providerConfig.label} API key`;
    const keyRow = document.createElement('div');
    keyRow.className = 'board-settings-inline-actions board-settings-ai-key-actions';
    const keyInput = document.createElement('input');
    keyInput.id = `${idPrefix}ApiKey`;
    keyInput.type = 'password';
    keyInput.placeholder = credentialStatus[providerConfig.id] ? 'Saved securely' : 'Paste API key';
    keyInput.autocomplete = 'new-password';
    keyInput.spellcheck = false;
    keyInput.disabled = !profileEnabled;
    const saveKey = document.createElement('button');
    saveKey.type = 'button';
    saveKey.textContent = credentialStatus[providerConfig.id] ? 'Replace' : 'Save Key';
    saveKey.disabled = !profileEnabled;
    const clearKey = document.createElement('button');
    clearKey.type = 'button';
    clearKey.textContent = 'Remove';
    clearKey.disabled = !profileEnabled || !credentialStatus[providerConfig.id];
    keyRow.append(keyInput, saveKey, clearKey);
    fields.append(keyLabel, keyRow);
    saveKey.addEventListener('click', async () => {
      const apiKey = String(keyInput.value || '').trim();
      if (!apiKey || !window.electronAPI || typeof window.electronAPI.setAiCredential !== 'function') {
        keyInput.focus();
        return;
      }
      saveKey.disabled = true;
      const result = await window.electronAPI.setAiCredential({ provider: providerConfig.id, apiKey });
      keyInput.value = '';
      if (result && result.ok) {
        setAppAiCredentialStatus(result.status);
        resetAppAiProviderModelStatuses(providerConfig.id, 'Not checked');
        renderAppSettingsControls();
        refreshAppAiProfilesUsingProvider(providerConfig.id);
      } else {
        setAppAiModelStatus(profileId, {
          checked: true,
          ok: false,
          message: result && result.message ? result.message : 'Unable to save API key.',
        });
        renderAppSettingsControls();
      }
    });
    clearKey.addEventListener('click', async () => {
      if (!window.electronAPI || typeof window.electronAPI.clearAiCredential !== 'function') return;
      const result = await window.electronAPI.clearAiCredential(providerConfig.id);
      if (result && result.ok) {
        setAppAiCredentialStatus(result.status);
        resetAppAiProviderModelStatuses(providerConfig.id, 'API key required');
        renderAppSettingsControls();
      }
    });
  }

  const modelLabel = document.createElement('label');
  modelLabel.setAttribute('for', `${idPrefix}Model`);
  modelLabel.textContent = `${providerConfig.label} model`;
  const modelRow = document.createElement('div');
  modelRow.className = 'board-settings-inline-actions board-settings-ai-model-actions';
  const modelSelect = document.createElement('select');
  modelSelect.id = `${idPrefix}Model`;
  modelSelect.setAttribute('aria-label', `${isAdvanced ? 'Advanced' : 'Normal'} ${providerConfig.label} model`);
  renderAppAiModelSelect(modelSelect, settings, modelStatus, profileId);
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.title = `Refresh ${providerConfig.label} models`;
  refreshButton.setAttribute('aria-label', refreshButton.title);
  refreshButton.disabled = !profileEnabled || modelStatus.checking || (providerConfig.isCloud && !credentialStatus[providerConfig.id]);
  refreshButton.innerHTML = window.feather && window.feather.icons && window.feather.icons['refresh-cw']
    ? window.feather.icons['refresh-cw'].toSvg()
    : 'Refresh';
  const status = document.createElement('span');
  status.id = `${idPrefix}Status`;
  status.className = 'board-settings-status';
  if (!profileEnabled) status.textContent = 'Disabled';
  else if (modelStatus.checking) status.textContent = 'Checking...';
  else if (modelStatus.checked && modelStatus.ok) {
    status.textContent = modelStatus.models.length > 0 ? modelStatus.message : 'Connected. No models found.';
    status.classList.add(modelStatus.models.length > 0 ? 'is-success' : 'is-warning');
  } else if (modelStatus.checked) {
    status.textContent = modelStatus.message || 'Not available';
    status.classList.add('is-warning');
  } else status.textContent = providerConfig.isCloud && !credentialStatus[providerConfig.id] ? 'API key required' : 'Not checked';
  modelRow.append(modelSelect, refreshButton, status);
  fields.append(modelLabel, modelRow);
  modelSelect.addEventListener('change', async () => {
    const model = modelSelect.value;
    const current = getAppAiSettings();
    setAppAiSettings({ ...current, [profileId]: { ...current[profileId], model } });
    scheduleAppSettingsSave();
    const shouldRender = typeof waitForNativeSelectChangeToSettle !== 'function' ||
      await waitForNativeSelectChangeToSettle(modelSelect, model);
    if (shouldRender) renderAppSettingsControls();
  });
  refreshButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    refreshAppAiModels(profileId);
  });
  container.appendChild(fields);
}

function renderAppSmartCardActionSettings(container, actions) {
  if (!container) {
    return;
  }

  const normalizedActions = normalizeAppSmartCardActions(actions);
  const expandedActionIds = getAppSettingsState().expandedSmartCardActionIds;
  destroyAppSmartCardActionsSortable();
  container.innerHTML = '';

  normalizedActions.forEach((action) => {
    const isExpanded = expandedActionIds.has(action.id);
    const actionEl = document.createElement('div');
    actionEl.className = 'board-settings-ai-action';
    actionEl.classList.toggle('is-expanded', isExpanded);
    actionEl.dataset.actionId = action.id;

    const header = document.createElement('div');
    header.className = 'board-settings-ai-action-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'board-settings-ai-action-title-wrap';

    const title = document.createElement('p');
    title.className = 'board-settings-ai-action-title';
    title.textContent = action.label;
    titleWrap.appendChild(title);

    const kind = document.createElement('p');
    kind.className = 'board-settings-ai-action-kind';
    kind.textContent = getAppSmartCardActionKindLabel(action);
    titleWrap.appendChild(kind);
    header.appendChild(titleWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'board-settings-ai-action-header-actions';

    if (action.prompt) {
      const shareButton = document.createElement('button');
      shareButton.type = 'button';
      shareButton.dataset.smartActionCommand = 'share';
      shareButton.dataset.actionId = action.id;
      shareButton.textContent = 'Share';
      headerActions.appendChild(shareButton);

      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.dataset.smartActionCommand = 'export';
      exportButton.dataset.actionId = action.id;
      exportButton.textContent = 'Export';
      headerActions.appendChild(exportButton);
    }

    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'board-settings-ai-action-drag-handle';
    dragHandle.dataset.smartActionDragHandle = 'true';
    dragHandle.dataset.actionId = action.id;
    dragHandle.title = 'Drag to reorder action';
    dragHandle.setAttribute('aria-label', `Reorder ${action.label}`);
    dragHandle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
    dragHandle.innerHTML = getAppSmartCardActionDragHandleMarkup();
    dragHandle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      moveAppSmartCardAction(action.id, event.key === 'ArrowUp' ? 'up' : 'down');
    });
    headerActions.appendChild(dragHandle);

    const canEditAction = canEditAppSmartCardAction(action);
    if (canEditAction) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'board-settings-ai-action-edit';
      editButton.dataset.smartActionCommand = 'toggle-edit';
      editButton.dataset.actionId = action.id;
      editButton.setAttribute('aria-expanded', String(isExpanded));
      editButton.setAttribute('aria-controls', `boardSettingsAiActionDetails-${action.id}`);
      editButton.textContent = isExpanded ? 'Done' : 'Edit';
      headerActions.appendChild(editButton);
    }

    if (action.builtIn) {
      if (canEditAction) {
        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'board-settings-ai-action-reset';
        resetButton.dataset.smartActionCommand = 'reset';
        resetButton.dataset.actionId = action.id;
        resetButton.textContent = 'Reset';
        headerActions.appendChild(resetButton);
      }
    } else {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'board-settings-ai-action-remove';
      removeButton.dataset.smartActionCommand = 'remove';
      removeButton.dataset.actionId = action.id;
      removeButton.textContent = 'Remove';
      headerActions.appendChild(removeButton);
    }
    header.appendChild(headerActions);
    actionEl.appendChild(header);

    const details = document.createElement('div');
    details.id = `boardSettingsAiActionDetails-${action.id}`;
    details.className = 'board-settings-ai-action-details';
    details.hidden = !isExpanded || !canEditAction;
    details.setAttribute('aria-hidden', isExpanded && canEditAction ? 'false' : 'true');

    if (!action.builtIn) {
      const label = document.createElement('label');
      label.className = 'board-settings-ai-action-label';
      label.setAttribute('for', `boardSettingsAiActionLabel-${action.id}`);
      label.textContent = 'Custom action label';
      details.appendChild(label);

      const labelInput = document.createElement('input');
      labelInput.id = `boardSettingsAiActionLabel-${action.id}`;
      labelInput.type = 'text';
      labelInput.value = action.label;
      labelInput.maxLength = APP_SMART_CARD_ACTION_LABEL_MAX_LENGTH;
      labelInput.dataset.smartActionField = 'label';
      labelInput.dataset.actionId = action.id;
      labelInput.placeholder = 'Action label';
      details.appendChild(labelInput);

      const targetLabel = document.createElement('label');
      targetLabel.className = 'board-settings-ai-action-label';
      targetLabel.setAttribute('for', `boardSettingsAiActionTarget-${action.id}`);
      targetLabel.textContent = 'Affects';
      details.appendChild(targetLabel);

      const targetSelect = document.createElement('select');
      targetSelect.id = `boardSettingsAiActionTarget-${action.id}`;
      targetSelect.dataset.smartActionField = 'target';
      targetSelect.dataset.actionId = action.id;
      const currentTarget = normalizeAppSmartCardActionTarget(action.target || action.type, DEFAULT_APP_SMART_CARD_ACTION_TARGET);
      APP_SMART_CARD_ACTION_TARGETS.forEach((target) => {
        const option = document.createElement('option');
        option.value = target;
        option.textContent = getAppSmartCardActionTargetLabel(target);
        option.selected = target === currentTarget;
        targetSelect.appendChild(option);
      });
      details.appendChild(targetSelect);
    }

    if (canEditAction) {
      const promptLabel = document.createElement('label');
      promptLabel.className = 'board-settings-ai-action-label';
      promptLabel.setAttribute('for', `boardSettingsAiActionPrompt-${action.id}`);
      promptLabel.textContent = action.builtIn ? 'Prompt' : 'Custom action prompt';
      details.appendChild(promptLabel);

      const promptTextarea = document.createElement('textarea');
      promptTextarea.id = `boardSettingsAiActionPrompt-${action.id}`;
      promptTextarea.value = action.prompt;
      promptTextarea.rows = action.builtIn ? 4 : 5;
      promptTextarea.maxLength = APP_SMART_CARD_ACTION_PROMPT_MAX_LENGTH;
      promptTextarea.dataset.smartActionField = 'prompt';
      promptTextarea.dataset.actionId = action.id;
      promptTextarea.spellcheck = true;
      details.appendChild(promptTextarea);
    }
    if (canEditAction) {
      actionEl.appendChild(details);
    }

    container.appendChild(actionEl);
  });

  initializeAppSmartCardActionsSortable(container);
  focusPendingAppSmartCardActionControl(container);
}

function canEditAppSmartCardAction(action) {
  return !action || action.editable !== false;
}

function getAppSmartCardActionTargetLabel(target) {
  const normalizedTarget = normalizeAppSmartCardActionTarget(target, DEFAULT_APP_SMART_CARD_ACTION_TARGET);
  return APP_SMART_CARD_ACTION_TARGET_LABELS[normalizedTarget] || APP_SMART_CARD_ACTION_TARGET_LABELS[DEFAULT_APP_SMART_CARD_ACTION_TARGET] || 'Content';
}

function getAppSmartCardActionKindLabel(action) {
  if (!action) {
    return 'Built in';
  }

  if (action.id === 'quick-smart-action') {
    return 'Built in - One-off';
  }

  if (action.id === 'question-card' || action.type === 'question') {
    return 'Built in - Read-only';
  }

  const prefix = action.builtIn ? 'Built in' : 'Custom';
  return `${prefix} - ${getAppSmartCardActionTargetLabel(action.target || action.type)}`;
}

function getAppSmartCardActionDragHandleMarkup() {
  if (
    window.feather &&
    window.feather.icons &&
    window.feather.icons.menu &&
    typeof window.feather.icons.menu.toSvg === 'function'
  ) {
    return window.feather.icons.menu.toSvg({
      width: 15,
      height: 15,
      'aria-hidden': 'true',
      focusable: 'false',
    });
  }

  return '<span aria-hidden="true">Drag</span>';
}

function destroyAppSmartCardActionsSortable() {
  const state = getAppSettingsState();
  if (!state.smartCardActionsSortable) {
    return;
  }

  state.smartCardActionsSortable.destroy();
  state.smartCardActionsSortable = null;
}

function initializeAppSmartCardActionsSortable(container) {
  if (!container || typeof Sortable !== 'function') {
    return;
  }

  const actionCount = container.querySelectorAll('.board-settings-ai-action[data-action-id]').length;
  if (actionCount < 2) {
    return;
  }

  const state = getAppSettingsState();
  state.smartCardActionsSortable = new Sortable(container, {
    animation: (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) ? 0 : 150,
    draggable: '.board-settings-ai-action[data-action-id]',
    handle: '.board-settings-ai-action-drag-handle',
    ghostClass: 'board-settings-ai-action--ghost',
    chosenClass: 'board-settings-ai-action--chosen',
    dragClass: 'board-settings-ai-action--dragging',
    onEnd: (event) => {
      if (event.oldIndex === event.newIndex) {
        return;
      }

      reorderAppSmartCardActionsFromContainer(container);
    },
  });
}

function reorderAppSmartCardActionsFromContainer(container) {
  if (!container) {
    return;
  }

  const actionIds = [...container.querySelectorAll('.board-settings-ai-action[data-action-id]')]
    .map((actionEl) => String(actionEl.dataset.actionId || '').trim())
    .filter(Boolean);

  reorderAppSmartCardActions(actionIds);
}

function reorderAppSmartCardActions(actionIds = []) {
  const normalizedActionIds = Array.isArray(actionIds)
    ? actionIds.map((actionId) => String(actionId || '').trim()).filter(Boolean)
    : [];
  if (normalizedActionIds.length === 0) {
    return;
  }

  const settings = getAppAiSettings();
  const actionsById = new Map(settings.smartCardActions.map((action) => [action.id, action]));
  const nextActions = [];

  normalizedActionIds.forEach((actionId) => {
    const action = actionsById.get(actionId);
    if (!action) {
      return;
    }

    nextActions.push(action);
    actionsById.delete(actionId);
  });

  if (nextActions.length === 0) {
    return;
  }

  actionsById.forEach((action) => {
    nextActions.push(action);
  });

  const previousOrder = settings.smartCardActions.map((action) => action.id).join('\n');
  const nextOrder = nextActions.map((action) => action.id).join('\n');
  if (previousOrder === nextOrder) {
    return;
  }

  setAppAiSettings({
    ...settings,
    smartCardActions: nextActions,
  });
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function focusPendingAppSmartCardActionControl(container) {
  const state = getAppSettingsState();
  const pendingActionId = String(state.pendingSmartCardActionFocusId || '').trim();
  if (!pendingActionId) {
    return;
  }

  state.pendingSmartCardActionFocusId = '';
  const handle = [...container.querySelectorAll('.board-settings-ai-action-drag-handle[data-action-id]')]
    .find((element) => element.dataset.actionId === pendingActionId);
  if (handle && typeof handle.focus === 'function') {
    handle.focus({ preventScroll: true });
  }
}

function getDefaultAppSmartCardAction(actionId) {
  return DEFAULT_APP_SMART_CARD_ACTIONS.find((action) => action.id === actionId) || null;
}

function updateAppSmartCardAction(actionId, partialAction = {}) {
  const settings = getAppAiSettings();
  const nextActions = settings.smartCardActions.map((action) => {
    if (action.id !== actionId) {
      return action;
    }

    return {
      ...action,
      ...partialAction,
    };
  });

  setAppAiSettings({
    ...settings,
    smartCardActions: nextActions,
  });
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function toggleAppSmartCardActionExpanded(actionId) {
  const normalizedActionId = String(actionId || '').trim();
  if (!normalizedActionId) {
    return;
  }

  const state = getAppSettingsState();
  if (state.expandedSmartCardActionIds.has(normalizedActionId)) {
    state.expandedSmartCardActionIds.delete(normalizedActionId);
  } else {
    state.expandedSmartCardActionIds.add(normalizedActionId);
  }
  renderAppSettingsControls();
}

function moveAppSmartCardAction(actionId, direction) {
  const normalizedActionId = String(actionId || '').trim();
  const offset = direction === 'up' ? -1 : (direction === 'down' ? 1 : 0);
  if (!normalizedActionId || offset === 0) {
    return;
  }

  const settings = getAppAiSettings();
  const actions = [...settings.smartCardActions];
  const currentIndex = actions.findIndex((action) => action.id === normalizedActionId);
  const nextIndex = currentIndex + offset;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= actions.length) {
    return;
  }

  const [action] = actions.splice(currentIndex, 1);
  actions.splice(nextIndex, 0, action);
  setAppAiSettings({
    ...settings,
    smartCardActions: actions,
  });
  const state = getAppSettingsState();
  state.expandedSmartCardActionIds.add(normalizedActionId);
  state.pendingSmartCardActionFocusId = normalizedActionId;
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function resetAppSmartCardActionPrompt(actionId) {
  const defaultAction = getDefaultAppSmartCardAction(actionId);
  if (!defaultAction) {
    return;
  }

  updateAppSmartCardAction(actionId, {
    prompt: defaultAction.prompt,
  });
}

function removeAppSmartCardAction(actionId) {
  const settings = getAppAiSettings();
  getAppSettingsState().expandedSmartCardActionIds.delete(String(actionId || '').trim());
  setAppAiSettings({
    ...settings,
    smartCardActions: settings.smartCardActions.filter((action) => action.id !== actionId || action.builtIn),
  });
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function createAppSmartCardActionId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addAppSmartCardAction() {
  const settings = getAppAiSettings();
  const customActionCount = settings.smartCardActions.filter((action) => !action.builtIn).length;
  if (customActionCount >= APP_CUSTOM_SMART_CARD_ACTION_LIMIT) {
    return;
  }

  const newActionId = createAppSmartCardActionId();
  setAppAiSettings({
    ...settings,
    smartCardActions: [
      {
        id: newActionId,
        type: 'custom',
        target: DEFAULT_APP_SMART_CARD_ACTION_TARGET,
        label: `Custom action ${customActionCount + 1}`,
        prompt: 'Use the card context to create useful Markdown to append to this card.',
        builtIn: false,
      },
      ...settings.smartCardActions,
    ],
  });
  getAppSettingsState().expandedSmartCardActionIds.add(newActionId);
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function renderAppSmartBoardActionSettings(container, actions) {
  if (!container) return;
  const normalizedActions = normalizeAppSmartBoardActions(actions);
  const expanded = getAppSettingsState().expandedSmartBoardActionIds;
  destroyAppSmartBoardActionsSortable();
  container.innerHTML = '';

  normalizedActions.forEach((action) => {
    const isExpanded = expanded.has(action.id);
    const actionEl = document.createElement('div');
    actionEl.className = 'board-settings-ai-action';
    actionEl.classList.toggle('is-expanded', isExpanded);
    actionEl.dataset.actionId = action.id;

    const header = document.createElement('div');
    header.className = 'board-settings-ai-action-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'board-settings-ai-action-title-wrap';
    const title = document.createElement('p');
    title.className = 'board-settings-ai-action-title';
    title.textContent = action.label;
    const kind = document.createElement('p');
    kind.className = 'board-settings-ai-action-kind';
    const prefix = action.builtIn ? 'Built in' : 'Custom';
    kind.textContent = `${prefix} - ${APP_SMART_BOARD_ACTION_MODE_LABELS[action.mode] || 'Read-only report'}`;
    titleWrap.append(title, kind);
    header.appendChild(titleWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'board-settings-ai-action-header-actions';
    if (action.prompt) {
      const shareButton = document.createElement('button');
      shareButton.type = 'button';
      shareButton.dataset.smartBoardActionCommand = 'share';
      shareButton.dataset.actionId = action.id;
      shareButton.textContent = 'Share';
      headerActions.appendChild(shareButton);
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.dataset.smartBoardActionCommand = 'export';
      exportButton.dataset.actionId = action.id;
      exportButton.textContent = 'Export';
      headerActions.appendChild(exportButton);
    }
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'board-settings-ai-action-drag-handle';
    dragHandle.dataset.smartBoardActionDragHandle = 'true';
    dragHandle.dataset.actionId = action.id;
    dragHandle.title = 'Drag to reorder action';
    dragHandle.setAttribute('aria-label', `Reorder ${action.label}`);
    dragHandle.innerHTML = getAppSmartCardActionDragHandleMarkup();
    dragHandle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      moveAppSmartBoardAction(action.id, event.key === 'ArrowUp' ? 'up' : 'down');
    });
    headerActions.appendChild(dragHandle);

    const canEdit = action.editable !== false;
    if (canEdit) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.dataset.smartBoardActionCommand = 'toggle-edit';
      editButton.dataset.actionId = action.id;
      editButton.setAttribute('aria-expanded', String(isExpanded));
      editButton.textContent = isExpanded ? 'Done' : 'Edit';
      headerActions.appendChild(editButton);
      if (action.builtIn) {
        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.dataset.smartBoardActionCommand = 'reset';
        resetButton.dataset.actionId = action.id;
        resetButton.textContent = 'Reset';
        headerActions.appendChild(resetButton);
      }
    }
    if (!action.builtIn) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.smartBoardActionCommand = 'remove';
      removeButton.dataset.actionId = action.id;
      removeButton.textContent = 'Remove';
      headerActions.appendChild(removeButton);
    }
    header.appendChild(headerActions);
    actionEl.appendChild(header);

    if (action.description) {
      const description = document.createElement('p');
      description.className = 'board-settings-ai-action-description';
      description.textContent = action.description;
      actionEl.appendChild(description);
    }

    if (canEdit) {
      const details = document.createElement('div');
      details.className = 'board-settings-ai-action-details';
      details.hidden = !isExpanded;
      details.setAttribute('aria-hidden', String(!isExpanded));
      if (!action.builtIn) {
        details.appendChild(createAppSmartBoardActionField('Name', 'text', action.label, action.id, 'label', APP_SMART_BOARD_ACTION_LABEL_MAX_LENGTH));
        details.appendChild(createAppSmartBoardActionField('Description', 'text', action.description, action.id, 'description', APP_SMART_BOARD_ACTION_DESCRIPTION_MAX_LENGTH));
        const modeLabel = document.createElement('label');
        modeLabel.textContent = 'Mode';
        const modeSelect = document.createElement('select');
        modeSelect.dataset.smartBoardActionField = 'mode';
        modeSelect.dataset.actionId = action.id;
        APP_SMART_BOARD_ACTION_MODES.forEach((mode) => {
          const option = document.createElement('option');
          option.value = mode;
          option.textContent = APP_SMART_BOARD_ACTION_MODE_LABELS[mode];
          option.selected = action.mode === mode;
          modeSelect.appendChild(option);
        });
        details.append(modeLabel, modeSelect);
      }

      if (!action.builtIn && action.mode === 'changes') {
        const capabilities = document.createElement('fieldset');
        capabilities.className = 'board-settings-ai-capabilities';
        const legend = document.createElement('legend');
        legend.textContent = 'Can propose';
        capabilities.appendChild(legend);
        APP_SMART_BOARD_ACTION_CAPABILITIES.forEach((capability) => {
          const label = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = action.capabilities.includes(capability);
          checkbox.dataset.smartBoardActionCapability = capability;
          checkbox.dataset.actionId = action.id;
          label.append(checkbox, document.createTextNode(APP_SMART_BOARD_ACTION_CAPABILITY_LABELS[capability] || capability));
          capabilities.appendChild(label);
        });
        details.appendChild(capabilities);
      }

      const promptLabel = document.createElement('label');
      promptLabel.textContent = action.builtIn ? 'Prompt' : 'Custom action prompt';
      const prompt = document.createElement('textarea');
      prompt.value = action.prompt;
      prompt.rows = 6;
      prompt.maxLength = APP_SMART_BOARD_ACTION_PROMPT_MAX_LENGTH;
      prompt.dataset.smartBoardActionField = 'prompt';
      prompt.dataset.actionId = action.id;
      details.append(promptLabel, prompt);
      actionEl.appendChild(details);
    }
    container.appendChild(actionEl);
  });
  initializeAppSmartBoardActionsSortable(container);
}

function createAppSmartBoardActionField(labelText, type, value, actionId, field, maxLength) {
  const wrapper = document.createElement('div');
  wrapper.className = 'board-settings-ai-action-field';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = value || '';
  input.maxLength = maxLength;
  input.dataset.smartBoardActionField = field;
  input.dataset.actionId = actionId;
  wrapper.append(label, input);
  return wrapper;
}

function destroyAppSmartBoardActionsSortable() {
  const state = getAppSettingsState();
  if (!state.smartBoardActionsSortable) return;
  state.smartBoardActionsSortable.destroy();
  state.smartBoardActionsSortable = null;
}

function initializeAppSmartBoardActionsSortable(container) {
  if (!container || typeof Sortable !== 'function' || container.children.length < 2) return;
  getAppSettingsState().smartBoardActionsSortable = new Sortable(container, {
    animation: (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) ? 0 : 150,
    draggable: '.board-settings-ai-action[data-action-id]',
    handle: '.board-settings-ai-action-drag-handle',
    ghostClass: 'board-settings-ai-action--ghost',
    onEnd: () => reorderAppSmartBoardActions([...container.querySelectorAll('.board-settings-ai-action[data-action-id]')].map((el) => el.dataset.actionId)),
  });
}

function reorderAppSmartBoardActions(actionIds) {
  const settings = getAppAiSettings();
  const byId = new Map(settings.smartBoardActions.map((action) => [action.id, action]));
  const next = [];
  (Array.isArray(actionIds) ? actionIds : []).forEach((id) => {
    if (!byId.has(id)) return;
    next.push(byId.get(id));
    byId.delete(id);
  });
  byId.forEach((action) => next.push(action));
  setAppAiSettings({ ...settings, smartBoardActions: next });
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function updateAppSmartBoardAction(actionId, partialAction) {
  const settings = getAppAiSettings();
  const actions = settings.smartBoardActions.map((action) => action.id === actionId ? { ...action, ...partialAction } : action);
  setAppAiSettings({ ...settings, smartBoardActions: actions });
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function updateAppSmartBoardActionCapability(actionId, capability, enabled) {
  const action = getAppAiSettings().smartBoardActions.find((candidate) => candidate.id === actionId);
  if (!action) return;
  const next = new Set(action.capabilities);
  if (enabled) next.add(capability); else next.delete(capability);
  updateAppSmartBoardAction(actionId, { capabilities: [...next] });
}

function toggleAppSmartBoardActionExpanded(actionId) {
  const expanded = getAppSettingsState().expandedSmartBoardActionIds;
  if (expanded.has(actionId)) expanded.delete(actionId); else expanded.add(actionId);
  renderAppSettingsControls();
}

function moveAppSmartBoardAction(actionId, direction) {
  const settings = getAppAiSettings();
  const actions = [...settings.smartBoardActions];
  const index = actions.findIndex((action) => action.id === actionId);
  const nextIndex = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || nextIndex < 0 || nextIndex >= actions.length) return;
  const [action] = actions.splice(index, 1);
  actions.splice(nextIndex, 0, action);
  setAppAiSettings({ ...settings, smartBoardActions: actions });
  getAppSettingsState().expandedSmartBoardActionIds.add(actionId);
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function resetAppSmartBoardActionPrompt(actionId) {
  const defaultAction = DEFAULT_APP_SMART_BOARD_ACTIONS.find((action) => action.id === actionId);
  if (defaultAction) updateAppSmartBoardAction(actionId, { prompt: defaultAction.prompt });
}

function removeAppSmartBoardAction(actionId) {
  const settings = getAppAiSettings();
  setAppAiSettings({ ...settings, smartBoardActions: settings.smartBoardActions.filter((action) => action.id !== actionId || action.builtIn) });
  getAppSettingsState().expandedSmartBoardActionIds.delete(actionId);
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function addAppSmartBoardAction() {
  const settings = getAppAiSettings();
  const count = settings.smartBoardActions.filter((action) => !action.builtIn).length;
  if (count >= APP_CUSTOM_SMART_BOARD_ACTION_LIMIT) return;
  const id = `custom-board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const action = {
    id,
    mode: 'report',
    label: `Custom board action ${count + 1}`,
    description: 'A reusable read-only report for the current board.',
    prompt: 'Analyze the current board and return a concise, factual Markdown report with relevant card references.',
    capabilities: [],
    builtIn: false,
  };
  setAppAiSettings({ ...settings, smartBoardActions: [action, ...settings.smartBoardActions] });
  getAppSettingsState().expandedSmartBoardActionIds.add(id);
  renderAppSettingsControls();
  scheduleAppSettingsSave();
}

function getAppSmartActionForSharing(scope, actionId) {
  const settings = getAppAiSettings();
  const actions = scope === 'board' ? settings.smartBoardActions : settings.smartCardActions;
  return actions.find((action) => action.id === actionId) || null;
}

async function shareAppSmartAction(scope, actionId) {
  const action = getAppSmartActionForSharing(scope, actionId);
  if (!action || !action.prompt || !window.electronAPI || typeof window.electronAPI.copySmartActionShareLink !== 'function') return;
  const result = await window.electronAPI.copySmartActionShareLink({ scope, action });
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(result && result.ok ? `Copied share link for ${action.label}.` : (result && result.message ? result.message : 'Unable to share this action.'));
  }
}

async function exportAppSmartAction(scope, actionId) {
  const action = getAppSmartActionForSharing(scope, actionId);
  if (!action || !action.prompt || !window.electronAPI || typeof window.electronAPI.exportSmartActionFile !== 'function') return;
  const result = await window.electronAPI.exportSmartActionFile({ scope, action });
  if (result && result.ok && typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(`Exported ${action.label}.`);
  }
}

function installImportedAppSmartAction(actionPackage) {
  const source = actionPackage && typeof actionPackage === 'object' ? actionPackage : {};
  const action = source.action && typeof source.action === 'object' ? source.action : null;
  if (!action) return false;
  const settings = getAppAiSettings();
  if (source.scope === 'board') {
    const id = `imported-board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const imported = {
      id,
      mode: normalizeAppSmartBoardActionMode(action.mode),
      label: action.name,
      description: action.description || 'Imported Smart Board Action.',
      prompt: action.prompt,
      capabilities: normalizeAppSmartBoardActionCapabilities(action.capabilities, action.mode),
      builtIn: false,
    };
    setAppAiSettings({ ...settings, smartBoardActions: [imported, ...settings.smartBoardActions] });
    getAppSettingsState().expandedSmartBoardActionIds.add(id);
    getAppSettingsState().activeSmartActionScope = 'board';
  } else {
    const id = `imported-card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const imported = {
      id,
      type: 'custom',
      target: normalizeAppSmartCardActionTarget(action.target),
      label: action.name,
      prompt: action.prompt,
      builtIn: false,
    };
    setAppAiSettings({ ...settings, smartCardActions: [imported, ...settings.smartCardActions] });
    getAppSettingsState().expandedSmartCardActionIds.add(id);
    getAppSettingsState().activeSmartActionScope = 'card';
  }
  renderAppSettingsControls();
  scheduleAppSettingsSave();
  return true;
}

async function importAppSmartAction() {
  if (!window.electronAPI || typeof window.electronAPI.importSmartActionFile !== 'function') return;
  const result = await window.electronAPI.importSmartActionFile();
  if (!result || !result.ok || !result.package) {
    if (result && !result.canceled && result.message && typeof announceSignboardStatus === 'function') announceSignboardStatus(result.message);
    return;
  }
  const actionPackage = result.package;
  const action = actionPackage.action;
  const capabilityText = actionPackage.scope === 'board'
    ? (action.mode === 'changes' ? `Can propose: ${(action.capabilities || []).join(', ') || 'no changes'}` : 'Read-only report')
    : `Affects: ${action.target}`;
  const promptPreview = String(action.prompt || '').slice(0, 700);
  const confirmed = window.confirm(`Import ${action.name}?\n\nScope: ${actionPackage.scope}\n${capabilityText}\n\nPrompt:\n${promptPreview}${String(action.prompt || '').length > promptPreview.length ? '…' : ''}`);
  if (!confirmed) return;
  if (installImportedAppSmartAction(actionPackage) && typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(`Imported ${action.name}.`);
  }
}

function getAppAiModelOptionLabel(model) {
  const source = model && typeof model === 'object' && !Array.isArray(model)
    ? model
    : {};
  const name = String(source.name || source.model || '').trim();
  if (!name) {
    return '';
  }

  const details = source.details && typeof source.details === 'object' && !Array.isArray(source.details)
    ? source.details
    : {};
  const parameterSize = typeof details.parameter_size === 'string' ? details.parameter_size.trim() : '';
  return parameterSize ? `${name} (${parameterSize})` : name;
}

function renderAppAiModelSelect(select, aiSettings, aiModelStatus, profileId = 'normal') {
  if (!select) {
    return;
  }

  const settings = normalizeAppAiSettings(aiSettings);
  const status = normalizeAppAiModelStatus(aiModelStatus);
  const providerConfig = getAppAiProviderConfig(settings, profileId);
  const selectedModel = providerConfig.profile.model;
  const models = status.ok ? status.models : [];
  const seen = new Set();

  select.innerHTML = '';

  const appendOption = (value, label, options = {}) => {
    const normalizedValue = String(value || '').trim();
    const optionKey = normalizedValue || '__empty';
    if ((!normalizedValue && !options.allowEmpty) || seen.has(optionKey)) {
      return;
    }

    const option = document.createElement('option');
    option.value = normalizedValue;
    option.textContent = label || normalizedValue;
    if (options.disabled) {
      option.disabled = true;
    }
    select.appendChild(option);
    seen.add(optionKey);
  };

  if (selectedModel && !models.some((model) => model.name === selectedModel || model.model === selectedModel)) {
    appendOption(selectedModel, status.checked && status.ok
      ? `${selectedModel} (saved, not listed)`
      : selectedModel);
  }

  for (const model of models) {
    appendOption(model.name, getAppAiModelOptionLabel(model));
  }

  if (seen.size === 0) {
    appendOption('', status.checking ? 'Checking models...' : 'No models found', {
      allowEmpty: true,
      disabled: true,
    });
  }

  select.value = seen.has(selectedModel)
    ? selectedModel
    : (select.options.length > 0 ? select.options[0].value : '');
  select.disabled = !settings.enabled ||
    (profileId === 'advanced' && !settings.advanced.enabled) ||
    status.checking ||
    select.options.length === 0;
}

async function refreshAppAiModels(profileId = 'normal') {
  const normalizedProfileId = profileId === 'advanced' ? 'advanced' : 'normal';
  const state = getAppSettingsState();
  const settings = getAppAiSettings();
  const providerConfig = getAppAiProviderConfig(settings, normalizedProfileId);

  if (!settings.enabled || (normalizedProfileId === 'advanced' && !settings.advanced.enabled)) {
    resetAppAiModelStatus(normalizedProfileId, 'Disabled');
    renderAppSettingsControls();
    return;
  }

  if (!window.electronAPI || typeof window.electronAPI.inspectAiProvider !== 'function') {
    setAppAiModelStatus(normalizedProfileId, {
      checked: true,
      checking: false,
      ok: false,
      url: providerConfig.settings.url,
      models: [],
      message: `${providerConfig.label} inspection is unavailable.`,
    });
    renderAppSettingsControls();
    return;
  }

  const requestId = state.aiModelStatusRequestIds[normalizedProfileId] + 1;
  state.aiModelStatusRequestIds[normalizedProfileId] = requestId;
  setAppAiModelStatus(normalizedProfileId, {
    checked: false,
    checking: true,
    ok: false,
    url: providerConfig.settings.url,
    models: getAppAiModelStatus(normalizedProfileId).models,
    message: 'Checking...',
  });
  renderAppSettingsControls();

  let result = null;
  try {
    result = await window.electronAPI.inspectAiProvider({
      provider: providerConfig.id,
      profile: normalizedProfileId,
      url: providerConfig.settings.url,
    });
  } catch (error) {
    console.error(`Unable to inspect ${providerConfig.label}.`, error);
  }

  if (state.aiModelStatusRequestIds[normalizedProfileId] !== requestId) {
    return;
  }

  if (!result || result.ok !== true) {
    setAppAiModelStatus(normalizedProfileId, {
      checked: true,
      checking: false,
      ok: false,
      url: providerConfig.settings.url,
      models: [],
      message: result && result.message ? result.message : `Unable to reach ${providerConfig.label}.`,
    });
    renderAppSettingsControls();
    return;
  }

  const firstModel = Array.isArray(result.models) && result.models.length > 0
    ? String(result.models[0].name || result.models[0].model || '').trim()
    : '';
  if (!providerConfig.profile.model && firstModel) {
    setAppAiSettings({
      ...settings,
      [normalizedProfileId]: {
        ...settings[normalizedProfileId],
        model: firstModel,
      },
    });
    scheduleAppSettingsSave();
  }

  setAppAiModelStatus(normalizedProfileId, {
    checked: true,
    checking: false,
    ok: true,
    url: result.url || providerConfig.settings.url,
    models: result.models,
    message: result.message || 'Connected.',
  });
  renderAppSettingsControls();
}

function refreshConfiguredAppAiModels() {
  const settings = getAppAiSettings();
  refreshAppAiModels('normal');
  if (settings.advanced.enabled) {
    refreshAppAiModels('advanced');
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
        ai: getAppAiSettings(),
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
