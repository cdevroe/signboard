const PLANNER_VIEW_IDS = Object.freeze({
  CALENDAR: 'calendar',
  THIS_WEEK: 'this-week',
  DAY: 'day',
  AGENDA: 'agenda',
});

const PLANNER_VIEW_OPTIONS = Object.freeze([
  { id: PLANNER_VIEW_IDS.CALENDAR, label: 'Calendar', shortcutAction: 'calendarView' },
  { id: PLANNER_VIEW_IDS.THIS_WEEK, label: 'This Week', shortcutAction: 'thisWeekView' },
  { id: PLANNER_VIEW_IDS.DAY, label: 'Day', shortcutAction: 'plannerDayView' },
  { id: PLANNER_VIEW_IDS.AGENDA, label: 'Agenda', shortcutAction: 'plannerAgendaView' },
]);

const PLANNER_VIEW_ICON_BY_ID = Object.freeze({
  [PLANNER_VIEW_IDS.CALENDAR]: 'calendar',
  [PLANNER_VIEW_IDS.THIS_WEEK]: 'clock',
  [PLANNER_VIEW_IDS.DAY]: 'sun',
  [PLANNER_VIEW_IDS.AGENDA]: 'list',
});

function getPlannerState() {
  if (!window.__plannerViewState) {
    window.__plannerViewState = {
      controlsInitialized: false,
      isOpen: false,
      activeView: PLANNER_VIEW_IDS.CALENDAR,
      calendarCursor: createMonthCursorDate(),
      weekCursor: createWeekCursorDate(),
      dayCursor: createPlannerDayCursorDate(),
      requestId: 0,
      activeSortables: [],
      searchQuery: '',
      searchTokens: [],
      searchRenderTimer: null,
      dateFilter: BOARD_DATE_FILTER_NONE,
      showCompletedCards: false,
      selectedBoardRoots: new Set(),
      boardFilterTouched: false,
      selectedLabelIds: [],
      dayHeadingFormatter: new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      agendaHeadingFormatter: new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  }

  return window.__plannerViewState;
}

function normalizePlannerViewId(viewId) {
  const normalized = String(viewId || '').trim().toLowerCase();
  if (normalized === PLANNER_VIEW_IDS.THIS_WEEK) {
    return PLANNER_VIEW_IDS.THIS_WEEK;
  }
  if (normalized === PLANNER_VIEW_IDS.DAY) {
    return PLANNER_VIEW_IDS.DAY;
  }
  if (normalized === PLANNER_VIEW_IDS.AGENDA) {
    return PLANNER_VIEW_IDS.AGENDA;
  }
  return PLANNER_VIEW_IDS.CALENDAR;
}

function createPlannerDayCursorDate(dateValue) {
  const source = dateValue instanceof Date ? dateValue : new Date();
  return new Date(source.getFullYear(), source.getMonth(), source.getDate());
}

function getPlannerOpenBoardRoots() {
  if (typeof getStoredOpenBoards !== 'function') {
    return [];
  }

  return getStoredOpenBoards();
}

function getPlannerSelectedBoardRoots() {
  const state = getPlannerState();
  const openBoards = getPlannerOpenBoardRoots();
  if (openBoards.length === 0) {
    state.selectedBoardRoots = new Set();
    state.boardFilterTouched = false;
    state.selectedLabelIds = [];
    return [];
  }

  if (!state.boardFilterTouched) {
    state.selectedBoardRoots = new Set(openBoards);
    return openBoards;
  }

  const selectedOpenBoards = openBoards.filter((boardRoot) => state.selectedBoardRoots.has(boardRoot));
  state.selectedBoardRoots = new Set(selectedOpenBoards);
  if (!canUsePlannerLabelFiltersForBoards(selectedOpenBoards)) {
    state.selectedLabelIds = [];
  }
  return selectedOpenBoards;
}

function getPlannerCurrentBoardRoot() {
  return normalizeBoardPath(window.boardRoot || '');
}

function canUsePlannerLabelFiltersForBoards(boardRoots) {
  const selectedBoards = Array.isArray(boardRoots) ? boardRoots : [];
  const currentBoardRoot = getPlannerCurrentBoardRoot();
  return selectedBoards.length === 1 && currentBoardRoot && selectedBoards[0] === currentBoardRoot;
}

function canUsePlannerLabelFilters() {
  return canUsePlannerLabelFiltersForBoards(getPlannerSelectedBoardRoots());
}

function getPlannerScopeMode() {
  const openBoards = getPlannerOpenBoardRoots();
  const selectedBoards = getPlannerSelectedBoardRoots();
  const currentBoardRoot = getPlannerCurrentBoardRoot();
  if (openBoards.length > 0 && selectedBoards.length === openBoards.length) {
    return 'all';
  }
  if (selectedBoards.length === 1 && currentBoardRoot && selectedBoards[0] === currentBoardRoot) {
    return 'current';
  }
  return 'custom';
}

function applyPlannerScope(scopeValue) {
  const normalizedScope = String(scopeValue || '').trim().toLowerCase();
  const state = getPlannerState();
  const openBoards = getPlannerOpenBoardRoots();
  const currentBoardRoot = getPlannerCurrentBoardRoot();

  if (normalizedScope === 'current' && currentBoardRoot && openBoards.includes(currentBoardRoot)) {
    state.selectedBoardRoots = new Set([currentBoardRoot]);
    state.boardFilterTouched = true;
  } else {
    state.selectedBoardRoots = new Set(openBoards);
    state.boardFilterTouched = false;
    state.selectedLabelIds = [];
  }

  if (!canUsePlannerLabelFilters()) {
    state.selectedLabelIds = [];
  }
}

function getPlannerActiveView() {
  return normalizePlannerViewId(getPlannerState().activeView);
}

function getPlannerActiveDateFilter() {
  const normalized = String(getPlannerState().dateFilter || '').trim();
  if (normalized === BOARD_DATE_FILTER_TODAY || normalized === BOARD_DATE_FILTER_OVERDUE) {
    return normalized;
  }

  return BOARD_DATE_FILTER_NONE;
}

function getPlannerShowCompletedCards() {
  return getPlannerState().showCompletedCards === true;
}

function isPlannerOpen() {
  return Boolean(getPlannerState().isOpen);
}

function destroyPlannerSortables() {
  const state = getPlannerState();
  for (const sortable of state.activeSortables) {
    if (sortable && typeof sortable.destroy === 'function') {
      sortable.destroy();
    }
  }
  state.activeSortables = [];
}

function storePlannerSortables(sortables) {
  getPlannerState().activeSortables = Array.isArray(sortables)
    ? sortables.filter(Boolean)
    : [];
}

function isCurrentPlannerRenderRequest(requestId) {
  return getPlannerState().requestId === requestId;
}

function getPlannerViewIconMarkup(viewId, size = 16) {
  const normalizedViewId = normalizePlannerViewId(viewId);
  const iconName = PLANNER_VIEW_ICON_BY_ID[normalizedViewId] || PLANNER_VIEW_ICON_BY_ID[PLANNER_VIEW_IDS.CALENDAR];
  if (
    window.feather &&
    window.feather.icons &&
    typeof window.feather.icons[iconName]?.toSvg === 'function'
  ) {
    return window.feather.icons[iconName].toSvg({
      width: size,
      height: size,
      stroke: 'currentColor',
    });
  }

  return `<i data-feather="${iconName}" aria-hidden="true"></i>`;
}

function getPlannerScopeIconMarkup(iconName, size = 14) {
  const normalizedIconName = String(iconName || '').trim() || 'layers';
  if (
    window.feather &&
    window.feather.icons &&
    typeof window.feather.icons[normalizedIconName]?.toSvg === 'function'
  ) {
    return window.feather.icons[normalizedIconName].toSvg({
      width: size,
      height: size,
      stroke: 'currentColor',
    });
  }

  return `<i data-feather="${normalizedIconName}" aria-hidden="true"></i>`;
}

function setPlannerActiveView(viewId, options = {}) {
  const state = getPlannerState();
  state.activeView = normalizePlannerViewId(viewId);
  renderPlannerViewControls();
  closePlannerFilterPopover();

  if (options.render === false || !state.isOpen) {
    return;
  }

  renderPlannerView().catch((error) => {
    console.error('Failed to render Planner after changing view.', error);
  });
}

function setPlannerCalendarCursorDate(dateValue) {
  const state = getPlannerState();
  state.calendarCursor = createMonthCursorDate(dateValue);
  return createMonthCursorDate(state.calendarCursor);
}

function getPlannerCalendarCursorDate() {
  const state = getPlannerState();
  if (!(state.calendarCursor instanceof Date) || Number.isNaN(state.calendarCursor.getTime())) {
    state.calendarCursor = createMonthCursorDate();
  }

  return createMonthCursorDate(state.calendarCursor);
}

function shiftPlannerCalendarMonth(monthDelta) {
  const currentCursor = getPlannerCalendarCursorDate();
  return setPlannerCalendarCursorDate(new Date(
    currentCursor.getFullYear(),
    currentCursor.getMonth() + (Number(monthDelta) || 0),
    1,
  ));
}

function setPlannerCalendarToToday() {
  return setPlannerCalendarCursorDate(new Date());
}

function setPlannerWeekCursorDate(dateValue) {
  const state = getPlannerState();
  state.weekCursor = createWeekCursorDate(dateValue);
  return createWeekCursorDate(state.weekCursor);
}

function getPlannerWeekCursorDate() {
  const state = getPlannerState();
  if (!(state.weekCursor instanceof Date) || Number.isNaN(state.weekCursor.getTime())) {
    state.weekCursor = createWeekCursorDate();
  }

  return createWeekCursorDate(state.weekCursor);
}

function shiftPlannerWeek(weekDelta) {
  const currentWeek = getPlannerWeekCursorDate();
  return setPlannerWeekCursorDate(new Date(
    currentWeek.getFullYear(),
    currentWeek.getMonth(),
    currentWeek.getDate() + ((Number(weekDelta) || 0) * 7),
  ));
}

function setPlannerWeekToToday() {
  return setPlannerWeekCursorDate(new Date());
}

function setPlannerDayCursorDate(dateValue) {
  const state = getPlannerState();
  state.dayCursor = createPlannerDayCursorDate(dateValue);
  return createPlannerDayCursorDate(state.dayCursor);
}

function getPlannerDayCursorDate() {
  const state = getPlannerState();
  if (!(state.dayCursor instanceof Date) || Number.isNaN(state.dayCursor.getTime())) {
    state.dayCursor = createPlannerDayCursorDate();
  }

  return createPlannerDayCursorDate(state.dayCursor);
}

function shiftPlannerDay(dayDelta) {
  const currentDay = getPlannerDayCursorDate();
  return setPlannerDayCursorDate(new Date(
    currentDay.getFullYear(),
    currentDay.getMonth(),
    currentDay.getDate() + (Number(dayDelta) || 0),
  ));
}

function setPlannerDayToToday() {
  return setPlannerDayCursorDate(new Date());
}

function setPlannerSearchQuery(value) {
  const state = getPlannerState();
  const normalized = normalizeSearchQuery(value);
  state.searchQuery = normalized;
  state.searchTokens = normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean) : [];
}

