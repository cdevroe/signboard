const BOARD_TABLE_COLUMNS = Object.freeze([
  { id: 'select', label: '' },
  { id: 'start', label: 'Start' },
  { id: 'due', label: 'Due' },
  { id: 'updated', label: 'Updated' },
  { id: 'created', label: 'Created' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'links', label: 'Links' },
  { id: 'title', label: 'Card' },
  { id: 'list', label: 'List' },
  { id: 'labels', label: 'Labels' },
]);

const BOARD_TABLE_SORT_OPTIONS = Object.freeze([
  { value: 'board', label: 'Board order' },
  { value: 'updated-asc', label: 'Updated, oldest first' },
  { value: 'updated-desc', label: 'Updated, newest first' },
  { value: 'created-asc', label: 'Created, oldest first' },
  { value: 'created-desc', label: 'Created, newest first' },
  { value: 'due-asc', label: 'Due date' },
  { value: 'title-asc', label: 'Title, A-Z' },
]);

const BOARD_TABLE_LIST_FILTER_ALL = 'all';
const BOARD_TABLE_LIST_FILTER_COMPLETED = 'completed';
const BOARD_TABLE_LIST_FILTER_PREFIX = 'list:';

function normalizeBoardTableTitle(titleText) {
  const normalized = String(titleText || '').trim().replace(/^#\s+/, '');
  return normalized || 'Untitled';
}

function getBoardTableState() {
  if (!window.__boardTableState) {
    window.__boardTableState = {
      sortKey: 'board',
      listFilter: BOARD_TABLE_LIST_FILTER_ALL,
      selectedCardPaths: new Set(),
      lastSelectedCardPath: '',
      activeBulkMenu: '',
    };
  }

  const state = window.__boardTableState;
  if (!(state.selectedCardPaths instanceof Set)) {
    state.selectedCardPaths = new Set(Array.isArray(state.selectedCardPaths) ? state.selectedCardPaths : []);
  }
  if (typeof state.listFilter !== 'string') {
    state.listFilter = BOARD_TABLE_LIST_FILTER_ALL;
  }
  if (typeof state.lastSelectedCardPath !== 'string') {
    state.lastSelectedCardPath = '';
  }
  if (typeof state.activeBulkMenu !== 'string') {
    state.activeBulkMenu = '';
  }

  return window.__boardTableState;
}

function getBoardTableSortKey() {
  const state = getBoardTableState();
  const sortKey = String(state.sortKey || 'board');
  return BOARD_TABLE_SORT_OPTIONS.some((option) => option.value === sortKey) ? sortKey : 'board';
}

function normalizeBoardTableCardPath(cardPath) {
  return String(cardPath || '').trim();
}

function getBoardTableSelectionSet() {
  return getBoardTableState().selectedCardPaths;
}

function clearBoardTableSelection() {
  const state = getBoardTableState();
  state.selectedCardPaths.clear();
  state.lastSelectedCardPath = '';
  state.activeBulkMenu = '';
}

function getBoardTableListFilter(listEntries = []) {
  const state = getBoardTableState();
  const listFilter = String(state.listFilter || BOARD_TABLE_LIST_FILTER_ALL);
  const entries = Array.isArray(listEntries) ? listEntries : [];

  if (listFilter === BOARD_TABLE_LIST_FILTER_COMPLETED) {
    return entries.some((entry) => entry && entry.isCompletedList)
      ? listFilter
      : BOARD_TABLE_LIST_FILTER_ALL;
  }

  if (listFilter.startsWith(BOARD_TABLE_LIST_FILTER_PREFIX)) {
    const listPath = listFilter.slice(BOARD_TABLE_LIST_FILTER_PREFIX.length);
    return entries.some((entry) => entry && entry.listPath === listPath)
      ? listFilter
      : BOARD_TABLE_LIST_FILTER_ALL;
  }

  return BOARD_TABLE_LIST_FILTER_ALL;
}

function setBoardTableListFilter(listFilter) {
  const state = getBoardTableState();
  state.listFilter = String(listFilter || BOARD_TABLE_LIST_FILTER_ALL);
  clearBoardTableSelection();
}

function getBoardTableListEntries(boardRoot, listsWithCards) {
  const entries = Array.isArray(listsWithCards) ? listsWithCards : [];

  return entries.map((entry) => {
    const listName = typeof entry === 'string'
      ? entry
      : String(entry && entry.listName ? entry.listName : '').trim();
    const listPath = typeof entry === 'string'
      ? `${boardRoot}${entry}`
      : String(entry && entry.listPath ? entry.listPath : `${boardRoot}${listName}`).trim();
    const cards = Array.isArray(entry && entry.cards) ? entry.cards : [];

    return {
      listName,
      listPath,
      listDisplayName: getBoardListDisplayName(listName),
      cards,
      isCompletedList: typeof isBoardListCompletedByWorkflow === 'function'
        ? isBoardListCompletedByWorkflow(listName)
        : false,
    };
  });
}

function getBoardTableListOptions(listEntries) {
  return (Array.isArray(listEntries) ? listEntries : [])
    .filter((entry) => entry && entry.listPath && entry.listName)
    .map((entry) => ({
      listName: entry.listName,
      listPath: entry.listPath,
      listDisplayName: entry.listDisplayName || getBoardListDisplayName(entry.listName),
    }));
}

function boardTableEntryMatchesFilters(entry) {
  const labels = Array.isArray(entry.labels) ? entry.labels : [];
  const taskStartDates = Array.isArray(entry.taskStartDates) ? entry.taskStartDates : [];
  const incompleteTaskStartDates = Array.isArray(entry.incompleteTaskStartDates)
    ? entry.incompleteTaskStartDates
    : taskStartDates;
  const taskDueDates = Array.isArray(entry.taskDueDates) ? entry.taskDueDates : [];
  const incompleteTaskDueDates = Array.isArray(entry.incompleteTaskDueDates)
    ? entry.incompleteTaskDueDates
    : taskDueDates;
  const cardDueDates = getCardFilterDueDates(
    [entry.start, entry.due],
    [...taskStartDates, ...taskDueDates],
  );
  const activeFilterDueDates = getActiveBoardFilterDueDates(
    [entry.start, entry.due],
    [...taskStartDates, ...taskDueDates],
    [...incompleteTaskStartDates, ...incompleteTaskDueDates],
  );

  return cardMatchesBoardLabelFilter(labels, cardDueDates, activeFilterDueDates, {
    isCompletedList: Boolean(entry.isCompletedList),
  }) && cardMatchesBoardSearch(entry.title, entry.body);
}

function boardTableEntryMatchesListFilter(entry, listEntries) {
  const listFilter = getBoardTableListFilter(listEntries);
  if (listFilter === BOARD_TABLE_LIST_FILTER_ALL) {
    return true;
  }

  if (listFilter === BOARD_TABLE_LIST_FILTER_COMPLETED) {
    return Boolean(entry && entry.isCompletedList);
  }

  if (listFilter.startsWith(BOARD_TABLE_LIST_FILTER_PREFIX)) {
    const listPath = listFilter.slice(BOARD_TABLE_LIST_FILTER_PREFIX.length);
    return Boolean(entry && entry.listPath === listPath);
  }

  return true;
}

async function collectBoardTableCards(boardRoot, listsWithCards) {
  const listEntries = getBoardTableListEntries(boardRoot, listsWithCards);
  const rowsByList = await Promise.all(
    listEntries.map(async (listEntry) => {
      const rows = await Promise.all(
        listEntry.cards.map(async (cardItem) => {
          const cardName = typeof getBoardSnapshotCardName === 'function'
            ? getBoardSnapshotCardName(cardItem)
            : String(cardItem || '');
          const cardPath = typeof getBoardSnapshotCardPath === 'function'
            ? getBoardSnapshotCardPath(listEntry.listPath, cardItem)
            : `${listEntry.listPath}/${cardName}`;
          const snapshotCard = typeof getBoardSnapshotCardData === 'function'
            ? getBoardSnapshotCardData(cardItem)
            : null;
          const card = snapshotCard || await window.board.readCard(cardPath);
          const frontmatter = card && card.frontmatter && typeof card.frontmatter === 'object'
            ? card.frontmatter
            : {};
          const body = String(card && typeof card.body === 'string' ? card.body : '');

          return {
            boardRoot,
            cardPath,
            cardName,
            listName: listEntry.listName,
            listPath: listEntry.listPath,
            listDisplayName: listEntry.listDisplayName,
            isCompletedList: Boolean(listEntry.isCompletedList),
            title: normalizeBoardTableTitle(frontmatter.title),
            start: String(frontmatter.start || '').trim(),
            due: String(frontmatter.due || '').trim(),
            labels: Array.isArray(frontmatter.labels)
              ? frontmatter.labels.map((labelId) => String(labelId))
              : [],
            body,
            taskSummary: card.taskSummary && typeof card.taskSummary === 'object'
              ? card.taskSummary
              : getTaskListSummary(body),
            taskStartDates: Array.isArray(card.taskStartDates)
              ? card.taskStartDates
              : (typeof getTaskListStartDates === 'function' ? getTaskListStartDates(body) : []),
            incompleteTaskStartDates: Array.isArray(card.incompleteTaskStartDates)
              ? card.incompleteTaskStartDates
              : (typeof getIncompleteTaskListStartDates === 'function' ? getIncompleteTaskListStartDates(body) : []),
            taskDueDates: Array.isArray(card.taskDueDates) ? card.taskDueDates : getTaskListDueDates(body),
            incompleteTaskDueDates: Array.isArray(card.incompleteTaskDueDates)
              ? card.incompleteTaskDueDates
              : getIncompleteTaskListDueDates(body),
            linkedObjectCount: typeof getFrontmatterLinkedObjectCount === 'function'
              ? getFrontmatterLinkedObjectCount(frontmatter)
              : 0,
            timestamps: card && card.timestamps && typeof card.timestamps === 'object'
              ? card.timestamps
              : {},
          };
        }),
      );

      return rows;
    }),
  );

  const allCards = rowsByList.flat().map((entry, index) => ({
    ...entry,
    boardOrderIndex: index,
  }));
  const cardsMatchingBoardFilters = allCards.filter(boardTableEntryMatchesFilters);
  return {
    listEntries,
    allCards,
    visibleCards: cardsMatchingBoardFilters.filter((entry) => boardTableEntryMatchesListFilter(entry, listEntries)),
  };
}

function pruneBoardTableSelection(visibleCards) {
  const selection = getBoardTableSelectionSet();
  const visiblePaths = new Set((Array.isArray(visibleCards) ? visibleCards : [])
    .map((entry) => normalizeBoardTableCardPath(entry && entry.cardPath))
    .filter(Boolean));

  for (const cardPath of Array.from(selection)) {
    if (!visiblePaths.has(cardPath)) {
      selection.delete(cardPath);
    }
  }

  const state = getBoardTableState();
  if (state.lastSelectedCardPath && !visiblePaths.has(state.lastSelectedCardPath)) {
    state.lastSelectedCardPath = '';
  }

  if (selection.size === 0) {
    state.activeBulkMenu = '';
  }
}

function isBoardTableEntrySelected(entry) {
  return getBoardTableSelectionSet().has(normalizeBoardTableCardPath(entry && entry.cardPath));
}

function getBoardTableSelectedEntries(visibleEntries) {
  const selection = getBoardTableSelectionSet();
  return (Array.isArray(visibleEntries) ? visibleEntries : [])
    .filter((entry) => selection.has(normalizeBoardTableCardPath(entry && entry.cardPath)));
}

function selectBoardTableVisibleEntries(visibleEntries, shouldSelect) {
  const selection = getBoardTableSelectionSet();
  const entries = Array.isArray(visibleEntries) ? visibleEntries : [];

  for (const entry of entries) {
    const cardPath = normalizeBoardTableCardPath(entry && entry.cardPath);
    if (!cardPath) {
      continue;
    }

    if (shouldSelect) {
      selection.add(cardPath);
    } else {
      selection.delete(cardPath);
    }
  }

  const state = getBoardTableState();
  state.lastSelectedCardPath = shouldSelect && entries.length > 0
    ? normalizeBoardTableCardPath(entries[0].cardPath)
    : '';
  state.activeBulkMenu = '';
}

function selectBoardTableEntryRange(entry, visibleEntries, shouldSelect, useRange) {
  const selection = getBoardTableSelectionSet();
  const state = getBoardTableState();
  const entries = Array.isArray(visibleEntries) ? visibleEntries : [];
  const cardPath = normalizeBoardTableCardPath(entry && entry.cardPath);
  if (!cardPath) {
    return;
  }

  const currentIndex = entries.findIndex((candidate) => normalizeBoardTableCardPath(candidate && candidate.cardPath) === cardPath);
  const anchorIndex = entries.findIndex((candidate) => (
    normalizeBoardTableCardPath(candidate && candidate.cardPath) === state.lastSelectedCardPath
  ));

  if (useRange && currentIndex >= 0 && anchorIndex >= 0) {
    const startIndex = Math.min(currentIndex, anchorIndex);
    const endIndex = Math.max(currentIndex, anchorIndex);
    for (let index = startIndex; index <= endIndex; index += 1) {
      const rangeCardPath = normalizeBoardTableCardPath(entries[index] && entries[index].cardPath);
      if (!rangeCardPath) {
        continue;
      }
      if (shouldSelect) {
        selection.add(rangeCardPath);
      } else {
        selection.delete(rangeCardPath);
      }
    }
  } else if (shouldSelect) {
    selection.add(cardPath);
  } else {
    selection.delete(cardPath);
  }

  state.lastSelectedCardPath = shouldSelect || selection.size > 0 ? cardPath : '';
  state.activeBulkMenu = '';
}

function compareBoardTableBaseOrder(left, right) {
  const leftIndex = Number.isFinite(left && left.boardOrderIndex) ? left.boardOrderIndex : 0;
  const rightIndex = Number.isFinite(right && right.boardOrderIndex) ? right.boardOrderIndex : 0;
  return leftIndex - rightIndex;
}

function compareOptionalTimestampValues(leftValue, rightValue, descending = false) {
  const leftMs = getCardTimestampMs(leftValue);
  const rightMs = getCardTimestampMs(rightValue);

  if (leftMs > 0 && rightMs > 0 && leftMs !== rightMs) {
    return descending ? rightMs - leftMs : leftMs - rightMs;
  }

  if (leftMs > 0 && rightMs <= 0) {
    return -1;
  }

  if (leftMs <= 0 && rightMs > 0) {
    return 1;
  }

  return 0;
}

function getBoardTablePrimaryDueDate(entry) {
  const displayDue = getBoardTableDisplayDueDates(entry);
  return displayDue.dueDates[0] || '';
}

function compareOptionalIsoDateValues(leftValue, rightValue) {
  const leftDate = String(leftValue || '').trim();
  const rightDate = String(rightValue || '').trim();

  if (leftDate && rightDate && leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  if (leftDate && !rightDate) {
    return -1;
  }

  if (!leftDate && rightDate) {
    return 1;
  }

  return 0;
}

function sortBoardTableCards(cards, sortKey = getBoardTableSortKey()) {
  const items = Array.isArray(cards) ? cards.slice() : [];
  const normalizedSortKey = BOARD_TABLE_SORT_OPTIONS.some((option) => option.value === sortKey)
    ? sortKey
    : 'board';

  items.sort((left, right) => {
    if (normalizedSortKey === 'updated-asc' || normalizedSortKey === 'updated-desc') {
      const byUpdated = compareOptionalTimestampValues(
        getCardTimestampValue(left, 'updatedAt'),
        getCardTimestampValue(right, 'updatedAt'),
        normalizedSortKey === 'updated-desc',
      );
      if (byUpdated !== 0) {
        return byUpdated;
      }
    } else if (normalizedSortKey === 'created-asc' || normalizedSortKey === 'created-desc') {
      const byCreated = compareOptionalTimestampValues(
        getCardTimestampValue(left, 'createdAt'),
        getCardTimestampValue(right, 'createdAt'),
        normalizedSortKey === 'created-desc',
      );
      if (byCreated !== 0) {
        return byCreated;
      }
    } else if (normalizedSortKey === 'due-asc') {
      const byDue = compareOptionalIsoDateValues(
        getBoardTablePrimaryDueDate(left),
        getBoardTablePrimaryDueDate(right),
      );
      if (byDue !== 0) {
        return byDue;
      }
    } else if (normalizedSortKey === 'title-asc') {
      const byTitle = String(left && left.title || '').localeCompare(String(right && right.title || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
        ignorePunctuation: true,
      });
      if (byTitle !== 0) {
        return byTitle;
      }
    }

    return compareBoardTableBaseOrder(left, right);
  });

  return items;
}

function createBoardTableSortControl() {
  const control = document.createElement('label');
  control.className = 'board-table-sort-control';

  const labelText = document.createElement('span');
  labelText.className = 'board-table-sort-label';
  labelText.textContent = 'Sort';
  control.appendChild(labelText);

  const select = document.createElement('select');
  select.className = 'board-table-sort-select';
  select.setAttribute('aria-label', 'Sort table cards');

  const sortKey = getBoardTableSortKey();
  for (const optionEntry of BOARD_TABLE_SORT_OPTIONS) {
    const option = document.createElement('option');
    option.value = optionEntry.value;
    option.textContent = optionEntry.label;
    option.selected = optionEntry.value === sortKey;
    select.appendChild(option);
  }

  select.value = sortKey;
  select.addEventListener('change', async () => {
    const nextSortKey = String(select.value || 'board');

    if (typeof waitForNativeMenuTrackingToSettle === 'function') {
      await waitForNativeMenuTrackingToSettle();
    }

    if (!select.isConnected || select.value !== nextSortKey) {
      return;
    }

    getBoardTableState().sortKey = nextSortKey;
    await renderBoard();
  });

  control.appendChild(select);
  return control;
}

function createBoardTableListFilterControl(listEntries) {
  const entries = Array.isArray(listEntries) ? listEntries : [];
  const control = document.createElement('label');
  control.className = 'board-table-filter-control';

  const labelText = document.createElement('span');
  labelText.className = 'board-table-filter-label';
  labelText.textContent = 'List';
  control.appendChild(labelText);

  const select = document.createElement('select');
  select.className = 'board-table-filter-select';
  select.setAttribute('aria-label', 'Filter table by list');

  const allOption = document.createElement('option');
  allOption.value = BOARD_TABLE_LIST_FILTER_ALL;
  allOption.textContent = 'All lists';
  select.appendChild(allOption);

  const hasCompletedLists = entries.some((entry) => entry && entry.isCompletedList);
  const completedOption = document.createElement('option');
  completedOption.value = BOARD_TABLE_LIST_FILTER_COMPLETED;
  completedOption.textContent = 'Completed lists';
  completedOption.disabled = !hasCompletedLists;
  select.appendChild(completedOption);

  const listGroup = document.createElement('optgroup');
  listGroup.label = 'Lists';
  for (const entry of entries) {
    if (!entry || !entry.listPath) {
      continue;
    }
    const option = document.createElement('option');
    option.value = `${BOARD_TABLE_LIST_FILTER_PREFIX}${entry.listPath}`;
    option.textContent = entry.listDisplayName || getBoardListDisplayName(entry.listName);
    listGroup.appendChild(option);
  }
  select.appendChild(listGroup);

  select.value = getBoardTableListFilter(entries);
  select.addEventListener('change', async () => {
    const nextListFilter = String(select.value || BOARD_TABLE_LIST_FILTER_ALL);

    if (typeof waitForNativeMenuTrackingToSettle === 'function') {
      await waitForNativeMenuTrackingToSettle();
    }

    if (!select.isConnected || select.value !== nextListFilter) {
      return;
    }

    setBoardTableListFilter(nextListFilter);
    await renderBoard();
  });

  control.appendChild(select);
  return control;
}

function createBoardTableBulkButton(label, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'board-table-bulk-button';
  button.textContent = label;

  if (options.destructive) {
    button.classList.add('board-table-bulk-button-danger');
  }

  if (options.active) {
    button.classList.add('is-active');
  }

  if (options.title) {
    button.title = options.title;
  }

  if (options.ariaLabel) {
    button.setAttribute('aria-label', options.ariaLabel);
  }

  if (options.menuId) {
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', options.active ? 'true' : 'false');
  }

  if (typeof options.onClick === 'function') {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await options.onClick(button);
    });
  }

  return button;
}

