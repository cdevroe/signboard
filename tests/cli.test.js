import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const CLI_PATH = path.resolve(PROJECT_ROOT, 'bin', 'signboard.js');

function futureDateString(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function runCli(args, env, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
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
    cwd: PROJECT_ROOT,
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
      due: futureDateString(2),
      labels: ['urgent'],
    },
    body: `Prepare launch notes\n- [ ] (due: ${futureDateString(1)}) Draft email`,
  });

  await cardFrontmatter.writeCard(path.join(todoList, '002-client-follow-up-cd456.md'), {
    frontmatter: {
      title: 'Client follow up',
      labels: ['client'],
    },
    body: `Follow up with client\n- [ ] (due: ${futureDateString(3)}) Schedule check-in`,
  });

  await cardFrontmatter.writeCard(path.join(doingList, '001-internal-review-ef789.md'), {
    frontmatter: {
      title: 'Internal review',
    },
    body: 'Review notes',
  });

  return { root, boardRoot };
}

describe('CLI', () => {
  let fixture;
  let env;
  let configDir;

  beforeAll(async () => {
    fixture = await createFixtureBoard();
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-config-'));
    env = {
      SIGNBOARD_CLI_CONFIG_DIR: configDir,
    };
  });

  afterAll(async () => {
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('should set the active board with "use"', () => {
    const useResult = runCli(['use', fixture.boardRoot], env);
    expect(useResult.stdout).toContain(fixture.boardRoot);
  });

  it('should return the current board with "use" (no args)', () => {
    const currentBoard = runCli(['use'], env);
    expect(currentBoard.stdout.trim()).toBe(fixture.boardRoot);
  });

  it('should suggest "cards" when given singular "card"', () => {
    const invalidSingular = runCliExpectFail(['card', '--read', 'kqmf2'], env);
    expect(invalidSingular.stderr).toContain('Unknown command group: card');
    expect(invalidSingular.stderr).toContain('Did you mean `cards`?');
  });

  it('should reject unknown flags', () => {
    const invalidFlag = runCliExpectFail(['cards', '--read', 'kqmf2'], env);
    expect(invalidFlag.stderr).toContain('Unknown option(s): --read');
  });

  it('should list boards as JSON', () => {
    const lists = JSON.parse(runCli(['lists', '--json'], env).stdout);
    expect(lists.length).toBe(2);
    expect(lists[0].displayName).toBe('To do');
  });

  it('should create a new list', () => {
    const createdList = JSON.parse(
      runCli(['lists', 'create', 'Blocked', '--json'], env).stdout
    );
    expect(createdList.directoryName).toContain('002-Blocked-');
  });

  it('should rename a list', () => {
    const renamedList = JSON.parse(
      runCli(['lists', 'rename', 'Blocked', 'Waiting', '--json'], env).stdout
    );
    expect(renamedList.after.displayName).toBe('Waiting');
  });

  it('should filter cards by due date', () => {
    const dueCards = JSON.parse(
      runCli(['cards', '--due', 'next:7', '--json'], env).stdout
    );
    expect(dueCards.length).toBe(2);
    expect(dueCards.some((card) => card.title === 'Launch plan')).toBeTruthy();
    expect(dueCards.some((card) => card.title === 'Client follow up')).toBeTruthy();
  });

  it('should return empty array for a list with no cards', () => {
    const waitingCards = JSON.parse(
      runCli(['cards', 'Waiting', '--json'], env).stdout
    );
    expect(waitingCards.length).toBe(0);
  });

  it('should filter cards by label', () => {
    const labelCards = JSON.parse(
      runCli(['cards', '--label', 'Urgent', '--json'], env).stdout
    );
    expect(labelCards.length).toBe(1);
    expect(labelCards[0].title).toBe('Launch plan');
  });

  let createdCardId;

  it('should create a card with metadata', () => {
    const createdCard = JSON.parse(
      runCli([
        'cards', 'create',
        '--list', 'Waiting',
        '--title', 'Needs approval',
        '--body', 'Waiting on leadership',
        '--due', futureDateString(5),
        '--label', 'Client',
        '--json',
      ], env).stdout
    );
    expect(createdCard.listDisplayName).toBe('Waiting');
    expect(createdCard.due).toBe(futureDateString(5));
    expect(createdCard.labels).toEqual(['client']);
    createdCardId = createdCard.id;
  });

  it('should edit a card (move, remove due, add label, append body)', () => {
    const editedCard = JSON.parse(
      runCli([
        'cards', 'edit',
        '--card', createdCardId,
        '--due', 'none',
        '--add-label', 'Urgent',
        '--move-to', 'Doing',
        '--append-body', 'Escalated yesterday.',
        '--json',
      ], env).stdout
    );
    expect(editedCard.listDisplayName).toBe('Doing');
    expect(editedCard.due).toBe(null);
    expect(editedCard.labels.sort()).toEqual(['client', 'urgent']);
    expect(editedCard.body).toContain('Escalated yesterday.');
  });

  it('should read a card by id', () => {
    const readCard = JSON.parse(
      runCli([
        'cards', 'read',
        '--list', 'Doing',
        '--card', createdCardId,
      ], env).stdout
    );
    expect(readCard.title).toBe('Needs approval');
    expect(readCard.listDisplayName).toBe('Doing');
  });
});
