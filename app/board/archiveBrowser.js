const ARCHIVE_BROWSER_TAB_IDS = Object.freeze({
  CARDS: 'cards',
  LISTS: 'lists',
});

const ARCHIVE_BROWSER_SORT_OPTIONS = Object.freeze({
  [ARCHIVE_BROWSER_TAB_IDS.CARDS]: [
    { value: 'archived-desc', label: 'Archived date, newest first' },
    { value: 'archived-asc', label: 'Archived date, oldest first' },
    { value: 'title-asc', label: 'Title, A-Z' },
  ],
  [ARCHIVE_BROWSER_TAB_IDS.LISTS]: [
    { value: 'archived-desc', label: 'Archived date, newest first' },
    { value: 'archived-asc', label: 'Archived date, oldest first' },
    { value: 'name-asc', label: 'Name, A-Z' },
  ],
});

const ARCHIVE_BROWSER_BATCH_SIZE = 80;

function getArchiveBrowserState() {
  if (!window.__archiveBrowserState) {
    window.__archiveBrowserState = {
      controlsInitialized: false,
      requestId: 0,
      detailRequestId: 0,
      isLoading: false,
      error: '',
      activeTab: ARCHIVE_BROWSER_TAB_IDS.CARDS,
      searchQuery: '',
      entries: {
        cards: [],
        lists: [],
      },
      sortKeyByTab: {
        [ARCHIVE_BROWSER_TAB_IDS.CARDS]: 'archived-desc',
        [ARCHIVE_BROWSER_TAB_IDS.LISTS]: 'archived-desc',
      },
      visibleCountByTab: {
        [ARCHIVE_BROWSER_TAB_IDS.CARDS]: ARCHIVE_BROWSER_BATCH_SIZE,
        [ARCHIVE_BROWSER_TAB_IDS.LISTS]: ARCHIVE_BROWSER_BATCH_SIZE,
      },
      selectedEntryPath: '',
      detailByPath: new Map(),
      detailLoadingPath: '',
      detailErrorPath: '',
      detailErrorMessage: '',
      restore: {
        isOpen: false,
        entryPath: '',
        availableLists: [],
        destinationQuery: '',
        selectedListPath: '',
        isSaving: false,
        error: '',
      },
      detailTimestampFormatter: new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  }

  return window.__archiveBrowserState;
}

function getArchiveBrowserModal() {
  return document.getElementById('modalArchiveBrowser');
}

function isArchiveBrowserModalOpen() {
  const modal = getArchiveBrowserModal();
  return Boolean(modal && modal.style.display === 'block');
}

function getArchiveBrowserSortKey() {
  const state = getArchiveBrowserState();
  const activeTab = state.activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS
    ? ARCHIVE_BROWSER_TAB_IDS.LISTS
    : ARCHIVE_BROWSER_TAB_IDS.CARDS;

  return state.sortKeyByTab[activeTab] || 'archived-desc';
}

function resetArchiveBrowserPagination(tabId) {
  const state = getArchiveBrowserState();
  const activeTab = tabId === ARCHIVE_BROWSER_TAB_IDS.LISTS
    ? ARCHIVE_BROWSER_TAB_IDS.LISTS
    : ARCHIVE_BROWSER_TAB_IDS.CARDS;
  state.visibleCountByTab[activeTab] = ARCHIVE_BROWSER_BATCH_SIZE;
}

function resetArchiveBrowserState() {
  const state = getArchiveBrowserState();
  state.requestId = 0;
  state.detailRequestId = 0;
  state.isLoading = false;
  state.error = '';
  state.activeTab = ARCHIVE_BROWSER_TAB_IDS.CARDS;
  state.searchQuery = '';
  state.entries = {
    cards: [],
    lists: [],
  };
  state.sortKeyByTab = {
    [ARCHIVE_BROWSER_TAB_IDS.CARDS]: 'archived-desc',
    [ARCHIVE_BROWSER_TAB_IDS.LISTS]: 'archived-desc',
  };
  state.visibleCountByTab = {
    [ARCHIVE_BROWSER_TAB_IDS.CARDS]: ARCHIVE_BROWSER_BATCH_SIZE,
    [ARCHIVE_BROWSER_TAB_IDS.LISTS]: ARCHIVE_BROWSER_BATCH_SIZE,
  };
  state.selectedEntryPath = '';
  state.detailByPath = new Map();
  state.detailLoadingPath = '';
  state.detailErrorPath = '';
  state.detailErrorMessage = '';
  state.restore = {
    isOpen: false,
    entryPath: '',
    availableLists: [],
    destinationQuery: '',
    selectedListPath: '',
    isSaving: false,
    error: '',
  };
}

function trimArchiveSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function getArchiveEntriesForActiveTab() {
  const state = getArchiveBrowserState();
  if (state.activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS) {
    return Array.isArray(state.entries.lists) ? state.entries.lists : [];
  }

  return Array.isArray(state.entries.cards) ? state.entries.cards : [];
}

function buildArchiveEntrySearchText(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }

  if (entry.kind === 'list') {
    return [
      entry.listDisplayName,
      entry.listDirectoryName,
      entry.originalListDisplayName,
      entry.originalListDirectoryName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  return [
    entry.title,
    entry.cardId,
    entry.originalListDisplayName,
    entry.originalListDirectoryName,
    ...(Array.isArray(entry.labelNames) ? entry.labelNames : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sortArchiveEntries(entries, sortKey, activeTab) {
  const items = Array.isArray(entries) ? entries.slice() : [];
  const compareArchivedAt = (left, right, descending = true) => {
    const leftAt = Date.parse(String(left && left.archivedAt || ''));
    const rightAt = Date.parse(String(right && right.archivedAt || ''));
    const normalizedLeft = Number.isFinite(leftAt) ? leftAt : 0;
    const normalizedRight = Number.isFinite(rightAt) ? rightAt : 0;
    return descending ? normalizedRight - normalizedLeft : normalizedLeft - normalizedRight;
  };

  items.sort((left, right) => {
    if (sortKey === 'archived-asc') {
      const byDate = compareArchivedAt(left, right, false);
      if (byDate !== 0) {
        return byDate;
      }
    } else if (sortKey === 'title-asc') {
      return String(left && left.title || '').localeCompare(String(right && right.title || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
        ignorePunctuation: true,
      });
    } else if (sortKey === 'name-asc') {
      return String(left && (left.listDisplayName || left.listDirectoryName) || '').localeCompare(
        String(right && (right.listDisplayName || right.listDirectoryName) || ''),
        undefined,
        {
          numeric: true,
          sensitivity: 'base',
          ignorePunctuation: true,
        },
      );
    } else {
      const byDate = compareArchivedAt(left, right, true);
      if (byDate !== 0) {
        return byDate;
      }
    }

    const fallbackLeft = activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS
      ? String(left && (left.listDisplayName || left.listDirectoryName) || '')
      : String(left && left.title || '');
    const fallbackRight = activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS
      ? String(right && (right.listDisplayName || right.listDirectoryName) || '')
      : String(right && right.title || '');
    return fallbackLeft.localeCompare(fallbackRight, undefined, {
      numeric: true,
      sensitivity: 'base',
      ignorePunctuation: true,
    });
  });

  return items;
}

function getFilteredArchiveEntries() {
  const state = getArchiveBrowserState();
  const activeTab = state.activeTab;
  const sortKey = getArchiveBrowserSortKey();
  const searchQuery = trimArchiveSearchValue(state.searchQuery);
  const items = getArchiveEntriesForActiveTab();
  const filtered = searchQuery
    ? items.filter((entry) => buildArchiveEntrySearchText(entry).includes(searchQuery))
    : items.slice();

  return sortArchiveEntries(filtered, sortKey, activeTab);
}

function syncArchiveBrowserSelection(filteredEntries) {
  const state = getArchiveBrowserState();
  const entries = Array.isArray(filteredEntries) ? filteredEntries : [];
  if (entries.length === 0) {
    state.selectedEntryPath = '';
    return '';
  }

  const hasSelectedEntry = entries.some((entry) => entry.entryPath === state.selectedEntryPath);
  if (hasSelectedEntry) {
    return state.selectedEntryPath;
  }

  state.selectedEntryPath = entries[0].entryPath;
  return state.selectedEntryPath;
}

function getSelectedArchiveEntry(filteredEntries) {
  const state = getArchiveBrowserState();
  const entries = Array.isArray(filteredEntries) ? filteredEntries : [];
  return entries.find((entry) => entry.entryPath === state.selectedEntryPath) || null;
}

function formatArchiveTimestampLabel(timestampValue) {
  const state = getArchiveBrowserState();
  const parsed = new Date(String(timestampValue || ''));
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }

  return state.detailTimestampFormatter.format(parsed);
}

function getArchiveBrowserResultCountLabel(filteredEntries, totalEntries) {
  const state = getArchiveBrowserState();
  const activeTab = state.activeTab;
  const filteredCount = Array.isArray(filteredEntries) ? filteredEntries.length : 0;
  const totalCount = Array.isArray(totalEntries) ? totalEntries.length : 0;
  const noun = activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS ? 'lists' : 'cards';

  if (totalCount === filteredCount) {
    return `${filteredCount} ${noun}`;
  }

  return `${filteredCount} of ${totalCount} ${noun}`;
}

function getArchiveBrowserSearchPlaceholder() {
  const state = getArchiveBrowserState();
  return state.activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS
    ? 'Search archived lists'
    : 'Search archived cards';
}

function createArchiveBadge(label, className = '') {
  const badge = document.createElement('span');
  badge.className = `archive-browser-badge ${className}`.trim();
  badge.textContent = label;
  return badge;
}

function createArchiveLabelChip(labelId, fallbackName) {
  const chip = document.createElement('span');
  chip.className = 'archive-browser-label-chip';
  const knownLabel = typeof getBoardLabelById === 'function' ? getBoardLabelById(labelId) : null;

  if (knownLabel && typeof getBoardLabelColor === 'function') {
    const chipColor = getBoardLabelColor(knownLabel);
    chip.textContent = knownLabel.name;
    chip.style.backgroundColor = `${chipColor}22`;
    chip.style.borderColor = chipColor;
  } else {
    chip.textContent = fallbackName || labelId || 'Label';
    chip.classList.add('archive-browser-label-chip-unknown');
  }

  return chip;
}

function renderArchiveBrowserSortOptions() {
  const sortSelect = document.getElementById('archiveBrowserSortSelect');
  if (!sortSelect) {
    return;
  }

  const state = getArchiveBrowserState();
  const activeTab = state.activeTab;
  const options = ARCHIVE_BROWSER_SORT_OPTIONS[activeTab] || ARCHIVE_BROWSER_SORT_OPTIONS[ARCHIVE_BROWSER_TAB_IDS.CARDS];
  const currentValue = getArchiveBrowserSortKey();

  sortSelect.innerHTML = '';
  for (const optionConfig of options) {
    const option = document.createElement('option');
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    option.selected = optionConfig.value === currentValue;
    sortSelect.appendChild(option);
  }
}

function isArchiveBrowserResultElementVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function getArchiveBrowserResultButtons() {
  const resultsEl = document.getElementById('archiveBrowserResults');
  if (!resultsEl) {
    return [];
  }

  return Array.from(resultsEl.querySelectorAll('.archive-browser-row'))
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => !button.disabled)
    .filter(isArchiveBrowserResultElementVisible);
}

function focusArchiveBrowserResultButton(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return false;
  }

  try {
    button.focus({ preventScroll: true });
  } catch {
    button.focus();
  }

  if (typeof button.scrollIntoView === 'function') {
    button.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  return true;
}

function focusArchiveBrowserSearchInput(options = {}) {
  const searchInput = document.getElementById('archiveBrowserSearchInput');
  if (!searchInput) {
    return false;
  }

  searchInput.focus();
  if (options.select !== false && typeof searchInput.select === 'function') {
    searchInput.select();
  }

  return true;
}

async function selectArchiveBrowserEntry(entryPath, options = {}) {
  const state = getArchiveBrowserState();
  const normalizedEntryPath = String(entryPath || '').trim();
  if (!normalizedEntryPath) {
    return false;
  }

  state.selectedEntryPath = normalizedEntryPath;
  renderArchiveBrowserResults();

  if (options.focus !== false) {
    const nextButton = getArchiveBrowserResultButtons()
      .find((button) => String(button.dataset.entryPath || '') === normalizedEntryPath);
    focusArchiveBrowserResultButton(nextButton);
  }

  await loadArchiveBrowserDetail(normalizedEntryPath);
  return true;
}

async function focusArchiveBrowserResultByIndex(index) {
  const resultButtons = getArchiveBrowserResultButtons();
  if (resultButtons.length === 0) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('No archived items match your search.');
    }
    return false;
  }

  const safeIndex = ((index % resultButtons.length) + resultButtons.length) % resultButtons.length;
  const targetButton = resultButtons[safeIndex];
  const targetPath = String(targetButton.dataset.entryPath || '').trim();
  if (targetPath) {
    await selectArchiveBrowserEntry(targetPath, { focus: true });
    return true;
  }

  return focusArchiveBrowserResultButton(targetButton);
}

function focusFirstArchiveBrowserResult() {
  return focusArchiveBrowserResultByIndex(0);
}

function focusLastArchiveBrowserResult() {
  return focusArchiveBrowserResultByIndex(getArchiveBrowserResultButtons().length - 1);
}

async function moveArchiveBrowserResultFocus(offset) {
  const resultButtons = getArchiveBrowserResultButtons();
  if (resultButtons.length === 0) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('No archived items match your search.');
    }
    return false;
  }

  const currentIndex = resultButtons.indexOf(document.activeElement);
  const fallbackIndex = Number(offset) < 0 ? resultButtons.length - 1 : 0;
  const nextIndex = currentIndex >= 0 ? currentIndex + Number(offset || 0) : fallbackIndex;
  return focusArchiveBrowserResultByIndex(nextIndex);
}

