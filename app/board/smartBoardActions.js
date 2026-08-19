function getSmartBoardActionState() {
  if (!window.__smartBoardActionState) {
    window.__smartBoardActionState = {
      initialized: false,
      profile: 'normal',
      requestId: 0,
      action: null,
      result: null,
      report: '',
    };
  }
  return window.__smartBoardActionState;
}

function getAvailableSmartBoardActions() {
  const settings = typeof getAppAiSettings === 'function' ? getAppAiSettings() : null;
  return settings && Array.isArray(settings.smartBoardActions) ? settings.smartBoardActions : [];
}

function isSmartBoardAdvancedProfileAvailable() {
  const settings = typeof getAppAiSettings === 'function' ? getAppAiSettings() : null;
  return Boolean(settings && settings.advanced && settings.advanced.enabled && String(settings.advanced.model || '').trim());
}

function renderSmartBoardActionControls() {
  const button = document.getElementById('smartBoardActionsButton');
  if (!button) return;
  const settings = typeof getAppAiSettings === 'function' ? getAppAiSettings() : null;
  const available = Boolean(window.boardRoot && settings && settings.enabled && settings.normal && String(settings.normal.model || '').trim());
  button.hidden = !available;
  button.disabled = !available;
  if (!available) closeSmartBoardActionsPopover();
}

