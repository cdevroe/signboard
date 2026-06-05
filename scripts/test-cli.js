const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');
const {
  archiveCard,
  archiveList: archiveListOnDisk,
} = require('../lib/archive');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'signboard.js');

function runCli(args, env, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `CLI command failed: ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return result;
}

function runCliExpectFail(args, env, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
    ...options,
  });

  if (result.status === 0) {
    throw new Error(`CLI command unexpectedly succeeded: ${args.join(' ')}`);
  }

  return result;
}

function daysFromTodayIso(daysAhead) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Number(daysAhead || 0));
  return date.toISOString().slice(0, 10);
}

async function createFixtureBoard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-'));
  const boardRoot = path.join(root, 'Client Work');
  const todoList = path.join(boardRoot, '000-To do-stock');
  const doingList = path.join(boardRoot, '001-Doing-stock');
  const backlogList = path.join(boardRoot, '002-Backlog-stock');
  const archiveDirectory = path.join(boardRoot, 'XXX-Archive');

  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(doingList, { recursive: true });
  await fs.mkdir(backlogList, { recursive: true });
  await fs.mkdir(archiveDirectory, { recursive: true });

  await boardLabels.writeBoardSettings(boardRoot, {
    labels: [
      { id: 'urgent', name: 'Urgent', colorLight: '#ef4444', colorDark: '#dc2626' },
      { id: 'client', name: 'Client', colorLight: '#3b82f6', colorDark: '#2563eb' },
      { id: 'template', name: 'Template', colorLight: '#a855f7', colorDark: '#9333ea' },
    ],
  });

  await cardFrontmatter.writeCard(path.join(todoList, '001-launch-plan-ab123.md'), {
    frontmatter: {
      title: 'Launch plan',
      due: daysFromTodayIso(3),
      labels: ['urgent', 'template'],
    },
    body: [
      '## Source',
      'Original referral',
      '',
      '## Notes',
      'Template instructions.',
      '',
      'Prepare launch notes',
      `- [ ] (due: ${daysFromTodayIso(2)}) Draft email`,
    ].join('\n'),
  });

  await cardFrontmatter.writeCard(path.join(todoList, '002-client-follow-up-cd456.md'), {
    frontmatter: {
      title: 'Client follow up',
      labels: ['client'],
    },
    body: `Follow up with client\n- [ ] (due: ${daysFromTodayIso(5)}) Schedule check-in`,
  });

  await cardFrontmatter.writeCard(path.join(doingList, '001-internal-review-ef789.md'), {
    frontmatter: {
      title: 'Internal review',
    },
    body: 'Review notes',
  });

  await cardFrontmatter.writeCard(path.join(doingList, '002-open-overdue-task-gh012.md'), {
    frontmatter: {
      title: 'Open overdue task',
    },
    body: `Still waiting\n- [ ] (due: ${daysFromTodayIso(-2)}) Chase reply`,
  });

  await cardFrontmatter.writeCard(path.join(doingList, '003-completed-overdue-task-ij345.md'), {
    frontmatter: {
      title: 'Completed overdue task',
    },
    body: `Wrapped up\n- [x] (due: ${daysFromTodayIso(-2)}) Sent reply`,
  });

  await cardFrontmatter.writeCard(path.join(doingList, '004-overdue-card-kl678.md'), {
    frontmatter: {
      title: 'Overdue card',
      due: daysFromTodayIso(-1),
    },
    body: `Card-level due date only\n- [x] (due: ${daysFromTodayIso(-3)}) Finished prep`,
  });

  const standaloneArchivedSourcePath = path.join(todoList, '003-archived-standalone-mn901.md');
  await cardFrontmatter.writeCard(standaloneArchivedSourcePath, {
    frontmatter: {
      title: 'Archived standalone note',
      labels: ['urgent'],
    },
    body: 'Saved for later.',
  });

  await cardFrontmatter.writeCard(path.join(backlogList, '001-archived-list-card-op234.md'), {
    frontmatter: {
      title: 'Archived list card',
    },
    body: 'Backlog work item.',
  });

  await archiveCard(boardRoot, standaloneArchivedSourcePath);
  await archiveListOnDisk(boardRoot, backlogList);

  return { root, boardRoot };
}

async function createImportFixtures(root) {
  const importsRoot = path.join(root, 'imports');
  await fs.mkdir(importsRoot, { recursive: true });

  const trelloPath = path.join(importsRoot, 'trello-export.json');
  await fs.writeFile(trelloPath, JSON.stringify({
    name: 'Sales Pipeline',
    lists: [
      { id: 'trello-list-1', name: 'Trello Leads', closed: false, pos: 1 },
    ],
    labels: [
      { id: 'trello-label-1', name: 'Pipeline', color: 'green' },
    ],
    members: [],
    checklists: [
      {
        id: 'check-1',
        idCard: 'trello-card-1',
        name: 'Prep',
        pos: 1,
        checkItems: [
          { id: 'check-item-1', name: 'Share outline', pos: 1, state: 'incomplete' },
        ],
      },
    ],
    actions: [
      {
        id: 'action-1',
        type: 'commentCard',
        date: '2026-03-20T12:00:00.000Z',
        data: { idCard: 'trello-card-1' },
        memberCreator: { fullName: 'Alex Example', username: 'alex' },
        text: 'Remember the deck.',
      },
    ],
    cards: [
      {
        id: 'trello-card-1',
        idList: 'trello-list-1',
        name: 'Imported pitch',
        desc: 'Imported from Trello.',
        due: '2026-03-22',
        closed: false,
        pos: 1,
        idLabels: ['trello-label-1'],
        attachments: [
          { id: 'attachment-1', name: 'Brief', url: 'https://example.com/brief' },
        ],
      },
    ],
  }, null, 2), 'utf8');

  const obsidianPath = path.join(importsRoot, 'editorial-kanban.md');
  await fs.writeFile(obsidianPath, [
    '---',
    'kanban-plugin: board',
    '---',
    '',
    '## Inbox',
    '- [ ] Draft intro @{2026-03-24} #Writing',
    '',
    '## Done',
    '- [x] Sent final #Done',
    '',
    '%% kanban:settings',
    '{"kanban-plugin":"board"}',
    '%%',
    '',
  ].join('\n'), 'utf8');

  const tasksRoot = path.join(importsRoot, 'tasks-workspace', 'tasks');
  const configRoot = path.join(importsRoot, 'tasks-workspace', 'config');
  const tasksProjectPath = path.join(tasksRoot, 'CLI Project');
  await fs.mkdir(path.join(tasksProjectPath, 'Todo'), { recursive: true });
  await fs.mkdir(configRoot, { recursive: true });

  await fs.writeFile(path.join(tasksProjectPath, 'Todo', 'Tasks md card.md'), [
    '[due:2026-03-26]',
    '',
    '[tag:CLI]',
    '',
    'Imported from Tasks.md.',
  ].join('\n'), 'utf8');

  await fs.writeFile(path.join(configRoot, 'tags.json'), JSON.stringify({
    '/CLI Project': {
      CLI: 'var(--color-alt-6)',
    },
  }, null, 2), 'utf8');

  return {
    trelloPath,
    obsidianPath,
    tasksProjectPath,
  };
}

async function main() {
  const fixture = await createFixtureBoard();
  const importFixtures = await createImportFixtures(fixture.root);
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-config-'));
  const env = {
    SIGNBOARD_CLI_CONFIG_DIR: configDir,
  };

  const createdBoardRoot = path.join(fixture.root, 'Created CLI Board');
  const createdBoard = JSON.parse(
    runCli(['boards', 'create', createdBoardRoot, '--json', '--use'], env).stdout
  );
  assert.strictEqual(createdBoard.boardRoot, createdBoardRoot);
  assert.strictEqual(createdBoard.cardFile, '000-hello-stock.md');
  assert.strictEqual(createdBoard.seededWelcomeCard, true);
  assert.strictEqual(createdBoard.currentBoardUpdated, true);
  assert.deepStrictEqual(
    (await fs.readdir(createdBoardRoot)).sort(),
    ['000-To-do-stock', '001-Doing-stock', '002-Done-stock', 'XXX-Archive'].sort(),
  );

  const starterCard = await cardFrontmatter.readCard(
    path.join(createdBoardRoot, '000-To-do-stock', '000-hello-stock.md')
  );
  assert.strictEqual(starterCard.frontmatter.title, '👋 Start Here');
  assert.ok(starterCard.body.includes('Quick Add'));
  assert.strictEqual(runCli(['use'], env).stdout.trim(), createdBoardRoot);

  const createdEmptyBoard = JSON.parse(
    runCli(['boards', 'create', '--parent', fixture.root, '--name', 'Empty CLI Board', '--no-welcome', '--json'], env).stdout
  );
  assert.strictEqual(createdEmptyBoard.boardRoot, path.join(fixture.root, 'Empty CLI Board'));
  assert.strictEqual(createdEmptyBoard.cardFile, '');
  assert.strictEqual(createdEmptyBoard.seededWelcomeCard, false);
  assert.deepStrictEqual(
    (await fs.readdir(path.join(createdEmptyBoard.boardRoot, '000-To-do-stock'))).sort(),
    [],
  );

  const invalidBoardSingular = runCliExpectFail(['board', 'create', path.join(fixture.root, 'Broken Board')], env);
  assert.ok(invalidBoardSingular.stderr.includes('Unknown command group: board'));
  assert.ok(invalidBoardSingular.stderr.includes('Did you mean `boards`?'));

  const useResult = runCli(['use', fixture.boardRoot], env);
  assert.ok(useResult.stdout.includes(fixture.boardRoot));

  const currentBoard = runCli(['use'], env);
  assert.strictEqual(currentBoard.stdout.trim(), fixture.boardRoot);

  const invalidSingular = runCliExpectFail(['card', '--read', 'kqmf2'], env);
  assert.ok(invalidSingular.stderr.includes('Unknown command group: card'));
  assert.ok(invalidSingular.stderr.includes('Did you mean `cards`?'));

  const invalidFlag = runCliExpectFail(['cards', '--read', 'kqmf2'], env);
  assert.ok(invalidFlag.stderr.includes('Unknown option(s): --read'));

  const lists = JSON.parse(runCli(['lists', '--json'], env).stdout);
  assert.strictEqual(lists.length, 2);
  assert.strictEqual(lists[0].displayName, 'To do');

  const defaultSettings = JSON.parse(runCli(['settings', '--json'], env).stdout);
  assert.ok(Array.isArray(defaultSettings.labels));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(defaultSettings, 'tooltipsEnabled'), false);

  const createdList = JSON.parse(
    runCli(['lists', 'create', 'Blocked', '--json'], env).stdout
  );
  assert.ok(createdList.directoryName.startsWith('002-Blocked-'));

  const renamedList = JSON.parse(
    runCli(['lists', 'rename', 'Blocked', 'Waiting', '--json'], env).stdout
  );
  assert.strictEqual(renamedList.after.displayName, 'Waiting');

  const dueCards = JSON.parse(
    runCli([
      'cards',
      '--due',
      'next:7',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(dueCards.length, 2);
  assert.ok(dueCards.some((card) => card.title === 'Launch plan'));
  assert.ok(dueCards.some((card) => card.title === 'Client follow up'));

  const overdueCards = JSON.parse(
    runCli([
      'cards',
      '--due',
      'overdue',
      '--json',
    ], env).stdout
  );
  assert.deepStrictEqual(
    overdueCards.map((card) => card.title).sort(),
    ['Open overdue task', 'Overdue card'],
  );

  const overdueTaskCardsDefault = JSON.parse(
    runCli([
      'cards',
      '--due',
      'overdue',
      '--due-source',
      'task',
      '--json',
    ], env).stdout
  );
  assert.deepStrictEqual(
    overdueTaskCardsDefault.map((card) => card.title).sort(),
    ['Open overdue task'],
  );

  const overdueTaskCardsAny = JSON.parse(
    runCli([
      'cards',
      '--due',
      'overdue',
      '--due-source',
      'task',
      '--task-status',
      'any',
      '--json',
    ], env).stdout
  );
  assert.deepStrictEqual(
    overdueTaskCardsAny.map((card) => card.title).sort(),
    ['Completed overdue task', 'Open overdue task', 'Overdue card'],
  );

  const invalidTaskStatus = runCliExpectFail([
    'cards',
    '--due',
    'overdue',
    '--task-status',
    'closed',
  ], env);
  assert.ok(invalidTaskStatus.stderr.includes('Unsupported task status filter: closed'));

  const waitingCards = JSON.parse(
    runCli([
      'cards',
      'Waiting',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(waitingCards.length, 0);

  const labelCards = JSON.parse(
    runCli([
      'cards',
      '--label',
      'Urgent',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(labelCards.length, 1);
  assert.strictEqual(labelCards[0].title, 'Launch plan');

  const duplicatePreview = JSON.parse(
    runCli([
      'cards',
      'duplicate',
      '--card',
      'ab123',
      '--list',
      'Waiting',
      '--title',
      'Lead from template',
      '--remove-label',
      'Template',
      '--dry-run',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(duplicatePreview.dryRun, true);
  assert.strictEqual(duplicatePreview.operation, 'duplicate-card');
  assert.strictEqual(duplicatePreview.listDisplayName, 'Waiting');
  assert.strictEqual(duplicatePreview.title, 'Lead from template');
  assert.ok(duplicatePreview.labels.includes('urgent'));
  assert.ok(!duplicatePreview.labels.includes('template'));

  const waitingAfterDuplicatePreview = JSON.parse(runCli(['cards', 'Waiting', '--json'], env).stdout);
  assert.strictEqual(waitingAfterDuplicatePreview.length, 0);

  const duplicatedCard = JSON.parse(
    runCli([
      'cards',
      'duplicate',
      '--card',
      'ab123',
      '--list',
      'Waiting',
      '--title',
      'Lead from template',
      '--remove-label',
      'Template',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(duplicatedCard.listDisplayName, 'Waiting');
  assert.strictEqual(duplicatedCard.title, 'Lead from template');
  assert.ok(duplicatedCard.labels.includes('urgent'));
  assert.ok(!duplicatedCard.labels.includes('template'));
  assert.strictEqual(duplicatedCard.taskSummary.total, 1);

  const preparedBodyPath = path.join(fixture.root, 'prepared.md');
  const replacementNotesPath = path.join(fixture.root, 'replacement-notes.md');
  await fs.writeFile(preparedBodyPath, [
    '## Source',
    'Imported lead.',
    '',
    '## Notes',
    'Prepared notes placeholder.',
    '',
    '## Destination',
    'Target city.',
  ].join('\n'), 'utf8');
  await fs.writeFile(replacementNotesPath, [
    '- Replaced note from file.',
    '- Confirmed requirements.',
  ].join('\n'), 'utf8');

  const createdFromTemplate = JSON.parse(
    runCli([
      'cards',
      'create',
      '--from-card',
      'ab123',
      '--list',
      'Waiting',
      '--title',
      'Prepared lead',
      '--remove-label',
      'Template',
      '--body-file',
      preparedBodyPath,
      '--json',
    ], env).stdout
  );
  assert.strictEqual(createdFromTemplate.title, 'Prepared lead');
  assert.strictEqual(createdFromTemplate.listDisplayName, 'Waiting');
  assert.ok(createdFromTemplate.body.includes('## Source'));
  assert.ok(createdFromTemplate.body.includes('Prepared notes placeholder.'));
  assert.ok(!createdFromTemplate.labels.includes('template'));

  const replacedSection = JSON.parse(
    runCli([
      'cards',
      'edit',
      '--card',
      createdFromTemplate.id,
      '--replace-section',
      'Notes',
      '--body-file',
      replacementNotesPath,
      '--json',
    ], env).stdout
  );
  assert.ok(replacedSection.body.includes('## Source\nImported lead.'));
  assert.ok(replacedSection.body.includes('## Notes\n- Replaced note from file.\n- Confirmed requirements.'));
  assert.ok(!replacedSection.body.includes('Prepared notes placeholder.'));
  assert.ok(replacedSection.body.includes('## Destination\nTarget city.'));

  const insertedSectionText = JSON.parse(
    runCli([
      'cards',
      'edit',
      '--card',
      createdFromTemplate.id,
      '--insert-after-heading',
      '## Source',
      '--text',
      'Website form.',
      '--json',
    ], env).stdout
  );
  assert.ok(insertedSectionText.body.includes('## Source\nWebsite form.\nImported lead.'));

  const noteAdded = JSON.parse(
    runCli([
      'cards',
      'notes',
      'add',
      '--card',
      createdFromTemplate.id,
      '--text',
      'Emailed follow-up',
      '--timestamp',
      '--json',
    ], env).stdout
  );
  assert.ok(noteAdded.body.includes('Emailed follow-up'));
  assert.match(noteAdded.body, /- [A-Z][a-z]+ \d{1,2}, \d{2}:\d{2} - Emailed follow-up/);

  const clearLabelsPreview = JSON.parse(
    runCli([
      'cards',
      'edit',
      '--card',
      duplicatedCard.id,
      '--clear-labels',
      '--dry-run',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(clearLabelsPreview.dryRun, true);
  assert.deepStrictEqual(clearLabelsPreview.labels, []);

  const duplicatedBeforeClear = JSON.parse(
    runCli([
      'cards',
      'read',
      '--card',
      duplicatedCard.id,
    ], env).stdout
  );
  assert.ok(duplicatedBeforeClear.labels.includes('urgent'));

  const clearedLabels = JSON.parse(
    runCli([
      'cards',
      'edit',
      '--card',
      duplicatedCard.id,
      '--clear-labels',
      '--json',
    ], env).stdout
  );
  assert.deepStrictEqual(clearedLabels.labels, []);

  const createdCard = JSON.parse(
    runCli([
      'cards',
      'create',
      '--list',
      'Waiting',
      '--title',
      'Needs approval',
      '--body',
      'Waiting on leadership',
      '--due',
      '2026-03-20',
      '--label',
      'Client',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(createdCard.listDisplayName, 'Waiting');
  assert.strictEqual(createdCard.due, '2026-03-20');
  assert.deepStrictEqual(createdCard.labels, ['client']);

  const editedCard = JSON.parse(
    runCli([
      'cards',
      'edit',
      '--card',
      createdCard.id,
      '--due',
      'none',
      '--add-label',
      'Urgent',
      '--move-to',
      'Doing',
      '--append-body',
      'Escalated yesterday.',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(editedCard.listDisplayName, 'Doing');
  assert.ok(editedCard.fileName.startsWith('000-'));
  assert.strictEqual(editedCard.due, null);
  assert.deepStrictEqual(editedCard.labels.sort(), ['client', 'urgent']);
  assert.ok(editedCard.body.includes('Escalated yesterday.'));

  const readCard = JSON.parse(
    runCli([
      'cards',
      'read',
      '--list',
      'Doing',
      '--card',
      createdCard.id,
    ], env).stdout
  );
  assert.strictEqual(readCard.title, 'Needs approval');
  assert.strictEqual(readCard.listDisplayName, 'Doing');

  const doingCards = JSON.parse(
    runCli([
      'cards',
      'Doing',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(doingCards[0].title, 'Needs approval');

  const archivedCards = JSON.parse(
    runCli([
      'archive',
      'cards',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(archivedCards.length, 2);
  assert.ok(archivedCards.some((entry) => entry.title === 'Archived standalone note'));
  assert.ok(archivedCards.some((entry) => entry.title === 'Archived list card'));

  const archivedLists = JSON.parse(
    runCli([
      'archive',
      'lists',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(archivedLists.length, 1);
  assert.strictEqual(archivedLists[0].listDisplayName, 'Backlog');

  const archivedCardDetail = JSON.parse(
    runCli([
      'archive',
      'read',
      '--kind',
      'card',
      '--entry',
      'Archived standalone note',
    ], env).stdout
  );
  assert.strictEqual(archivedCardDetail.kind, 'card');
  assert.strictEqual(archivedCardDetail.entry.title, 'Archived standalone note');

  const archivedListDetail = JSON.parse(
    runCli([
      'archive',
      'read',
      '--kind',
      'list',
      '--entry',
      'Backlog',
    ], env).stdout
  );
  assert.strictEqual(archivedListDetail.kind, 'list');
  assert.strictEqual(archivedListDetail.entry.cardCount, 1);

  const restoredArchivedCard = JSON.parse(
    runCli([
      'archive',
      'restore-card',
      '--card',
      'Archived standalone note',
      '--to-list',
      'Waiting',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(restoredArchivedCard.title, 'Archived standalone note');
  assert.strictEqual(restoredArchivedCard.targetListDisplayName, 'Waiting');

  const waitingCardsAfterRestore = JSON.parse(
    runCli([
      'cards',
      'Waiting',
      '--json',
    ], env).stdout
  );
  assert.ok(waitingCardsAfterRestore.some((card) => card.title === 'Archived standalone note'));

  const restoredArchivedList = JSON.parse(
    runCli([
      'archive',
      'restore-list',
      '--list',
      'Backlog',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(restoredArchivedList.listDisplayName, 'Backlog');

  const listsAfterArchiveRestore = JSON.parse(runCli(['lists', '--json'], env).stdout);
  assert.ok(listsAfterArchiveRestore.some((list) => list.displayName === 'Backlog'));

  const trelloImport = JSON.parse(
    runCli([
      'import',
      'trello',
      '--file',
      importFixtures.trelloPath,
      '--json',
    ], env).stdout
  );
  assert.strictEqual(trelloImport.importer, 'trello');
  assert.strictEqual(trelloImport.listsCreated, 1);
  assert.strictEqual(trelloImport.cardsCreated, 1);

  const trelloCards = JSON.parse(
    runCli([
      'cards',
      '--search',
      'Imported pitch',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(trelloCards.length, 1);
  assert.strictEqual(trelloCards[0].due, '2026-03-22');

  const obsidianImport = JSON.parse(
    runCli([
      'import',
      'obsidian',
      '--source',
      importFixtures.obsidianPath,
      '--json',
    ], env).stdout
  );
  assert.strictEqual(obsidianImport.importer, 'obsidian');
  assert.strictEqual(obsidianImport.listsCreated, 2);
  assert.strictEqual(obsidianImport.cardsCreated, 2);

  const obsidianCards = JSON.parse(
    runCli([
      'cards',
      '--search',
      'Draft intro',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(obsidianCards.length, 1);
  assert.strictEqual(obsidianCards[0].due, '2026-03-24');
  assert.ok(obsidianCards[0].labelNames.includes('Writing'));

  const tasksMdImport = JSON.parse(
    runCli([
      'import',
      'tasksmd',
      '--source',
      importFixtures.tasksProjectPath,
      '--json',
    ], env).stdout
  );
  assert.strictEqual(tasksMdImport.importer, 'tasksmd');
  assert.strictEqual(tasksMdImport.listsCreated, 1);
  assert.strictEqual(tasksMdImport.cardsCreated, 1);

  const tasksMdCards = JSON.parse(
    runCli([
      'cards',
      '--search',
      'Tasks md card',
      '--json',
    ], env).stdout
  );
  assert.strictEqual(tasksMdCards.length, 1);
  assert.strictEqual(tasksMdCards[0].due, '2026-03-26');
  assert.ok(tasksMdCards[0].labelNames.includes('CLI'));

  console.log('CLI tests passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