function toggleBoardTableBulkMenu(menuId) {
  const state = getBoardTableState();
  state.activeBulkMenu = state.activeBulkMenu === menuId ? '' : menuId;
}

function normalizeBoardTableDateInput(dateValue) {
  const normalized = String(dateValue || '').trim();
  if (!normalized) {
    return '';
  }

  if (typeof normalizeTaskDateValue === 'function') {
    return normalizeTaskDateValue(normalized);
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function getBoardTableBulkOperationMessage(successCount, failureCount, verb) {
  const success = Number(successCount) || 0;
  const failure = Number(failureCount) || 0;
  const cardLabel = success === 1 ? 'card' : 'cards';
  if (failure > 0 && success > 0) {
    return `${verb} ${success} ${cardLabel}; ${failure} failed.`;
  }
  if (failure > 0) {
    return `Could not update ${failure} ${failure === 1 ? 'card' : 'cards'}.`;
  }
  return `${verb} ${success} ${cardLabel}.`;
}

function announceBoardTableBulkStatus(message) {
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(message);
  }
}

async function archiveBoardTableSelectedCards(selectedEntries) {
  const entries = Array.isArray(selectedEntries) ? selectedEntries : [];
  if (entries.length === 0) {
    return;
  }

  const warningMessage = `Archive ${entries.length} selected card${entries.length === 1 ? '' : 's'}?\n\nThis will move ${entries.length === 1 ? 'it' : 'them'} into XXX-Archive.`;
  if (!window.confirm(warningMessage)) {
    return;
  }

  let archivedCount = 0;
  let failureCount = 0;
  for (const entry of entries) {
    try {
      await window.board.archiveCard(entry.cardPath);
      archivedCount += 1;
    } catch (error) {
      failureCount += 1;
      console.error('Failed to archive selected table card.', error);
    }
  }

  clearBoardTableSelection();
  await renderBoard();
  announceBoardTableBulkStatus(getBoardTableBulkOperationMessage(archivedCount, failureCount, 'Archived'));
}

async function moveBoardTableSelectedCards(selectedEntries, targetListPath) {
  const normalizedTargetListPath = String(targetListPath || '').trim();
  const entries = (Array.isArray(selectedEntries) ? selectedEntries : [])
    .filter((entry) => entry && entry.cardPath && entry.listPath !== normalizedTargetListPath);
  if (!normalizedTargetListPath || entries.length === 0) {
    announceBoardTableBulkStatus('No selected cards needed to move.');
    return;
  }

  let movedCount = 0;
  let failureCount = 0;
  for (const entry of entries.slice().reverse()) {
    try {
      const newCardPath = await moveBoardTableCardToList(entry, normalizedTargetListPath);
      if (newCardPath) {
        movedCount += 1;
      }
    } catch (error) {
      failureCount += 1;
      console.error('Failed to move selected table card.', error);
    }
  }

  clearBoardTableSelection();
  await renderBoard();
  announceBoardTableBulkStatus(getBoardTableBulkOperationMessage(movedCount, failureCount, 'Moved'));
}

function getBoardTableLabelIdsFromMenu(menu) {
  if (!menu || typeof menu.querySelectorAll !== 'function') {
    return [];
  }

  return Array.from(menu.querySelectorAll('input[data-label-id]:checked'))
    .map((input) => String(input.dataset.labelId || '').trim())
    .filter(Boolean);
}

function getBoardTableLabelsWithAddedIds(currentLabelIds, addedLabelIds) {
  const current = Array.isArray(currentLabelIds) ? currentLabelIds.map((labelId) => String(labelId)) : [];
  const existing = new Set(current);
  const next = current.slice();
  const selected = new Set((Array.isArray(addedLabelIds) ? addedLabelIds : []).map((labelId) => String(labelId)));

  for (const label of getBoardLabels()) {
    if (selected.has(label.id) && !existing.has(label.id)) {
      existing.add(label.id);
      next.push(label.id);
    }
  }

  return next;
}

function getBoardTableLabelsWithoutIds(currentLabelIds, removedLabelIds) {
  const removed = new Set((Array.isArray(removedLabelIds) ? removedLabelIds : []).map((labelId) => String(labelId)));
  return (Array.isArray(currentLabelIds) ? currentLabelIds : [])
    .map((labelId) => String(labelId))
    .filter((labelId) => !removed.has(labelId));
}

async function updateBoardTableSelectedLabels(selectedEntries, labelIds, mode) {
  const entries = Array.isArray(selectedEntries) ? selectedEntries : [];
  const selectedLabelIds = Array.isArray(labelIds) ? labelIds.filter(Boolean) : [];
  const normalizedMode = mode === 'remove' ? 'remove' : 'add';
  if (entries.length === 0 || selectedLabelIds.length === 0) {
    announceBoardTableBulkStatus('Choose at least one label.');
    return;
  }

  let updatedCount = 0;
  let failureCount = 0;
  for (const entry of entries) {
    const nextLabels = normalizedMode === 'remove'
      ? getBoardTableLabelsWithoutIds(entry.labels, selectedLabelIds)
      : getBoardTableLabelsWithAddedIds(entry.labels, selectedLabelIds);
    const currentLabels = Array.isArray(entry.labels) ? entry.labels.map((labelId) => String(labelId)) : [];
    if (nextLabels.join('\u0000') === currentLabels.join('\u0000')) {
      continue;
    }

    try {
      await window.board.updateFrontmatter(entry.cardPath, { labels: nextLabels });
      updatedCount += 1;
    } catch (error) {
      failureCount += 1;
      console.error('Failed to update labels for selected table card.', error);
    }
  }

  clearBoardTableSelection();
  await renderBoard();
  announceBoardTableBulkStatus(getBoardTableBulkOperationMessage(
    updatedCount,
    failureCount,
    normalizedMode === 'remove' ? 'Updated labels on' : 'Updated labels on',
  ));
}

async function updateBoardTableSelectedDate(selectedEntries, fieldName, dateValue) {
  const entries = Array.isArray(selectedEntries) ? selectedEntries : [];
  const normalizedFieldName = fieldName === 'start' ? 'start' : 'due';
  const normalizedDate = normalizeBoardTableDateInput(dateValue);
  const isClearing = !String(dateValue || '').trim();

  if (entries.length === 0) {
    return;
  }

  if (!isClearing && !normalizedDate) {
    announceBoardTableBulkStatus('Use a valid YYYY-MM-DD date.');
    return;
  }

  if (isClearing) {
    const label = normalizedFieldName === 'start' ? 'start date' : 'due date';
    const warningMessage = `Clear the ${label} from ${entries.length} selected card${entries.length === 1 ? '' : 's'}?`;
    if (!window.confirm(warningMessage)) {
      return;
    }
  }

  let updatedCount = 0;
  let failureCount = 0;
  for (const entry of entries) {
    const currentDate = String(entry[normalizedFieldName] || '').trim();
    if (currentDate === normalizedDate) {
      continue;
    }

    try {
      await window.board.updateFrontmatter(entry.cardPath, {
        [normalizedFieldName]: normalizedDate,
      });
      updatedCount += 1;
    } catch (error) {
      failureCount += 1;
      console.error(`Failed to update ${normalizedFieldName} date for selected table card.`, error);
    }
  }

  clearBoardTableSelection();
  await renderBoard();
  const verb = isClearing
    ? `Cleared ${normalizedFieldName} date on`
    : `Set ${normalizedFieldName} date on`;
  announceBoardTableBulkStatus(getBoardTableBulkOperationMessage(updatedCount, failureCount, verb));
}

function createBoardTableBulkMoveMenu(selectedEntries, listOptions) {
  const menu = document.createElement('div');
  menu.className = 'board-table-bulk-menu board-table-bulk-move-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Move selected cards');

  for (const optionEntry of listOptions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-table-bulk-menu-option';
    button.textContent = optionEntry.listDisplayName;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await moveBoardTableSelectedCards(selectedEntries, optionEntry.listPath);
    });
    menu.appendChild(button);
  }

  return menu;
}