function getPlannerSearchQuery() {
  return getPlannerState().searchQuery;
}

function plannerCardMatchesSearch(cardEntry) {
  const tokens = getPlannerState().searchTokens;
  if (tokens.length === 0) {
    return true;
  }

  const haystack = [
    cardEntry && cardEntry.title,
    cardEntry && cardEntry.body,
    cardEntry && cardEntry.boardDisplayName,
    cardEntry && cardEntry.listDisplayName,
  ].map((value) => String(value || '')).join('\n').toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

function plannerCardMatchesLabelFilter(cardEntry) {
  const selectedLabelIds = getPlannerSelectedLabelIds();
  if (selectedLabelIds.length === 0) {
    return true;
  }

  const cardLabelIds = cardEntry && Array.isArray(cardEntry.labels)
    ? cardEntry.labels
    : [];
  if (typeof cardMatchesLabelFilter === 'function') {
    return cardMatchesLabelFilter(cardLabelIds, selectedLabelIds);
  }

  const selected = new Set(selectedLabelIds);
  return cardLabelIds.some((labelId) => selected.has(String(labelId)));
}

function schedulePlannerRender() {
  const state = getPlannerState();
  if (state.searchRenderTimer) {
    clearTimeout(state.searchRenderTimer);
  }

  state.searchRenderTimer = setTimeout(() => {
    state.searchRenderTimer = null;
    if (!state.isOpen) {
      return;
    }

    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after search.', error);
    });
  }, 150);
}

async function flushPlannerSearchRender() {
  const state = getPlannerState();
  if (state.searchRenderTimer) {
    clearTimeout(state.searchRenderTimer);
    state.searchRenderTimer = null;
  }

  if (!state.isOpen) {
    return;
  }

  await renderPlannerView();
}

function isPlannerSearchResultElementVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function getPlannerSearchResultButtons() {
  const selectors = [
    '.planner-calendar-card',
    '.planner-this-week-card',
    '.planner-list-card',
  ];

  return Array.from(document.querySelectorAll(selectors.join(',')))
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => !button.disabled)
    .filter(isPlannerSearchResultElementVisible);
}

function focusPlannerSearchResultButton(button) {
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

function focusPlannerSearchResultByIndex(index) {
  const resultButtons = getPlannerSearchResultButtons();
  if (resultButtons.length === 0) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('No matching planner cards.');
    }
    return false;
  }

  const safeIndex = ((index % resultButtons.length) + resultButtons.length) % resultButtons.length;
  return focusPlannerSearchResultButton(resultButtons[safeIndex]);
}

function focusFirstPlannerSearchResult() {
  return focusPlannerSearchResultByIndex(0);
}

function focusLastPlannerSearchResult() {
  return focusPlannerSearchResultByIndex(getPlannerSearchResultButtons().length - 1);
}

function movePlannerSearchResultFocus(offset) {
  const resultButtons = getPlannerSearchResultButtons();
  if (resultButtons.length === 0) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('No matching planner cards.');
    }
    return false;
  }

  const currentIndex = resultButtons.indexOf(document.activeElement);
  const fallbackIndex = Number(offset) < 0 ? resultButtons.length - 1 : 0;
  const nextIndex = currentIndex >= 0 ? currentIndex + Number(offset || 0) : fallbackIndex;
  return focusPlannerSearchResultByIndex(nextIndex);
}

function focusPlannerSearchInputForKeyboardNavigation(options = {}) {
  const searchInput = document.getElementById('plannerSearchInput');
  if (!searchInput || !isPlannerOpen()) {
    return false;
  }

  searchInput.focus();
  if (options.select !== false && typeof searchInput.select === 'function') {
    searchInput.select();
  }

  return true;
}

async function clearPlannerSearchFromKeyboard(searchInput) {
  if (!searchInput || (!searchInput.value && !getPlannerSearchQuery())) {
    return false;
  }

  searchInput.value = '';
  setPlannerSearchQuery('');
  await flushPlannerSearchRender();
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus('Planner search cleared.');
  }
  return true;
}

async function handlePlannerSearchInputKeydown(event) {
  if (!event) {
    return;
  }

  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    await flushPlannerSearchRender();

    if (event.key === 'ArrowUp') {
      focusLastPlannerSearchResult();
      return;
    }

    focusFirstPlannerSearchResult();
    return;
  }

  if (event.key === 'Escape') {
    const shouldClear = Boolean(event.target && (event.target.value || getPlannerSearchQuery()));
    if (shouldClear) {
      event.preventDefault();
      event.stopPropagation();
      await clearPlannerSearchFromKeyboard(event.target);
    }
  }
}

