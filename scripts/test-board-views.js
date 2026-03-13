const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSource(context, relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  vm.runInContext(source, context);
}

function run() {
  const context = {
    console,
    window: {},
    cardMatchesBoardLabelFilter: () => true,
    cardMatchesBoardSearch: () => true,
  };

  vm.createContext(context);
  loadSource(context, 'app/utilities/dueDateStatus.js');
  loadSource(context, 'app/utilities/taskList.js');
  loadSource(context, 'app/board/boardViews.js');

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

  const calendarBuckets = context.buildCalendarCardBuckets([
    {
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
    },
  ], new Date(2026, 2, 1));

  const marchTenthEntries = calendarBuckets.get('2026-03-10') || [];
  const marchTwelfthEntries = calendarBuckets.get('2026-03-12') || [];

  assert.strictEqual(marchTenthEntries.length, 1, 'expected one placement for shared card/task due date');
  assert.strictEqual(marchTenthEntries[0].temporalDisplayTitle, 'Prep launch +1 more');
  assert.strictEqual(marchTenthEntries[0].temporalDisplaySubtitle, 'Board launch');
  assert.strictEqual(marchTenthEntries[0].listDisplayName, 'In Progress');
  assert.strictEqual(marchTwelfthEntries.length, 1, 'expected one placement for task-only due date');
  assert.strictEqual(marchTwelfthEntries[0].temporalDisplayTitle, 'Review launch notes');
  assert.strictEqual(marchTwelfthEntries[0].temporalDisplaySubtitle, 'Board launch');
  assert.strictEqual(marchTwelfthEntries[0].listDisplayName, 'In Progress');
}

run();
