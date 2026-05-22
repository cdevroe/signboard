const assert = require('assert');
const path = require('path');

const {
  buildExternalPublishedCalendarIcs,
  collectExternalPublishedCalendarEvents,
} = require('../lib/externalPublishedCalendar');

async function run() {
  const boardRoot = path.join('/tmp', 'signboard-calendar-board');
  const includedList = '001-Next-abc12';
  const completedList = '002-Done-abc12';
  const includedListPath = path.join(boardRoot, includedList);
  const completedListPath = path.join(boardRoot, completedList);
  const cardsByPath = new Map([
    [
      path.join(includedListPath, '001-card-due.md'),
      {
        frontmatter: { title: 'Card due', due: '2026-04-05' },
        body: '- [x] (due: 2026-04-05) Finished task',
      },
    ],
    [
      path.join(includedListPath, '002-task-due.md'),
      {
        frontmatter: { title: 'Task card' },
        body: [
          '- [ ] (due: 2026-04-06) Send proposal',
          '- [x] (due: 2026-04-07) Completed follow-up',
        ].join('\n'),
      },
    ],
    [
      path.join(completedListPath, '003-done-card.md'),
      {
        frontmatter: { title: 'Done card', due: '2026-04-08' },
        body: '- [ ] (due: 2026-04-09) Historical task',
      },
    ],
  ]);

  const events = await collectExternalPublishedCalendarEvents({
    boardRoots: [boardRoot],
    readBoardSettings: async () => ({
      externalPublishedCalendar: { include: true },
      workflow: {
        autoDetectCompletedLists: true,
        completedListNames: [],
        ignoredCompletedListNames: [],
      },
    }),
    listLists: async () => [includedList, completedList],
    listCards: async (listPath) => {
      if (listPath === includedListPath) {
        return ['001-card-due.md', '002-task-due.md'];
      }
      if (listPath === completedListPath) {
        return ['003-done-card.md'];
      }
      return [];
    },
    readCard: async (cardPath) => cardsByPath.get(cardPath),
    getBoardName: () => 'Calendar Board',
  });

  assert.deepStrictEqual(
    events.map((event) => ({ kind: event.kind, date: event.date, summary: event.summary })),
    [
      { kind: 'card', date: '2026-04-05', summary: 'Card due' },
      { kind: 'task', date: '2026-04-06', summary: 'Send proposal' },
    ],
    'expected published calendar events to include card dates and open task dates only',
  );

  const ics = buildExternalPublishedCalendarIcs(events, {
    now: new Date('2026-04-01T12:00:00Z'),
  });

  assert(ics.includes('BEGIN:VCALENDAR'), 'expected VCALENDAR output');
  assert(ics.includes('SUMMARY:Card due'), 'expected card event summary');
  assert(ics.includes('SUMMARY:Send proposal'), 'expected task event summary');
  assert(!ics.includes('Completed follow-up'), 'expected checked task due markers to be excluded');
  assert(!ics.includes('Done card'), 'expected completed-list cards to be excluded');
  assert(ics.includes('DTSTART;VALUE=DATE:20260405'), 'expected all-day card start date');
  assert(ics.includes('DTEND;VALUE=DATE:20260406'), 'expected all-day exclusive end date');

  const optedOutEvents = await collectExternalPublishedCalendarEvents({
    boardRoots: [boardRoot],
    readBoardSettings: async () => ({
      externalPublishedCalendar: { include: false },
      workflow: {},
    }),
    listLists: async () => [includedList],
    listCards: async () => ['001-card-due.md'],
    readCard: async (cardPath) => cardsByPath.get(cardPath),
  });
  assert.strictEqual(optedOutEvents.length, 0, 'expected board-level opt-out to suppress calendar entries');

  const missingBoardRoot = path.join('/tmp', 'signboard-calendar-missing-board');
  const consoleErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    consoleErrors.push(args);
  };

  try {
    const eventsWithMissingBoard = await collectExternalPublishedCalendarEvents({
      boardRoots: [missingBoardRoot, boardRoot],
      readBoardSettings: async (root) => ({
        externalPublishedCalendar: { include: true },
        workflow: root === boardRoot
          ? {
              autoDetectCompletedLists: true,
              completedListNames: [],
              ignoredCompletedListNames: [],
            }
          : {},
      }),
      listLists: async (root) => {
        if (root === missingBoardRoot) {
          const error = new Error('Missing board root');
          error.code = 'ENOENT';
          throw error;
        }

        return [includedList];
      },
      listCards: async (listPath) => listPath === includedListPath ? ['001-card-due.md'] : [],
      readCard: async (cardPath) => cardsByPath.get(cardPath),
      getBoardName: (root) => root === boardRoot ? 'Calendar Board' : 'Missing Board',
    });

    assert.strictEqual(eventsWithMissingBoard.length, 1, 'expected missing board roots to be skipped');
    assert.strictEqual(consoleErrors.length, 0, 'expected missing board roots to be skipped without console errors');
  } finally {
    console.error = originalConsoleError;
  }

  console.log('External Published Calendar tests passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
