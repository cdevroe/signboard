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
const DEFAULT_APP_AI_SETTINGS = APP_SETTINGS_SCHEMA.cloneDefaultAiSettings();
const cloneDefaultAppSmartCardActions = APP_SETTINGS_SCHEMA.cloneDefaultSmartCardActions;
const normalizeAppNotificationSettings = APP_SETTINGS_SCHEMA.normalizeNotificationSettings;
const normalizeAppTooltipsEnabled = APP_SETTINGS_SCHEMA.normalizeTooltipsEnabled;
const normalizeAppGlobalShortcutAccelerator = APP_SETTINGS_SCHEMA.normalizeGlobalShortcutAccelerator;
const normalizeAppQuickAddSettings = APP_SETTINGS_SCHEMA.normalizeQuickAddSettings;
const normalizeAppExternalPublishedCalendarPort = APP_SETTINGS_SCHEMA.normalizeExternalPublishedCalendarPort;
const normalizeAppExternalPublishedCalendarSettings = APP_SETTINGS_SCHEMA.normalizeExternalPublishedCalendarSettings;
const normalizeAppSmartCardActionLabel = APP_SETTINGS_SCHEMA.normalizeSmartCardActionLabel;
const normalizeAppSmartCardActionPrompt = APP_SETTINGS_SCHEMA.normalizeSmartCardActionPrompt;
const normalizeAppSmartCardActionId = APP_SETTINGS_SCHEMA.normalizeSmartCardActionId;
const normalizeAppSmartCardActions = APP_SETTINGS_SCHEMA.normalizeSmartCardActions;
const normalizeAppAiSettings = APP_SETTINGS_SCHEMA.normalizeAiSettings;
const DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_STATUS = Object.freeze({
  enabled: false,
  running: false,
  port: 48273,
  url: '',
  message: 'Disabled',
});
const DEFAULT_APP_OLLAMA_MODEL_STATUS = Object.freeze({
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
        ollama: { ...DEFAULT_APP_AI_SETTINGS.ollama },
        smartCardActions: cloneDefaultAppSmartCardActions(),
      },
      externalPublishedCalendarStatus: { ...DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_STATUS },
      ollamaModelStatus: { ...DEFAULT_APP_OLLAMA_MODEL_STATUS, models: [] },
      ollamaModelStatusRequestId: 0,
      globalShortcutStatus: {
        accelerator: '',
        registered: false,
        message: '',
      },
      expandedSmartCardActionIds: new Set(),
      pendingSmartCardActionFocusId: '',
      smartCardActionsSortable: null,
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

function normalizeAppOllamaModelEntry(model) {
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

function normalizeAppOllamaModels(models) {
  const sourceModels = Array.isArray(models) ? models : [];
  const seen = new Set();
  const normalizedModels = [];

  for (const model of sourceModels) {
    const normalized = normalizeAppOllamaModelEntry(model);
    if (!normalized || seen.has(normalized.name)) {
      continue;
    }
    seen.add(normalized.name);
    normalizedModels.push(normalized);
  }

  return normalizedModels.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeAppOllamaModelStatus(status) {
  const source = status && typeof status === 'object' && !Array.isArray(status)
    ? status
    : {};

  return {
    checked: source.checked === true,
    checking: source.checking === true,
    ok: source.ok === true,
    url: typeof source.url === 'string' ? source.url.trim() : '',
    models: normalizeAppOllamaModels(source.models),
    message: typeof source.message === 'string' && source.message.trim()
      ? source.message.trim()
      : DEFAULT_APP_OLLAMA_MODEL_STATUS.message,
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

function getAppOllamaModelStatus() {
  return normalizeAppOllamaModelStatus(getAppSettingsState().ollamaModelStatus);
}

function setAppOllamaModelStatus(status) {
  const state = getAppSettingsState();
  state.ollamaModelStatus = normalizeAppOllamaModelStatus(status);
}

function resetAppOllamaModelStatus(message = DEFAULT_APP_OLLAMA_MODEL_STATUS.message) {
  setAppOllamaModelStatus({
    ...DEFAULT_APP_OLLAMA_MODEL_STATUS,
    models: [],
    message,
  });
}

function applyAppSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  setAppNotificationSettings(source.notifications || DEFAULT_APP_NOTIFICATION_SETTINGS);
  setAppTooltipsEnabled(source.tooltipsEnabled);
  setAppQuickAddSettings(source.quickAdd || DEFAULT_APP_QUICK_ADD_SETTINGS);
  setAppExternalPublishedCalendarSettings(source.externalPublishedCalendar || DEFAULT_APP_EXTERNAL_PUBLISHED_CALENDAR_SETTINGS);
  setAppAiSettings(source.ai || DEFAULT_APP_AI_SETTINGS);
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
    refreshAppAiOllamaModels();
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
          refreshAppAiOllamaModels();
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
  const aiOllamaUrlInput = document.getElementById('boardSettingsAiOllamaUrl');
  const aiOllamaModelSelect = document.getElementById('boardSettingsAiOllamaModel');
  const aiOllamaRefreshButton = document.getElementById('btnRefreshAiOllamaModels');
  const aiOllamaStatus = document.getElementById('boardSettingsAiOllamaStatus');
  const aiActionsList = document.getElementById('boardSettingsAiActionsList');
  const aiAddActionButton = document.getElementById('btnAddAiSmartCardAction');
  const notifications = getAppNotificationSettings();
  const quickAdd = getAppQuickAddSettings();
  const externalCalendar = getAppExternalPublishedCalendarSettings();
  const externalCalendarRuntime = getAppExternalPublishedCalendarStatus();
  const globalShortcutStatus = getAppGlobalShortcutStatus();
  const aiSettings = getAppAiSettings();
  const ollamaModelStatus = getAppOllamaModelStatus();

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

  if (aiOllamaUrlInput) {
    aiOllamaUrlInput.value = aiSettings.ollama.url;
  }

  if (aiOllamaModelSelect) {
    renderAppOllamaModelSelect(aiOllamaModelSelect, aiSettings, ollamaModelStatus);
  }

  if (aiOllamaRefreshButton) {
    aiOllamaRefreshButton.disabled = !aiSettings.enabled || ollamaModelStatus.checking;
  }

  if (aiOllamaStatus) {
    aiOllamaStatus.classList.remove('is-success', 'is-warning');
    if (!aiSettings.enabled) {
      aiOllamaStatus.textContent = 'Disabled';
    } else if (ollamaModelStatus.checking) {
      aiOllamaStatus.textContent = 'Checking...';
    } else if (ollamaModelStatus.checked && ollamaModelStatus.ok) {
      aiOllamaStatus.textContent = ollamaModelStatus.models.length > 0
        ? ollamaModelStatus.message
        : 'Connected. No models found.';
      aiOllamaStatus.classList.add(ollamaModelStatus.models.length > 0 ? 'is-success' : 'is-warning');
    } else if (ollamaModelStatus.checked) {
      aiOllamaStatus.textContent = ollamaModelStatus.message || 'Not running';
      aiOllamaStatus.classList.add('is-warning');
    } else {
      aiOllamaStatus.textContent = 'Not checked';
    }
  }

  if (aiActionsList) {
    renderAppSmartCardActionSettings(aiActionsList, aiSettings.smartCardActions);
  }

  if (aiAddActionButton) {
    aiAddActionButton.disabled = !aiSettings.enabled;
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

  if (typeof renderCardEditorSmartActionControls === 'function') {
    renderCardEditorSmartActionControls();
  }
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
    kind.textContent = action.builtIn ? 'Built in' : 'Custom';
    titleWrap.appendChild(kind);
    header.appendChild(titleWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'board-settings-ai-action-header-actions';

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

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'board-settings-ai-action-edit';
    editButton.dataset.smartActionCommand = 'toggle-edit';
    editButton.dataset.actionId = action.id;
    editButton.setAttribute('aria-expanded', String(isExpanded));
    editButton.setAttribute('aria-controls', `boardSettingsAiActionDetails-${action.id}`);
    editButton.textContent = isExpanded ? 'Done' : 'Edit';
    headerActions.appendChild(editButton);

    if (action.builtIn) {
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'board-settings-ai-action-reset';
      resetButton.dataset.smartActionCommand = 'reset';
      resetButton.dataset.actionId = action.id;
      resetButton.textContent = 'Reset';
      headerActions.appendChild(resetButton);
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
    details.hidden = !isExpanded;
    details.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');

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
    }

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
    actionEl.appendChild(details);

    container.appendChild(actionEl);
  });

  initializeAppSmartCardActionsSortable(container);
  focusPendingAppSmartCardActionControl(container);
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

function getAppOllamaModelOptionLabel(model) {
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

function renderAppOllamaModelSelect(select, aiSettings, ollamaModelStatus) {
  if (!select) {
    return;
  }

  const settings = normalizeAppAiSettings(aiSettings);
  const status = normalizeAppOllamaModelStatus(ollamaModelStatus);
  const selectedModel = settings.ollama.model;
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
    appendOption(model.name, getAppOllamaModelOptionLabel(model));
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
  select.disabled = !settings.enabled || status.checking || select.options.length === 0;
}

async function refreshAppAiOllamaModels() {
  const state = getAppSettingsState();
  const settings = getAppAiSettings();

  if (!settings.enabled) {
    resetAppOllamaModelStatus('Disabled');
    renderAppSettingsControls();
    return;
  }

  if (!window.electronAPI || typeof window.electronAPI.inspectOllama !== 'function') {
    setAppOllamaModelStatus({
      checked: true,
      checking: false,
      ok: false,
      url: settings.ollama.url,
      models: [],
      message: 'Ollama inspection is unavailable.',
    });
    renderAppSettingsControls();
    return;
  }

  const requestId = state.ollamaModelStatusRequestId + 1;
  state.ollamaModelStatusRequestId = requestId;
  setAppOllamaModelStatus({
    checked: false,
    checking: true,
    ok: false,
    url: settings.ollama.url,
    models: getAppOllamaModelStatus().models,
    message: 'Checking...',
  });
  renderAppSettingsControls();

  let result = null;
  try {
    result = await window.electronAPI.inspectOllama({
      url: settings.ollama.url,
    });
  } catch (error) {
    console.error('Unable to inspect Ollama.', error);
  }

  if (state.ollamaModelStatusRequestId !== requestId) {
    return;
  }

  if (!result || result.ok !== true) {
    setAppOllamaModelStatus({
      checked: true,
      checking: false,
      ok: false,
      url: settings.ollama.url,
      models: [],
      message: result && result.message ? result.message : 'Unable to reach Ollama.',
    });
    renderAppSettingsControls();
    return;
  }

  setAppOllamaModelStatus({
    checked: true,
    checking: false,
    ok: true,
    url: result.url || settings.ollama.url,
    models: result.models,
    message: result.message || 'Connected.',
  });
  renderAppSettingsControls();
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
