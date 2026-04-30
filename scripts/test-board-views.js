const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSource(context, relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  vm.runInContext(source, context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

class MockClassList {
  constructor(element) {
    this.element = element;
  }

  _read() {
    return this.element.className
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  _write(values) {
    this.element.className = values.join(' ');
  }

  add(...tokens) {
    const next = new Set(this._read());
    for (const token of tokens) {
      if (token) {
        next.add(token);
      }
    }
    this._write([...next]);
  }

  remove(...tokens) {
    const toRemove = new Set(tokens.filter(Boolean));
    this._write(this._read().filter((token) => !toRemove.has(token)));
  }

  toggle(token, force) {
    if (!token) {
      return false;
    }

    const shouldAdd = typeof force === 'boolean'
      ? force
      : !this.contains(token);

    if (shouldAdd) {
      this.add(token);
      return true;
    }

    this.remove(token);
    return false;
  }

  contains(token) {
    return this._read().includes(token);
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.classList = new MockClassList(this);
    this._textContent = '';
    this.type = '';
    this.checked = false;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get textContent() {
    const childText = this.children
      .map((child) => (typeof child === 'string' ? child : child.textContent))
      .join('');
    return `${this._textContent}${childText}`;
  }

  set innerHTML(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get innerHTML() {
    return this._textContent;
  }

  appendChild(child) {
    if (typeof child === 'string') {
      this.children.push(child);
      return child;
    }

    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    const textValue = String(value);
    this.attributes[name] = textValue;
    if (name === 'class') {
      this.className = textValue;
    }
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .split('-')
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
      this.dataset[key] = textValue;
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }

  contains(target) {
    if (target === this) {
      return true;
    }

    for (const child of this.children) {
      if (typeof child !== 'string' && typeof child.contains === 'function' && child.contains(target)) {
        return true;
      }
    }

    return false;
  }
}

function findFirstByClass(root, className) {
  if (!root || !root.children) {
    return null;
  }

  for (const child of root.children) {
    if (typeof child === 'string') {
      continue;
    }

    if (child.classList.contains(className)) {
      return child;
    }

    const nested = findFirstByClass(child, className);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function createFixedDateClass(isoDate) {
  const fixedTimestamp = Date.parse(`${isoDate}T12:00:00`);

  return class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedTimestamp);
        return;
      }

      super(...args);
    }

    static now() {
      return fixedTimestamp;
    }

    static parse(value) {
      return Date.parse(value);
    }

    static UTC(...args) {
      return Date.UTC(...args);
    }
  };
}

function createLabel(index, name = `Label ${index}`) {
  return {
    id: `label-${index}`,
    name,
    colorLight: '#3b82f6',
    colorDark: '#60a5fa',
  };
}

function createContext() {
  const elements = new Map();
  const documentElement = {
    dataset: { theme: 'light' },
    style: {
      setProperty() {},
    },
    clientWidth: 1280,
    clientHeight: 900,
  };
  const document = {
    createElement: (tagName) => new MockElement(tagName),
    getElementById: (id) => elements.get(id) || null,
    documentElement,
    body: new MockElement('body'),
    querySelectorAll: () => [],
  };

  const context = {
    console,
    navigator: {
      platform: 'Win32',
    },
    window: {
      innerWidth: 1280,
      innerHeight: 900,
      board: {
        listCards: async () => [],
      },
    },
    document,
    Element: MockElement,
    Date: createFixedDateClass('2026-03-10'),
    feather: null,
    renderBoard: async () => {},
    cardMatchesBoardSearch: () => true,
    openAddListModal: () => {},
    toggleAddCardModal: () => {},
  };

  context.window.document = document;

  vm.createContext(context);
  loadSource(context, 'app/utilities/dueDateStatus.js');
  loadSource(context, 'app/utilities/taskList.js');
  loadSource(context, 'app/board/boardLabels.js');
  loadSource(context, 'app/board/boardViews.js');
  loadSource(context, 'app/lists/listActionsPopover.js');

  const filterButton = new MockElement('button');
  const filterLabel = new MockElement('span');
  const filterPopover = new MockElement('div');
  const viewButton = new MockElement('button');
  const viewPopover = new MockElement('div');
  const listActionsPopover = new MockElement('div');
  elements.set('labelFilterButton', filterButton);
  elements.set('labelFilterButtonText', filterLabel);
  elements.set('labelFilterPopover', filterPopover);
  elements.set('boardViewButton', viewButton);
  elements.set('boardViewPopover', viewPopover);
  elements.set('listActionsPopover', listActionsPopover);

  return {
    context,
    filterButton,
    filterPopover,
    viewPopover,
    listActionsPopover,
  };
}

function run() {
  const {
    context,
    filterButton,
    filterPopover,
    viewPopover,
    listActionsPopover,
  } = createContext();

  assert.strictEqual(
    context.getBoardListDisplayName('003-In Progress-abc12'),
    'In Progress',
    'expected prefixed list directory names to be normalized for display',
  );
  assert.strictEqual(
    context.getBoardListDisplayName('Inbox'),
    'Inbox',
    'expected plain list names to remain unchanged',
  );

  const body = [
    '- [ ] (due: 2026-03-10) Prep launch',
    '- [ ] (due: 2026-03-10) Email team',
    '- [ ] (due: 2026-03-12) Review launch notes',
  ].join('\n');
  const taskItems = context.parseTaskListItems(body);

  const taskPlacement = context.createTemporalPlacementForDate({
    cardPath: '/tmp/board-launch.md',
    listName: '003-In Progress-abc12',
    listDisplayName: 'In Progress',
    title: 'Board launch',
    due: '2026-03-10',
    labels: [],
    body,
    taskSummary: { total: 3, completed: 0, remaining: 3 },
    taskItems,
    taskDueDates: context.getTaskListDueDates(body),
  }, '2026-03-10');

  assert(taskPlacement, 'expected task placement');
  assert.strictEqual(taskPlacement.temporalReason, 'task');
  assert.strictEqual(taskPlacement.temporalDisplayTitle, 'Prep launch +1 more');
  assert.strictEqual(taskPlacement.temporalDisplaySubtitle, 'Board launch');
  assert.strictEqual(taskPlacement.listDisplayName, 'In Progress');

  const cardPlacement = context.createTemporalPlacementForDate({
    cardPath: '/tmp/card-only.md',
    listName: '001-Backlog-abc12',
    listDisplayName: 'Backlog',
    title: 'Card-only due date',
    due: '2026-03-15',
    labels: [],
    body: 'Body',
    taskSummary: { total: 0, completed: 0, remaining: 0 },
    taskItems: [],
    taskDueDates: [],
  }, '2026-03-15');

  assert(cardPlacement, 'expected card placement');
  assert.strictEqual(cardPlacement.temporalReason, 'card');
  assert.strictEqual(cardPlacement.temporalDisplayTitle, 'Card-only due date');
  assert.strictEqual(cardPlacement.temporalDisplaySubtitle, '');
  assert.strictEqual(cardPlacement.listDisplayName, 'Backlog');

  const labels = [
    createLabel(1, 'Urgent'),
    createLabel(2, 'Bug'),
  ];
  context.setBoardLabels(labels);
  context.resetBoardLabelFilter();
  context.renderBoardLabelFilterButton();
  assert.strictEqual(filterButton.getAttribute('aria-label'), 'Filter cards');
  assert.strictEqual(filterButton.getAttribute('data-sb-tooltip'), 'Filter cards');
  assert.strictEqual(filterButton.classList.contains('is-active'), false);
  assert.strictEqual(filterButton.getAttribute('data-active-filters'), '0');

  const filterState = context.getBoardLabelState();
  filterState.filterIds = ['label-1'];
  context.renderBoardLabelFilterButton();
  assert.strictEqual(filterButton.getAttribute('aria-label'), 'Filter cards: Urgent');
  assert.strictEqual(filterButton.classList.contains('is-active'), true);
  assert.strictEqual(filterButton.getAttribute('data-active-filters'), '1');

  filterState.filterIds = [];
  filterState.activeDateFilter = 'today';
  context.renderBoardLabelFilterButton();
  assert.strictEqual(filterButton.getAttribute('aria-label'), 'Filter cards: Today');
  assert.strictEqual(filterButton.classList.contains('is-active'), true);
  assert.strictEqual(filterButton.getAttribute('data-active-filters'), '1');

  filterState.filterIds = ['label-1'];
  filterState.activeDateFilter = 'overdue';
  context.renderBoardLabelFilterButton();
  assert.strictEqual(filterButton.getAttribute('aria-label'), 'Filter cards: 2 active');
  assert.strictEqual(filterButton.classList.contains('is-active'), true);
  assert.strictEqual(filterButton.getAttribute('data-active-filters'), '2');

  assert.deepStrictEqual(
    toPlain(context.getCardFilterDueDates('2026-03-10', ['2026-03-09', '2026-03-10'])),
    ['2026-03-09', '2026-03-10'],
    'expected card + task due dates to be deduped and sorted',
  );

  filterState.filterIds = ['label-1'];
  filterState.activeDateFilter = 'today';
  assert.strictEqual(context.cardMatchesBoardLabelFilter(['label-1'], ['2026-03-10']), true);
  assert.strictEqual(context.cardMatchesBoardLabelFilter(['label-1'], ['2026-03-09']), false);
  assert.strictEqual(context.cardMatchesBoardLabelFilter(['label-2'], ['2026-03-10']), false);

  filterState.filterIds = [];
  filterState.activeDateFilter = 'overdue';
  assert.strictEqual(context.cardMatchesBoardLabelFilter([], ['2026-03-09']), true);
  assert.strictEqual(context.cardMatchesBoardLabelFilter([], ['2026-03-10']), false);
  assert.strictEqual(context.doesBoardDateFilterMatchDueDate('2026-03-09'), true);
  assert.strictEqual(context.doesBoardDateFilterMatchDueDate('2026-03-10'), false);
  assert.strictEqual(
    context.cardMatchesBoardLabelFilter([], ['2026-03-09'], []),
    false,
    'expected overdue filter to ignore completed overdue task dates when there is no overdue card due date',
  );
  assert.deepStrictEqual(
    toPlain(context.getActiveBoardFilterDueDates('', ['2026-03-09'], [])),
    [],
    'expected overdue active-filter due dates to ignore completed overdue task dates',
  );
  assert.deepStrictEqual(
    toPlain(context.getActiveBoardFilterDueDates('2026-03-08', ['2026-03-09'], [])),
    ['2026-03-08'],
    'expected overdue active-filter due dates to keep overdue card due dates',
  );
  assert.strictEqual(context.getShortcutHintText('boardSettings'), 'Ctrl+,');
  assert.strictEqual(context.getShortcutHintText('switchBoard'), 'Ctrl+K');
  assert.strictEqual(context.getShortcutHintText('toggleTheme'), 'Ctrl+Shift+D');
  assert.strictEqual(context.getShortcutHintText('cycleColorScheme'), 'Ctrl+Alt+Shift+C');
  assert.strictEqual(context.getShortcutKeycapText('moveCardLeft'), 'Ctrl + Shift + [');
  assert.strictEqual(context.getShortcutKeycapText('moveCardRight'), 'Ctrl + Shift + ]');
  assert.strictEqual(context.getShortcutKeycapText('archiveCard'), 'Ctrl + Alt + Shift + Backspace');
  assert.strictEqual(context.getShortcutHintText('archiveBrowser'), 'Ctrl+Shift+A');
  assert.strictEqual(context.getShortcutKeycapText('kanbanView'), 'Ctrl + 1');

  context.renderBoardViewPopover();
  assert(viewPopover.textContent.includes('Ctrl+1'), 'expected Kanban shortcut hint in view popover');
  assert(viewPopover.textContent.includes('Ctrl+2'), 'expected Calendar shortcut hint in view popover');
  assert(viewPopover.textContent.includes('Ctrl+3'), 'expected This Week shortcut hint in view popover');

  const listActionsState = context.getListActionsPopoverState();
  listActionsState.anchorElement = new MockElement('button');
  listActionsState.listPath = '/tmp/board/001-Backlog-abc12';
  listActionsState.listDisplayName = 'Backlog';
  listActionsState.cardCount = 3;
  context.renderListActionsPopover();
  assert(listActionsPopover.textContent.includes('Ctrl+N'), 'expected add-card shortcut hint in list actions popover');
  assert(listActionsPopover.textContent.includes('Ctrl+Shift+N'), 'expected add-list shortcut hint in list actions popover');

  context.setBoardLabels(Array.from({ length: 11 }, (_, index) => createLabel(index + 1)));
  filterState.filterIds = ['label-1'];
  filterState.activeDateFilter = 'today';
  context.renderBoardLabelFilterPopover();

  assert(filterPopover.textContent.includes('Today'), 'expected Today row in filter popover');
  assert(filterPopover.textContent.includes('Overdue'), 'expected Overdue row in filter popover');
  assert(findFirstByClass(filterPopover, 'label-popover-separator'), 'expected separator in filter popover');
  assert(findFirstByClass(filterPopover, 'label-popover-labels-scroll'), 'expected scroll container for long label lists');

  const clearButton = findFirstByClass(filterPopover, 'label-popover-clear');
  assert(clearButton, 'expected clear button');
  assert.strictEqual(clearButton.textContent, 'Clear filters');

  const todayTaskBody = '- [ ] (due: 2026-03-10) Prep launch';
  const todayTaskItems = context.parseTaskListItems(todayTaskBody);
  const entries = [
    {
      cardPath: '/tmp/task-today.md',
      listName: '003-In Progress-abc12',
      listDisplayName: 'In Progress',
      title: 'Task due today',
      due: '',
      labels: ['label-1'],
      body: todayTaskBody,
      taskSummary: { total: 1, completed: 0, remaining: 1 },
      taskItems: todayTaskItems,
      taskDueDates: context.getTaskListDueDates(todayTaskBody),
    },
    {
      cardPath: '/tmp/card-overdue.md',
      listName: '001-Backlog-abc12',
      listDisplayName: 'Backlog',
      title: 'Card overdue',
      due: '2026-03-09',
      labels: ['label-2'],
      body: 'Body',
      taskSummary: { total: 0, completed: 0, remaining: 0 },
      taskItems: [],
      taskDueDates: [],
      incompleteTaskDueDates: [],
    },
    {
      cardPath: '/tmp/mixed-dates.md',
      listName: '002-Doing-abc12',
      listDisplayName: 'Doing',
      title: 'Mixed due dates',
      due: '2026-03-10',
      labels: ['label-1'],
      body: '- [ ] (due: 2026-03-09) Missed prep',
      taskSummary: { total: 1, completed: 0, remaining: 1 },
      taskItems: context.parseTaskListItems('- [ ] (due: 2026-03-09) Missed prep'),
      taskDueDates: ['2026-03-09'],
      incompleteTaskDueDates: ['2026-03-09'],
    },
    {
      cardPath: '/tmp/completed-overdue-task.md',
      listName: '002-Doing-abc12',
      listDisplayName: 'Doing',
      title: 'Completed overdue task',
      due: '',
      labels: ['label-1'],
      body: '- [x] (due: 2026-03-09) Finished prep',
      taskSummary: { total: 1, completed: 1, remaining: 0 },
      taskItems: context.parseTaskListItems('- [x] (due: 2026-03-09) Finished prep'),
      taskDueDates: ['2026-03-09'],
      incompleteTaskDueDates: [],
    },
  ];

  filterState.filterIds = ['label-1'];
  filterState.activeDateFilter = 'today';
  const todayCalendarBuckets = context.buildCalendarCardBuckets(entries, new context.Date(2026, 2, 1));
  const todayCalendarEntries = todayCalendarBuckets.get('2026-03-10') || [];
  assert.strictEqual(todayCalendarEntries.length, 2, 'expected only today placements that match active filters in calendar view');
  assert.strictEqual(todayCalendarEntries[0].temporalReason, 'task');
  assert.strictEqual(todayCalendarBuckets.has('2026-03-09'), false);

  const todayWeekBuckets = context.buildWeekCardBuckets(entries, new context.Date(2026, 2, 9));
  const todayWeekEntries = todayWeekBuckets.get('2026-03-10') || [];
  assert.strictEqual(todayWeekEntries.length, 2, 'expected only today placements that match active filters in week view');
  assert.strictEqual(todayWeekEntries[0].temporalReason, 'task');
  assert.strictEqual(todayWeekBuckets.has('2026-03-09'), false);

  filterState.filterIds = [];
  filterState.activeDateFilter = 'overdue';
  const overdueCalendarBuckets = context.buildCalendarCardBuckets(entries, new context.Date(2026, 2, 1));
  const overdueCalendarEntries = overdueCalendarBuckets.get('2026-03-09') || [];
  assert.strictEqual(overdueCalendarEntries.length, 2, 'expected overdue view to ignore completed overdue task placements in calendar view');
  assert.strictEqual(overdueCalendarEntries[0].temporalReason, 'card');
  assert.strictEqual(overdueCalendarBuckets.has('2026-03-10'), false);

  const overdueWeekBuckets = context.buildWeekCardBuckets(entries, new context.Date(2026, 2, 9));
  const overdueWeekEntries = overdueWeekBuckets.get('2026-03-09') || [];
  assert.strictEqual(overdueWeekEntries.length, 2, 'expected overdue view to ignore completed overdue task placements in week view');
  assert.strictEqual(overdueWeekEntries[0].temporalReason, 'card');
  assert.strictEqual(overdueWeekBuckets.has('2026-03-10'), false);
}

run();