async function clearArchiveBrowserSearchFromKeyboard(searchInput) {
  const state = getArchiveBrowserState();
  if (!searchInput || (!searchInput.value && !state.searchQuery)) {
    return false;
  }

  searchInput.value = '';
  state.searchQuery = '';
  resetArchiveBrowserPagination(state.activeTab);
  state.selectedEntryPath = '';
  renderArchiveBrowserModal();

  const selectedPath = syncArchiveBrowserSelection(getFilteredArchiveEntries());
  renderArchiveBrowserModal();
  if (selectedPath) {
    await loadArchiveBrowserDetail(selectedPath);
  }

  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus('Archive search cleared.');
  }
  return true;
}

async function handleArchiveBrowserSearchInputKeydown(event) {
  if (!event) {
    return;
  }

  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'ArrowUp') {
      await focusLastArchiveBrowserResult();
      return;
    }

    await focusFirstArchiveBrowserResult();
    return;
  }

  if (event.key === 'Escape') {
    const state = getArchiveBrowserState();
    const shouldClear = Boolean(event.target && (event.target.value || state.searchQuery));
    if (shouldClear) {
      event.preventDefault();
      event.stopPropagation();
      await clearArchiveBrowserSearchFromKeyboard(event.target);
    }
  }
}

function handleArchiveBrowserResultKeydown(event) {
  if (!event || !(event.currentTarget instanceof HTMLButtonElement)) {
    return;
  }

  const runNavigation = (callback) => {
    callback().catch((error) => {
      console.error('Failed to navigate archive browser results.', error);
    });
  };

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    runNavigation(() => moveArchiveBrowserResultFocus(1));
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    runNavigation(() => moveArchiveBrowserResultFocus(-1));
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    runNavigation(() => focusArchiveBrowserResultByIndex(0));
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    runNavigation(() => focusArchiveBrowserResultByIndex(getArchiveBrowserResultButtons().length - 1));
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    focusArchiveBrowserSearchInput();
  }
}

