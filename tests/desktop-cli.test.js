import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

function futureDateString(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

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
      due: futureDateString(2),
      labels: ['urgent'],
    },
    body: `Prepare launch notes\n- [ ] (due: ${futureDateString(1)}) Draft email`,
  });

  return { root, boardRoot };
}

function runDesktopCli(args, env = {}) {
  const result = spawnSync(electronBinary, ['.', ...args], {
    cwd: PROJECT_ROOT,
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
    cwd: PROJECT_ROOT,
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

describe('Desktop CLI', () => {
  let fixture;
  let env;
  let configDir;

  beforeAll(async () => {
    fixture = await createFixtureBoard();
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-desktop-cli-config-'));
    env = {
      SIGNBOARD_CLI_CONFIG_DIR: configDir,
    };
  });

  afterAll(async () => {
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('should display help output', () => {
    const helpResult = runDesktopCli(['help'], env);
    expect(helpResult.stdout).toContain('Signboard CLI');
  });

  it('should set the active board with "use"', () => {
    const useResult = runDesktopCli(['use', fixture.boardRoot], env);
    expect(useResult.stdout).toContain(fixture.boardRoot);
  });

  it('should reject unknown command group with suggestion', () => {
    const invalidResult = runDesktopCliExpectFail(['card', '--read', 'kqmf2'], env);
    expect(invalidResult.stderr).toContain('Unknown command group: card');
  });

  it('should filter cards by due date via Electron binary', () => {
    const listResult = runDesktopCli([
      'cards',
      '--due',
      'next:7',
      '--json',
    ], env);
    const cards = JSON.parse(listResult.stdout);
    expect(cards.length).toBe(1);
    expect(cards[0].title).toBe('Launch plan');
  });
});
