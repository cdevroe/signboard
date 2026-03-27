const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');

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
  const archiveList = path.join(boardRoot, 'XXX-Archive');

  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(doingList, { recursive: true });
  await fs.mkdir(archiveList, { recursive: true });

  await boardLabels.writeBoardSettings(boardRoot, {
    labels: [
      { id: 'urgent', name: 'Urgent', colorLight: '#ef4444', colorDark: '#dc2626' },
      { id: 'client', name: 'Client', colorLight: '#3b82f6', colorDark: '#2563eb' },
    ],
    notifications: { enabled: false, time: '09:00' },
  });

  await cardFrontmatter.writeCard(path.join(todoList, '001-launch-plan-ab123.md'), {
    frontmatter: {
      title: 'Launch plan',
      due: daysFromTodayIso(3),
      labels: ['urgent'],
    },
    body: `Prepare launch notes\n- [ ] (due: ${daysFromTodayIso(2)}) Draft email`,
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

  return {
    trelloPath,
    obsidianPath,
  };
}

async function main() {
  const fixture = await createFixtureBoard();
  const importFixtures = await createImportFixtures(fixture.root);
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-config-'));
  const env = {
    SIGNBOARD_CLI_CONFIG_DIR: configDir,
  };

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
  assert.strictEqual(defaultSettings.tooltipsEnabled, true);

  const updatedSettings = JSON.parse(
    runCli(['settings', 'edit', '--tooltips', 'off', '--json'], env).stdout
  );
  assert.strictEqual(updatedSettings.tooltipsEnabled, false);

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

  console.log('CLI tests passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
