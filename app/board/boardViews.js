const BOARD_VIEW_IDS = Object.freeze({
  KANBAN: 'kanban',
  CALENDAR: 'calendar',
  THIS_WEEK: 'this-week',
});

const BOARD_VIEW_OPTIONS = Object.freeze([
  { id: BOARD_VIEW_IDS.KANBAN, label: 'Kanban' },
  { id: BOARD_VIEW_IDS.CALENDAR, label: 'Calendar' },
  { id: BOARD_VIEW_IDS.THIS_WEEK, label: 'This Week' },
]);

const BOARD_VIEW_ICON_BY_ID = Object.freeze({
  [BOARD_VIEW_IDS.KANBAN]: 'columns',
  [BOARD_VIEW_IDS.CALENDAR]: 'calendar',
  [BOARD_VIEW_IDS.THIS_WEEK]: 'clock',
});

const BOARD_CALENDAR_WEEKDAY_LABELS = Object.freeze([
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
]);

function getBoardViewState() {
  if (!window.__boardViewState) {
    window.__boardViewState = {
      controlsInitialized: false,
      viewByBoard: new Map(),
      calendarCursorByBoard: new Map(),
      weekCursorByBoard: new Map(),
      monthLabelFormatter: new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
      }),
      shortMonthDayFormatter: new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      longMonthDayFormatter: new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
      }),
    };
  }

  return window.__boardViewState;
}

function normalizeBoardViewId(viewId) {
  const normalized = String(viewId || '').trim().toLowerCase();
  if (normalized === BOARD_VIEW_IDS.CALENDAR) {
    return BOARD_VIEW_IDS.CALENDAR;
  }

  if (normalized === BOARD_VIEW_IDS.THIS_WEEK) {
    return BOARD_VIEW_IDS.THIS_WEEK;
  }

  return BOARD_VIEW_IDS.KANBAN;
}

function getActiveBoardKeyForViewState() {
  if (typeof normalizeBoardPath === 'function') {
    return normalizeBoardPath(window.boardRoot || '');
  }

  const fallbackPath = String(window.boardRoot || '').trim();
  if (!fallbackPath) {
    return '';
  }

  return fallbackPath.endsWith('/') ? fallbackPath : `${fallbackPath}/`;
}

function getActiveBoardView() {
  const state = getBoardViewState();
  const boardKey = getActiveBoardKeyForViewState();
  if (!boardKey) {
    return BOARD_VIEW_IDS.KANBAN;
  }

  if (!state.viewByBoard.has(boardKey)) {
    state.viewByBoard.set(boardKey, BOARD_VIEW_IDS.KANBAN);
  }

  return normalizeBoardViewId(state.viewByBoard.get(boardKey));
}

function setActiveBoardView(viewId, options = {}) {
  const normalizedView = normalizeBoardViewId(viewId);
  const boardKey = getActiveBoardKeyForViewState();
  const state = getBoardViewState();

  if (boardKey) {
    state.viewByBoard.set(boardKey, normalizedView);
  }

  syncBoardViewControlState();
  closeBoardViewPopover();

  if (options.render === false) {
    return;
  }

  renderBoard().catch((error) => {
    console.error('Failed to render board after changing board view.', error);
  });
}

function createMonthCursorDate(dateValue) {
  const source = dateValue instanceof Date ? dateValue : new Date();
  return new Date(source.getFullYear(), source.getMonth(), 1);
}

function getBoardCalendarCursorDate() {
  const state = getBoardViewState();
  const boardKey = getActiveBoardKeyForViewState();
  if (!boardKey) {
    return createMonthCursorDate();
  }

  const existing = state.calendarCursorByBoard.get(boardKey);
  if (!(existing instanceof Date) || Number.isNaN(existing.getTime())) {
    const nowMonth = createMonthCursorDate();
    state.calendarCursorByBoard.set(boardKey, nowMonth);
    return nowMonth;
  }

  return createMonthCursorDate(existing);
}

function setBoardCalendarCursorDate(dateValue) {
  const boardKey = getActiveBoardKeyForViewState();
  if (!boardKey) {
    return createMonthCursorDate();
  }

  const nextCursor = createMonthCursorDate(dateValue);
  const state = getBoardViewState();
  state.calendarCursorByBoard.set(boardKey, nextCursor);
  return nextCursor;
}