function isPlannerSearchResultNavigationTarget(target) {
  return Boolean(
    target instanceof HTMLButtonElement &&
    (
      target.classList.contains('planner-calendar-card') ||
      target.classList.contains('planner-this-week-card') ||
      target.classList.contains('planner-list-card')
    )
  );
}

function handlePlannerSearchResultKeydown(event) {
  if (!event || !isPlannerSearchResultNavigationTarget(event.target)) {
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    movePlannerSearchResultFocus(1);
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    movePlannerSearchResultFocus(-1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    focusFirstPlannerSearchResult();
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    focusLastPlannerSearchResult();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    focusPlannerSearchInputForKeyboardNavigation();
  }
}

function setPlannerDateFilter(filterValue) {
  const normalized = String(filterValue || '').trim();
  const state = getPlannerState();
  state.dateFilter = (normalized === BOARD_DATE_FILTER_TODAY || normalized === BOARD_DATE_FILTER_OVERDUE)
    ? normalized
    : BOARD_DATE_FILTER_NONE;
  renderPlannerViewControls();
  renderPlannerFilterPopover();
  if (state.isOpen) {
    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after filter change.', error);
    });
  }
}

function setPlannerShowCompletedCards(showCompletedCards) {
  const state = getPlannerState();
  state.showCompletedCards = Boolean(showCompletedCards);
  renderPlannerViewControls();
  renderPlannerFilterPopover();
  if (state.isOpen) {
    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after completed-card filter change.', error);
    });
  }
}

function setPlannerBoardSelected(boardRoot, isSelected) {
  const normalizedBoardRoot = normalizeBoardPath(boardRoot);
  if (!normalizedBoardRoot) {
    return;
  }

  const state = getPlannerState();
  const nextSelected = new Set(getPlannerSelectedBoardRoots());
  if (isSelected) {
    nextSelected.add(normalizedBoardRoot);
  } else {
    nextSelected.delete(normalizedBoardRoot);
  }

  state.selectedBoardRoots = nextSelected;
  state.boardFilterTouched = true;
  if (!canUsePlannerLabelFiltersForBoards(getPlannerOpenBoardRoots().filter((openBoardRoot) => nextSelected.has(openBoardRoot)))) {
    state.selectedLabelIds = [];
  }
  renderPlannerViewControls();
  renderPlannerFilterPopover();
  if (state.isOpen) {
    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after board filter change.', error);
    });
  }
}

function setPlannerScope(scopeValue) {
  const state = getPlannerState();
  applyPlannerScope(scopeValue);

  renderPlannerViewControls();
  renderPlannerFilterPopover();
  if (state.isOpen) {
    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after scope change.', error);
    });
  }
}

function getPlannerSelectedLabelIds() {
  const state = getPlannerState();
  if (!canUsePlannerLabelFilters()) {
    state.selectedLabelIds = [];
    return [];
  }

  const boardLabels = typeof getBoardLabels === 'function' ? getBoardLabels() : [];
  const validIds = new Set(
    (Array.isArray(boardLabels) ? boardLabels : [])
      .map((label) => String(label && label.id || '').trim())
      .filter(Boolean),
  );
  state.selectedLabelIds = state.selectedLabelIds.filter((labelId) => validIds.has(labelId));
  return state.selectedLabelIds.slice();
}

function setPlannerLabelSelected(labelId, isSelected) {
  const normalizedLabelId = String(labelId || '').trim();
  if (!normalizedLabelId || !canUsePlannerLabelFilters()) {
    return;
  }

  const state = getPlannerState();
  const nextSelected = new Set(getPlannerSelectedLabelIds());
  if (isSelected) {
    nextSelected.add(normalizedLabelId);
  } else {
    nextSelected.delete(normalizedLabelId);
  }
  state.selectedLabelIds = Array.from(nextSelected);
  renderPlannerViewControls();
  renderPlannerFilterPopover();
  if (state.isOpen) {
    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after label filter change.', error);
    });
  }
}

function clearPlannerFilters() {
  const state = getPlannerState();
  state.dateFilter = BOARD_DATE_FILTER_NONE;
  state.showCompletedCards = false;
  state.boardFilterTouched = false;
  state.selectedBoardRoots = new Set(getPlannerOpenBoardRoots());
  state.selectedLabelIds = [];
  renderPlannerViewControls();
  renderPlannerFilterPopover();
  if (state.isOpen) {
    renderPlannerView().catch((error) => {
      console.error('Failed to render Planner after clearing filters.', error);
    });
  }
}

function getPlannerVisibleDueDatesForEntry(cardEntry) {
  if (!cardEntry || !plannerCardMatchesSearch(cardEntry) || !plannerCardMatchesLabelFilter(cardEntry)) {
    return [];
  }

  if (cardEntry.isCompletedList && !getPlannerShowCompletedCards()) {
    return [];
  }

  const activeFilter = getPlannerActiveDateFilter();
  return getTemporalDueDatesForEntry(cardEntry)
    .filter((dateValue) => doesBoardDateFilterMatchDueDate(dateValue, activeFilter))
    .sort();
}

function buildPlannerCalendarCardBuckets(cardEntries, monthCursor) {
  const entries = Array.isArray(cardEntries) ? cardEntries : [];
  const buckets = new Map();

  for (const entry of entries) {
    for (const dueDateValue of getPlannerVisibleDueDatesForEntry(entry)) {
      if (!isIsoDateWithinMonth(dueDateValue, monthCursor)) {
        continue;
      }

      const placement = createTemporalPlacementForDate(entry, dueDateValue);
      if (!placement) {
        continue;
      }

      if (!buckets.has(dueDateValue)) {
        buckets.set(dueDateValue, []);
      }
      buckets.get(dueDateValue).push(placement);
    }
  }

  for (const cards of buckets.values()) {
    cards.sort(comparePlannerTemporalCards);
  }

  return buckets;
}

function buildPlannerWeekCardBuckets(cardEntries, weekStartDate) {
  const entries = Array.isArray(cardEntries) ? cardEntries : [];
  const buckets = new Map();

  for (const entry of entries) {
    for (const dueDateValue of getPlannerVisibleDueDatesForEntry(entry)) {
      if (!isIsoDateWithinWeek(dueDateValue, weekStartDate)) {
        continue;
      }

      const placement = createTemporalPlacementForDate(entry, dueDateValue);
      if (!placement) {
        continue;
      }

      if (!buckets.has(dueDateValue)) {
        buckets.set(dueDateValue, []);
      }
      buckets.get(dueDateValue).push(placement);
    }
  }

  for (const cards of buckets.values()) {
    cards.sort(comparePlannerTemporalCards);
  }

  return buckets;
}

function buildPlannerPlacementsForDate(cardEntries, isoDate) {
  const entries = Array.isArray(cardEntries) ? cardEntries : [];
  const placements = [];

  for (const entry of entries) {
    if (!getPlannerVisibleDueDatesForEntry(entry).includes(isoDate)) {
      continue;
    }

    const placement = createTemporalPlacementForDate(entry, isoDate);
    if (placement) {
      placements.push(placement);
    }
  }

  return placements.sort(comparePlannerTemporalCards);
}

function buildPlannerAgendaPlacements(cardEntries) {
  const entries = Array.isArray(cardEntries) ? cardEntries : [];
  const placements = [];

  for (const entry of entries) {
    for (const dueDateValue of getPlannerVisibleDueDatesForEntry(entry)) {
      const placement = createTemporalPlacementForDate(entry, dueDateValue);
      if (placement) {
        placements.push({
          ...placement,
          agendaDate: dueDateValue,
        });
      }
    }
  }

  return placements.sort((a, b) => {
    const dateCompare = String(a.agendaDate || '').localeCompare(String(b.agendaDate || ''));
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return comparePlannerTemporalCards(a, b);
  });
}

function comparePlannerTemporalCards(a, b) {
  const sourceA = `${String(a.boardDisplayName || '')}\n${String(a.listDisplayName || '')}\n${String(a.temporalDisplayTitle || a.title || '')}`;
  const sourceB = `${String(b.boardDisplayName || '')}\n${String(b.listDisplayName || '')}\n${String(b.temporalDisplayTitle || b.title || '')}`;
  return sourceA.localeCompare(sourceB, undefined, { sensitivity: 'base' });
}