function renderArchiveBrowserResults() {
  const state = getArchiveBrowserState();
  const resultsEl = document.getElementById('archiveBrowserResults');
  const resultCountEl = document.getElementById('archiveBrowserResultCount');
  if (!resultsEl || !resultCountEl) {
    return;
  }

  const totalEntries = getArchiveEntriesForActiveTab();
  const filteredEntries = getFilteredArchiveEntries();
  syncArchiveBrowserSelection(filteredEntries);
  const visibleCount = Math.max(ARCHIVE_BROWSER_BATCH_SIZE, state.visibleCountByTab[state.activeTab] || ARCHIVE_BROWSER_BATCH_SIZE);
  const entriesToRender = filteredEntries.slice(0, visibleCount);
  const previousScrollTop = resultsEl.scrollTop;

  resultsEl.innerHTML = '';

  if (state.isLoading) {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'archive-browser-empty-state';
    loadingEl.textContent = 'Loading archive...';
    resultsEl.appendChild(loadingEl);
    resultCountEl.textContent = '';
    return;
  }

  if (state.error) {
    const errorEl = document.createElement('div');
    errorEl.className = 'archive-browser-empty-state archive-browser-empty-state-error';
    errorEl.textContent = state.error;
    resultsEl.appendChild(errorEl);
    resultCountEl.textContent = '';
    return;
  }

  if (filteredEntries.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'archive-browser-empty-state';
    emptyEl.textContent = totalEntries.length > 0
      ? 'No archived items match your search.'
      : 'Archive is empty.';
    resultsEl.appendChild(emptyEl);
    resultCountEl.textContent = getArchiveBrowserResultCountLabel(filteredEntries, totalEntries);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entriesToRender) {
    const rowButton = document.createElement('button');
    rowButton.type = 'button';
    rowButton.className = 'archive-browser-row';
    rowButton.dataset.entryPath = entry.entryPath;
    rowButton.classList.toggle('is-active', entry.entryPath === state.selectedEntryPath);
    rowButton.setAttribute('aria-pressed', entry.entryPath === state.selectedEntryPath ? 'true' : 'false');

    const header = document.createElement('div');
    header.className = 'archive-browser-row-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'archive-browser-row-title-wrap';

    const title = document.createElement('strong');
    title.className = 'archive-browser-row-title';
    title.textContent = entry.kind === 'list'
      ? (entry.listDisplayName || entry.listDirectoryName || 'Untitled list')
      : (entry.title || 'Untitled');
    titleWrap.appendChild(title);

    if (entry.kind === 'card' && entry.insideArchivedList) {
      titleWrap.appendChild(createArchiveBadge('In archived list', 'archive-browser-badge-emphasis'));
    }

    if (entry.kind === 'list') {
      titleWrap.appendChild(createArchiveBadge(`${entry.cardCount} card${entry.cardCount === 1 ? '' : 's'}`, 'archive-browser-badge-muted'));
    }

    const archivedAt = document.createElement('span');
    archivedAt.className = 'archive-browser-row-date';
    archivedAt.textContent = formatArchiveTimestampLabel(entry.archivedAt);

    header.appendChild(titleWrap);
    header.appendChild(archivedAt);
    rowButton.appendChild(header);

    if (entry.kind === 'card') {
      const badges = document.createElement('div');
      badges.className = 'archive-browser-row-badges';

      if (entry.due) {
        badges.appendChild(createArchiveBadge(`Due ${entry.due}`, 'archive-browser-badge-due'));
      }

      if (Array.isArray(entry.labels) && entry.labels.length > 0) {
        for (let index = 0; index < Math.min(entry.labels.length, 3); index += 1) {
          badges.appendChild(createArchiveLabelChip(entry.labels[index], entry.labelNames[index]));
        }
      }

      if (badges.children.length > 0) {
        rowButton.appendChild(badges);
      }

      if (entry.previewText) {
        const preview = document.createElement('p');
        preview.className = 'archive-browser-row-preview';
        preview.textContent = entry.previewText;
        rowButton.appendChild(preview);
      }
    }

    rowButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await selectArchiveBrowserEntry(entry.entryPath, { focus: event.detail === 0 });
    });
    rowButton.addEventListener('keydown', handleArchiveBrowserResultKeydown);

    fragment.appendChild(rowButton);
  }

  resultsEl.appendChild(fragment);
  resultsEl.scrollTop = previousScrollTop;
  resultCountEl.textContent = getArchiveBrowserResultCountLabel(filteredEntries, totalEntries);
}