function shiftBoardCalendarMonth(monthDelta) {
  const currentCursor = getBoardCalendarCursorDate();
  const delta = Number(monthDelta) || 0;
  const shifted = new Date(currentCursor.getFullYear(), currentCursor.getMonth() + delta, 1);
  return setBoardCalendarCursorDate(shifted);
}

function setBoardCalendarToToday() {
  return setBoardCalendarCursorDate(new Date());
}

function createWeekCursorDate(dateValue) {
  const source = dateValue instanceof Date ? dateValue : new Date();
  const localDay = new Date(source.getFullYear(), source.getMonth(), source.getDate());
  const mondayOffset = (localDay.getDay() + 6) % 7;
  localDay.setDate(localDay.getDate() - mondayOffset);
  return localDay;
}

function getBoardWeekCursorDate() {
  const state = getBoardViewState();
  const boardKey = getActiveBoardKeyForViewState();
  if (!boardKey) {
    return createWeekCursorDate();
  }

  const existing = state.weekCursorByBoard.get(boardKey);
  if (!(existing instanceof Date) || Number.isNaN(existing.getTime())) {
    const currentWeek = createWeekCursorDate();
    state.weekCursorByBoard.set(boardKey, currentWeek);
    return currentWeek;
  }

  return createWeekCursorDate(existing);
}

function setBoardWeekCursorDate(dateValue) {
  const boardKey = getActiveBoardKeyForViewState();
  if (!boardKey) {
    return createWeekCursorDate();
  }

  const nextCursor = createWeekCursorDate(dateValue);
  const state = getBoardViewState();
  state.weekCursorByBoard.set(boardKey, nextCursor);
  return nextCursor;
}

function shiftBoardWeek(weekDelta) {
  const currentWeek = getBoardWeekCursorDate();
  const delta = Number(weekDelta) || 0;
  const shifted = new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() + (delta * 7));
  return setBoardWeekCursorDate(shifted);
}

function setBoardWeekToToday() {
  return setBoardWeekCursorDate(new Date());
}

function isCurrentCalendarMonth(dateValue) {
  const monthDate = createMonthCursorDate(dateValue);
  const todayMonth = createMonthCursorDate(new Date());
  return (
    monthDate.getFullYear() === todayMonth.getFullYear() &&
    monthDate.getMonth() === todayMonth.getMonth()
  );
}

function formatCalendarMonthLabel(dateValue) {
  const state = getBoardViewState();
  return state.monthLabelFormatter.format(createMonthCursorDate(dateValue));
}

function formatWeekRangeLabel(weekStartDate) {
  const state = getBoardViewState();
  const start = createWeekCursorDate(weekStartDate);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return `${state.longMonthDayFormatter.format(start)} - ${state.longMonthDayFormatter.format(end)}`;
}

function isCurrentWeek(weekStartDate) {
  const currentWeek = createWeekCursorDate(new Date());
  const candidate = createWeekCursorDate(weekStartDate);
  return currentWeek.getTime() === candidate.getTime();
}

function formatIsoLocalDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isIsoDateWithinMonth(isoDate, monthCursor) {
  const parsed = parseIsoDateStringToLocalDate(isoDate);
  if (!parsed) {
    return false;
  }

  return (
    parsed.getFullYear() === monthCursor.getFullYear() &&
    parsed.getMonth() === monthCursor.getMonth()
  );
}

function isIsoDateWithinWeek(isoDate, weekStartDate) {
  const parsed = parseIsoDateStringToLocalDate(isoDate);
  if (!parsed) {
    return false;
  }

  const weekStart = createWeekCursorDate(weekStartDate);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const parsedTime = parsed.getTime();
  return parsedTime >= weekStart.getTime() && parsedTime <= weekEnd.getTime();
}

function getCalendarGridCellCount(monthCursor) {
  const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const mondayFirstOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  return Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7;
}

