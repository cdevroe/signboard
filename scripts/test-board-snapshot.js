const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const cardFrontmatter = require('../lib/cardFrontmatter');
const { readBoardSnapshot } = require('../lib/boardSnapshot');

async function testReadBoardSnapshot() {
  const boardRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-board-snapshot-'));
  const todoList = path.join(boardRoot, '000-To-do-stock');
  const doneList = path.join(boardRoot, '001-Done-stock');
  const archiveList = path.join(boardRoot, 'XXX-Archive');

  try {
    await fs.mkdir(todoList, { recursive: true });
    await fs.mkdir(doneList, { recursive: true });
    await fs.mkdir(archiveList, { recursive: true });
    await cardFrontmatter.writeCard(path.join(todoList, '000-alpha-card-abcde.md'), {
      frontmatter: {
        title: 'Alpha',
        due: '2026-03-10',
        labels: ['label-1'],
      },
      body: '- [ ] (start: 2026-03-09) Prep\n- [x] (due: 2026-03-08) Done',
    });
    await cardFrontmatter.writeCard(path.join(doneList, '000-finished-card-fghij.md'), {
      frontmatter: {
        title: 'Finished',
      },
      body: 'Complete',
    });
    await cardFrontmatter.writeCard(path.join(archiveList, '000-archived-card-klmno.md'), {
      frontmatter: {
        title: 'Archived',
      },
      body: 'Archived',
    });

    const snapshot = await readBoardSnapshot(boardRoot);

    assert.strictEqual(snapshot.ok, true);
    assert.strictEqual(snapshot.boardName, path.basename(boardRoot));
    assert.deepStrictEqual(snapshot.lists.map((list) => list.listName), [
      '000-To-do-stock',
      '001-Done-stock',
    ]);
    assert(snapshot.boardSettings, 'expected board settings in snapshot');
    assert.strictEqual(snapshot.lists[0].cards.length, 1);
    assert.strictEqual(snapshot.lists[0].cards[0].frontmatter.title, 'Alpha');
    assert.deepStrictEqual(snapshot.lists[0].cards[0].taskStartDates, ['2026-03-09']);
    assert.deepStrictEqual(snapshot.lists[0].cards[0].taskDueDates, ['2026-03-08']);
    assert.deepStrictEqual(snapshot.lists[0].cards[0].incompleteTaskDueDates, []);
    assert(snapshot.lists[0].cards[0].timestamps.updatedAt, 'expected card timestamps');

    const snapshotWithArchive = await readBoardSnapshot(boardRoot, { includeArchive: true });
    assert.deepStrictEqual(snapshotWithArchive.lists.map((list) => list.listName), [
      '000-To-do-stock',
      '001-Done-stock',
      'XXX-Archive',
    ]);

    const leanSnapshot = await readBoardSnapshot(boardRoot, {
      includeBoardSettings: false,
      includeTimestamps: false,
      includeTaskItems: false,
    });
    const leanCard = leanSnapshot.lists[0].cards[0];
    assert.strictEqual(leanSnapshot.boardSettings, null);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(leanCard, 'timestamps'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(leanCard, 'taskItems'), false);
    assert.deepStrictEqual(leanCard.taskStartDates, ['2026-03-09']);
  } finally {
    await fs.rm(boardRoot, { recursive: true, force: true });
  }
}

async function run() {
  await testReadBoardSnapshot();
  console.log('Board snapshot tests passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