function renderArchiveBrowserDetail() {
  const state = getArchiveBrowserState();
  const detailEl = document.getElementById('archiveBrowserDetail');
  if (!detailEl) {
    return;
  }

  const filteredEntries = getFilteredArchiveEntries();
  const selectedEntry = getSelectedArchiveEntry(filteredEntries);
  detailEl.innerHTML = '';

  if (state.isLoading) {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'archive-browser-detail-empty';
    loadingEl.textContent = 'Loading archive details...';
    detailEl.appendChild(loadingEl);
    return;
  }

  if (!selectedEntry) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'archive-browser-detail-empty';
    emptyEl.textContent = 'Select an archived card or list to preview it.';
    detailEl.appendChild(emptyEl);
    return;
  }

  const detail = state.detailByPath.get(selectedEntry.entryPath) || null;
  if (!detail && state.detailLoadingPath === selectedEntry.entryPath) {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'archive-browser-detail-empty';
    loadingEl.textContent = 'Loading preview...';
    detailEl.appendChild(loadingEl);
    return;
  }

  if (!detail && state.detailErrorPath === selectedEntry.entryPath) {
    const errorEl = document.createElement('div');
    errorEl.className = 'archive-browser-detail-empty archive-browser-empty-state-error';
    errorEl.textContent = state.detailErrorMessage || 'Unable to load archive entry.';
    detailEl.appendChild(errorEl);
    return;
  }

  if (!detail) {
    const placeholderEl = document.createElement('div');
    placeholderEl.className = 'archive-browser-detail-empty';
    placeholderEl.textContent = 'Loading preview...';
    detailEl.appendChild(placeholderEl);
    return;
  }

  const header = document.createElement('div');
  header.className = 'archive-browser-detail-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'archive-browser-detail-title-wrap';

  const title = document.createElement('h2');
  title.className = 'archive-browser-detail-title';
  title.textContent = detail.kind === 'list'
    ? (detail.listDisplayName || detail.listDirectoryName || 'Untitled list')
    : (detail.title || 'Untitled');
  titleWrap.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'archive-browser-detail-meta';
  meta.textContent = `Archived ${formatArchiveTimestampLabel(detail.archivedAt)} • Original list: ${detail.originalListDisplayName || 'Unknown original list'}`;
  titleWrap.appendChild(meta);
  header.appendChild(titleWrap);

  const restoreButton = document.createElement('button');
  restoreButton.type = 'button';
  restoreButton.className = 'archive-browser-restore-button';
  restoreButton.textContent = detail.kind === 'list' ? 'Restore list' : 'Restore card';
  restoreButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (detail.kind === 'list') {
      await handleRestoreArchivedList(detail);
      return;
    }

    await openArchiveRestoreDialog(detail);
  });
  header.appendChild(restoreButton);
  detailEl.appendChild(header);

  const badges = document.createElement('div');
  badges.className = 'archive-browser-detail-badges';
  if (detail.kind === 'card') {
    if (detail.due) {
      badges.appendChild(createArchiveBadge(`Due ${detail.due}`, 'archive-browser-badge-due'));
    }
    if (detail.insideArchivedList) {
      badges.appendChild(createArchiveBadge('Stored inside archived list', 'archive-browser-badge-emphasis'));
    }
    if (Array.isArray(detail.labels) && detail.labels.length > 0) {
      for (let index = 0; index < detail.labels.length; index += 1) {
        badges.appendChild(createArchiveLabelChip(detail.labels[index], detail.labelNames[index]));
      }
    }
  } else {
    badges.appendChild(createArchiveBadge(`${detail.cardCount} card${detail.cardCount === 1 ? '' : 's'}`, 'archive-browser-badge-muted'));
    if (detail.originalListDirectoryName && detail.originalListDirectoryName !== detail.listDirectoryName) {
      badges.appendChild(createArchiveBadge(detail.originalListDirectoryName, 'archive-browser-badge-muted'));
    }
  }
  if (badges.children.length > 0) {
    detailEl.appendChild(badges);
  }

  if (detail.kind === 'card') {
    const preview = document.createElement('pre');
    preview.className = 'archive-browser-detail-preview';
    preview.textContent = detail.card && typeof detail.card.body === 'string' && detail.card.body.trim()
      ? detail.card.body
      : 'No notes on this card.';
    detailEl.appendChild(preview);
  } else {
    const listPreview = document.createElement('div');
    listPreview.className = 'archive-browser-detail-list-preview';

    const subtitle = document.createElement('h3');
    subtitle.className = 'archive-browser-detail-subtitle';
    subtitle.textContent = 'Cards in this archived list';
    listPreview.appendChild(subtitle);

    if (Array.isArray(detail.cards) && detail.cards.length > 0) {
      const list = document.createElement('ul');
      list.className = 'archive-browser-detail-card-list';

      for (const cardEntry of detail.cards.slice(0, 40)) {
        const item = document.createElement('li');
        item.className = 'archive-browser-detail-card-list-item';
        item.textContent = cardEntry.title || 'Untitled';
        list.appendChild(item);
      }

      listPreview.appendChild(list);

      if (detail.cards.length > 40) {
        const more = document.createElement('p');
        more.className = 'archive-browser-detail-more';
        more.textContent = `${detail.cards.length - 40} more card${detail.cards.length - 40 === 1 ? '' : 's'} in this list`;
        listPreview.appendChild(more);
      }
    } else {
      const emptyList = document.createElement('p');
      emptyList.className = 'archive-browser-detail-more';
      emptyList.textContent = 'This archived list is empty.';
      listPreview.appendChild(emptyList);
    }

    detailEl.appendChild(listPreview);
  }
}