function truncateCalendarCardTitle(titleText) {
  const normalized = String(titleText || '').trim();
  if (!normalized) {
    return 'Untitled';
  }

  return normalized.replace(/^#\s+/, '');
}

async function collectCardsForCalendar(boardRoot, lists) {
  const listNames = Array.isArray(lists) ? lists : [];
  const cardPaths = [];

  const listEntries = await Promise.all(
    listNames.map(async (listName) => {
      const listPath = `${boardRoot}${listName}`;
      const cardNames = await window.board.listCards(listPath);
      return {
        listPath,
        cardNames: Array.isArray(cardNames) ? cardNames : [],
      };
    }),
  );

  for (const { listPath, cardNames } of listEntries) {
    for (const cardName of cardNames) {
      cardPaths.push(`${listPath}/${cardName}`);
    }
  }

  const cardEntries = await Promise.all(
    cardPaths.map(async (cardPath) => {
      const card = await window.board.readCard(cardPath);
      const frontmatter = card && card.frontmatter && typeof card.frontmatter === 'object'
        ? card.frontmatter
        : {};

      return {
        cardPath,
        title: truncateCalendarCardTitle(frontmatter.title),
        due: String(frontmatter.due || '').trim(),
        labels: Array.isArray(frontmatter.labels)
          ? frontmatter.labels.map((labelId) => String(labelId))
          : [],
        body: String(card && card.body ? card.body : ''),
      };
    }),
  );

  return cardEntries;
}

function buildCalendarCardBuckets(cardEntries, monthCursor) {
  const entries = Array.isArray(cardEntries) ? cardEntries : [];
  const buckets = new Map();

  for (const entry of entries) {
    const hasDueDate = Boolean(entry.due);
    const matchesLabelFilter = cardMatchesBoardLabelFilter(entry.labels, hasDueDate);
    const matchesSearchFilter = cardMatchesBoardSearch(entry.title, entry.body);

    if (!hasDueDate || !matchesLabelFilter || !matchesSearchFilter) {
      continue;
    }

    const dueDate = parseIsoDateStringToLocalDate(entry.due);
    if (!dueDate) {
      continue;
    }

    if (
      dueDate.getFullYear() !== monthCursor.getFullYear() ||
      dueDate.getMonth() !== monthCursor.getMonth()
    ) {
      continue;
    }

    const isoDate = formatIsoLocalDate(dueDate);
    if (!isoDate) {
      continue;
    }

    if (!buckets.has(isoDate)) {
      buckets.set(isoDate, []);
    }

    buckets.get(isoDate).push(entry);
  }

  return buckets;
}

function buildWeekCardBuckets(cardEntries, weekStartDate) {
  const entries = Array.isArray(cardEntries) ? cardEntries : [];
  const buckets = new Map();
  const weekStart = createWeekCursorDate(weekStartDate);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);

  for (const entry of entries) {
    const hasDueDate = Boolean(entry.due);
    const matchesLabelFilter = cardMatchesBoardLabelFilter(entry.labels, hasDueDate);
    const matchesSearchFilter = cardMatchesBoardSearch(entry.title, entry.body);
    if (!hasDueDate || !matchesLabelFilter || !matchesSearchFilter) {
      continue;
    }

    const dueDate = parseIsoDateStringToLocalDate(entry.due);
    if (!dueDate) {
      continue;
    }

    const dueTime = dueDate.getTime();
    if (dueTime < weekStart.getTime() || dueTime > weekEnd.getTime()) {
      continue;
    }

    const isoDate = formatIsoLocalDate(dueDate);
    if (!isoDate) {
      continue;
    }

    if (!buckets.has(isoDate)) {
      buckets.set(isoDate, []);
    }

    buckets.get(isoDate).push(entry);
  }

  return buckets;
}

function syncBoardViewSelectWithState() {
  const viewButton = document.getElementById('boardViewButton');
  if (!viewButton) {
    return;
  }

  const activeView = getActiveBoardView();
  const activeOption = BOARD_VIEW_OPTIONS.find((option) => option.id === activeView) || BOARD_VIEW_OPTIONS[0];
  const iconName = BOARD_VIEW_ICON_BY_ID[activeOption.id] || BOARD_VIEW_ICON_BY_ID[BOARD_VIEW_IDS.KANBAN];
  viewButton.setAttribute('data-active-view', activeOption.id);
  viewButton.setAttribute('aria-label', `Current view: ${activeOption.label}. Change view.`);
  viewButton.setAttribute('title', `Current view: ${activeOption.label}. Change view.`);

  if (
    window.feather &&
    window.feather.icons &&
    typeof window.feather.icons[iconName]?.toSvg === 'function'
  ) {
    viewButton.innerHTML = window.feather.icons[iconName].toSvg();
  } else {
    viewButton.innerHTML = `<i data-feather="${iconName}"></i>`;
    if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
      feather.replace();
    }
  }

  const svgIcon = viewButton.querySelector('svg');
  if (svgIcon) {
    svgIcon.setAttribute('aria-hidden', 'true');
    svgIcon.setAttribute('focusable', 'false');
  }
}

