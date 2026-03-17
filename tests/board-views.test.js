import { describe, it, expect } from 'vitest';
import vm from 'vm';
import { loadSource } from './helpers/vm-loader.js';

describe('boardViews', () => {
  function createContext() {
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
    return context;
  }

  it('normalizes prefixed list directory names for display', () => {
    const context = createContext();
    expect(context.getBoardListDisplayName('003-In Progress-abc12')).toBe('In Progress');
  });

  it('leaves plain list names unchanged', () => {
    const context = createContext();
    expect(context.getBoardListDisplayName('Inbox')).toBe('Inbox');
  });

  it('creates temporal placement for tasks with shared card due date', () => {
    const context = createContext();

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

    expect(taskPlacement).toBeTruthy();
    expect(taskPlacement.temporalReason).toBe('task');
    expect(taskPlacement.temporalDisplayTitle).toBe('Prep launch +1 more');
    expect(taskPlacement.temporalDisplaySubtitle).toBe('Board launch');
    expect(taskPlacement.listDisplayName).toBe('In Progress');
  });

  it('creates temporal placement for card-only due date', () => {
    const context = createContext();

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

    expect(cardPlacement).toBeTruthy();
    expect(cardPlacement.temporalReason).toBe('card');
    expect(cardPlacement.temporalDisplayTitle).toBe('Card-only due date');
    expect(cardPlacement.temporalDisplaySubtitle).toBe('');
    expect(cardPlacement.listDisplayName).toBe('Backlog');
  });

  it('builds calendar card buckets with correct date grouping', () => {
    const context = createContext();

    const body = [
      '- [ ] (due: 2026-03-10) Prep launch',
      '- [ ] (due: 2026-03-10) Email team',
      '- [ ] (due: 2026-03-12) Review launch notes',
    ].join('\n');
    const taskItems = context.parseTaskListItems(body);

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

    expect(marchTenthEntries.length).toBe(1);
    expect(marchTenthEntries[0].temporalDisplayTitle).toBe('Prep launch +1 more');
    expect(marchTenthEntries[0].temporalDisplaySubtitle).toBe('Board launch');
    expect(marchTenthEntries[0].listDisplayName).toBe('In Progress');
    expect(marchTwelfthEntries.length).toBe(1);
    expect(marchTwelfthEntries[0].temporalDisplayTitle).toBe('Review launch notes');
    expect(marchTwelfthEntries[0].temporalDisplaySubtitle).toBe('Board launch');
    expect(marchTwelfthEntries[0].listDisplayName).toBe('In Progress');
  });
});
