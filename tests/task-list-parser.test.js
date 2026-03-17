import { describe, it, expect } from 'vitest';
import vm from 'vm';
import { loadSource } from './helpers/vm-loader.js';

function loadTaskListUtilities() {
  const context = { console };
  vm.createContext(context);
  loadSource(context, 'app/utilities/dueDateStatus.js');
  loadSource(context, 'app/utilities/taskList.js');
  return context;
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

describe('task list parser', () => {
  const context = loadTaskListUtilities();
  const { getTaskListSummary, getTaskListDueDates } = context;

  it('counts all unchecked tasks correctly', () => {
    const baseline = [
      '- [ ] Task one',
      '- [ ] Task two',
      '- [ ] Task three',
    ].join('\n');

    expect(toPlain(getTaskListSummary(baseline))).toEqual({
      total: 3,
      completed: 0,
      remaining: 3,
    });
  });

  it('accepts spaced, lowercase, and capital X completed variants', () => {
    const withCompletedVariants = [
      '- [x ] Task one',
      '- [X ] Task two',
      '- [ x] Task three',
      '- [ X] Task four',
      '- [ x ] Task five',
      '- [ X ] Task six',
      '- [ ] Task seven',
    ].join('\n');

    expect(toPlain(getTaskListSummary(withCompletedVariants))).toEqual({
      total: 7,
      completed: 6,
      remaining: 1,
    });
  });

  it('extracts unique sorted due dates from tasks', () => {
    const withTaskDueDates = [
      '- [ ] (due: 2026-03-20) Task one',
      '- [x ] (due: 2026-03-20) Task two',
      '- [ ] (due: 2026-03-22) Task three',
    ].join('\n');

    expect(toPlain(getTaskListDueDates(withTaskDueDates))).toEqual([
      '2026-03-20',
      '2026-03-22',
    ]);
  });

  it('only parses checklist lines as tasks, ignoring other list types', () => {
    const withHeadingsAndPlainLists = [
      '## Notes',
      '',
      '- Plain bullet item',
      '1. Numbered item',
      '* Another plain bullet',
      '- [ ] Actual task item',
      '',
    ].join('\n');

    expect(toPlain(getTaskListSummary(withHeadingsAndPlainLists))).toEqual({
      total: 1,
      completed: 0,
      remaining: 1,
    });
  });
});
