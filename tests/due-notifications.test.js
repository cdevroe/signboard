import { describe, it, expect } from 'vitest';
import vm from 'vm';
import { loadSource } from './helpers/vm-loader.js';

describe('dueNotifications', () => {
  function createContext() {
    const context = {
      console,
      normalizeBoardPath: (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) {
          return '';
        }
        return normalized.endsWith('/') ? normalized : `${normalized}/`;
      },
    };
    vm.createContext(context);
    loadSource(context, 'app/utilities/dueDateStatus.js');
    loadSource(context, 'app/utilities/taskList.js');
    loadSource(context, 'app/utilities/dueNotifications.js');
    return context;
  }

  function createFixtures() {
    const boardRoot = '/tmp/board/';
    const todayIsoDate = '2026-03-20';
    const listName = '000-To-do-stock';
    const listPath = `${boardRoot}${listName}`;
    const cardsByPath = new Map([
      [
        `${listPath}/001-card-due.md`,
        {
          frontmatter: { title: 'Card Due', due: '2026-03-20' },
          body: 'Card-level due date only.',
        },
      ],
      [
        `${listPath}/002-task-due.md`,
        {
          frontmatter: { title: 'Task Card' },
          body: '- [ ] (due: 2026-03-20) Send launch email to the beta list',
        },
      ],
      [
        `${listPath}/003-completed-task-due.md`,
        {
          frontmatter: { title: 'Completed Task Card' },
          body: '- [x ] (due: 2026-03-20) Already shipped',
        },
      ],
      [
        `${listPath}/004-mixed-task-due.md`,
        {
          frontmatter: { title: 'Mixed Task Card' },
          body: [
            '- [ ] (due: 2026-03-21) Due tomorrow',
            '- [ ] (due: 2026-03-20) Confirm invoice totals',
          ].join('\n'),
        },
      ],
    ]);

    const boardApi = {
      listLists: async (root) => {
        expect(root).toBe(boardRoot);
        return [listName];
      },
      listCards: async (root) => {
        expect(root).toBe(listPath);
        return [
          '001-card-due.md',
          '002-task-due.md',
          '003-completed-task-due.md',
          '004-mixed-task-due.md',
        ];
      },
      readCard: async (cardPath) => {
        const card = cardsByPath.get(cardPath);
        if (!card) {
          throw new Error(`Unknown fixture card: ${cardPath}`);
        }
        return card;
      },
    };

    return { boardRoot, todayIsoDate, boardApi };
  }

  it('collects due-today items including card due and incomplete task due entries', async () => {
    const context = createContext();
    const { boardRoot, todayIsoDate, boardApi } = createFixtures();
    const toPlain = (value) => JSON.parse(JSON.stringify(value));

    const dueItems = toPlain(
      await context.collectDueTodayItemsForBoard(boardApi, boardRoot, todayIsoDate),
    );

    expect(dueItems).toEqual([
      { kind: 'card', cardTitle: 'Card Due', taskText: '' },
      { kind: 'task', cardTitle: 'Task Card', taskText: 'Send launch email to the beta list' },
      { kind: 'task', cardTitle: 'Mixed Task Card', taskText: 'Confirm invoice totals' },
    ]);
  });

  it('builds single task-due notification body with card title and task text', async () => {
    const context = createContext();
    const { boardRoot, todayIsoDate, boardApi } = createFixtures();
    const toPlain = (value) => JSON.parse(JSON.stringify(value));

    const dueItems = toPlain(
      await context.collectDueTodayItemsForBoard(boardApi, boardRoot, todayIsoDate),
    );
    const singleTaskBody = context.buildDueNotificationBody([dueItems[1]]);

    expect(singleTaskBody).toBe('Task Card: Send launch email to the beta list');
  });

  it('builds multi-item notification summary body', async () => {
    const context = createContext();
    const { boardRoot, todayIsoDate, boardApi } = createFixtures();
    const toPlain = (value) => JSON.parse(JSON.stringify(value));

    const dueItems = toPlain(
      await context.collectDueTodayItemsForBoard(boardApi, boardRoot, todayIsoDate),
    );
    const summaryBody = context.buildDueNotificationBody(dueItems);

    expect(summaryBody).toBe(
      'Due today: 3 items. First: Task Card: Send launch email to the beta list',
    );
  });
});