function renderArchiveRestoreDialog() {
  const state = getArchiveBrowserState();
  const dialogEl = document.getElementById('archiveRestoreDialog');
  const titleEl = document.getElementById('archiveRestoreTitle');
  const originalListEl = document.getElementById('archiveRestoreOriginalList');
  const searchInput = document.getElementById('archiveRestoreSearchInput');
  const optionsEl = document.getElementById('archiveRestoreListOptions');
  const errorEl = document.getElementById('archiveRestoreError');
  const confirmButton = document.getElementById('archiveRestoreConfirm');
  if (!dialogEl || !titleEl || !originalListEl || !searchInput || !optionsEl || !errorEl || !confirmButton) {
    return;
  }

  const filteredEntries = getFilteredArchiveEntries();
  const selectedEntry = getSelectedArchiveEntry(filteredEntries);
  const restoreEntry = selectedEntry && selectedEntry.entryPath === state.restore.entryPath
    ? selectedEntry
    : (Array.isArray(state.entries.cards) ? state.entries.cards.find((entry) => entry.entryPath === state.restore.entryPath) : null);

  const dialogWasOpen = dialogEl.getAttribute('aria-hidden') === 'false' && !dialogEl.classList.contains('hidden');
  if (state.restore.isOpen) {
    if (typeof setAccessibleModalVisible === 'function' && !dialogWasOpen) {
      setAccessibleModalVisible(dialogEl, true, {
        display: 'grid',
        initialFocus: '#archiveRestoreSearchInput',
        labelledBy: 'archiveRestoreTitle',
      });
    } else {
      dialogEl.classList.remove('hidden');
      dialogEl.style.display = 'grid';
      dialogEl.setAttribute('aria-hidden', 'false');
    }
  } else if (dialogWasOpen && typeof setAccessibleModalVisible === 'function') {
    setAccessibleModalVisible(dialogEl, false, { restoreFocus: false });
  } else {
    dialogEl.classList.add('hidden');
    dialogEl.style.display = 'none';
    dialogEl.setAttribute('aria-hidden', 'true');
  }

  if (!state.restore.isOpen || !restoreEntry) {
    errorEl.textContent = '';
    optionsEl.innerHTML = '';
    return;
  }

  titleEl.textContent = `Restore "${restoreEntry.title || 'card'}"`;
  originalListEl.textContent = restoreEntry.originalListDisplayName
    ? `Original list: ${restoreEntry.originalListDisplayName}`
    : 'Original list: Unknown original list';
  searchInput.value = state.restore.destinationQuery;

  const query = trimArchiveSearchValue(state.restore.destinationQuery);
  const filteredLists = state.restore.availableLists.filter((listEntry) => {
    if (!query) {
      return true;
    }

    return `${listEntry.displayName} ${listEntry.directoryName}`.toLowerCase().includes(query);
  });

  optionsEl.innerHTML = '';
  if (filteredLists.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'archive-restore-empty';
    emptyEl.textContent = 'No lists match that search.';
    optionsEl.appendChild(emptyEl);
  } else {
    for (const listEntry of filteredLists) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'archive-restore-option';
      optionButton.classList.toggle('is-active', listEntry.path === state.restore.selectedListPath);
      optionButton.textContent = listEntry.displayName;
      optionButton.title = listEntry.directoryName;
      optionButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.restore.selectedListPath = listEntry.path;
        state.restore.error = '';
        renderArchiveRestoreDialog();
      });
      optionsEl.appendChild(optionButton);
    }
  }

  errorEl.textContent = state.restore.error || '';
  confirmButton.disabled = !state.restore.selectedListPath || state.restore.isSaving;
  confirmButton.textContent = state.restore.isSaving ? 'Restoring...' : 'Restore card';
}