function syncBoardViewControlState() {
  syncBoardViewSelectWithState();
  renderBoardViewPopover();
}

function closeBoardViewPopover() {
  const popover = document.getElementById('boardViewPopover');
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
}

function closeBoardViewPopoverIfClickOutside(target) {
  const viewButton = document.getElementById('boardViewButton');
  const popover = document.getElementById('boardViewPopover');
  if (!viewButton || !popover || popover.classList.contains('hidden')) {
    return;
  }

  if (viewButton.contains(target) || popover.contains(target)) {
    return;
  }

  closeBoardViewPopover();
}

function renderBoardViewPopover() {
  const popover = document.getElementById('boardViewPopover');
  if (!popover) {
    return;
  }

  const activeView = getActiveBoardView();
  popover.innerHTML = '';

  for (const option of BOARD_VIEW_OPTIONS) {
    const optionButton = document.createElement('button');
    optionButton.type = 'button';
    optionButton.className = 'board-view-option';
    optionButton.dataset.viewId = option.id;
    optionButton.setAttribute('aria-pressed', String(option.id === activeView));
    optionButton.innerHTML = `
      <span class="board-view-option-check">${option.id === activeView ? '✓' : ''}</span>
      <span>${option.label}</span>
    `;
    optionButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveBoardView(option.id);
    });
    popover.appendChild(optionButton);
  }
}

function toggleBoardViewPopover() {
  const popover = document.getElementById('boardViewPopover');
  if (!popover) {
    return;
  }

  if (typeof closeBoardLabelFilterPopover === 'function') {
    closeBoardLabelFilterPopover();
  }
  if (typeof closeCardLabelPopover === 'function') {
    closeCardLabelPopover();
  }

  renderBoardViewPopover();
  const isHidden = popover.classList.contains('hidden');
  popover.classList.toggle('hidden', !isHidden);
}

function initializeBoardViewControls() {
  const state = getBoardViewState();
  if (state.controlsInitialized) {
    syncBoardViewControlState();
    return;
  }

  const viewButton = document.getElementById('boardViewButton');
  const popover = document.getElementById('boardViewPopover');
  if (!viewButton || !popover) {
    return;
  }

  syncBoardViewControlState();

  viewButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleBoardViewPopover();
  });

  popover.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  state.controlsInitialized = true;
}

async function handleCalendarCardDrop(evt, monthCursor) {
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

  if (!isIsoDateWithinMonth(targetDate, monthCursor)) {
    await renderBoard();
    return;
  }

  try {
    await window.board.updateFrontmatter(cardPath, { due: targetDate });
    draggedCard.dataset.due = targetDate;
  } catch (error) {
    console.error('Failed to move card to a new calendar date.', error);
    await renderBoard();
  }
}

function createTemporalCardElement(cardEntry, isoDate, className) {
  const cardButton = document.createElement('button');
  cardButton.type = 'button';
  cardButton.className = className;
  cardButton.dataset.path = cardEntry.cardPath;
  cardButton.dataset.due = isoDate;
  cardButton.textContent = cardEntry.title;
  cardButton.setAttribute('data-sb-tooltip-disabled', 'true');

  cardButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleEditCardModal(cardEntry.cardPath);
  });

  return cardButton;
}

function createCalendarDayCell({
  isoDate,
  monthCursor,
  isToday,
  isWeekend,
  cardsForDay,
  cardClassName = 'board-calendar-card',
}) {
  const dayCell = document.createElement('section');
  dayCell.className = 'board-calendar-day';
  dayCell.dataset.date = isoDate;
  if (isToday) {
    dayCell.classList.add('is-today');
  }
  if (isWeekend) {
    dayCell.classList.add('is-weekend');
  }

  const dayHeader = document.createElement('header');
  dayHeader.className = 'board-calendar-day-header';

  const parsedDate = parseIsoDateStringToLocalDate(isoDate);
  const dayNumber = document.createElement('span');
  dayNumber.className = 'board-calendar-day-number';
  dayNumber.textContent = parsedDate ? String(parsedDate.getDate()) : '';
  dayHeader.appendChild(dayNumber);

  if (isToday) {
    const todayBadge = document.createElement('span');
    todayBadge.className = 'board-calendar-today-badge';
    todayBadge.textContent = 'Today';
    dayHeader.appendChild(todayBadge);
  }

  dayCell.appendChild(dayHeader);

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'board-calendar-day-cards';
  cardsWrap.dataset.date = isoDate;
  cardsWrap.dataset.month = String(monthCursor.getMonth() + 1);

  for (const cardEntry of cardsForDay) {
    cardsWrap.appendChild(createTemporalCardElement(cardEntry, isoDate, cardClassName));
  }

  dayCell.appendChild(cardsWrap);
  return { dayCell, cardsWrap };
}

