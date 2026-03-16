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
      due: '2026-03-15',
      labels: ['urgent'],
    },
    body: 'Prepare launch notes\n- [ ] (due: 2026-03-12) Draft email',
  });

  await cardFrontmatter.writeCard(path.join(todoList, '002-client-follow-up-cd456.md'), {
    frontmatter: {
      title: 'Client follow up',
      labels: ['client'],
    },
    body: 'Follow up with client\n- [ ] (due: 2026-03-18) Schedule check-in',
  });

  await cardFrontmatter.writeCard(path.join(doingList, '001-internal-review-ef789.md'), {
    frontmatter: {
      title: 'Internal review',
    },
    body: 'Review notes',
  });

  return { root, boardRoot };
}

async function main() {
  const fixture = await createFixtureBoard();
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

  console.log('CLI tests passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