function renderArchiveBrowserModal() {
  const state = getArchiveBrowserState();
  const modal = getArchiveBrowserModal();
  const searchInput = document.getElementById('archiveBrowserSearchInput');
  const cardsTab = document.getElementById('archiveBrowserTabCards');
  const listsTab = document.getElementById('archiveBrowserTabLists');
  if (!modal || !searchInput || !cardsTab || !listsTab) {
    return;
  }

  cardsTab.classList.toggle('is-active', state.activeTab === ARCHIVE_BROWSER_TAB_IDS.CARDS);
  listsTab.classList.toggle('is-active', state.activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS);
  cardsTab.setAttribute('aria-selected', state.activeTab === ARCHIVE_BROWSER_TAB_IDS.CARDS ? 'true' : 'false');
  listsTab.setAttribute('aria-selected', state.activeTab === ARCHIVE_BROWSER_TAB_IDS.LISTS ? 'true' : 'false');
  searchInput.value = state.searchQuery;
  searchInput.placeholder = getArchiveBrowserSearchPlaceholder();
  renderArchiveBrowserSortOptions();
  renderArchiveBrowserResults();
  renderArchiveBrowserDetail();
  renderArchiveRestoreDialog();
}

async function loadArchiveBrowserDetail(entryPath) {
  const state = getArchiveBrowserState();
  const normalizedEntryPath = String(entryPath || '').trim();
  if (!normalizedEntryPath) {
    return;
  }

  if (state.detailByPath.has(normalizedEntryPath)) {
    state.detailLoadingPath = '';
    state.detailErrorPath = '';
    state.detailErrorMessage = '';
    renderArchiveBrowserDetail();
    return;
  }

  state.detailRequestId += 1;
  const requestId = state.detailRequestId;
  state.detailLoadingPath = normalizedEntryPath;
  state.detailErrorPath = '';
  state.detailErrorMessage = '';
  renderArchiveBrowserDetail();

  try {
    const response = await window.board.readArchiveEntry(normalizedEntryPath);
    if (requestId !== state.detailRequestId) {
      return;
    }

    if (response && response.entry) {
      state.detailByPath.set(normalizedEntryPath, response.entry);
    }
    state.detailLoadingPath = '';
    renderArchiveBrowserDetail();
  } catch (error) {
    if (requestId !== state.detailRequestId) {
      return;
    }

    state.detailLoadingPath = '';
    state.detailErrorPath = normalizedEntryPath;
    state.detailErrorMessage = error && error.message
      ? error.message
      : 'Unable to load archive entry.';
    renderArchiveBrowserDetail();
  }
}

async function refreshArchiveBrowserData() {
  const state = getArchiveBrowserState();
  if (!window.board || typeof window.board.listArchiveEntries !== 'function') {
    return;
  }

  state.requestId += 1;
  const requestId = state.requestId;
  const previousSelectedEntryPath = state.selectedEntryPath;
  state.isLoading = true;
  state.error = '';
  state.entries = {
    cards: [],
    lists: [],
  };
  state.detailByPath = new Map();
  state.detailLoadingPath = '';
  state.detailErrorPath = '';
  state.detailErrorMessage = '';
  renderArchiveBrowserModal();

  try {
    const response = await window.board.listArchiveEntries();
    if (requestId !== state.requestId) {
      return;
    }

    state.entries = {
      cards: Array.isArray(response && response.cards) ? response.cards : [],
      lists: Array.isArray(response && response.lists) ? response.lists : [],
    };
    state.selectedEntryPath = previousSelectedEntryPath;
    state.isLoading = false;
    renderArchiveBrowserModal();

    const filteredEntries = getFilteredArchiveEntries();
    const selectedPath = syncArchiveBrowserSelection(filteredEntries);
    renderArchiveBrowserModal();
    if (selectedPath) {
      await loadArchiveBrowserDetail(selectedPath);
    }
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    state.isLoading = false;
    state.error = error && error.message
      ? error.message
      : 'Unable to load archive.';
    renderArchiveBrowserModal();
  }
}