function createCalendarEmptyCell(isWeekend) {
  const emptyCell = document.createElement('div');
  emptyCell.className = 'board-calendar-day board-calendar-day--outside';
  if (isWeekend) {
    emptyCell.classList.add('is-weekend');
  }
  emptyCell.setAttribute('aria-hidden', 'true');
  return emptyCell;
}

function createCalendarHeader(monthCursor) {
  const header = document.createElement('div');
  header.className = 'board-calendar-header board-calendar-header--month';

  const navigation = document.createElement('div');
  navigation.className = 'board-calendar-nav';

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'board-calendar-nav-button';
  previousButton.title = 'Previous month';
  previousButton.setAttribute('aria-label', 'Previous month');
  previousButton.innerHTML = '<i data-feather="chevron-left"></i>';
  previousButton.addEventListener('click', () => {
    shiftBoardCalendarMonth(-1);
    renderBoard().catch((error) => {
      console.error('Failed to render previous calendar month.', error);
    });
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'board-calendar-nav-button';
  nextButton.title = 'Next month';
  nextButton.setAttribute('aria-label', 'Next month');
  nextButton.innerHTML = '<i data-feather="chevron-right"></i>';
  nextButton.addEventListener('click', () => {
    shiftBoardCalendarMonth(1);
    renderBoard().catch((error) => {
      console.error('Failed to render next calendar month.', error);
    });
  });

  const monthLabel = document.createElement('h2');
  monthLabel.className = 'board-calendar-month-label';
  monthLabel.textContent = formatCalendarMonthLabel(monthCursor);

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className = 'board-calendar-today-button';
  todayButton.textContent = 'Today';
  todayButton.title = 'Jump to current month';
  todayButton.disabled = isCurrentCalendarMonth(monthCursor);
  todayButton.addEventListener('click', () => {
    setBoardCalendarToToday();
    renderBoard().catch((error) => {
      console.error('Failed to render current calendar month.', error);
    });
  });

  navigation.appendChild(previousButton);
  navigation.appendChild(nextButton);
  navigation.appendChild(todayButton);

  header.appendChild(navigation);
  header.appendChild(monthLabel);

  return header;
}

function createCalendarWeekdayHeader() {
  const weekdaysRow = document.createElement('div');
  weekdaysRow.className = 'board-calendar-weekdays';

  for (const [index, label] of BOARD_CALENDAR_WEEKDAY_LABELS.entries()) {
    const weekday = document.createElement('div');
    weekday.className = 'board-calendar-weekday';
    if (index >= 5) {
      weekday.classList.add('is-weekend');
    }
    weekday.textContent = label.short;
    weekday.setAttribute('title', label.full);
    weekdaysRow.appendChild(weekday);
  }

  return weekdaysRow;
}

async function handleWeekCardDrop(evt, weekStartDate) {
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

  if (!isIsoDateWithinWeek(targetDate, weekStartDate)) {
    await renderBoard();
    return;
  }

  try {
    await window.board.updateFrontmatter(cardPath, { due: targetDate });
    draggedCard.dataset.due = targetDate;
  } catch (error) {
    console.error('Failed to move card to a new week date.', error);
    await renderBoard();
  }
}

function createThisWeekHeader(weekStartDate) {
  const header = document.createElement('div');
  header.className = 'board-calendar-header board-calendar-header--week';

  const navigation = document.createElement('div');
  navigation.className = 'board-calendar-nav';

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'board-calendar-nav-button';
  previousButton.title = 'Previous week';
  previousButton.setAttribute('aria-label', 'Previous week');
  previousButton.innerHTML = '<i data-feather="chevron-left"></i>';
  previousButton.addEventListener('click', () => {
    shiftBoardWeek(-1);
    renderBoard().catch((error) => {
      console.error('Failed to render previous week.', error);
    });
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'board-calendar-nav-button';
  nextButton.title = 'Next week';
  nextButton.setAttribute('aria-label', 'Next week');
  nextButton.innerHTML = '<i data-feather="chevron-right"></i>';
  nextButton.addEventListener('click', () => {
    shiftBoardWeek(1);
    renderBoard().catch((error) => {
      console.error('Failed to render next week.', error);
    });
  });

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className = 'board-calendar-today-button';
  todayButton.textContent = 'Today';
  todayButton.title = 'Jump to current week';
  todayButton.disabled = isCurrentWeek(weekStartDate);
  todayButton.addEventListener('click', () => {
    setBoardWeekToToday();
    renderBoard().catch((error) => {
      console.error('Failed to render current week.', error);
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

function createThisWeekDayCell({
  dayDate,
  isoDate,
  dayLabel,
  isToday,
  isWeekend,
  cardsForDay,
  extraClassName = '',
}) {
  const dayCell = document.createElement('section');
  dayCell.className = 'board-this-week-day';
  dayCell.dataset.date = isoDate;
  if (extraClassName) {
    dayCell.classList.add(extraClassName);
  }
  if (isToday) {
    dayCell.classList.add('is-today');
  }
  if (isWeekend) {
    dayCell.classList.add('is-weekend');
  }

  const dayHeader = document.createElement('header');
  dayHeader.className = 'board-this-week-day-header';

  const title = document.createElement('span');
  title.className = 'board-this-week-day-title';
  title.textContent = dayLabel;

  const state = getBoardViewState();
  const dateLabel = document.createElement('span');
  dateLabel.className = 'board-this-week-day-date';
  dateLabel.textContent = state.shortMonthDayFormatter.format(dayDate);

  dayHeader.appendChild(title);
  dayHeader.appendChild(dateLabel);

  if (isToday) {
    const todayBadge = document.createElement('span');
    todayBadge.className = 'board-calendar-today-badge';
    todayBadge.textContent = 'Today';
    dayHeader.appendChild(todayBadge);
  }

  dayCell.appendChild(dayHeader);

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'board-this-week-day-cards';
  cardsWrap.dataset.date = isoDate;

  for (const cardEntry of cardsForDay) {
    cardsWrap.appendChild(createTemporalCardElement(cardEntry, isoDate, 'board-this-week-card'));
  }

  dayCell.appendChild(cardsWrap);
  return { dayCell, cardsWrap };
}

async function renderThisWeekBoard(boardEl, boardRoot, lists) {
  if (!boardEl) {
    return;
  }

  const weekStartDate = getBoardWeekCursorDate();
  const allCards = await collectCardsForCalendar(boardRoot, lists);
  const cardsByDate = buildWeekCardBuckets(allCards, weekStartDate);
  const todayIso = formatIsoLocalDate(new Date());

  const weekEl = document.createElement('section');
  weekEl.className = 'board-this-week';
  weekEl.appendChild(createThisWeekHeader(weekStartDate));

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
  boardEl.appendChild(weekEl);

  if (typeof Sortable !== 'function') {
    return;
  }

  for (const container of sortableContainers) {
    new Sortable(container, {
      group: 'this-week-cards',
      animation: 150,
      draggable: '.board-this-week-card',
      onEnd: async (evt) => {
        await handleWeekCardDrop(evt, weekStartDate);
      },
    });
  }
}

async function renderCalendarBoard(boardEl, boardRoot, lists) {
  if (!boardEl) {
    return;
  }

  const monthCursor = getBoardCalendarCursorDate();
  const allCards = await collectCardsForCalendar(boardRoot, lists);
  const cardsByDate = buildCalendarCardBuckets(allCards, monthCursor);

  const calendarEl = document.createElement('section');
  calendarEl.className = 'board-calendar';

  calendarEl.appendChild(createCalendarHeader(monthCursor));
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
    });

    sortableContainers.push(cardsWrap);
    grid.appendChild(dayCell);
  }

  calendarEl.appendChild(grid);
  boardEl.appendChild(calendarEl);

  if (typeof Sortable !== 'function') {
    return;
  }

  for (const container of sortableContainers) {
    new Sortable(container, {
      group: 'calendar-cards',
      animation: 150,
      draggable: '.board-calendar-card',
      onEnd: async (evt) => {
        await handleCalendarCardDrop(evt, monthCursor);
      },
    });
  }
}