function createBoardTableBulkLabelsMenu(selectedEntries) {
  const menu = document.createElement('div');
  menu.className = 'board-table-bulk-menu board-table-bulk-labels-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Update selected card labels');

  const labels = getBoardLabels();
  if (labels.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'board-table-bulk-menu-empty';
    empty.textContent = 'No labels yet.';
    menu.appendChild(empty);
    return menu;
  }

  const labelList = document.createElement('div');
  labelList.className = 'board-table-bulk-label-list';
  for (const label of labels) {
    const row = document.createElement('label');
    row.className = 'board-table-bulk-label-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.labelId = label.id;

    const swatch = document.createElement('span');
    swatch.className = 'label-color-swatch';
    swatch.style.backgroundColor = getBoardLabelColor(label);

    const text = document.createElement('span');
    text.textContent = label.name;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    labelList.appendChild(row);
  }
  menu.appendChild(labelList);

  const actions = document.createElement('div');
  actions.className = 'board-table-bulk-menu-actions';

  const addButton = createBoardTableBulkButton('Add labels', {
    onClick: async () => {
      await updateBoardTableSelectedLabels(selectedEntries, getBoardTableLabelIdsFromMenu(menu), 'add');
    },
  });
  const removeButton = createBoardTableBulkButton('Remove labels', {
    onClick: async () => {
      await updateBoardTableSelectedLabels(selectedEntries, getBoardTableLabelIdsFromMenu(menu), 'remove');
    },
  });

  actions.appendChild(addButton);
  actions.appendChild(removeButton);
  menu.appendChild(actions);

  return menu;
}