async function collectPlannerCardsForBoard(boardRoot) {
  const normalizedBoardRoot = normalizeBoardPath(boardRoot);
  if (!normalizedBoardRoot || !window.board) {
    return {
      boardRoot: normalizedBoardRoot,
      boardDisplayName: getBoardLabelFromPath(normalizedBoardRoot),
      cards: [],
      error: null,
    };
  }

  const fallbackBoardName = getBoardLabelFromPath(normalizedBoardRoot);
  try {
    const [boardDisplayName, lists, boardSettings] = await Promise.all([
      Promise.resolve(window.board.getBoardName(normalizedBoardRoot)).catch(() => fallbackBoardName),
      window.board.listLists(normalizedBoardRoot),
      typeof window.board.readBoardSettings === 'function'
        ? window.board.readBoardSettings(normalizedBoardRoot).catch(() => ({}))
        : Promise.resolve({}),
    ]);
    const boardSourceTheme = typeof getBoardTemporalSourceTheme === 'function'
      ? getBoardTemporalSourceTheme(boardSettings || {})
      : null;
    const cards = await collectCardsForCalendar(normalizedBoardRoot, lists, {
      boardDisplayName: boardDisplayName || fallbackBoardName,
      workflowSettings: boardSettings && boardSettings.workflow,
      boardSourceTheme,
      boardColorScheme: boardSettings && typeof boardSettings.colorScheme === 'string'
        ? boardSettings.colorScheme
        : '',
    });
    return {
      boardRoot: normalizedBoardRoot,
      boardDisplayName: boardDisplayName || fallbackBoardName,
      cards,
      error: null,
    };
  } catch (error) {
    return {
      boardRoot: normalizedBoardRoot,
      boardDisplayName: fallbackBoardName,
      cards: [],
      error,
    };
  }
}

async function collectPlannerCards() {
  const selectedBoards = getPlannerSelectedBoardRoots();
  const boardResults = await Promise.all(selectedBoards.map((boardRoot) => collectPlannerCardsForBoard(boardRoot)));
  return {
    cards: boardResults.flatMap((result) => result.cards || []),
    errors: boardResults.filter((result) => result.error),
  };
}

async function openPlannerCard(cardEntry) {
  if (!cardEntry || !cardEntry.cardPath) {
    return;
  }

  const cardBoardRoot = normalizeBoardPath(cardEntry.boardRoot);
  if (
    cardBoardRoot &&
    normalizeBoardPath(window.boardRoot) !== cardBoardRoot &&
    typeof switchToBoardPath === 'function'
  ) {
    await switchToBoardPath(cardBoardRoot);
  }

  await toggleEditCardModal(cardEntry.cardPath);
}

function createPlannerTemporalCard(cardEntry, isoDate, className) {
  return createTemporalCardElement(cardEntry, isoDate, className, {
    onOpenCard: (entry) => {
      openPlannerCard(entry).catch((error) => {
        console.error('Failed to open Planner card.', error);
      });
    },
  });
}

async function handlePlannerCardDrop(evt, rangePredicate) {
  const draggedCard = evt && evt.item;
  if (!(draggedCard instanceof HTMLElement)) {
    return;
  }

  const cardPath = String(draggedCard.dataset.path || '').trim();
  const sourceDate = String(evt && evt.from && evt.from.dataset ? evt.from.dataset.date : '').trim();
  const targetDate = String(evt && evt.to && evt.to.dataset ? evt.to.dataset.date : '').trim();
  if (!cardPath || !targetDate || sourceDate === targetDate) {
    return;
  }

  if (typeof rangePredicate === 'function' && !rangePredicate(targetDate)) {
    await renderPlannerView();
    return;
  }

  try {
    await window.board.updateFrontmatter(cardPath, { due: targetDate });
    draggedCard.dataset.due = targetDate;
  } catch (error) {
    console.error('Failed to move Planner card to a new date.', error);
    await renderPlannerView();
  }
}

