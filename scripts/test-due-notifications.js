const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadDueNotificationUtilities() {
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

  const dueDateSource = fs.readFileSync(path.join(__dirname, '../app/utilities/dueDateStatus.js'), 'utf8');
  vm.runInContext(dueDateSource, context);

  const taskListSource = fs.readFileSync(path.join(__dirname, '../app/utilities/taskList.js'), 'utf8');
  vm.runInContext(taskListSource, context);

  const dueNotificationSource = fs.readFileSync(path.join(__dirname, '../app/utilities/dueNotifications.js'), 'utf8');
  vm.runInContext(dueNotificationSource, context);

  return context;
}

async function run() {
  const context = loadDueNotificationUtilities();
  const { collectDueTodayItemsForBoard, buildDueNotificationBody } = context;
  const toPlain = (value) => JSON.parse(JSON.stringify(value));

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
      assert.strictEqual(root, boardRoot);
      return [listName];
    },
    listCards: async (root) => {
      assert.strictEqual(root, listPath);
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

  const dueItems = toPlain(await collectDueTodayItemsForBoard(boardApi, boardRoot, todayIsoDate));
  assert.deepStrictEqual(
    dueItems,
    [
      { kind: 'card', cardTitle: 'Card Due', taskText: '' },
      { kind: 'task', cardTitle: 'Task Card', taskText: 'Send launch email to the beta list' },
      { kind: 'task', cardTitle: 'Mixed Task Card', taskText: 'Confirm invoice totals' },
    ],
    'Expected due-item collection to include card due + incomplete task due entries',
  );

  const singleTaskBody = buildDueNotificationBody([dueItems[1]]);
  assert.strictEqual(
    singleTaskBody,
    'Task Card: Send launch email to the beta list',
    'Expected single task-due notification to include card title and task summary',
  );

  const summaryBody = buildDueNotificationBody(dueItems);
  assert.strictEqual(
    summaryBody,
    'Due today: 3 items. First: Task Card: Send launch email to the beta list',
    'Expected multi-item notification summary body',
  );

  console.log('Due notification tests passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