function createBoardTableBulkDateRow(labelText, fieldName, selectedEntries) {
  const row = document.createElement('div');
  row.className = 'board-table-bulk-date-row';

  const label = document.createElement('label');
  label.className = 'board-table-bulk-date-label';
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'board-table-bulk-date-input';
  input.setAttribute('aria-label', `${labelText} date`);
  label.appendChild(input);

  const setButton = createBoardTableBulkButton('Set', {
    onClick: async () => {
      await updateBoardTableSelectedDate(selectedEntries, fieldName, input.value);
    },
  });
  const clearButton = createBoardTableBulkButton('Clear', {
    onClick: async () => {
      await updateBoardTableSelectedDate(selectedEntries, fieldName, '');
    },
  });

  row.appendChild(label);
  row.appendChild(setButton);
  row.appendChild(clearButton);
  return row;
}

function createBoardTableBulkDatesMenu(selectedEntries) {
  const menu = document.createElement('div');
  menu.className = 'board-table-bulk-menu board-table-bulk-dates-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Update selected card dates');
  menu.appendChild(createBoardTableBulkDateRow('Start', 'start', selectedEntries));
  menu.appendChild(createBoardTableBulkDateRow('Due', 'due', selectedEntries));
  return menu;
}

function createBoardTableBulkMenuWrap(label, menuId, menuFactory, options = {}) {
  const state = getBoardTableState();
  const isActive = state.activeBulkMenu === menuId;
  const wrap = document.createElement('div');
  wrap.className = 'board-table-bulk-menu-wrap';

  const button = createBoardTableBulkButton(label, {
    ...options,
    menuId,
    active: isActive,
    onClick: async () => {
      toggleBoardTableBulkMenu(menuId);
      await renderBoard();
    },
  });
  wrap.appendChild(button);

  if (isActive) {
    wrap.appendChild(menuFactory());
  }

  return wrap;
}

