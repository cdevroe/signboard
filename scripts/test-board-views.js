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

  get childElementCount() {
    return this.children.filter((child) => typeof child !== 'string').length;
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

  removeAttribute(name) {
    delete this.attributes[name];
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
  const workspaceButtonMap = new Map();
  let timerId = 0;
  const timers = new Map();
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
    querySelector: (selector) => {
      const match = String(selector || '').match(/\.workspace-view-dock-button\[data-workspace-view="([^"]+)"\]/);
      if (match) {
        return workspaceButtonMap.get(match[1]) || null;
      }
      return null;
    },
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
        readCard: async () => ({ frontmatter: {}, body: '' }),
        formatDueDate: async (dateValue) => String(dateValue || ''),
      },
      setTimeout: (callback, delay = 0) => {
        const id = ++timerId;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => {
        timers.delete(id);
      },
      requestAnimationFrame: (callback) => {
        callback();
        return 0;
      },
    },
    document,
    Element: MockElement,
    Date: createFixedDateClass('2026-03-10'),
    feather: null,
    renderBoard: async () => {},
    normalizeBoardPath: (value) => {
      const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
      return normalized ? `${normalized}/` : '';
    },
    getStoredOpenBoards: () => ['/tmp/client-a/', '/tmp/home/'],
    cardMatchesBoardSearch: () => true,
    openAddListModal: () => {},
    toggleAddCardModal: () => {},
  };

  context.window.document = document;

  vm.createContext(context);
  loadSource(context, 'app/utilities/dueDateStatus.js');
  loadSource(context, 'app/utilities/taskList.js');
  loadSource(context, 'app/utilities/cardTimestamps.js');
  loadSource(context, 'app/utilities/linkedObjects.js');
  loadSource(context, 'app/board/boardLabels.js');
  loadSource(context, 'app/board/boardSearch.js');
  loadSource(context, 'app/board/boardSnapshot.js');
  loadSource(context, 'app/board/boardViews.js');
  loadSource(context, 'app/board/tableView.js');
  loadSource(context, 'app/board/plannerView.js');
  loadSource(context, 'app/lists/listActionsPopover.js');

  const filterButton = new MockElement('button');
  const filterLabel = new MockElement('span');
  const filterPopover = new MockElement('div');
  const workspaceDock = new MockElement('nav');
  const boardEl = new MockElement('main');
  const listActionsPopover = new MockElement('div');
  elements.set('labelFilterButton', filterButton);
  elements.set('labelFilterButtonText', filterLabel);
  elements.set('labelFilterPopover', filterPopover);
  elements.set('workspaceViewDock', workspaceDock);
  elements.set('board', boardEl);
  elements.set('listActionsPopover', listActionsPopover);
  for (const viewId of ['planner', 'kanban', 'table']) {
    const button = new MockElement('button');
    button.className = 'workspace-view-dock-button';
    button.dataset.workspaceView = viewId;
    workspaceButtonMap.set(viewId, button);
    workspaceDock.appendChild(button);
  }

  return {
    context,
    filterButton,
    filterPopover,
    workspaceDock,
    workspaceButtonMap,
    listActionsPopover,
  };
}