function createPlannerCalendarHeader(monthCursor) {
  const header = document.createElement('div');
  header.className = 'board-calendar-header board-calendar-header--month planner-date-header';

  const navigation = document.createElement('div');
  navigation.className = 'board-calendar-nav';

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'board-calendar-nav-button';
  previousButton.title = 'Previous month';
  previousButton.setAttribute('aria-label', 'Previous month');
  previousButton.innerHTML = '<i data-feather="chevron-left"></i>';
  previousButton.addEventListener('click', () => {
    shiftPlannerCalendarMonth(-1);
    renderPlannerView().catch((error) => {
      console.error('Failed to render previous Planner month.', error);
    });
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'board-calendar-nav-button';
  nextButton.title = 'Next month';
  nextButton.setAttribute('aria-label', 'Next month');
  nextButton.innerHTML = '<i data-feather="chevron-right"></i>';
  nextButton.addEventListener('click', () => {
    shiftPlannerCalendarMonth(1);
    renderPlannerView().catch((error) => {
      console.error('Failed to render next Planner month.', error);
    });
  });

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className = 'board-calendar-today-button';
  todayButton.textContent = 'Today';
  todayButton.title = 'Jump to current month';
  todayButton.disabled = isCurrentCalendarMonth(monthCursor);
  todayButton.addEventListener('click', () => {
    setPlannerCalendarToToday();
    renderPlannerView().catch((error) => {
      console.error('Failed to render current Planner month.', error);
    });
  });

  const monthLabel = document.createElement('h2');
  monthLabel.className = 'board-calendar-month-label';
  monthLabel.textContent = formatCalendarMonthLabel(monthCursor);

  navigation.appendChild(previousButton);
  navigation.appendChild(nextButton);
  navigation.appendChild(todayButton);
  header.appendChild(navigation);
  header.appendChild(monthLabel);
  return header;
}

function createPlannerWeekHeader(weekStartDate) {
  const header = document.createElement('div');
  header.className = 'board-calendar-header board-calendar-header--week planner-date-header';

  const navigation = document.createElement('div');
  navigation.className = 'board-calendar-nav';

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'board-calendar-nav-button';
  previousButton.title = 'Previous week';
  previousButton.setAttribute('aria-label', 'Previous week');
  previousButton.innerHTML = '<i data-feather="chevron-left"></i>';
  previousButton.addEventListener('click', () => {
    shiftPlannerWeek(-1);
    renderPlannerView().catch((error) => {
      console.error('Failed to render previous Planner week.', error);
    });
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'board-calendar-nav-button';
  nextButton.title = 'Next week';
  nextButton.setAttribute('aria-label', 'Next week');
  nextButton.innerHTML = '<i data-feather="chevron-right"></i>';
  nextButton.addEventListener('click', () => {
    shiftPlannerWeek(1);
    renderPlannerView().catch((error) => {
      console.error('Failed to render next Planner week.', error);
    });
  });

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className = 'board-calendar-today-button';
  todayButton.textContent = 'Today';
  todayButton.title = 'Jump to current week';
  todayButton.disabled = isCurrentWeek(weekStartDate);
  todayButton.addEventListener('click', () => {
    setPlannerWeekToToday();
    renderPlannerView().catch((error) => {
      console.error('Failed to render current Planner week.', error);
    });
  });

  const weekLabel = document.createElement('h2');
  weekLabel.className = 'board-calendar-month-label';
  weekLabel.textContent = `Week of ${formatWeekRangeLabel(weekStartDate)}`;

  navigation.appendChild(previousButton);
  navigation.appendChild(nextButton);
  navigation.appendChild(todayButton);
  header.appendChild(navigation);
  header.appendChild(weekLabel);
  return header;
}

function createPlannerDayHeader(dayDate) {
  const header = document.createElement('div');
  header.className = 'board-calendar-header planner-date-header';

  const navigation = document.createElement('div');
  navigation.className = 'board-calendar-nav';

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'board-calendar-nav-button';
  previousButton.title = 'Previous day';
  previousButton.setAttribute('aria-label', 'Previous day');
  previousButton.innerHTML = '<i data-feather="chevron-left"></i>';
  previousButton.addEventListener('click', () => {
    shiftPlannerDay(-1);
    renderPlannerView().catch((error) => {
      console.error('Failed to render previous Planner day.', error);
    });
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'board-calendar-nav-button';
  nextButton.title = 'Next day';
  nextButton.setAttribute('aria-label', 'Next day');
  nextButton.innerHTML = '<i data-feather="chevron-right"></i>';
  nextButton.addEventListener('click', () => {
    shiftPlannerDay(1);
    renderPlannerView().catch((error) => {
      console.error('Failed to render next Planner day.', error);
    });
  });

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className = 'board-calendar-today-button';
  todayButton.textContent = 'Today';
  todayButton.title = 'Jump to today';
  todayButton.disabled = formatIsoLocalDate(dayDate) === formatIsoLocalDate(new Date());
  todayButton.addEventListener('click', () => {
    setPlannerDayToToday();
    renderPlannerView().catch((error) => {
      console.error('Failed to render current Planner day.', error);
    });
  });

  const dayLabel = document.createElement('h2');
  dayLabel.className = 'board-calendar-month-label';
  dayLabel.textContent = getPlannerState().dayHeadingFormatter.format(dayDate);

  navigation.appendChild(previousButton);
  navigation.appendChild(nextButton);
  navigation.appendChild(todayButton);
  header.appendChild(navigation);
  header.appendChild(dayLabel);
  return header;
}

function createPlannerEmptyState(message) {
  const emptyEl = document.createElement('div');
  emptyEl.className = 'planner-empty-state';
  emptyEl.textContent = message;
  return emptyEl;
}

function renderPlannerCalendarView(container, cardEntries) {
  const monthCursor = getPlannerCalendarCursorDate();
  const cardsByDate = buildPlannerCalendarCardBuckets(cardEntries, monthCursor);

  const calendarEl = document.createElement('section');
  calendarEl.className = 'planner-view planner-calendar board-calendar';
  calendarEl.appendChild(createPlannerCalendarHeader(monthCursor));
  calendarEl.appendChild(createCalendarWeekdayHeader());

  const grid = document.createElement('div');
  grid.className = 'board-calendar-grid';

  const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const mondayFirstOffset = (firstOfMonth.getDay() + 6) % 7;
  const totalCells = getCalendarGridCellCount(monthCursor);
  const todayIso = formatIsoLocalDate(new Date());
  const sortableContainers = [];

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const weekdayIndex = cellIndex % 7;
    const isWeekend = weekdayIndex >= 5;
    const dayNumber = cellIndex - mondayFirstOffset + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      grid.appendChild(createCalendarEmptyCell(isWeekend));
      continue;
    }

    const cellDate = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNumber);
    const isoDate = formatIsoLocalDate(cellDate);
    const cardsForDay = cardsByDate.get(isoDate) || [];
    const { dayCell, cardsWrap } = createCalendarDayCell({
      isoDate,
      monthCursor,
      isToday: isoDate === todayIso,
      isWeekend,
      cardsForDay,
      cardClassName: 'board-calendar-card planner-calendar-card',
      cardOptions: {
        onOpenCard: (entry) => {
          openPlannerCard(entry).catch((error) => {
            console.error('Failed to open Planner calendar card.', error);
          });
        },
      },
    });

    sortableContainers.push(cardsWrap);
    grid.appendChild(dayCell);
  }

  calendarEl.appendChild(grid);
  container.appendChild(calendarEl);

  if (typeof Sortable !== 'function') {
    return [];
  }

  return sortableContainers.map((sortableContainer) => new Sortable(sortableContainer, createBoardCardSortableOptions({
    group: 'planner-calendar-cards',
    animation: 150,
    draggable: '.planner-calendar-card',
    onEnd: async (evt) => {
      await handlePlannerCardDrop(evt, (targetDate) => isIsoDateWithinMonth(targetDate, monthCursor));
    },
  })));
}

function renderPlannerWeekView(container, cardEntries) {
  const weekStartDate = getPlannerWeekCursorDate();
  const cardsByDate = buildPlannerWeekCardBuckets(cardEntries, weekStartDate);
  const todayIso = formatIsoLocalDate(new Date());

  const weekEl = document.createElement('section');
  weekEl.className = 'planner-view planner-this-week board-this-week';
  weekEl.appendChild(createPlannerWeekHeader(weekStartDate));

  const grid = document.createElement('div');
  grid.className = 'board-this-week-grid';
  const sortableContainers = [];

  const dayEntries = BOARD_CALENDAR_WEEKDAY_LABELS.map((label, index) => {
    const dayDate = new Date(
      weekStartDate.getFullYear(),
      weekStartDate.getMonth(),
      weekStartDate.getDate() + index,
    );
    const isoDate = formatIsoLocalDate(dayDate);
    return {
      index,
      dayDate,
      isoDate,
      dayLabel: label.full,
      isWeekend: index >= 5,
      isToday: isoDate === todayIso,
      cardsForDay: cardsByDate.get(isoDate) || [],
      cardClassName: 'board-this-week-card planner-this-week-card',
      cardOptions: {
        onOpenCard: (entry) => {
          openPlannerCard(entry).catch((error) => {
            console.error('Failed to open Planner week card.', error);
          });
        },
      },
    };
  });

  const mondayCell = createThisWeekDayCell({ ...dayEntries[0], extraClassName: 'day-mon' });
  const tuesdayCell = createThisWeekDayCell({ ...dayEntries[1], extraClassName: 'day-tue' });
  const wednesdayCell = createThisWeekDayCell({ ...dayEntries[2], extraClassName: 'day-wed' });
  const thursdayCell = createThisWeekDayCell({ ...dayEntries[3], extraClassName: 'day-thu' });
  const fridayCell = createThisWeekDayCell({ ...dayEntries[4], extraClassName: 'day-fri' });
  const saturdayCell = createThisWeekDayCell({ ...dayEntries[5], extraClassName: 'day-sat' });
  const sundayCell = createThisWeekDayCell({ ...dayEntries[6], extraClassName: 'day-sun' });

  const weekendWrap = document.createElement('div');
  weekendWrap.className = 'board-this-week-weekend';
  weekendWrap.appendChild(saturdayCell.dayCell);
  weekendWrap.appendChild(sundayCell.dayCell);

  grid.appendChild(mondayCell.dayCell);
  grid.appendChild(tuesdayCell.dayCell);
  grid.appendChild(wednesdayCell.dayCell);
  grid.appendChild(thursdayCell.dayCell);
  grid.appendChild(fridayCell.dayCell);
  grid.appendChild(weekendWrap);

  sortableContainers.push(
    mondayCell.cardsWrap,
    tuesdayCell.cardsWrap,
    wednesdayCell.cardsWrap,
    thursdayCell.cardsWrap,
    fridayCell.cardsWrap,
    saturdayCell.cardsWrap,
    sundayCell.cardsWrap,
  );

  weekEl.appendChild(grid);
  container.appendChild(weekEl);

  if (typeof Sortable !== 'function') {
    return [];
  }

  return sortableContainers.map((sortableContainer) => new Sortable(sortableContainer, createBoardCardSortableOptions({
    group: 'planner-week-cards',
    animation: 150,
    draggable: '.planner-this-week-card',
    onEnd: async (evt) => {
      await handlePlannerCardDrop(evt, (targetDate) => isIsoDateWithinWeek(targetDate, weekStartDate));
    },
  })));
}

function renderPlannerDayView(container, cardEntries) {
  const dayDate = getPlannerDayCursorDate();
  const isoDate = formatIsoLocalDate(dayDate);
  const placements = buildPlannerPlacementsForDate(cardEntries, isoDate);
  const dayEl = document.createElement('section');
  dayEl.className = 'planner-view planner-day';
  dayEl.appendChild(createPlannerDayHeader(dayDate));

  const listEl = document.createElement('div');
  listEl.className = 'planner-list-view';
  if (placements.length === 0) {
    listEl.appendChild(createPlannerEmptyState('No dated cards for this day.'));
  } else {
    for (const placement of placements) {
      listEl.appendChild(createPlannerTemporalCard(placement, isoDate, 'planner-list-card'));
    }
  }

  dayEl.appendChild(listEl);
  container.appendChild(dayEl);
  return [];
}

function getPlannerAgendaDateLabel(isoDate) {
  const parsedDate = parseIsoDateStringToLocalDate(isoDate);
  if (!parsedDate) {
    return isoDate;
  }

  const todayIso = formatIsoLocalDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = formatIsoLocalDate(tomorrowDate);
  if (isoDate === todayIso) {
    return `Today · ${getPlannerState().agendaHeadingFormatter.format(parsedDate)}`;
  }
  if (isoDate === tomorrowIso) {
    return `Tomorrow · ${getPlannerState().agendaHeadingFormatter.format(parsedDate)}`;
  }
  if (isoDate < todayIso) {
    return `Overdue · ${getPlannerState().agendaHeadingFormatter.format(parsedDate)}`;
  }

  return getPlannerState().agendaHeadingFormatter.format(parsedDate);
}

function renderPlannerAgendaView(container, cardEntries) {
  const placements = buildPlannerAgendaPlacements(cardEntries);
  const agendaEl = document.createElement('section');
  agendaEl.className = 'planner-view planner-agenda';

  const header = document.createElement('div');
  header.className = 'planner-agenda-header';
  const title = document.createElement('h2');
  title.textContent = 'Agenda';
  header.appendChild(title);
  agendaEl.appendChild(header);

  const listEl = document.createElement('div');
  listEl.className = 'planner-agenda-list';

  if (placements.length === 0) {
    listEl.appendChild(createPlannerEmptyState('No dated cards match this agenda.'));
  } else {
    const placementsByDate = new Map();
    for (const placement of placements) {
      const isoDate = String(placement.agendaDate || '').trim();
      if (!placementsByDate.has(isoDate)) {
        placementsByDate.set(isoDate, []);
      }
      placementsByDate.get(isoDate).push(placement);
    }

    for (const [isoDate, datePlacements] of placementsByDate.entries()) {
      const dateSection = document.createElement('section');
      dateSection.className = 'planner-agenda-date-section';
      if (isoDate < formatIsoLocalDate(new Date())) {
        dateSection.classList.add('is-overdue');
      }

      const dateHeading = document.createElement('h3');
      dateHeading.textContent = getPlannerAgendaDateLabel(isoDate);
      dateSection.appendChild(dateHeading);

      const dateCards = document.createElement('div');
      dateCards.className = 'planner-agenda-date-cards';
      for (const placement of datePlacements) {
        dateCards.appendChild(createPlannerTemporalCard(placement, isoDate, 'planner-list-card'));
      }
      dateSection.appendChild(dateCards);
      listEl.appendChild(dateSection);
    }
  }

  agendaEl.appendChild(listEl);
  container.appendChild(agendaEl);
  return [];
}

async function renderPlannerView() {
  const state = getPlannerState();
  if (!state.isOpen) {
    return;
  }

  const requestId = state.requestId + 1;
  state.requestId = requestId;

  const plannerBody = document.getElementById('plannerBody');
  if (!plannerBody) {
    return;
  }

  const { cards, errors } = await collectPlannerCards();
  if (!isCurrentPlannerRenderRequest(requestId)) {
    return;
  }

  const stagingEl = document.createElement('div');
  stagingEl.className = 'planner-staging';
  const activeView = getPlannerActiveView();
  let sortables = [];

  if (activeView === PLANNER_VIEW_IDS.THIS_WEEK) {
    sortables = renderPlannerWeekView(stagingEl, cards);
  } else if (activeView === PLANNER_VIEW_IDS.DAY) {
    sortables = renderPlannerDayView(stagingEl, cards);
  } else if (activeView === PLANNER_VIEW_IDS.AGENDA) {
    sortables = renderPlannerAgendaView(stagingEl, cards);
  } else {
    sortables = renderPlannerCalendarView(stagingEl, cards);
  }

  if (errors.length > 0) {
    const errorNotice = document.createElement('div');
    errorNotice.className = 'planner-source-warning';
    errorNotice.textContent = `${errors.length} open board${errors.length === 1 ? '' : 's'} could not be loaded.`;
    stagingEl.prepend(errorNotice);
  }

  if (!isCurrentPlannerRenderRequest(requestId)) {
    return;
  }

  destroyPlannerSortables();
  plannerBody.replaceChildren(...Array.from(stagingEl.childNodes));
  storePlannerSortables(sortables);
  renderPlannerViewControls();

  if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
    feather.replace();
  }
}

function renderPlannerViewControls() {
  const viewTabs = document.getElementById('plannerViewTabs');
  const scopeToggle = document.getElementById('plannerScopeToggle');
  const searchInput = document.getElementById('plannerSearchInput');
  const filterButton = document.getElementById('plannerFilterButton');
  const scopeLabel = document.getElementById('plannerScopeLabel');
  const closeButton = document.getElementById('plannerCloseButton');
  const activeView = getPlannerActiveView();
  const openBoards = getPlannerOpenBoardRoots();
  const selectedBoards = getPlannerSelectedBoardRoots();
  const scopeMode = getPlannerScopeMode();

  if (viewTabs) {
    viewTabs.replaceChildren();
    for (const option of PLANNER_VIEW_OPTIONS) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'planner-view-tab';
      optionButton.dataset.viewId = option.id;
      optionButton.setAttribute('aria-pressed', String(option.id === activeView));
      optionButton.setAttribute('aria-label', option.label);
      optionButton.setAttribute('title', `${option.label} (${getShortcutHintText(option.shortcutAction)})`);
      optionButton.setAttribute('aria-keyshortcuts', getShortcutAriaKeyshortcuts(option.shortcutAction));
      if (option.id === activeView) {
        optionButton.classList.add('is-active');
      }
      optionButton.innerHTML = `
        <span class="planner-view-tab-icon" aria-hidden="true">${getPlannerViewIconMarkup(option.id, 15)}</span>
        <span class="planner-view-tab-label">${option.label}</span>
      `;
      optionButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPlannerActiveView(option.id);
      });
      viewTabs.appendChild(optionButton);
    }
  }

  if (searchInput) {
    searchInput.value = getPlannerSearchQuery();
  }

  if (scopeToggle) {
    scopeToggle.replaceChildren();
    const scopeOptions = [
      { id: 'all', label: 'All Boards', icon: 'layers' },
      { id: 'current', label: 'Current Board', icon: 'columns' },
    ];
    const currentBoardRoot = getPlannerCurrentBoardRoot();

    for (const option of scopeOptions) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'planner-scope-option';
      optionButton.dataset.scope = option.id;
      const isActive = scopeMode === option.id;
      const isDisabled = option.id === 'current' && (!currentBoardRoot || !openBoards.includes(currentBoardRoot));
      optionButton.classList.toggle('is-active', isActive);
      optionButton.disabled = isDisabled;
      optionButton.setAttribute('aria-pressed', String(isActive));
      optionButton.setAttribute('aria-label', option.label);
      optionButton.innerHTML = `
        <span class="planner-scope-option-icon" aria-hidden="true">${getPlannerScopeIconMarkup(option.icon)}</span>
        <span class="planner-scope-option-label">${option.label}</span>
      `;
      optionButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPlannerScope(option.id);
      });
      scopeToggle.appendChild(optionButton);
    }
  }

  if (scopeLabel) {
    const selectedCount = selectedBoards.length;
    const openCount = openBoards.length;
    if (scopeMode === 'all') {
      scopeLabel.textContent = `${openCount} board${openCount === 1 ? '' : 's'}`;
    } else if (scopeMode === 'current') {
      scopeLabel.textContent = getBoardLabelFromPath(selectedBoards[0] || currentBoardRoot);
    } else {
      scopeLabel.textContent = `${selectedCount}/${openCount} boards`;
    }
  }

  if (filterButton) {
    const activeFilterParts = [];
    const activeDateFilter = getPlannerActiveDateFilter();
    if (activeDateFilter === BOARD_DATE_FILTER_TODAY) {
      activeFilterParts.push('Today');
    } else if (activeDateFilter === BOARD_DATE_FILTER_OVERDUE) {
      activeFilterParts.push('Overdue');
    }

    if (selectedBoards.length !== openBoards.length) {
      activeFilterParts.push(`${selectedBoards.length} boards`);
    }
    if (getPlannerShowCompletedCards()) {
      activeFilterParts.push('Completed shown');
    }
    const selectedLabelIds = getPlannerSelectedLabelIds();
    if (selectedLabelIds.length > 0) {
      activeFilterParts.push(`${selectedLabelIds.length} label${selectedLabelIds.length === 1 ? '' : 's'}`);
    }

    filterButton.classList.toggle('is-active', activeFilterParts.length > 0);
    filterButton.setAttribute('data-active-filters', String(activeFilterParts.length));
    filterButton.setAttribute('aria-label', activeFilterParts.length > 0
      ? `Planner filters: ${activeFilterParts.join(', ')}`
      : 'Planner filters');
    filterButton.setAttribute('title', activeFilterParts.length > 0
      ? `Planner filters: ${activeFilterParts.join(', ')}`
      : 'Planner filters');
  }

  if (closeButton) {
    closeButton.setAttribute('aria-keyshortcuts', getShortcutAriaKeyshortcuts('plannerToggle'));
    closeButton.setAttribute('title', `Close Planner (${getShortcutHintText('plannerToggle')})`);
  }
}