function createBoardTableBulkToolbar(selectedEntries, visibleEntries, listOptions) {
  const toolbar = document.createElement('div');
  toolbar.className = 'board-table-bulk-toolbar';
  toolbar.setAttribute('aria-label', 'Bulk card actions');

  const count = selectedEntries.length;
  const countText = document.createElement('span');
  countText.className = 'board-table-bulk-count';
  countText.textContent = `${count} selected`;
  toolbar.appendChild(countText);

  toolbar.appendChild(createBoardTableBulkButton('Archive', {
    destructive: true,
    onClick: async () => {
      await archiveBoardTableSelectedCards(selectedEntries);
    },
  }));

  toolbar.appendChild(createBoardTableBulkMenuWrap(
    'Move',
    'move',
    () => createBoardTableBulkMoveMenu(selectedEntries, listOptions),
  ));

  toolbar.appendChild(createBoardTableBulkMenuWrap(
    'Labels',
    'labels',
    () => createBoardTableBulkLabelsMenu(selectedEntries),
  ));

  toolbar.appendChild(createBoardTableBulkMenuWrap(
    'Dates',
    'dates',
    () => createBoardTableBulkDatesMenu(selectedEntries),
  ));

  toolbar.appendChild(createBoardTableBulkButton('Clear', {
    onClick: async () => {
      clearBoardTableSelection();
      await renderBoard();
    },
  }));

  if (visibleEntries.length === 0) {
    toolbar.hidden = true;
  }

  return toolbar;
}