async function run() {
  const {
    context,
    filterButton,
    filterPopover,
    workspaceDock,
    workspaceButtonMap,
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
  assert.strictEqual(context.isAutoDetectedCompletedListName('004-Done-abc12'), true);
  assert.strictEqual(context.isAutoDetectedCompletedListName('002-Doing-abc12'), false);
  assert.strictEqual(context.isBoardListCompletedByWorkflow('004-Done-abc12', {
    autoDetectCompletedLists: true,
    completedListNames: [],
    ignoredCompletedListNames: [],
  }), true);
  assert.strictEqual(context.isBoardListCompletedByWorkflow('004-Done-abc12', {
    autoDetectCompletedLists: true,
    completedListNames: [],
    ignoredCompletedListNames: ['004-Done-abc12'],
  }), false);
  assert.strictEqual(context.isBoardListCompletedByWorkflow('002-Doing-abc12', {
    autoDetectCompletedLists: false,
    completedListNames: ['002-Doing-abc12'],
    ignoredCompletedListNames: [],
  }), true);

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

  const completedTaskOnCardDuePlacement = context.createTemporalPlacementForDate({
    cardPath: '/tmp/card-due-completed-task.md',
    listName: '001-Backlog-abc12',
    listDisplayName: 'Backlog',
    title: 'Card due with finished task',
    due: '2026-03-10',
    labels: [],
    body: '- [x] (due: 2026-03-10) Finished prep',
    taskSummary: { total: 1, completed: 1, remaining: 0 },
    taskItems: context.parseTaskListItems('- [x] (due: 2026-03-10) Finished prep'),
    taskDueDates: ['2026-03-10'],
    incompleteTaskDueDates: [],
  }, '2026-03-10');

  assert(completedTaskOnCardDuePlacement, 'expected card placement when the card due date matches');
  assert.strictEqual(completedTaskOnCardDuePlacement.temporalReason, 'card');
  assert.strictEqual(completedTaskOnCardDuePlacement.temporalDisplayTitle, 'Card due with finished task');

  const completedTaskOnlyPlacement = context.createTemporalPlacementForDate({
    cardPath: '/tmp/completed-task-only.md',
    listName: '001-Backlog-abc12',
    listDisplayName: 'Backlog',
    title: 'Finished task only',
    due: '',
    labels: [],
    body: '- [x] (due: 2026-03-10) Finished prep',
    taskSummary: { total: 1, completed: 1, remaining: 0 },
    taskItems: context.parseTaskListItems('- [x] (due: 2026-03-10) Finished prep'),
    taskDueDates: ['2026-03-10'],
    incompleteTaskDueDates: [],
  }, '2026-03-10');

  assert.strictEqual(completedTaskOnlyPlacement, null, 'expected completed task due markers not to create temporal placements');

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

  filterState.filterIds = [];
  filterState.activeDateFilter = 'next:7';
  context.renderBoardLabelFilterButton();
  assert.strictEqual(filterButton.getAttribute('aria-label'), 'Filter cards: Next 7 days');

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
  filterState.activeDateFilter = 'next:7';
  assert.strictEqual(context.doesBoardDateFilterMatchDueDate('2026-03-10'), true);
  assert.strictEqual(context.doesBoardDateFilterMatchDueDate('2026-03-17'), true);
  assert.strictEqual(context.doesBoardDateFilterMatchDueDate('2026-03-18'), false);
  assert.strictEqual(context.cardMatchesBoardLabelFilter([], ['2026-03-12']), true);
  assert.deepStrictEqual(
    toPlain(context.getActiveBoardFilterDueDates('', ['2026-03-12'], [])),
    [],
    'expected next-range active-filter due dates to ignore completed task dates',
  );
  filterState.activeDateFilter = 'overdue';
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
  filterState.activeDateFilter = 'today';
  assert.deepStrictEqual(
    toPlain(context.getActiveBoardFilterDueDates('', ['2026-03-10'], [])),
    [],
    'expected today active-filter due dates to ignore completed task dates',
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
  assert.strictEqual(context.getShortcutKeycapText('tableView'), 'Ctrl + Alt + 1');
  assert.strictEqual(context.getShortcutHintText('tableView'), 'Ctrl+Alt+1');
  assert.strictEqual(context.getShortcutKeycapText('plannerToggle'), 'Ctrl + Shift + P');
  assert.strictEqual(context.getShortcutKeycapText('plannerDayView'), 'Ctrl + 4');
  assert.strictEqual(context.getShortcutKeycapText('plannerAgendaView'), 'Ctrl + 5');
  assert.strictEqual(context.normalizeBoardViewId('table'), 'table');

  const tableHeader = context.createBoardTableHeader();
  assert.deepStrictEqual(
    toPlain(tableHeader.children[0].children.map((headerCell) => headerCell.textContent)),
    ['', 'Start', 'Due', 'Updated', 'Created', 'Tasks', 'Links', 'Card', 'List', 'Labels'],
    'expected table columns to keep the configured order',
  );

  const sortableTableCards = [
    {
      title: 'New untouched',
      boardOrderIndex: 0,
      timestamps: {
        createdAt: '2026-03-09T12:00:00.000Z',
        updatedAt: '2026-03-09T12:00:00.000Z',
      },
    },
    {
      title: 'Old stale',
      boardOrderIndex: 1,
      timestamps: {
        createdAt: '2026-01-10T12:00:00.000Z',
        updatedAt: '2026-01-20T12:00:00.000Z',
      },
    },
    {
      title: 'Old active',
      boardOrderIndex: 2,
      timestamps: {
        createdAt: '2026-01-05T12:00:00.000Z',
        updatedAt: '2026-03-10T12:00:00.000Z',
      },
    },
  ];

  assert.deepStrictEqual(
    toPlain(context.sortBoardTableCards(sortableTableCards, 'updated-asc').map((entry) => entry.title)),
    ['Old stale', 'New untouched', 'Old active'],
    'expected updated oldest-first sort to surface stale cards',
  );
  assert.deepStrictEqual(
    toPlain(context.sortBoardTableCards(sortableTableCards, 'created-asc').map((entry) => entry.title)),
    ['Old active', 'Old stale', 'New untouched'],
    'expected created oldest-first sort to surface oldest cards',
  );

  context.window.boardRoot = '/tmp/client-a/';
  context.initializeBoardViewControls();
  assert.strictEqual(workspaceDock.getAttribute('aria-hidden'), 'false', 'expected workspace dock to be visible with an open board');
  assert.strictEqual(workspaceButtonMap.get('planner').getAttribute('title'), 'Planner (Ctrl+Shift+P)');
  assert.strictEqual(workspaceButtonMap.get('kanban').getAttribute('title'), 'Kanban (Ctrl+1)');
  assert.strictEqual(workspaceButtonMap.get('table').getAttribute('title'), 'Table (Ctrl+Alt+1)');
  assert.strictEqual(workspaceButtonMap.get('kanban').getAttribute('aria-pressed'), 'true', 'expected Kanban to default active');
  assert.strictEqual(workspaceButtonMap.get('table').getAttribute('aria-pressed'), 'false', 'expected Table to start inactive');

  context.setActiveBoardView('table', { render: false });
  assert.strictEqual(workspaceButtonMap.get('table').getAttribute('aria-pressed'), 'true', 'expected Table dock button to become active');
  assert.strictEqual(workspaceButtonMap.get('kanban').getAttribute('aria-pressed'), 'false', 'expected Kanban dock button to become inactive');
  assert.strictEqual(context.getWorkspaceViewTransitionDirection('planner', 'kanban'), 'right', 'expected Kanban to sit right of Planner');
  assert.strictEqual(context.getWorkspaceViewTransitionDirection('kanban', 'planner'), 'left', 'expected Planner to sit left of Kanban');
  assert.strictEqual(context.getWorkspaceViewTransitionDirection('kanban', 'table'), 'right', 'expected Table to sit right of Kanban');
  assert.strictEqual(context.getWorkspaceViewTransitionDirection('table', 'kanban'), 'left', 'expected Kanban to sit left of Table');
  context.setWorkspaceTransitionDirection('right');
  context.playPendingWorkspaceBoardTransition();
  assert.strictEqual(context.document.body.getAttribute('data-workspace-transition'), 'enter-right', 'expected Table-side views to enter from the right');
  context.clearWorkspaceTransitionState();
  context.setWorkspaceTransitionDirection('left');
  context.playPendingWorkspaceBoardTransition();
  assert.strictEqual(context.document.body.getAttribute('data-workspace-transition'), 'enter-left', 'expected Planner-side views to enter from the left');
  context.clearWorkspaceTransitionState();

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
  assert(filterPopover.textContent.includes('Next 7 days'), 'expected Next 7 days row in filter popover');
  assert(findFirstByClass(filterPopover, 'label-popover-separator'), 'expected separator in filter popover');
  assert(findFirstByClass(filterPopover, 'label-popover-labels-scroll'), 'expected scroll container for long label lists');

  const clearButton = findFirstByClass(filterPopover, 'label-popover-clear');
  assert(clearButton, 'expected clear button');
  assert.strictEqual(clearButton.textContent, 'Clear filters');

  const todayTaskBody = '- [ ] (due: 2026-03-10) Prep launch';
  const todayTaskItems = context.parseTaskListItems(todayTaskBody);
  const entries = [
    {
      cardPath: '/tmp/task-starts-soon.md',
      listName: '003-In Progress-abc12',
      listDisplayName: 'In Progress',
      title: 'Task starts soon',
      start: '',
      due: '',
      labels: [],
      body: '- [ ] (start: 2026-03-12) Draft outline',
      taskSummary: { total: 1, completed: 0, remaining: 1 },
      taskItems: context.parseTaskListItems('- [ ] (start: 2026-03-12) Draft outline'),
      taskStartDates: ['2026-03-12'],
      incompleteTaskStartDates: ['2026-03-12'],
      taskDueDates: [],
      incompleteTaskDueDates: [],
    },
    {
      cardPath: '/tmp/card-starts-soon.md',
      listName: '001-Backlog-abc12',
      listDisplayName: 'Backlog',
      title: 'Card starts soon',
      start: '2026-03-12',
      due: '',
      labels: [],
      body: 'Body',
      taskSummary: { total: 0, completed: 0, remaining: 0 },
      taskItems: [],
      taskStartDates: [],
      incompleteTaskStartDates: [],
      taskDueDates: [],
      incompleteTaskDueDates: [],
    },
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
      incompleteTaskDueDates: context.getIncompleteTaskListDueDates(todayTaskBody),
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
    {
      cardPath: '/tmp/completed-today-task.md',
      listName: '002-Doing-abc12',
      listDisplayName: 'Doing',
      title: 'Completed today task',
      due: '',
      labels: ['label-1'],
      body: '- [x] (due: 2026-03-10) Finished today',
      taskSummary: { total: 1, completed: 1, remaining: 0 },
      taskItems: context.parseTaskListItems('- [x] (due: 2026-03-10) Finished today'),
      taskDueDates: ['2026-03-10'],
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

  filterState.activeDateFilter = 'next:7';
  const nextCalendarBuckets = context.buildCalendarCardBuckets(entries, new context.Date(2026, 2, 1));
  const nextStartEntries = nextCalendarBuckets.get('2026-03-12') || [];
  assert.deepStrictEqual(
    toPlain(nextStartEntries.map((entry) => entry.temporalReason).sort()),
    ['card-start', 'task-start'],
    'expected next-range calendar view to include card and task start placements',
  );

  const tableLists = [
    {
      listName: '000-To-do-stock',
      listPath: '/tmp/board/000-To-do-stock',
      cards: ['000-alpha.md', '001-beta.md'],
    },
    {
      listName: '001-Done-stock',
      listPath: '/tmp/board/001-Done-stock',
      cards: ['000-done.md'],
    },
  ];
  const tableCards = new Map([
    ['/tmp/board/000-To-do-stock/000-alpha.md', {
      frontmatter: {
        title: 'Alpha task',
        labels: ['label-1'],
        linked_objects: [
          { type: 'url', url: 'https://example.com/docs' },
          { type: 'file', path: '/tmp/example.pdf' },
        ],
      },
      body: '- [ ] (due: 2026-03-10) Prep table view',
    }],
    ['/tmp/board/000-To-do-stock/001-beta.md', {
      frontmatter: { title: 'Beta overdue', due: '2026-03-09', labels: ['label-2'] },
      body: 'Body',
    }],
    ['/tmp/board/001-Done-stock/000-done.md', {
      frontmatter: { title: 'Finished overdue', due: '2026-03-09' },
      body: 'Done body',
    }],
  ]);
  context.window.board.readCard = async (cardPath) => tableCards.get(cardPath) || { frontmatter: {}, body: '' };
  context.window.board.formatDueDate = async (dateValue) => `formatted ${dateValue}`;

  filterState.filterIds = [];
  filterState.activeDateFilter = '';
  context.setBoardSearchQuery('');
  const unfilteredTableState = await context.collectBoardTableCards('/tmp/board/', tableLists);
  assert.strictEqual(unfilteredTableState.allCards.length, 3, 'expected table collection to read every card');
  assert.strictEqual(unfilteredTableState.visibleCards.length, 3, 'expected table view to include every unfiltered card');
  assert.strictEqual(unfilteredTableState.allCards[0].linkedObjectCount, 2, 'expected table collection to count linked objects');

  context.getBoardTableState().listFilter = 'completed';
  const completedListTableState = await context.collectBoardTableCards('/tmp/board/', tableLists);
  assert.deepStrictEqual(
    toPlain(completedListTableState.visibleCards.map((card) => card.title)),
    ['Finished overdue'],
    'expected table list filter to show completed-list cards',
  );
  context.getBoardTableState().listFilter = 'list:/tmp/board/000-To-do-stock';
  const singleListTableState = await context.collectBoardTableCards('/tmp/board/', tableLists);
  assert.deepStrictEqual(
    toPlain(singleListTableState.visibleCards.map((card) => card.title)),
    ['Alpha task', 'Beta overdue'],
    'expected table list filter to show cards from one list',
  );
  context.getBoardTableState().listFilter = 'all';

  context.clearBoardTableSelection();
  const tableSelectionEntries = context.sortBoardTableCards(unfilteredTableState.visibleCards);
  context.selectBoardTableEntryRange(tableSelectionEntries[0], tableSelectionEntries, true, false);
  assert.deepStrictEqual(
    toPlain(context.getBoardTableSelectedEntries(tableSelectionEntries).map((card) => card.title)),
    ['Alpha task'],
    'expected first selected table row to seed selection',
  );
  context.selectBoardTableEntryRange(tableSelectionEntries[2], tableSelectionEntries, true, true);
  assert.deepStrictEqual(
    toPlain(context.getBoardTableSelectedEntries(tableSelectionEntries).map((card) => card.title)),
    ['Alpha task', 'Beta overdue', 'Finished overdue'],
    'expected shift-select to select the row range',
  );
  context.selectBoardTableEntryRange(tableSelectionEntries[1], tableSelectionEntries, false, true);
  assert.deepStrictEqual(
    toPlain(context.getBoardTableSelectedEntries(tableSelectionEntries).map((card) => card.title)),
    ['Alpha task'],
    'expected shift-unselect to clear the row range',
  );
  context.clearBoardTableSelection();

  assert.deepStrictEqual(
    toPlain(context.getBoardTableLabelsWithAddedIds(['label-2'], ['label-1', 'label-2'])),
    ['label-2', 'label-1'],
    'expected bulk add labels to preserve existing labels and append new labels',
  );
  assert.deepStrictEqual(
    toPlain(context.getBoardTableLabelsWithoutIds(['label-1', 'label-2'], ['label-1'])),
    ['label-2'],
    'expected bulk remove labels to remove only selected labels',
  );

  filterState.filterIds = ['label-1'];
  const labelFilteredTableState = await context.collectBoardTableCards('/tmp/board/', tableLists);
  assert.deepStrictEqual(
    toPlain(labelFilteredTableState.visibleCards.map((card) => card.title)),
    ['Alpha task'],
    'expected table view to reuse board label filters',
  );

  filterState.filterIds = [];
  filterState.activeDateFilter = 'overdue';
  const overdueTableState = await context.collectBoardTableCards('/tmp/board/', tableLists);
  assert.deepStrictEqual(
    toPlain(overdueTableState.visibleCards.map((card) => card.title)),
    ['Beta overdue'],
    'expected table overdue filter to hide completed-list cards',
  );

  filterState.activeDateFilter = '';
  context.setBoardSearchQuery('prep');
  const searchTableState = await context.collectBoardTableCards('/tmp/board/', tableLists);
  assert.deepStrictEqual(
    toPlain(searchTableState.visibleCards.map((card) => card.title)),
    ['Alpha task'],
    'expected table view to reuse board search',
  );

  context.setBoardSearchQuery('');
  const tableRender = await context.renderTableBoard('/tmp/board/', tableLists);
  assert(tableRender.root.textContent.includes('Alpha task'), 'expected rendered table to include card title');
  assert(tableRender.root.textContent.includes('To-do'), 'expected rendered table to include list dropdown text');
  assert(tableRender.root.textContent.includes('Links'), 'expected rendered table to include links column');
  const tableLinksBadge = findFirstByClass(tableRender.root, 'board-table-linked-objects-badge');
  assert(tableLinksBadge, 'expected rendered table to show linked-object badge');
  assert.strictEqual(tableLinksBadge.textContent, '2');

  const plannerState = context.getPlannerState();
  plannerState.searchTokens = [];
  plannerState.dateFilter = '';

  context.setPlannerCalendarCursorDate(new context.Date(2026, 2, 10));
  context.setPlannerWeekCursorDate(new context.Date(2026, 2, 10));
  context.setPlannerDayCursorDate(new context.Date(2026, 2, 10));
  assert.deepStrictEqual(
    toPlain(context.reconcilePlannerDateCursors(
      new context.Date(2026, 2, 10),
      new context.Date(2026, 2, 16),
    )),
    { calendarChanged: false, weekChanged: true, dayChanged: true },
    'expected tracked Planner cursors to follow the local day into a new week',
  );
  assert.strictEqual(
    context.formatIsoLocalDate(context.getPlannerWeekCursorDate()),
    '2026-03-16',
    'expected This Week to advance to the new current week',
  );
  assert.strictEqual(
    context.formatIsoLocalDate(context.getPlannerDayCursorDate()),
    '2026-03-16',
    'expected Day to advance to the new current day',
  );

  context.setPlannerCalendarCursorDate(new context.Date(2026, 2, 31));
  context.setPlannerWeekCursorDate(new context.Date(2026, 2, 31));
  context.setPlannerDayCursorDate(new context.Date(2026, 2, 31));
  assert.deepStrictEqual(
    toPlain(context.reconcilePlannerDateCursors(
      new context.Date(2026, 2, 31),
      new context.Date(2026, 3, 6),
    )),
    { calendarChanged: true, weekChanged: true, dayChanged: true },
    'expected tracked Planner cursors to follow month and week boundaries after a long sleep',
  );
  assert.strictEqual(
    context.formatIsoLocalDate(context.getPlannerCalendarCursorDate()),
    '2026-04-01',
    'expected Calendar to advance to the new current month',
  );

  context.setPlannerCalendarCursorDate(new context.Date(2026, 0, 1));
  context.setPlannerWeekCursorDate(new context.Date(2026, 1, 2));
  context.setPlannerDayCursorDate(new context.Date(2026, 1, 3));
  assert.deepStrictEqual(
    toPlain(context.reconcilePlannerDateCursors(
      new context.Date(2026, 2, 10),
      new context.Date(2026, 3, 6),
    )),
    { calendarChanged: false, weekChanged: false, dayChanged: false },
    'expected deliberately browsed Planner dates to remain pinned across a local day rollover',
  );
  assert.strictEqual(context.formatIsoLocalDate(context.getPlannerCalendarCursorDate()), '2026-01-01');
  assert.strictEqual(context.formatIsoLocalDate(context.getPlannerWeekCursorDate()), '2026-02-02');
  assert.strictEqual(context.formatIsoLocalDate(context.getPlannerDayCursorDate()), '2026-02-03');

  const plannerEntries = [
    {
      cardPath: '/tmp/client-a/task-today.md',
      boardRoot: '/tmp/client-a/',
      boardDisplayName: 'Client A',
      listName: '001-Next-abc12',
      listDisplayName: 'Next',
      isCompletedList: false,
      title: 'Client task',
      due: '',
      labels: [],
      body: '- [ ] (due: 2026-03-10) Send proposal',
      taskSummary: { total: 1, completed: 0, remaining: 1 },
      taskItems: context.parseTaskListItems('- [ ] (due: 2026-03-10) Send proposal'),
      taskDueDates: ['2026-03-10'],
      incompleteTaskDueDates: ['2026-03-10'],
    },
    {
      cardPath: '/tmp/client-a/task-finished-today.md',
      boardRoot: '/tmp/client-a/',
      boardDisplayName: 'Client A',
      listName: '001-Next-abc12',
      listDisplayName: 'Next',
      isCompletedList: false,
      title: 'Finished client task',
      due: '',
      labels: [],
      body: '- [x] (due: 2026-03-10) Send signed proposal',
      taskSummary: { total: 1, completed: 1, remaining: 0 },
      taskItems: context.parseTaskListItems('- [x] (due: 2026-03-10) Send signed proposal'),
      taskDueDates: ['2026-03-10'],
      incompleteTaskDueDates: [],
    },
    {
      cardPath: '/tmp/home/card-overdue.md',
      boardRoot: '/tmp/home/',
      boardDisplayName: 'Home',
      listName: '002-Doing-abc12',
      listDisplayName: 'Doing',
      isCompletedList: false,
      title: 'Pay bill',
      due: '2026-03-09',
      labels: [],
      body: 'Body',
      taskSummary: { total: 0, completed: 0, remaining: 0 },
      taskItems: [],
      taskDueDates: [],
      incompleteTaskDueDates: [],
    },
    {
      cardPath: '/tmp/home/completed-overdue.md',
      boardRoot: '/tmp/home/',
      boardDisplayName: 'Home',
      listName: '003-Done-abc12',
      listDisplayName: 'Done',
      isCompletedList: true,
      title: 'Completed task',
      due: '',
      labels: [],
      body: '- [x] (due: 2026-03-09) Finished',
      taskSummary: { total: 1, completed: 1, remaining: 0 },
      taskItems: context.parseTaskListItems('- [x] (due: 2026-03-09) Finished'),
      taskDueDates: ['2026-03-09'],
      incompleteTaskDueDates: [],
    },
    {
      cardPath: '/tmp/home/completed-card-overdue.md',
      boardRoot: '/tmp/home/',
      boardDisplayName: 'Home',
      listName: '003-Done-abc12',
      listDisplayName: 'Done',
      isCompletedList: true,
      title: 'Completed card',
      due: '2026-03-09',
      labels: [],
      body: 'Body',
      taskSummary: { total: 0, completed: 0, remaining: 0 },
      taskItems: [],
      taskDueDates: [],
      incompleteTaskDueDates: [],
    },
  ];

  const plannerCalendarBuckets = context.buildPlannerCalendarCardBuckets(plannerEntries, new context.Date(2026, 2, 1));
  assert.strictEqual((plannerCalendarBuckets.get('2026-03-10') || []).length, 1, 'expected Planner calendar to include task due dates');
  assert.strictEqual((plannerCalendarBuckets.get('2026-03-10') || [])[0].boardDisplayName, 'Client A');
  assert.strictEqual((plannerCalendarBuckets.get('2026-03-09') || []).length, 1, 'expected Planner calendar to hide completed-list cards by default');

  plannerState.dateFilter = 'overdue';
  const plannerOverdueBuckets = context.buildPlannerCalendarCardBuckets(plannerEntries, new context.Date(2026, 2, 1));
  assert.strictEqual((plannerOverdueBuckets.get('2026-03-09') || []).length, 1, 'expected Planner overdue filter to ignore completed-list overdue cards by default');
  assert.strictEqual((plannerOverdueBuckets.get('2026-03-09') || [])[0].title, 'Pay bill');

  plannerState.showCompletedCards = true;
  plannerState.dateFilter = '';
  const plannerCompletedBuckets = context.buildPlannerCalendarCardBuckets(plannerEntries, new context.Date(2026, 2, 1));
  assert.strictEqual((plannerCompletedBuckets.get('2026-03-09') || []).length, 2, 'expected Planner to show completed-list card due dates when requested without showing completed task due markers');
  plannerState.dateFilter = 'overdue';
  const plannerCompletedOverdueBuckets = context.buildPlannerCalendarCardBuckets(plannerEntries, new context.Date(2026, 2, 1));
  assert.strictEqual((plannerCompletedOverdueBuckets.get('2026-03-09') || []).length, 2, 'expected Planner to include completed-list card due dates when completed cards are shown');

  plannerState.dateFilter = '';
  plannerState.showCompletedCards = false;
  plannerState.searchTokens = ['client'];
  const plannerSearchAgenda = context.buildPlannerAgendaPlacements(plannerEntries);
  assert.strictEqual(plannerSearchAgenda.length, 1, 'expected Planner search to match board source text');
  assert.strictEqual(plannerSearchAgenda[0].boardDisplayName, 'Client A');

  context.window.boardRoot = '/tmp/client-a/';
  context.setBoardLabels([createLabel(1, 'Urgent'), createLabel(2, 'Waiting')]);
  plannerEntries[0].labels = ['label-1'];
  plannerState.searchTokens = [];
  plannerState.dateFilter = '';
  plannerState.boardFilterTouched = true;
  plannerState.selectedBoardRoots = new Set(['/tmp/client-a/']);
  plannerState.selectedLabelIds = ['label-1'];
  const plannerLabelAgenda = context.buildPlannerAgendaPlacements(plannerEntries);
  assert.strictEqual(plannerLabelAgenda.length, 1, 'expected Planner label filter to apply when current board is the only selected board');
  plannerState.selectedLabelIds = ['label-2'];
  const plannerLabelEmptyAgenda = context.buildPlannerAgendaPlacements(plannerEntries);
  assert.strictEqual(plannerLabelEmptyAgenda.length, 0, 'expected Planner label filter to hide non-matching labels');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