function renderPlannerFilterPopover() {
  const popover = document.getElementById('plannerFilterPopover');
  if (!popover) {
    return;
  }

  const activeDateFilter = getPlannerActiveDateFilter();
  const showCompletedCards = getPlannerShowCompletedCards();
  const openBoards = getPlannerOpenBoardRoots();
  const selectedBoards = new Set(getPlannerSelectedBoardRoots());
  popover.replaceChildren();

  const dateSection = document.createElement('section');
  dateSection.className = 'planner-filter-section';
  const dateTitle = document.createElement('h3');
  dateTitle.textContent = 'Date';
  dateSection.appendChild(dateTitle);

  const dateOptions = [
    { value: BOARD_DATE_FILTER_NONE, label: 'All dated cards' },
    { value: BOARD_DATE_FILTER_TODAY, label: 'Today' },
    { value: BOARD_DATE_FILTER_OVERDUE, label: 'Overdue' },
  ];

  for (const option of dateOptions) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'planner-filter-row';
    row.setAttribute('aria-pressed', String(activeDateFilter === option.value));
    row.innerHTML = `
      <span class="planner-filter-check" aria-hidden="true">${activeDateFilter === option.value ? '✓' : ''}</span>
      <span>${option.label}</span>
    `;
    row.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPlannerDateFilter(option.value);
    });
    dateSection.appendChild(row);
  }
  popover.appendChild(dateSection);

  const completedSection = document.createElement('section');
  completedSection.className = 'planner-filter-section';
  const completedTitle = document.createElement('h3');
  completedTitle.textContent = 'Completed cards';
  completedSection.appendChild(completedTitle);

  const completedOptions = [
    { value: false, label: 'Hide completed cards' },
    { value: true, label: 'Show completed cards' },
  ];

  for (const option of completedOptions) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'planner-filter-row';
    row.setAttribute('aria-pressed', String(showCompletedCards === option.value));
    row.innerHTML = `
      <span class="planner-filter-check" aria-hidden="true">${showCompletedCards === option.value ? '✓' : ''}</span>
      <span>${option.label}</span>
    `;
    row.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPlannerShowCompletedCards(option.value);
    });
    completedSection.appendChild(row);
  }
  popover.appendChild(completedSection);

  const boardsSection = document.createElement('section');
  boardsSection.className = 'planner-filter-section';
  const boardsTitle = document.createElement('h3');
  boardsTitle.textContent = 'Boards';
  boardsSection.appendChild(boardsTitle);

  if (openBoards.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'planner-filter-empty';
    empty.textContent = 'No open boards.';
    boardsSection.appendChild(empty);
  } else {
    for (const boardRoot of openBoards) {
      const label = document.createElement('label');
      label.className = 'planner-filter-checkbox-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedBoards.has(boardRoot);
      checkbox.addEventListener('change', (event) => {
        setPlannerBoardSelected(boardRoot, Boolean(event.target.checked));
      });

      const text = document.createElement('span');
      text.textContent = getBoardLabelFromPath(boardRoot);

      label.appendChild(checkbox);
      label.appendChild(text);
      boardsSection.appendChild(label);
    }
  }

  popover.appendChild(boardsSection);

  if (canUsePlannerLabelFilters()) {
    const labelsSection = document.createElement('section');
    labelsSection.className = 'planner-filter-section';
    const labelsTitle = document.createElement('h3');
    labelsTitle.textContent = 'Labels';
    labelsSection.appendChild(labelsTitle);

    const selectedLabelIds = new Set(getPlannerSelectedLabelIds());
    const boardLabels = typeof getBoardLabels === 'function' ? getBoardLabels() : [];
    const labels = Array.isArray(boardLabels) ? boardLabels : [];

    if (labels.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'planner-filter-empty';
      empty.textContent = 'No labels on this board.';
      labelsSection.appendChild(empty);
    } else {
      for (const labelEntry of labels) {
        const labelId = String(labelEntry && labelEntry.id || '').trim();
        if (!labelId) {
          continue;
        }

        const label = document.createElement('label');
        label.className = 'planner-filter-checkbox-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedLabelIds.has(labelId);
        checkbox.addEventListener('change', (event) => {
          setPlannerLabelSelected(labelId, Boolean(event.target.checked));
        });

        const swatch = document.createElement('span');
        swatch.className = 'planner-filter-label-swatch';
        if (typeof getBoardLabelColor === 'function') {
          swatch.style.backgroundColor = getBoardLabelColor(labelEntry);
        }
        swatch.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.textContent = String(labelEntry.name || '').trim() || 'Untitled label';

        label.appendChild(checkbox);
        label.appendChild(swatch);
        label.appendChild(text);
        labelsSection.appendChild(label);
      }
    }

    popover.appendChild(labelsSection);
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'planner-filter-clear';
  clearButton.textContent = 'Clear filters';
  clearButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearPlannerFilters();
  });
  popover.appendChild(clearButton);
}

