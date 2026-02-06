const BOARD_LABEL_COLOR_PALETTE = [
  { colorLight: '#f59e0b', colorDark: '#d97706' },
  { colorLight: '#a855f7', colorDark: '#7e22ce' },
  { colorLight: '#14b8a6', colorDark: '#0f766e' },
  { colorLight: '#ec4899', colorDark: '#be185d' },
  { colorLight: '#84cc16', colorDark: '#4d7c0f' },
  { colorLight: '#f97316', colorDark: '#c2410c' },
];

function getBoardLabelState() {
  if (!window.__boardLabelState) {
    window.__boardLabelState = {
      labels: [],
      labelsById: new Map(),
      filterIds: [],
      activeCardLabelPopover: null,
      settingsSaveTimer: null,
      settingsSaveInFlight: Promise.resolve(),
    };
  }

  return window.__boardLabelState;
}

function setBoardLabels(labels) {
  const state = getBoardLabelState();
  state.labels = Array.isArray(labels) ? labels.map((label) => ({ ...label })) : [];
  state.labelsById = new Map(state.labels.map((label) => [label.id, label]));

  const validIds = new Set(state.labels.map((label) => label.id));
  state.filterIds = state.filterIds.filter((id) => validIds.has(id));
}

function getBoardLabels() {
  return getBoardLabelState().labels;
}

function getBoardLabelById(labelId) {
  if (!labelId) {
    return null;
  }

  return getBoardLabelState().labelsById.get(String(labelId)) || null;
}

function getBoardThemeMode() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function getBoardLabelColor(label) {
  if (!label) {
    return '';
  }

  return getBoardThemeMode() === 'dark' ? label.colorDark : label.colorLight;
}

function getActiveBoardLabelFilterIds() {
  return getBoardLabelState().filterIds.slice();
}

function isBoardLabelFilterActive() {
  return getActiveBoardLabelFilterIds().length > 0;
}

function cardMatchesBoardLabelFilter(cardLabelIds) {
  const selectedFilterIds = getActiveBoardLabelFilterIds();
  if (selectedFilterIds.length === 0) {
    return true;
  }

  if (!Array.isArray(cardLabelIds) || cardLabelIds.length === 0) {
    return false;
  }

  const selected = new Set(selectedFilterIds);
  return cardLabelIds.some((labelId) => selected.has(labelId));
}

function renderBoardLabelFilterButton() {
  const button = document.getElementById('labelFilterButton');
  if (!button) {
    return;
  }

  const labelSpan = document.getElementById('labelFilterButtonText');
  const labels = getBoardLabels();
  const selectedFilterIds = getActiveBoardLabelFilterIds();

  if (!labelSpan) {
    return;
  }

  if (labels.length === 0 || selectedFilterIds.length === 0) {
    labelSpan.textContent = 'Sort';
    return;
  }

  if (selectedFilterIds.length === 1) {
    const selectedLabel = getBoardLabelById(selectedFilterIds[0]);
    labelSpan.textContent = selectedLabel ? `Sort: ${selectedLabel.name}` : 'Sort: 1';
    return;
  }

  labelSpan.textContent = `Sort: ${selectedFilterIds.length}`;
}

async function handleBoardLabelFilterChange(labelId, enabled) {
  const state = getBoardLabelState();
  const next = new Set(state.filterIds);

  if (enabled) {
    next.add(labelId);
  } else {
    next.delete(labelId);
  }

  state.filterIds = [...next];
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();

  await renderBoard();
}