async function openArchiveBrowserModal() {
  if (!window.boardRoot) {
    return;
  }

  const modal = getArchiveBrowserModal();
  if (!modal) {
    return;
  }

  resetArchiveBrowserState();
  if (typeof setAccessibleModalVisible === 'function') {
    setAccessibleModalVisible(modal, true, {
      display: 'block',
      initialFocus: '#archiveBrowserSearchInput',
      labelledBy: 'archiveBrowserTitle',
    });
  } else {
    modal.style.display = 'block';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  if (typeof setBoardInteractive === 'function') {
    setBoardInteractive(false);
  }

  renderArchiveBrowserModal();
  await refreshArchiveBrowserData();

  const searchInput = document.getElementById('archiveBrowserSearchInput');
  if (searchInput) {
    searchInput.focus();
    if (typeof searchInput.select === 'function') {
      searchInput.select();
    }
  }
}

function closeArchiveBrowserModal() {
  const modal = getArchiveBrowserModal();
  if (!modal) {
    return;
  }

  const restoreDialog = document.getElementById('archiveRestoreDialog');
  if (restoreDialog && restoreDialog.getAttribute('aria-hidden') === 'false') {
    if (typeof setAccessibleModalVisible === 'function') {
      setAccessibleModalVisible(restoreDialog, false, { restoreFocus: false });
    } else {
      restoreDialog.classList.add('hidden');
      restoreDialog.style.display = 'none';
      restoreDialog.setAttribute('aria-hidden', 'true');
    }
  }

  if (typeof setAccessibleModalVisible === 'function') {
    setAccessibleModalVisible(modal, false);
  } else {
    modal.style.display = 'none';
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  resetArchiveBrowserState();

  if (typeof setBoardInteractive === 'function') {
    setBoardInteractive(true);
  }
}

function openArchiveRestoreDialog(entry) {
  const state = getArchiveBrowserState();
  if (!entry || entry.kind !== 'card') {
    return Promise.resolve();
  }

  return window.board.listLists(window.boardRoot).then((listNames) => {
    const names = Array.isArray(listNames) ? listNames : [];
    const availableLists = names.map((directoryName) => ({
      directoryName,
      displayName: getArchiveDisplayNameForList(directoryName),
      path: `${window.boardRoot}${directoryName}`,
    })).sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, {
      numeric: true,
      sensitivity: 'base',
      ignorePunctuation: true,
    }));

    const preferredList = availableLists.find((listEntry) => listEntry.directoryName === entry.originalListDirectoryName) || null;
    state.restore = {
      isOpen: true,
      entryPath: entry.entryPath,
      availableLists,
      destinationQuery: '',
      selectedListPath: preferredList ? preferredList.path : '',
      isSaving: false,
      error: '',
    };
    renderArchiveRestoreDialog();
  }).catch((error) => {
    console.error('Unable to open archive restore dialog.', error);
  });
}

function closeArchiveRestoreDialog() {
  const state = getArchiveBrowserState();
  state.restore = {
    isOpen: false,
    entryPath: '',
    availableLists: [],
    destinationQuery: '',
    selectedListPath: '',
    isSaving: false,
    error: '',
  };
  renderArchiveRestoreDialog();
}

async function handleConfirmArchiveRestore() {
  const state = getArchiveBrowserState();
  const selectedListPath = String(state.restore.selectedListPath || '').trim();
  const entryPath = String(state.restore.entryPath || '').trim();
  if (!selectedListPath || !entryPath || !window.board || typeof window.board.restoreArchivedCard !== 'function') {
    return;
  }

  state.restore.isSaving = true;
  state.restore.error = '';
  renderArchiveRestoreDialog();

  try {
    await window.board.restoreArchivedCard(entryPath, selectedListPath);
    closeArchiveRestoreDialog();
    await refreshArchiveBrowserData();
    await renderBoard();
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('Restored archived card.');
    }
  } catch (error) {
    state.restore.isSaving = false;
    state.restore.error = error && error.message
      ? error.message
      : 'Unable to restore archived card.';
    renderArchiveRestoreDialog();
  }
}

function sanitizeArchiveRestoreListName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Untitled';
}

function getArchiveDisplayNameForList(directoryName) {
  const structured = parseArchiveStructuredListName(directoryName);
  if (structured) {
    return structured.displayName;
  }

  return String(directoryName || '').replace(/^\d+-/, '') || 'Untitled';
}

function parseArchiveStructuredListName(directoryName) {
  const match = String(directoryName || '').match(/^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    displayName: match[2],
    suffix: match[3],
  };
}

function buildArchiveRestoreListDirectoryName(originalDirectoryName, requestedDisplayName) {
  const structured = parseArchiveStructuredListName(originalDirectoryName);
  if (structured) {
    return `${structured.prefix}${sanitizeArchiveRestoreListName(requestedDisplayName || structured.displayName)}${structured.suffix}`;
  }

  return sanitizeArchiveRestoreListName(requestedDisplayName || originalDirectoryName);
}

async function resolveArchiveRestoreListDirectoryName(entry) {
  const existingLists = await window.board.listLists(window.boardRoot);
  const existingNames = new Set(Array.isArray(existingLists) ? existingLists.map((listName) => String(listName)) : []);
  const preferredDirectoryName = String(entry.originalListDirectoryName || entry.listDirectoryName || '').trim();
  if (preferredDirectoryName && !existingNames.has(preferredDirectoryName)) {
    return preferredDirectoryName;
  }

  const structured = parseArchiveStructuredListName(preferredDirectoryName);
  let promptValue = structured ? structured.displayName : (entry.originalListDisplayName || entry.listDisplayName || preferredDirectoryName);

  while (true) {
    const input = window.prompt(
      `A list named "${entry.originalListDisplayName || entry.listDisplayName || 'this list'}" already exists.\n\nRestore it as:`,
      promptValue,
    );
    if (input == null) {
      return '';
    }

    const nextDirectoryName = buildArchiveRestoreListDirectoryName(preferredDirectoryName || entry.listDirectoryName, input);
    if (!nextDirectoryName) {
      promptValue = input;
      continue;
    }

    if (!existingNames.has(nextDirectoryName)) {
      return nextDirectoryName;
    }

    promptValue = input;
    window.alert('That list name already exists. Choose another name.');
  }
}