function closePlannerFilterPopover() {
  const popover = document.getElementById('plannerFilterPopover');
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
  popover.setAttribute('aria-hidden', 'true');
}

function isPlannerFilterPopoverOpen() {
  const popover = document.getElementById('plannerFilterPopover');
  return Boolean(popover && !popover.classList.contains('hidden'));
}

function closePlannerFilterPopoverIfClickOutside(target) {
  const button = document.getElementById('plannerFilterButton');
  const popover = document.getElementById('plannerFilterPopover');
  if (!button || !popover || popover.classList.contains('hidden')) {
    return;
  }

  if (button.contains(target) || popover.contains(target)) {
    return;
  }

  closePlannerFilterPopover();
}

function getPlannerFilterFocusableControls(popover = document.getElementById('plannerFilterPopover')) {
  if (!popover) {
    return [];
  }

  return Array.from(popover.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
    .filter((control) => control instanceof HTMLElement)
    .filter((control) => {
      const style = window.getComputedStyle(control);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

function focusPlannerFilterControl(index) {
  const controls = getPlannerFilterFocusableControls();
  if (controls.length === 0) {
    return false;
  }

  const safeIndex = ((index % controls.length) + controls.length) % controls.length;
  controls[safeIndex].focus();
  return true;
}

function movePlannerFilterFocus(offset) {
  const controls = getPlannerFilterFocusableControls();
  if (controls.length === 0) {
    return false;
  }

  const currentIndex = controls.indexOf(document.activeElement);
  const fallbackIndex = Number(offset) < 0 ? controls.length - 1 : 0;
  const nextIndex = currentIndex >= 0 ? currentIndex + Number(offset || 0) : fallbackIndex;
  return focusPlannerFilterControl(nextIndex);
}

function handlePlannerFilterPopoverKeydown(event) {
  const popover = document.getElementById('plannerFilterPopover');
  if (!event || !popover || popover.classList.contains('hidden')) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePlannerFilterPopover();
    const filterButton = document.getElementById('plannerFilterButton');
    if (filterButton && typeof filterButton.focus === 'function') {
      filterButton.focus();
    }
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    movePlannerFilterFocus(1);
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    movePlannerFilterFocus(-1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    focusPlannerFilterControl(0);
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    focusPlannerFilterControl(getPlannerFilterFocusableControls().length - 1);
  }
}

function togglePlannerFilterPopover() {
  const popover = document.getElementById('plannerFilterPopover');
  if (!popover) {
    return;
  }

  renderPlannerFilterPopover();
  const isHidden = popover.classList.contains('hidden');
  popover.classList.toggle('hidden', !isHidden);
  popover.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
  if (isHidden) {
    focusPlannerFilterControl(0);
  }
}

function syncPlannerAvailability() {
  const railButton = document.getElementById('plannerRailButton');
  const hasOpenBoards = getPlannerOpenBoardRoots().length > 0;
  if (railButton) {
    railButton.disabled = !hasOpenBoards;
    railButton.setAttribute('aria-hidden', hasOpenBoards ? 'false' : 'true');
    railButton.setAttribute('title', `Open Planner (${getShortcutHintText('plannerToggle')})`);
    railButton.setAttribute('aria-keyshortcuts', getShortcutAriaKeyshortcuts('plannerToggle'));
  }

  if (!hasOpenBoards && isPlannerOpen()) {
    closePlannerView({ restoreFocus: false });
  }

  renderPlannerViewControls();
}

async function openPlannerView(options = {}) {
  if (getPlannerOpenBoardRoots().length === 0) {
    return false;
  }

  const state = getPlannerState();
  const overlay = document.getElementById('plannerOverlay');
  const railButton = document.getElementById('plannerRailButton');
  if (!overlay) {
    return false;
  }

  if (typeof hideShortcutHelpModal === 'function') {
    hideShortcutHelpModal();
  }
  if (typeof closeBoardMenuPopover === 'function') {
    closeBoardMenuPopover();
  }
  if (typeof closeBoardLabelFilterPopover === 'function') {
    closeBoardLabelFilterPopover();
  }
  if (typeof closeBoardSwitcher === 'function') {
    closeBoardSwitcher();
  }
  if (typeof closeAllModals === 'function') {
    await closeAllModals({ key: 'Escape' }, { skipRerender: true });
  }

  const requestedView = options && options.viewId ? options.viewId : '';
  if (requestedView) {
    state.activeView = normalizePlannerViewId(requestedView);
  }

  const requestedScope = String((options && options.scope) || '').trim().toLowerCase();
  if (!state.isOpen || requestedScope) {
    applyPlannerScope(requestedScope === 'current' ? 'current' : 'all');
  }
  state.isOpen = true;
  overlay.classList.remove('hidden', 'is-closing');
  overlay.setAttribute('aria-hidden', 'false');
  if (typeof overlay.offsetWidth === 'number') {
    // Force the pre-open transform to apply before sliding the overlay in.
    void overlay.offsetWidth;
  }
  document.body.classList.add('planner-open');
  if (railButton) {
    railButton.setAttribute('aria-expanded', 'true');
  }

  renderPlannerViewControls();
  await renderPlannerView();
  return true;
}

function closePlannerView(options = {}) {
  const state = getPlannerState();
  const overlay = document.getElementById('plannerOverlay');
  const railButton = document.getElementById('plannerRailButton');
  state.isOpen = false;
  document.body.classList.remove('planner-open');
  closePlannerFilterPopover();
  destroyPlannerSortables();

  if (overlay) {
    overlay.classList.add('is-closing');
    overlay.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (!getPlannerState().isOpen) {
        overlay.classList.add('hidden');
      }
      overlay.classList.remove('is-closing');
    }, 240);
  }

  if (railButton) {
    railButton.setAttribute('aria-expanded', 'false');
    if (options.restoreFocus !== false && typeof railButton.focus === 'function') {
      railButton.focus();
    }
  }
}

async function togglePlannerView() {
  if (isPlannerOpen()) {
    closePlannerView();
    return true;
  }

  return openPlannerView();
}

function focusPlannerSearchInput() {
  const searchInput = document.getElementById('plannerSearchInput');
  if (!searchInput || !isPlannerOpen()) {
    return false;
  }

  searchInput.focus();
  if (typeof searchInput.select === 'function') {
    searchInput.select();
  }

  return true;
}

function handlePlannerViewShortcut(event, options = {}) {
  const ignoreEditableTarget = Boolean(options.ignoreEditableTarget);

  if (
    !isPlannerOpen() ||
    event.shiftKey ||
    (typeof hasPlannerDateViewShortcutModifiers === 'function' && !hasPlannerDateViewShortcutModifiers(event)) ||
    (!ignoreEditableTarget && isEditableShortcutTarget(event.target))
  ) {
    return false;
  }

  let nextViewId = '';
  switch (event.code) {
    case 'Digit1':
      if (event.altKey) {
        return false;
      }
      event.preventDefault();
      closePlannerView();
      return true;
    case 'Digit2':
      nextViewId = PLANNER_VIEW_IDS.CALENDAR;
      break;
    case 'Digit3':
      nextViewId = PLANNER_VIEW_IDS.THIS_WEEK;
      break;
    case 'Digit4':
      nextViewId = PLANNER_VIEW_IDS.DAY;
      break;
    case 'Digit5':
      nextViewId = PLANNER_VIEW_IDS.AGENDA;
      break;
    default:
      return false;
  }

  event.preventDefault();
  setPlannerActiveView(nextViewId, { render: false });
  applyPlannerScope(event.altKey ? 'current' : 'all');
  renderPlannerViewControls();
  closePlannerFilterPopover();
  renderPlannerView().catch((error) => {
    console.error('Failed to render Planner after shortcut view change.', error);
  });
  return true;
}

function initializePlannerControls() {
  const state = getPlannerState();
  if (state.controlsInitialized) {
    syncPlannerAvailability();
    return;
  }

  const railButton = document.getElementById('plannerRailButton');
  const closeButton = document.getElementById('plannerCloseButton');
  const closeRail = document.getElementById('plannerCloseRail');
  const filterButton = document.getElementById('plannerFilterButton');
  const filterPopover = document.getElementById('plannerFilterPopover');
  const searchInput = document.getElementById('plannerSearchInput');

  if (railButton) {
    railButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePlannerView().catch((error) => {
        console.error('Failed to toggle Planner.', error);
      });
    });
  }

  if (closeButton) {
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePlannerView();
    });
  }

  if (closeRail) {
    closeRail.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePlannerView();
    });
  }

  if (filterButton) {
    filterButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePlannerFilterPopover();
    });
  }

  if (filterPopover) {
    filterPopover.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    filterPopover.addEventListener('keydown', handlePlannerFilterPopoverKeydown);
  }

  if (searchInput) {
    searchInput.value = getPlannerSearchQuery();
    searchInput.addEventListener('input', (event) => {
      setPlannerSearchQuery(event.target.value);
      schedulePlannerRender();
    });
    searchInput.addEventListener('keydown', (event) => {
      handlePlannerSearchInputKeydown(event).catch((error) => {
        console.error('Failed to handle Planner search keyboard navigation.', error);
      });
    });
  }

  document.addEventListener('keydown', handlePlannerSearchResultKeydown);

  state.controlsInitialized = true;
  syncPlannerAvailability();
}