function renderBoardLabelFilterPopover() {
  const popover = document.getElementById('labelFilterPopover');
  if (!popover) {
    return;
  }

  const labels = getBoardLabels();
  const selectedFilterIds = new Set(getActiveBoardLabelFilterIds());
  popover.innerHTML = '';

  if (labels.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'label-popover-empty';
    emptyState.textContent = 'No labels yet. Add labels in Settings.';
    popover.appendChild(emptyState);
    return;
  }

  for (const label of labels) {
    const row = document.createElement('label');
    row.className = 'label-popover-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedFilterIds.has(label.id);
    checkbox.addEventListener('change', async (event) => {
      await handleBoardLabelFilterChange(label.id, event.target.checked);
    });

    const swatch = document.createElement('span');
    swatch.className = 'label-color-swatch';
    swatch.style.backgroundColor = getBoardLabelColor(label);

    const text = document.createElement('span');
    text.textContent = label.name;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    popover.appendChild(row);
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'label-popover-clear';
  clearButton.textContent = 'Clear filter';
  clearButton.disabled = selectedFilterIds.size === 0;
  clearButton.addEventListener('click', async () => {
    resetBoardLabelFilter();
    renderBoardLabelFilterButton();
    renderBoardLabelFilterPopover();
    await renderBoard();
  });
  popover.appendChild(clearButton);
}

function closeBoardLabelFilterPopover() {
  const popover = document.getElementById('labelFilterPopover');
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
}

function closeLabelFilterIfClickOutside(target) {
  const button = document.getElementById('labelFilterButton');
  const popover = document.getElementById('labelFilterPopover');
  if (!button || !popover || popover.classList.contains('hidden')) {
    return;
  }

  if (button.contains(target) || popover.contains(target)) {
    return;
  }

  closeBoardLabelFilterPopover();
}

function closeCardLabelPopover() {
  const state = getBoardLabelState();
  if (state.activeCardLabelPopover && state.activeCardLabelPopover.parentNode) {
    state.activeCardLabelPopover.parentNode.removeChild(state.activeCardLabelPopover);
  }

  state.activeCardLabelPopover = null;
}

function closeCardLabelSelectorIfClickOutside(target) {
  const state = getBoardLabelState();
  const popover = state.activeCardLabelPopover;
  if (!popover) {
    return;
  }

  const anchor = popover.__anchorElement;
  if ((anchor && anchor.contains(target)) || popover.contains(target)) {
    return;
  }

  closeCardLabelPopover();
}

function positionCardLabelPopover(popover, anchorElement) {
  const bounds = anchorElement.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.top = `${Math.min(window.innerHeight - 220, bounds.bottom + 6)}px`;
  popover.style.left = `${Math.min(window.innerWidth - 260, Math.max(8, bounds.left - 60))}px`;
}

function createCardLabelPopoverContent(selectedLabelIds, onChange) {
  const labels = getBoardLabels();
  const knownLabelIds = new Set(labels.map((label) => label.id));
  const unknownLabelIds = selectedLabelIds.filter((labelId) => !knownLabelIds.has(labelId));
  const knownSelection = new Set(selectedLabelIds.filter((labelId) => knownLabelIds.has(labelId)));

  const fragment = document.createDocumentFragment();

  if (labels.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'label-popover-empty';
    emptyState.textContent = 'No labels yet. Add labels in Settings.';
    fragment.appendChild(emptyState);
    return fragment;
  }

  for (const label of labels) {
    const row = document.createElement('label');
    row.className = 'label-popover-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = knownSelection.has(label.id);
    checkbox.addEventListener('change', async (event) => {
      if (event.target.checked) {
        knownSelection.add(label.id);
      } else {
        knownSelection.delete(label.id);
      }

      const orderedKnownSelection = labels
        .map((entry) => entry.id)
        .filter((entryId) => knownSelection.has(entryId));

      const nextLabelIds = [...orderedKnownSelection, ...unknownLabelIds];
      await onChange(nextLabelIds);
    });

    const swatch = document.createElement('span');
    swatch.className = 'label-color-swatch';
    swatch.style.backgroundColor = getBoardLabelColor(label);

    const text = document.createElement('span');
    text.textContent = label.name;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    fragment.appendChild(row);
  }

  if (unknownLabelIds.length > 0) {
    const unknownHint = document.createElement('p');
    unknownHint.className = 'label-popover-empty';
    unknownHint.textContent = `${unknownLabelIds.length} unknown label reference(s) preserved`;
    fragment.appendChild(unknownHint);
  }

  return fragment;
}

function toggleCardLabelSelector(anchorElement, cardPath, selectedLabelIds, onChange) {
  const state = getBoardLabelState();
  const popover = state.activeCardLabelPopover;

  if (popover && popover.__anchorElement === anchorElement) {
    closeCardLabelPopover();
    return;
  }

  closeBoardLabelFilterPopover();
  closeCardLabelPopover();

  const menu = document.createElement('div');
  menu.className = 'label-popover card-label-popover';
  menu.__anchorElement = anchorElement;
  menu.__cardPath = cardPath;

  const content = createCardLabelPopoverContent(
    Array.isArray(selectedLabelIds) ? selectedLabelIds : [],
    onChange,
  );
  menu.appendChild(content);

  menu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.body.appendChild(menu);
  positionCardLabelPopover(menu, anchorElement);

  state.activeCardLabelPopover = menu;
}

function createBoardSettingsLabelRow(label, index) {
  const row = document.createElement('div');
  row.className = 'board-settings-label-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = label.name;
  nameInput.placeholder = `Label ${index + 1}`;
  nameInput.className = 'board-settings-label-name';
  nameInput.addEventListener('input', (event) => {
    updateBoardLabel(index, 'name', event.target.value);
  });

  const lightInput = document.createElement('input');
  lightInput.type = 'color';
  lightInput.value = label.colorLight;
  lightInput.className = 'board-settings-label-color';
  lightInput.title = 'Light mode color';
  lightInput.addEventListener('input', (event) => {
    updateBoardLabel(index, 'colorLight', event.target.value);
  });

  const darkInput = document.createElement('input');
  darkInput.type = 'color';
  darkInput.value = label.colorDark;
  darkInput.className = 'board-settings-label-color';
  darkInput.title = 'Dark mode color';
  darkInput.addEventListener('input', (event) => {
    updateBoardLabel(index, 'colorDark', event.target.value);
  });

  row.appendChild(nameInput);
  row.appendChild(lightInput);
  row.appendChild(darkInput);

  return row;
}

function renderBoardSettingsLabels() {
  const labelsContainer = document.getElementById('boardSettingsLabels');
  if (!labelsContainer) {
    return;
  }

  labelsContainer.innerHTML = '';
  const labels = getBoardLabels();

  for (const [index, label] of labels.entries()) {
    labelsContainer.appendChild(createBoardSettingsLabelRow(label, index));
  }
}

function updateBoardLabel(index, key, value) {
  const labels = getBoardLabels();
  if (!labels[index]) {
    return;
  }

  const nextLabels = labels.map((label, labelIndex) => {
    if (labelIndex !== index) {
      return { ...label };
    }

    return {
      ...label,
      [key]: key === 'name' ? String(value || '') : String(value || '').toLowerCase(),
    };
  });

  setBoardLabels(nextLabels);
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  scheduleBoardLabelSettingsSave();
}

function generateBoardLabelId() {
  return `label-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getNextBoardLabelColors() {
  const labels = getBoardLabels();
  const colorPair = BOARD_LABEL_COLOR_PALETTE[labels.length % BOARD_LABEL_COLOR_PALETTE.length];
  return { ...colorPair };
}

function addBoardLabelDefinition() {
  const labels = getBoardLabels();
  const nextIndex = labels.length + 1;
  const colors = getNextBoardLabelColors();

  const nextLabels = [
    ...labels.map((label) => ({ ...label })),
    {
      id: generateBoardLabelId(),
      name: `Label ${nextIndex}`,
      colorLight: colors.colorLight,
      colorDark: colors.colorDark,
    },
  ];

  setBoardLabels(nextLabels);
  renderBoardSettingsLabels();
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  scheduleBoardLabelSettingsSave();
}

function scheduleBoardLabelSettingsSave() {
  const state = getBoardLabelState();

  if (state.settingsSaveTimer) {
    clearTimeout(state.settingsSaveTimer);
  }

  state.settingsSaveTimer = setTimeout(() => {
    state.settingsSaveTimer = null;
    persistBoardLabelSettings();
  }, 250);
}

function persistBoardLabelSettings() {
  const state = getBoardLabelState();

  state.settingsSaveInFlight = state.settingsSaveInFlight
    .then(async () => {
      if (!window.boardRoot) {
        return;
      }

      const result = await window.board.updateBoardLabels(window.boardRoot, getBoardLabels());
      setBoardLabels(result.labels || []);
      if (!isBoardSettingsModalOpen()) {
        renderBoardSettingsLabels();
      }
      renderBoardLabelFilterButton();
      renderBoardLabelFilterPopover();
      await renderBoard();
    })
    .catch((error) => {
      console.error('Unable to save board labels.', error);
    });

  return state.settingsSaveInFlight;
}

async function flushBoardLabelSettingsSave() {
  const state = getBoardLabelState();

  if (state.settingsSaveTimer) {
    clearTimeout(state.settingsSaveTimer);
    state.settingsSaveTimer = null;
    await persistBoardLabelSettings();
    return;
  }

  await state.settingsSaveInFlight;
}

function openBoardSettingsModal() {
  const modal = document.getElementById('modalBoardSettings');
  if (!modal) {
    return;
  }

  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
  renderBoardSettingsLabels();
  modal.style.display = 'block';

  if (typeof setBoardInteractive === 'function') {
    setBoardInteractive(false);
  }
}

async function closeBoardSettingsModal() {
  const modal = document.getElementById('modalBoardSettings');
  if (!modal || modal.style.display !== 'block') {
    return;
  }

  await flushBoardLabelSettingsSave();
  modal.style.display = 'none';

  if (typeof setBoardInteractive === 'function') {
    setBoardInteractive(true);
  }
}

function isBoardSettingsModalOpen() {
  const modal = document.getElementById('modalBoardSettings');
  return Boolean(modal && modal.style.display === 'block');
}

function resetBoardLabelFilter() {
  getBoardLabelState().filterIds = [];
}

async function ensureBoardLabelsLoaded() {
  if (!window.boardRoot) {
    setBoardLabels([]);
    renderBoardLabelFilterButton();
    renderBoardLabelFilterPopover();
    return;
  }

  const settings = await window.board.readBoardSettings(window.boardRoot);
  setBoardLabels(settings.labels || []);
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
}

function closeAllLabelPopovers() {
  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
}

function initializeBoardLabelControls() {
  const filterButton = document.getElementById('labelFilterButton');
  const filterPopover = document.getElementById('labelFilterPopover');
  const openSettingsButton = document.getElementById('openBoardSettings');
  const closeSettingsButton = document.getElementById('boardSettingsClose');
  const addLabelButton = document.getElementById('btnAddBoardLabel');

  if (filterButton) {
    filterButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!filterPopover) {
        return;
      }
      closeCardLabelPopover();
      renderBoardLabelFilterPopover();
      const isHidden = filterPopover.classList.contains('hidden');
      filterPopover.classList.toggle('hidden', !isHidden);
    });
  }

  if (filterPopover) {
    filterPopover.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (openSettingsButton) {
    openSettingsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.boardRoot) {
        return;
      }
      await ensureBoardLabelsLoaded();
      openBoardSettingsModal();
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await closeBoardSettingsModal();
    });
  }

  if (addLabelButton) {
    addLabelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addBoardLabelDefinition();
    });
  }
}