async function handleRestoreArchivedList(entry) {
  if (!entry || entry.kind !== 'list' || !window.board || typeof window.board.restoreArchivedList !== 'function') {
    return;
  }

  try {
    const restoredDirectoryName = await resolveArchiveRestoreListDirectoryName(entry);
    if (!restoredDirectoryName) {
      return;
    }

    await window.board.restoreArchivedList(entry.entryPath, restoredDirectoryName);
    await refreshArchiveBrowserData();
    await renderBoard();
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('Restored archived list.');
    }
  } catch (error) {
    window.alert(error && error.message ? error.message : 'Unable to restore archived list.');
  }
}

function handleArchiveBrowserResultsScroll(event) {
  const state = getArchiveBrowserState();
  const target = event && event.currentTarget;
  if (!target) {
    return;
  }

  const threshold = 120;
  if ((target.scrollHeight - target.scrollTop - target.clientHeight) > threshold) {
    return;
  }

  const filteredEntries = getFilteredArchiveEntries();
  const currentVisibleCount = state.visibleCountByTab[state.activeTab] || ARCHIVE_BROWSER_BATCH_SIZE;
  if (currentVisibleCount >= filteredEntries.length) {
    return;
  }

  state.visibleCountByTab[state.activeTab] = currentVisibleCount + ARCHIVE_BROWSER_BATCH_SIZE;
  renderArchiveBrowserResults();
}

function setArchiveBrowserActiveTab(tabId) {
  const state = getArchiveBrowserState();
  state.activeTab = tabId === ARCHIVE_BROWSER_TAB_IDS.LISTS
    ? ARCHIVE_BROWSER_TAB_IDS.LISTS
    : ARCHIVE_BROWSER_TAB_IDS.CARDS;
  resetArchiveBrowserPagination(state.activeTab);
  state.selectedEntryPath = '';
  renderArchiveBrowserModal();

  const filteredEntries = getFilteredArchiveEntries();
  const selectedPath = syncArchiveBrowserSelection(filteredEntries);
  renderArchiveBrowserModal();
  if (selectedPath) {
    loadArchiveBrowserDetail(selectedPath).catch((error) => {
      console.error('Unable to load archive detail.', error);
    });
  }
}

function initializeArchiveBrowserControls() {
  const state = getArchiveBrowserState();
  if (state.controlsInitialized) {
    return;
  }

  const openButton = document.getElementById('openArchiveBrowser');
  const closeButton = document.getElementById('archiveBrowserClose');
  const modal = getArchiveBrowserModal();
  const cardsTab = document.getElementById('archiveBrowserTabCards');
  const listsTab = document.getElementById('archiveBrowserTabLists');
  const searchInput = document.getElementById('archiveBrowserSearchInput');
  const sortSelect = document.getElementById('archiveBrowserSortSelect');
  const resultsEl = document.getElementById('archiveBrowserResults');
  const restoreSearchInput = document.getElementById('archiveRestoreSearchInput');
  const restoreCancel = document.getElementById('archiveRestoreCancel');
  const restoreConfirm = document.getElementById('archiveRestoreConfirm');

  if (modal) {
    modal.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (openButton) {
    openButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.boardRoot) {
        return;
      }
      if (typeof closeBoardMenuPopover === 'function') {
        closeBoardMenuPopover();
      }
      if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' });
      }
      await openArchiveBrowserModal();
    });
  }

  if (closeButton) {
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeArchiveBrowserModal();
    });
  }

  if (cardsTab) {
    cardsTab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setArchiveBrowserActiveTab(ARCHIVE_BROWSER_TAB_IDS.CARDS);
    });
  }

  if (listsTab) {
    listsTab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setArchiveBrowserActiveTab(ARCHIVE_BROWSER_TAB_IDS.LISTS);
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', async (event) => {
      state.searchQuery = String(event.currentTarget.value || '');
      resetArchiveBrowserPagination(state.activeTab);
      state.selectedEntryPath = '';
      renderArchiveBrowserModal();

      const filteredEntries = getFilteredArchiveEntries();
      const selectedPath = syncArchiveBrowserSelection(filteredEntries);
      renderArchiveBrowserModal();
      if (selectedPath) {
        await loadArchiveBrowserDetail(selectedPath);
      }
    });
    searchInput.addEventListener('keydown', (event) => {
      handleArchiveBrowserSearchInputKeydown(event).catch((error) => {
        console.error('Failed to handle archive search keyboard navigation.', error);
      });
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', async (event) => {
      state.sortKeyByTab[state.activeTab] = String(event.currentTarget.value || 'archived-desc');
      resetArchiveBrowserPagination(state.activeTab);
      state.selectedEntryPath = '';
      renderArchiveBrowserModal();

      const filteredEntries = getFilteredArchiveEntries();
      const selectedPath = syncArchiveBrowserSelection(filteredEntries);
      renderArchiveBrowserModal();
      if (selectedPath) {
        await loadArchiveBrowserDetail(selectedPath);
      }
    });
  }

  if (resultsEl) {
    resultsEl.addEventListener('scroll', handleArchiveBrowserResultsScroll);
  }

  if (restoreSearchInput) {
    restoreSearchInput.addEventListener('input', (event) => {
      state.restore.destinationQuery = String(event.currentTarget.value || '');
      renderArchiveRestoreDialog();
    });
  }

  if (restoreCancel) {
    restoreCancel.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeArchiveRestoreDialog();
    });
  }

  if (restoreConfirm) {
    restoreConfirm.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleConfirmArchiveRestore();
    });
  }

  state.controlsInitialized = true;
}