function createBoardTableHeader(visibleEntries) {
  const thead = document.createElement('thead');
  const row = document.createElement('tr');

  for (const column of BOARD_TABLE_COLUMNS) {
    const header = document.createElement('th');
    header.scope = 'col';
    header.className = `board-table-heading board-table-heading-${column.id}`;

    if (column.id === 'select') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'board-table-select-checkbox board-table-select-all-checkbox';
      checkbox.title = 'Select visible cards';
      checkbox.setAttribute('aria-label', 'Select visible cards');

      const entries = Array.isArray(visibleEntries) ? visibleEntries : [];
      const selectedEntries = getBoardTableSelectedEntries(entries);
      checkbox.checked = entries.length > 0 && selectedEntries.length === entries.length;
      checkbox.indeterminate = selectedEntries.length > 0 && selectedEntries.length < entries.length;
      checkbox.disabled = entries.length === 0;
      checkbox.addEventListener('click', async (event) => {
        event.stopPropagation();
        selectBoardTableVisibleEntries(entries, checkbox.checked);
        await renderBoard();
      });

      header.appendChild(checkbox);
    } else {
      header.textContent = column.label;
    }
    row.appendChild(header);
  }

  thead.appendChild(row);
  return thead;
}

function createBoardTableSelectionCell(entry, visibleEntries) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-select';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'board-table-select-checkbox';
  checkbox.checked = isBoardTableEntrySelected(entry);
  checkbox.title = `Select ${entry.title}`;
  checkbox.setAttribute('aria-label', `Select ${entry.title}`);
  checkbox.addEventListener('click', async (event) => {
    event.stopPropagation();
    selectBoardTableEntryRange(entry, visibleEntries, checkbox.checked, Boolean(event.shiftKey));
    await renderBoard();
  });

  cell.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  cell.appendChild(checkbox);
  return cell;
}

