const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTaskListUtilities() {
  const context = { console };
  vm.createContext(context);

  const dueDateSource = fs.readFileSync(path.join(__dirname, '../app/utilities/dueDateStatus.js'), 'utf8');
  vm.runInContext(dueDateSource, context);

  const taskListSource = fs.readFileSync(path.join(__dirname, '../app/utilities/taskList.js'), 'utf8');
  vm.runInContext(taskListSource, context);

  return context;
}

function run() {
  const context = loadTaskListUtilities();
  const {
    getTaskListSummary,
    getTaskListDueDates,
    getIncompleteTaskListDueDates,
    getTaskListStartDates,
    getIncompleteTaskListStartDates,
    parseTaskListItems,
    setTaskListItemStartDateByLineIndex,
    setTaskListItemDueDateByLineIndex,
  } = context;
  const toPlain = (value) => JSON.parse(JSON.stringify(value));

  const baseline = [
    '- [ ] Task one',
    '- [ ] Task two',
    '- [ ] Task three',
  ].join('\n');
  assert.deepStrictEqual(
    toPlain(getTaskListSummary(baseline)),
    { total: 3, completed: 0, remaining: 3 },
    'Expected 0/3 for unchecked task list',
  );

  const withCompletedVariants = [
    '- [x ] Task one',
    '- [X ] Task two',
    '- [ x] Task three',
    '- [ X] Task four',
    '- [ x ] Task five',
    '- [ X ] Task six',
    '- [ ] Task seven',
  ].join('\n');
  assert.deepStrictEqual(
    toPlain(getTaskListSummary(withCompletedVariants)),
    { total: 7, completed: 6, remaining: 1 },
    'Expected completed parser to accept spaced/lower/capital X variants',
  );

  const withTaskDueDates = [
    '- [ ] (due: 2026-03-20) Task one',
    '- [x ] (due: 2026-03-20) Task two',
    '- [ ] (due: 2026-03-22) Task three',
  ].join('\n');
  assert.deepStrictEqual(
    toPlain(getTaskListDueDates(withTaskDueDates)),
    ['2026-03-20', '2026-03-22'],
    'Expected unique sorted task due dates',
  );
  assert.deepStrictEqual(
    toPlain(getIncompleteTaskListDueDates(withTaskDueDates)),
    ['2026-03-20', '2026-03-22'],
    'Expected completed task due dates to be ignored when collecting incomplete task due dates',
  );

  const withStartAndDueDates = [
    '- [ ] (start: 2026-03-18) (due: 2026-03-20) Task one',
    '- [x ] (scheduled: 2026-03-19) (due: 2026-03-21) Task two',
    '- [ ] (due: 2026-03-22) (start: 2026-03-17) Task three',
  ].join('\n');
  assert.deepStrictEqual(
    toPlain(getTaskListStartDates(withStartAndDueDates)),
    ['2026-03-17', '2026-03-18', '2026-03-19'],
    'Expected unique sorted task start dates',
  );
  assert.deepStrictEqual(
    toPlain(getIncompleteTaskListStartDates(withStartAndDueDates)),
    ['2026-03-17', '2026-03-18'],
    'Expected completed task start dates to be ignored when collecting incomplete task start dates',
  );
  const parsedStartDueTask = toPlain(parseTaskListItems(withStartAndDueDates)[0]);
  assert.strictEqual(parsedStartDueTask.start, '2026-03-18');
  assert.strictEqual(parsedStartDueTask.due, '2026-03-20');
  assert.strictEqual(parsedStartDueTask.contentWithoutDateMarkers, 'Task one');
  assert.strictEqual(
    setTaskListItemDueDateByLineIndex('- [ ] (start: 2026-03-18) Task one', 0, '2026-03-20'),
    '- [ ] (start: 2026-03-18) (due: 2026-03-20) Task one',
    'Expected setting a due date to preserve an existing start marker',
  );
  assert.strictEqual(
    setTaskListItemStartDateByLineIndex('- [ ] (due: 2026-03-20) Task one', 0, '2026-03-18'),
    '- [ ] (start: 2026-03-18) (due: 2026-03-20) Task one',
    'Expected setting a start date to preserve an existing due marker',
  );

  const withOnlyCompletedDueTasks = [
    '- [x ] (due: 2026-03-18) Closed task one',
    '- [X ] (due: 2026-03-19) Closed task two',
  ].join('\n');
  assert.deepStrictEqual(
    toPlain(getIncompleteTaskListDueDates(withOnlyCompletedDueTasks)),
    [],
    'Expected no incomplete task due dates when all due-marked tasks are completed',
  );

  const withHeadingsAndPlainLists = [
    '## Notes',
    '',
    '- Plain bullet item',
    '1. Numbered item',
    '* Another plain bullet',
    '- [ ] Actual task item',
    '',
  ].join('\n');
  assert.deepStrictEqual(
    toPlain(getTaskListSummary(withHeadingsAndPlainLists)),
    { total: 1, completed: 0, remaining: 1 },
    'Expected only checklist lines to be parsed as tasks',
  );

  console.log('Task list parser tests passed.');
}

run();
