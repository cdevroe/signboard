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
  const { getTaskListSummary, getTaskListDueDates } = context;
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

  console.log('Task list parser tests passed.');
}

run();