function createBoardTableTimestampCell(entry, timestampKey) {
  const cell = document.createElement('td');
  cell.className = `board-table-cell board-table-cell-${timestampKey === 'createdAt' ? 'created' : 'updated'}`;

  const timestampValue = getCardTimestampValue(entry, timestampKey);
  if (!timestampValue) {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'Unknown';
    cell.appendChild(empty);
    return cell;
  }

  const time = document.createElement('time');
  time.className = 'board-table-timestamp';
  time.setAttribute('datetime', timestampValue);
  time.textContent = createCardTimestampCellValue(timestampValue);
  time.title = formatCardTimestampDateTime(timestampValue);
  cell.appendChild(time);

  return cell;
}

function createBoardTableTitleCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-title';

  const titleButton = document.createElement('button');
  titleButton.type = 'button';
  titleButton.className = 'board-table-card-title-button';
  titleButton.textContent = entry.title;
  titleButton.title = 'Open card';
  titleButton.setAttribute('aria-label', `Open ${entry.title}`);
  titleButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleEditCardModal(entry.cardPath);
  });
  cell.appendChild(titleButton);

  return cell;
}

async function moveBoardTableCardToList(entry, targetListPath) {
  const normalizedTargetListPath = String(targetListPath || '').trim();
  if (!entry || !entry.cardPath || !normalizedTargetListPath || normalizedTargetListPath === entry.listPath) {
    return '';
  }

  if (!window.board || typeof window.board.moveCardToTop !== 'function') {
    return '';
  }

  const result = await window.board.moveCardToTop(entry.cardPath, normalizedTargetListPath);
  return result && result.cardPath ? result.cardPath : '';
}

function createBoardTableListCell(entry, listOptions) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-list';

  const select = document.createElement('select');
  select.className = 'board-table-list-select';
  select.setAttribute('aria-label', `Move ${entry.title} to list`);

  for (const optionEntry of listOptions) {
    const option = document.createElement('option');
    option.value = optionEntry.listPath;
    option.textContent = optionEntry.listDisplayName;
    option.selected = optionEntry.listPath === entry.listPath;
    select.appendChild(option);
  }

  select.value = entry.listPath;
  select.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  select.addEventListener('change', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const previousListPath = entry.listPath;
    const nextListPath = String(select.value || '').trim();
    if (!nextListPath || nextListPath === previousListPath) {
      select.value = previousListPath;
      return;
    }

    if (typeof waitForNativeMenuTrackingToSettle === 'function') {
      await waitForNativeMenuTrackingToSettle();
    }

    if (!select.isConnected || select.value !== nextListPath) {
      return;
    }

    select.disabled = true;
    try {
      const newCardPath = await moveBoardTableCardToList(entry, nextListPath);
      if (!newCardPath) {
        select.value = previousListPath;
        return;
      }

      await renderBoard();
    } catch (error) {
      console.error('Failed to move table row card to another list.', error);
      select.value = previousListPath;
    } finally {
      select.disabled = false;
    }
  });

  cell.appendChild(select);
  return cell;
}

function getBoardTableDisplayDueDates(entry) {
  if (entry.due) {
    return {
      dueDates: [entry.due],
      prefix: '',
    };
  }

  const taskDueDates = Array.isArray(entry.incompleteTaskDueDates) && entry.incompleteTaskDueDates.length > 0
    ? entry.incompleteTaskDueDates
    : [];

  return {
    dueDates: getCardFilterDueDates('', taskDueDates),
    prefix: 'Task: ',
  };
}

function getBoardTableDisplayStartDates(entry) {
  if (entry.start) {
    return {
      startDates: [entry.start],
      prefix: '',
    };
  }

  const taskStartDates = Array.isArray(entry.incompleteTaskStartDates) && entry.incompleteTaskStartDates.length > 0
    ? entry.incompleteTaskStartDates
    : [];

  return {
    startDates: getCardFilterDueDates('', taskStartDates),
    prefix: 'Task: ',
  };
}

async function createBoardTableStartCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-start';

  const displayStart = getBoardTableDisplayStartDates(entry);
  const firstStartDate = displayStart.startDates[0] || '';
  if (!firstStartDate) {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    cell.appendChild(empty);
    return cell;
  }

  const startEl = document.createElement('span');
  startEl.className = 'board-table-start';
  const formattedStart = await window.board.formatDueDate(firstStartDate);
  const extraCount = Math.max(0, displayStart.startDates.length - 1);
  startEl.textContent = `${displayStart.prefix}${formattedStart}${extraCount > 0 ? ` +${extraCount}` : ''}`;
  startEl.title = formatLongDueDateLabel(firstStartDate);
  setDueDateVisualClass(startEl, firstStartDate);
  cell.appendChild(startEl);

  return cell;
}

async function createBoardTableDueCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-due';

  const displayDue = getBoardTableDisplayDueDates(entry);
  const firstDueDate = displayDue.dueDates[0] || '';
  if (!firstDueDate) {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    cell.appendChild(empty);
    return cell;
  }

  const dueEl = document.createElement('span');
  dueEl.className = 'board-table-due';
  const formattedDue = await window.board.formatDueDate(firstDueDate);
  const extraCount = Math.max(0, displayDue.dueDates.length - 1);
  dueEl.textContent = `${displayDue.prefix}${formattedDue}${extraCount > 0 ? ` +${extraCount}` : ''}`;
  dueEl.title = formatLongDueDateLabel(firstDueDate);
  setDueDateVisualClass(dueEl, firstDueDate);
  cell.appendChild(dueEl);

  return cell;
}

function createBoardTableTaskCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-tasks';

  const taskProgressBadge = createTaskProgressBadge(
    entry.taskSummary,
    'board-table-task-progress',
  );
  if (taskProgressBadge) {
    cell.appendChild(taskProgressBadge);
  } else {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    cell.appendChild(empty);
  }

  return cell;
}

function createBoardTableLinkedObjectsCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-links';

  const linkedObjectsBadge = typeof createLinkedObjectsMetadataBadge === 'function'
    ? createLinkedObjectsMetadataBadge(entry.linkedObjectCount, 'board-table-linked-objects-badge')
    : null;
  if (linkedObjectsBadge) {
    cell.appendChild(linkedObjectsBadge);
  } else {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    cell.appendChild(empty);
  }

  return cell;
}

function createBoardTableLabelsCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-labels';

  const labelsWrap = document.createElement('div');
  labelsWrap.className = 'board-table-labels';

  for (const labelId of entry.labels) {
    const label = getBoardLabelById(labelId);
    const labelChip = document.createElement('span');
    labelChip.className = 'card-label-chip';

    if (label) {
      const chipColor = getBoardLabelColor(label);
      labelChip.textContent = label.name;
      labelChip.style.backgroundColor = `${chipColor}22`;
      labelChip.style.borderColor = chipColor;
    } else {
      labelChip.classList.add('card-label-chip-unknown');
      labelChip.textContent = 'Unknown label';
      labelChip.title = labelId;
    }

    labelsWrap.appendChild(labelChip);
  }

  if (labelsWrap.childElementCount === 0) {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    labelsWrap.appendChild(empty);
  }

  cell.appendChild(labelsWrap);
  return cell;
}

async function createBoardTableRow(entry, listOptions, visibleEntries) {
  const row = document.createElement('tr');
  row.className = 'board-table-row';
  row.classList.toggle('is-selected', isBoardTableEntrySelected(entry));
  row.dataset.path = entry.cardPath;
  row.dataset.listPath = entry.listPath;
  row.setAttribute('aria-selected', isBoardTableEntrySelected(entry) ? 'true' : 'false');
  row.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest && target.closest('button, select, input, textarea, a')) {
      return;
    }

    toggleEditCardModal(entry.cardPath);
  });

  row.appendChild(createBoardTableSelectionCell(entry, visibleEntries));
  row.appendChild(await createBoardTableStartCell(entry));
  row.appendChild(await createBoardTableDueCell(entry));
  row.appendChild(createBoardTableTimestampCell(entry, 'updatedAt'));
  row.appendChild(createBoardTableTimestampCell(entry, 'createdAt'));
  row.appendChild(createBoardTableTaskCell(entry));
  row.appendChild(createBoardTableLinkedObjectsCell(entry));
  row.appendChild(createBoardTableTitleCell(entry));
  row.appendChild(createBoardTableListCell(entry, listOptions));
  row.appendChild(createBoardTableLabelsCell(entry));

  return row;
}

function createBoardTableSummary(visibleCount, totalCount) {
  const summary = document.createElement('p');
  summary.className = 'board-table-summary';

  const cardLabel = visibleCount === 1 ? 'card' : 'cards';
  summary.textContent = visibleCount === totalCount
    ? `${visibleCount} ${cardLabel}`
    : `${visibleCount} of ${totalCount} ${totalCount === 1 ? 'card' : 'cards'}`;

  return summary;
}

function createBoardTableEmptyState(totalCount) {
  const empty = document.createElement('div');
  empty.className = 'board-table-empty';
  empty.textContent = totalCount > 0
    ? 'No cards match the current filters.'
    : 'No cards yet.';
  return empty;
}

async function renderTableBoard(boardRoot, listsWithCards) {
  const tableState = await collectBoardTableCards(boardRoot, listsWithCards);
  const listOptions = getBoardTableListOptions(tableState.listEntries);
  const visibleCards = sortBoardTableCards(tableState.visibleCards);
  pruneBoardTableSelection(visibleCards);
  const selectedEntries = getBoardTableSelectedEntries(visibleCards);

  const tableView = document.createElement('section');
  tableView.className = 'board-table-view';

  const tableHeader = document.createElement('div');
  tableHeader.className = 'board-table-header';
  const tableHeaderLeft = document.createElement('div');
  tableHeaderLeft.className = 'board-table-header-left';
  if (selectedEntries.length > 0) {
    tableHeaderLeft.appendChild(createBoardTableBulkToolbar(selectedEntries, visibleCards, listOptions));
  }
  const tableHeaderRight = document.createElement('div');
  tableHeaderRight.className = 'board-table-header-right';
  tableHeaderRight.appendChild(createBoardTableListFilterControl(tableState.listEntries));
  tableHeaderRight.appendChild(createBoardTableSortControl());
  tableHeaderRight.appendChild(createBoardTableSummary(
    tableState.visibleCards.length,
    tableState.allCards.length,
  ));
  tableHeader.appendChild(tableHeaderLeft);
  tableHeader.appendChild(tableHeaderRight);
  tableView.appendChild(tableHeader);

  if (tableState.visibleCards.length === 0) {
    tableView.appendChild(createBoardTableEmptyState(tableState.allCards.length));
    return {
      root: tableView,
      listEntries: tableState.listEntries,
      allCards: tableState.allCards,
      visibleCards: tableState.visibleCards,
    };
  }

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'board-table-scroll';

  const table = document.createElement('table');
  table.className = 'board-table';
  table.appendChild(createBoardTableHeader(visibleCards));

  const tbody = document.createElement('tbody');
  const rows = await Promise.all(
    visibleCards.map((entry) => createBoardTableRow(entry, listOptions, visibleCards)),
  );

  for (const row of rows) {
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  tableView.appendChild(scrollWrap);

  return {
    root: tableView,
    listEntries: tableState.listEntries,
    allCards: tableState.allCards,
    visibleCards: tableState.visibleCards,
  };
}