function positionSmartBoardActionsPopover() {
  const button = document.getElementById('smartBoardActionsButton');
  const popover = document.getElementById('smartBoardActionsPopover');
  if (!button || !popover) return;
  const bounds = button.getBoundingClientRect();
  const width = Math.min(390, window.innerWidth - 24);
  popover.style.width = `${width}px`;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, bounds.right - width));
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(bounds.bottom + 8)}px`;
}

function closeSmartBoardActionsPopover() {
  const button = document.getElementById('smartBoardActionsButton');
  const popover = document.getElementById('smartBoardActionsPopover');
  if (!popover) return;
  popover.classList.add('hidden');
  popover.setAttribute('aria-hidden', 'true');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function createSmartBoardActionsHeader(popover) {
  const header = document.createElement('div');
  header.className = 'smart-board-actions-header';
  const title = document.createElement('p');
  title.textContent = 'Smart Board Actions';
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.title = 'Open Smart Actions settings';
  settingsButton.setAttribute('aria-label', settingsButton.title);
  settingsButton.innerHTML = window.feather && window.feather.icons && window.feather.icons.settings
    ? window.feather.icons.settings.toSvg({ width: 15, height: 15 })
    : 'Settings';
  settingsButton.addEventListener('click', async () => {
    closeSmartBoardActionsPopover();
    if (typeof setAppSmartActionSettingsScope === 'function') setAppSmartActionSettingsScope('board');
    if (typeof openBoardSettingsModal === 'function') {
      openBoardSettingsModal({ panel: 'smart-actions', initialFocus: '#boardSettingsSmartActionsBoardTab' });
    }
  });
  header.append(title, settingsButton);
  popover.appendChild(header);

  if (isSmartBoardAdvancedProfileAvailable()) {
    const profile = document.createElement('div');
    profile.className = 'smart-board-actions-profile';
    ['normal', 'advanced'].forEach((profileId) => {
      const profileButton = document.createElement('button');
      profileButton.type = 'button';
      profileButton.textContent = profileId === 'advanced' ? 'Advanced' : 'Normal';
      profileButton.classList.toggle('is-active', getSmartBoardActionState().profile === profileId);
      profileButton.addEventListener('click', () => {
        getSmartBoardActionState().profile = profileId;
        renderSmartBoardActionsMenu(popover);
      });
      profile.appendChild(profileButton);
    });
    popover.appendChild(profile);
  }
}

function renderSmartBoardActionsMenu(popover = document.getElementById('smartBoardActionsPopover')) {
  if (!popover) return;
  popover.innerHTML = '';
  createSmartBoardActionsHeader(popover);
  const actions = document.createElement('div');
  actions.className = 'smart-board-actions-menu';
  getAvailableSmartBoardActions().forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'smart-board-action-menu-item';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = action.label;
    const description = document.createElement('small');
    description.textContent = action.description || (action.mode === 'changes' ? 'Proposes board changes for review.' : 'Creates a read-only report.');
    copy.append(title, description);
    const badge = document.createElement('span');
    badge.className = `smart-board-action-mode is-${action.mode}`;
    badge.textContent = action.mode === 'changes' ? 'Review' : 'Report';
    button.append(copy, badge);
    button.addEventListener('click', () => {
      if (action.oneOff || !action.prompt) renderSmartBoardActionPrompt(popover, action);
      else requestSmartBoardAction(action);
    });
    actions.appendChild(button);
  });
  popover.appendChild(actions);
  positionSmartBoardActionsPopover();
}

function renderSmartBoardActionPrompt(popover, action) {
  popover.innerHTML = '';
  createSmartBoardActionsHeader(popover);
  const title = document.createElement('label');
  title.setAttribute('for', 'smartBoardActionPrompt');
  title.textContent = action.label;
  const textarea = document.createElement('textarea');
  textarea.id = 'smartBoardActionPrompt';
  textarea.rows = 5;
  textarea.placeholder = action.id === 'create-cards'
    ? 'Describe the cards you want to create'
    : 'What do you want to know about this board?';
  const controls = document.createElement('div');
  controls.className = 'smart-board-actions-prompt-controls';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  back.addEventListener('click', () => renderSmartBoardActionsMenu(popover));
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'primary';
  run.textContent = 'Run';
  run.addEventListener('click', () => {
    const prompt = String(textarea.value || '').trim();
    if (!prompt) return textarea.focus();
    requestSmartBoardAction(action, prompt);
  });
  controls.append(back, run);
  popover.append(title, textarea, controls);
  positionSmartBoardActionsPopover();
  textarea.focus();
}

function openSmartBoardActionResultModal(action, statusText = 'Analyzing this board…') {
  const modal = document.getElementById('modalSmartBoardActionResult');
  if (!modal) return;
  document.getElementById('smartBoardActionResultTitle').textContent = action ? action.label : 'Smart Board Action';
  document.getElementById('smartBoardActionResultContext').textContent = '';
  document.getElementById('smartBoardActionResultBody').innerHTML = '';
  document.getElementById('smartBoardActionResultStatus').textContent = statusText;
  document.getElementById('smartBoardActionCopyReport').disabled = true;
  document.getElementById('smartBoardActionApplyChanges').hidden = true;
  if (typeof setAccessibleModalVisible === 'function') {
    setAccessibleModalVisible(modal, true, { display: 'block', labelledBy: 'smartBoardActionResultTitle', initialFocus: '#smartBoardActionResultClose' });
  } else {
    modal.classList.remove('hidden');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  }
  if (typeof setBoardInteractive === 'function') setBoardInteractive(false);
}

function closeSmartBoardActionResultModal() {
  const modal = document.getElementById('modalSmartBoardActionResult');
  if (!modal) return;
  if (typeof setAccessibleModalVisible === 'function') setAccessibleModalVisible(modal, false);
  else {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  if (typeof setBoardInteractive === 'function') setBoardInteractive(true);
}

function getSmartBoardChangeSummary(change) {
  const labels = {
    'create-card': 'Create card',
    'update-title': 'Rename card',
    'append-content': 'Append content',
    'add-labels': 'Add labels',
    'set-dates': 'Set dates',
    'move-card': 'Move card',
    'archive-card': 'Archive card',
  };
  const details = change.operation === 'create-card' || change.operation === 'update-title'
    ? change.title
    : (change.operation === 'add-labels' ? change.labels.join(', ') : (change.list || change.start || change.due || change.body));
  return `${labels[change.operation] || change.operation}${details ? `: ${details}` : ''}`;
}

function renderSmartBoardActionResult(result, action) {
  const state = getSmartBoardActionState();
  state.result = result;
  state.action = action;
  state.report = String(result.report || '').trim();
  const body = document.getElementById('smartBoardActionResultBody');
  const context = document.getElementById('smartBoardActionResultContext');
  const status = document.getElementById('smartBoardActionResultStatus');
  const copy = document.getElementById('smartBoardActionCopyReport');
  const apply = document.getElementById('smartBoardActionApplyChanges');
  body.innerHTML = '';
  const summary = result.contextSummary || {};
  context.textContent = `${summary.includedCardCount || 0} of ${summary.totalCardCount || 0} cards included${summary.omittedCardCount ? ` · ${summary.omittedCardCount} omitted by the context limit` : ''} · ${result.provider || ''} ${result.model || ''}`.trim();

  if (state.report) {
    const report = document.createElement('pre');
    report.className = 'smart-board-action-report';
    report.textContent = state.report;
    body.appendChild(report);
  }
  if (Array.isArray(result.cards) && result.cards.length > 0) {
    const heading = document.createElement('h3');
    heading.textContent = 'Referenced cards';
    const list = document.createElement('div');
    list.className = 'smart-board-action-card-references';
    result.cards.forEach((card) => {
      const item = document.createElement('div');
      item.innerHTML = `<strong></strong><span></span><p></p>`;
      item.querySelector('strong').textContent = card.title || card.cardId;
      item.querySelector('span').textContent = `${card.list || 'Board'}${card.estimateMinutes ? ` · about ${card.estimateMinutes} min` : ''}`;
      item.querySelector('p').textContent = card.reason || '';
      list.appendChild(item);
    });
    body.append(heading, list);
  }
  if (Array.isArray(result.changes) && result.changes.length > 0) {
    const heading = document.createElement('h3');
    heading.textContent = 'Proposed changes';
    const list = document.createElement('div');
    list.className = 'smart-board-action-changes';
    result.changes.forEach((change, index) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.smartBoardChangeIndex = String(index);
      const copyWrap = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = getSmartBoardChangeSummary(change);
      const reason = document.createElement('small');
      reason.textContent = change.reason || '';
      copyWrap.append(title, reason);
      label.append(checkbox, copyWrap);
      list.appendChild(label);
    });
    body.append(heading, list);
    apply.hidden = false;
    apply.disabled = false;
  } else {
    apply.hidden = true;
  }
  copy.disabled = !state.report;
  status.textContent = result.changes && result.changes.length > 0 ? 'Review every selected change before applying.' : 'Read-only result. No board files were changed.';
}

async function requestSmartBoardAction(action, prompt = '') {
  const state = getSmartBoardActionState();
  const requestId = ++state.requestId;
  closeSmartBoardActionsPopover();
  openSmartBoardActionResultModal(action);
  try {
    const result = await window.electronAPI.runSmartBoardAction({
      actionId: action.id,
      prompt,
      profile: state.profile,
    });
    if (requestId !== state.requestId) return;
    if (!result || result.ok !== true) throw new Error(result && result.message ? result.message : 'Unable to run Smart Board Action.');
    renderSmartBoardActionResult(result, action);
  } catch (error) {
    const body = document.getElementById('smartBoardActionResultBody');
    const status = document.getElementById('smartBoardActionResultStatus');
    body.textContent = error && error.message ? error.message : 'Unable to run Smart Board Action.';
    status.textContent = 'No board files were changed.';
  }
}

async function applySelectedSmartBoardActionChanges() {
  const state = getSmartBoardActionState();
  if (!state.result || !state.action) return;
  const selected = [...document.querySelectorAll('[data-smart-board-change-index]:checked')]
    .map((input) => state.result.changes[Number.parseInt(input.dataset.smartBoardChangeIndex, 10)])
    .filter(Boolean);
  if (selected.length === 0) return;
  if (selected.some((change) => change.operation === 'archive-card') && !window.confirm('Apply the selected changes, including archiving the selected cards?')) return;
  const button = document.getElementById('smartBoardActionApplyChanges');
  const status = document.getElementById('smartBoardActionResultStatus');
  button.disabled = true;
  status.textContent = 'Applying selected changes…';
  try {
    const result = await window.electronAPI.applySmartBoardActionChanges({ actionId: state.action.id, changes: selected });
    status.textContent = result && result.ok
      ? `Applied ${result.applied} change${result.applied === 1 ? '' : 's'}${result.failed ? `; ${result.failed} failed` : ''}.`
      : (result && result.message ? result.message : 'No changes were applied.');
    if (result && result.applied > 0 && typeof renderBoard === 'function') await renderBoard();
  } catch (error) {
    status.textContent = error && error.message ? error.message : 'Unable to apply selected changes.';
  }
}

function initializeSmartBoardActionControls() {
  const state = getSmartBoardActionState();
  if (state.initialized) return;
  state.initialized = true;
  const button = document.getElementById('smartBoardActionsButton');
  const popover = document.getElementById('smartBoardActionsPopover');
  const close = document.getElementById('smartBoardActionResultClose');
  const done = document.getElementById('smartBoardActionResultDone');
  const copy = document.getElementById('smartBoardActionCopyReport');
  const apply = document.getElementById('smartBoardActionApplyChanges');
  if (button && popover) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (popover.classList.contains('hidden')) {
        renderSmartBoardActionsMenu(popover);
        popover.classList.remove('hidden');
        popover.setAttribute('aria-hidden', 'false');
        button.setAttribute('aria-expanded', 'true');
        positionSmartBoardActionsPopover();
      } else closeSmartBoardActionsPopover();
    });
    popover.addEventListener('click', (event) => event.stopPropagation());
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#smartBoardActionsPopover, #smartBoardActionsButton')) closeSmartBoardActionsPopover();
  });
  window.addEventListener('resize', () => {
    if (popover && !popover.classList.contains('hidden')) positionSmartBoardActionsPopover();
  });
  [close, done].forEach((control) => control && control.addEventListener('click', closeSmartBoardActionResultModal));
  if (copy) copy.addEventListener('click', async () => {
    if (state.report && window.electronAPI && typeof window.electronAPI.copyTextToClipboard === 'function') {
      await window.electronAPI.copyTextToClipboard(state.report);
      document.getElementById('smartBoardActionResultStatus').textContent = 'Copied report.';
    }
  });
  if (apply) apply.addEventListener('click', applySelectedSmartBoardActionChanges);
  renderSmartBoardActionControls();
}
