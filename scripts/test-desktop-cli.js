const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const electronBinary = require('electron');
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');

async function createFixtureBoard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-desktop-cli-'));
  const boardRoot = path.join(root, 'Desktop CLI Board');
  const todoList = path.join(boardRoot, '000-To do-stock');
  const archiveList = path.join(boardRoot, 'XXX-Archive');

  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(archiveList, { recursive: true });

  await boardLabels.writeBoardSettings(boardRoot, {
    labels: [
      { id: 'urgent', name: 'Urgent', colorLight: '#ef4444', colorDark: '#dc2626' },
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

  return { boardRoot };
}

function runDesktopCli(args, env = {}) {
  const result = spawnSync(electronBinary, ['.', ...args], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      `Desktop CLI failed: ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return result;
}

function runDesktopCliExpectFail(args, env = {}) {
  const result = spawnSync(electronBinary, ['.', ...args], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

  if (result.status === 0) {
    throw new Error(`Desktop CLI unexpectedly succeeded: ${args.join(' ')}`);
  }

  return result;
}

async function main() {
  const fixture = await createFixtureBoard();
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-desktop-cli-config-'));
  const env = {
    SIGNBOARD_CLI_CONFIG_DIR: configDir,
  };

  const helpResult = runDesktopCli(['help'], env);
  assert.ok(helpResult.stdout.includes('Signboard CLI'));

  const useResult = runDesktopCli(['use', fixture.boardRoot], env);
  assert.ok(useResult.stdout.includes(fixture.boardRoot));

  const invalidResult = runDesktopCliExpectFail(['card', '--read', 'kqmf2'], env);
  assert.ok(invalidResult.stderr.includes('Unknown command group: card'));

  const listResult = runDesktopCli([
    'cards',
    '--due',
    'next:7',
    '--json',
  ], env);
  const cards = JSON.parse(listResult.stdout);
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].title, 'Launch plan');

  const settingsResult = runDesktopCli([
    'settings',
    'edit',
    '--tooltips',
    'off',
    '--json',
  ], env);
  const settings = JSON.parse(settingsResult.stdout);
  assert.strictEqual(settings.tooltipsEnabled, false);

  console.log('Desktop CLI tests passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
