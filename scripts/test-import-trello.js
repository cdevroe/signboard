const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const boardLabels = require('../lib/boardLabels');
const cardFrontmatter = require('../lib/cardFrontmatter');
const { importTrello } = require('../lib/importers');
const { ARCHIVE_DIRECTORY_NAME, getListDisplayName } = require('../lib/cliBoard');

async function listDirectories(boardRoot) {
  const entries = await fs.readdir(boardRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function listMarkdownFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name).sort();
}

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-import-trello-'));
  const boardRoot = path.join(tmpDir, 'Imported Board');
  const sourcePath = path.join(tmpDir, 'trello.json');
  await fs.mkdir(boardRoot, { recursive: true });

  try {
    await boardLabels.writeBoardSettings(boardRoot, {
      labels: [
        { id: 'quoted-existing', name: 'Quoted', colorLight: '#f59e0b', colorDark: '#d97706' },
      ],
      notifications: { enabled: false, time: '09:00' },
      tooltipsEnabled: true,
    });

    const sourceData = {
      name: 'Trello Demo',
      url: 'https://trello.example/board',
      lists: [
        { id: 'list-open-1', name: 'Backlog', pos: 10, closed: false },
        { id: 'list-open-2', name: 'Doing', pos: 20, closed: false },
        { id: 'list-closed', name: 'Done Elsewhere', pos: 30, closed: true },
      ],
      labels: [
        { id: 'label-reuse', name: 'Quoted', color: 'yellow' },
        { id: 'label-blank', name: '', color: 'blue' },
      ],
      members: [
        { id: 'member-1', fullName: 'Casey Example', username: 'casey' },
      ],
      cards: [
        {
          id: 'card-open',
          idShort: 11,
          shortLink: 'abcde',
          idList: 'list-open-1',
          name: 'Open Trello Card',
          desc: 'Body from Trello',
          due: '2026-04-02T15:00:00.000Z',
          dueReminder: 60,
          start: '2026-04-01T12:00:00.000Z',
          dueComplete: false,
          closed: false,
          isTemplate: false,
          pos: 10,
          idLabels: ['label-reuse', 'label-blank'],
          idMembers: ['member-1'],
          attachments: [
            { name: 'spec.txt', url: 'https://trello.example/spec.txt', mimeType: 'text/plain', bytes: 128 },
          ],
        },
        {
          id: 'card-closed',
          idShort: 12,
          shortLink: 'fghij',
          idList: 'list-open-2',
          name: 'Closed Trello Card',
          desc: '',
          closed: true,
          pos: 20,
          idLabels: [],
          attachments: [],
        },
        {
          id: 'card-from-closed-list',
          idShort: 13,
          shortLink: 'klmno',
          idList: 'list-closed',
          name: 'Card in Closed List',
          desc: '',
          closed: false,
          pos: 30,
          idLabels: [],
          attachments: [],
        },
      ],
      checklists: [
        {
          id: 'check-1',
          idCard: 'card-open',
          name: 'Checklist',
          pos: 5,
          checkItems: [
            { id: 'item-1', name: 'First task', state: 'incomplete', pos: 1, due: '2026-04-05T10:00:00.000Z' },
            { id: 'item-2', name: 'Second task', state: 'complete', pos: 2, due: null },
          ],
        },
      ],
      actions: Array.from({ length: 1000 }, (_, index) => ({
        type: 'commentCard',
        date: `2026-04-01T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
        data: {
          idCard: 'card-open',
          text: index === 0 ? 'First import comment' : `History comment ${index}`,
        },
        memberCreator: { fullName: 'Casey Example', username: 'casey' },
      })),
    };

    await fs.writeFile(sourcePath, JSON.stringify(sourceData, null, 2), 'utf8');

    const summary = await importTrello({
      boardRoot,
      sourcePath,
    });

    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.importer, 'trello');
    assert.strictEqual(summary.listsCreated, 2);
    assert.strictEqual(summary.cardsCreated, 3);
    assert.strictEqual(summary.labelsCreated, 1);
    assert.strictEqual(summary.archivedCards, 2);
    assert(summary.warnings.some((warning) => warning.includes('1000 actions')), 'expected truncation warning');

    const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });
    const labelNames = settings.labels.map((label) => label.name).sort();
    assert.deepStrictEqual(labelNames, ['Quoted', 'Trello Blue']);

    const directoryNames = await listDirectories(boardRoot);
    assert(directoryNames.includes(ARCHIVE_DIRECTORY_NAME), 'archive directory should exist');
    const visibleListNames = directoryNames
      .filter((name) => name !== ARCHIVE_DIRECTORY_NAME)
      .map((name) => getListDisplayName(name))
      .sort();
    assert.deepStrictEqual(visibleListNames, ['Backlog', 'Doing']);

    const backlogDirectory = directoryNames.find((name) => getListDisplayName(name) === 'Backlog');
    const backlogFiles = await listMarkdownFiles(path.join(boardRoot, backlogDirectory));
    assert.strictEqual(backlogFiles.length, 1);
    const openCard = await cardFrontmatter.readCard(path.join(boardRoot, backlogDirectory, backlogFiles[0]));
    assert.strictEqual(openCard.frontmatter.title, 'Open Trello Card');
    assert.strictEqual(openCard.frontmatter.due, '2026-04-02');
    assert.deepStrictEqual(openCard.frontmatter.labels.sort(), ['quoted-existing', settings.labels.find((label) => label.name === 'Trello Blue').id].sort());
    assert(openCard.body.includes('Body from Trello'));
    assert(openCard.body.includes('## Checklist'));
    assert(openCard.body.includes('- [ ] (due: 2026-04-05) First task'));
    assert(openCard.body.includes('## Imported comments'));
    assert(openCard.body.includes('First import comment'));
    assert(openCard.body.includes('## Imported attachments'));
    assert(openCard.body.includes('[spec.txt](https://trello.example/spec.txt)'));
    assert(openCard.body.includes('Original Trello list'));

    const archiveFiles = await listMarkdownFiles(path.join(boardRoot, ARCHIVE_DIRECTORY_NAME));
    assert.strictEqual(archiveFiles.length, 2);
    const archivedCard = await cardFrontmatter.readCard(path.join(boardRoot, ARCHIVE_DIRECTORY_NAME, archiveFiles[0]));
    assert(archivedCard.body.includes('Closed in Trello'), 'archived cards should record closed state');

    console.log('Trello importer tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('Trello importer tests failed.');
  console.error(error);
  process.exitCode = 1;
});
