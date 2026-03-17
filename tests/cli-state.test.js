import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  CLI_STATE_FILE_NAME,
  getCliConfigDir,
  getCliStatePath,
  readCliState,
  writeCliState,
  setCurrentBoard,
  getCurrentBoard,
} = require('../lib/cliState');

describe('cliState', () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-state-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── CLI_STATE_FILE_NAME ──────────────────────────────────────────────

  describe('CLI_STATE_FILE_NAME', () => {
    it('should be cli-state.json', () => {
      expect(CLI_STATE_FILE_NAME).toBe('cli-state.json');
    });
  });

  // ── getCliConfigDir ──────────────────────────────────────────────────

  describe('getCliConfigDir', () => {
    it('should use SIGNBOARD_CLI_CONFIG_DIR env override when set', () => {
      const dir = getCliConfigDir({
        env: { SIGNBOARD_CLI_CONFIG_DIR: '/custom/dir' },
      });
      expect(dir).toBe(path.resolve('/custom/dir'));
    });

    it('should ignore blank SIGNBOARD_CLI_CONFIG_DIR', () => {
      const dir = getCliConfigDir({
        env: { SIGNBOARD_CLI_CONFIG_DIR: '   ' },
        homeDir: '/home/test',
      });
      expect(dir).not.toBe(path.resolve('   '));
    });

    it('should use APPDATA on win32', () => {
      const dir = getCliConfigDir({
        env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
        platform: 'win32',
        homeDir: 'C:\\Users\\test',
      });
      expect(dir).toBe(
        path.join('C:\\Users\\test\\AppData\\Roaming', 'Signboard')
      );
    });

    it('should fall through to XDG on win32 when APPDATA is empty', () => {
      const dir = getCliConfigDir({
        env: { APPDATA: '', XDG_CONFIG_HOME: '/xdg/config' },
        platform: 'win32',
        homeDir: '/home/test',
      });
      expect(dir).toBe(path.join(path.resolve('/xdg/config'), 'signboard'));
    });

    it('should use XDG_CONFIG_HOME when set on non-win32', () => {
      const dir = getCliConfigDir({
        env: { XDG_CONFIG_HOME: '/xdg/config' },
        platform: 'linux',
        homeDir: '/home/test',
      });
      expect(dir).toBe(path.join(path.resolve('/xdg/config'), 'signboard'));
    });

    it('should fall back to ~/.config/signboard', () => {
      const dir = getCliConfigDir({
        env: {},
        platform: 'darwin',
        homeDir: '/Users/testuser',
      });
      expect(dir).toBe(
        path.join(path.resolve('/Users/testuser'), '.config', 'signboard')
      );
    });

    it('should use defaults when called with no arguments', () => {
      const dir = getCliConfigDir();
      expect(typeof dir).toBe('string');
      expect(dir.length).toBeGreaterThan(0);
    });
  });

  // ── getCliStatePath ──────────────────────────────────────────────────

  describe('getCliStatePath', () => {
    it('should append cli-state.json to the config dir', () => {
      const statePath = getCliStatePath({
        env: { SIGNBOARD_CLI_CONFIG_DIR: tmpDir },
      });
      expect(statePath).toBe(path.join(tmpDir, 'cli-state.json'));
    });
  });

  // ── readCliState ─────────────────────────────────────────────────────

  describe('readCliState', () => {
    it('should return empty object when file does not exist', async () => {
      const missingDir = path.join(tmpDir, 'does-not-exist');
      const state = await readCliState({
        env: { SIGNBOARD_CLI_CONFIG_DIR: missingDir },
      });
      expect(state).toEqual({});
    });

    it('should read and parse a valid JSON state file', async () => {
      const readDir = path.join(tmpDir, 'read-test');
      await fs.mkdir(readDir, { recursive: true });
      await fs.writeFile(
        path.join(readDir, 'cli-state.json'),
        JSON.stringify({ currentBoard: '/some/path' }),
        'utf8'
      );

      const state = await readCliState({
        env: { SIGNBOARD_CLI_CONFIG_DIR: readDir },
      });
      expect(state).toEqual({ currentBoard: '/some/path' });
    });

    it('should return empty object when JSON parses to null', async () => {
      const nullDir = path.join(tmpDir, 'null-json');
      await fs.mkdir(nullDir, { recursive: true });
      await fs.writeFile(
        path.join(nullDir, 'cli-state.json'),
        'null',
        'utf8'
      );

      const state = await readCliState({
        env: { SIGNBOARD_CLI_CONFIG_DIR: nullDir },
      });
      expect(state).toEqual({});
    });

    it('should return empty object when JSON parses to a non-object', async () => {
      const arrayDir = path.join(tmpDir, 'array-json');
      await fs.mkdir(arrayDir, { recursive: true });
      await fs.writeFile(
        path.join(arrayDir, 'cli-state.json'),
        '"just a string"',
        'utf8'
      );

      const state = await readCliState({
        env: { SIGNBOARD_CLI_CONFIG_DIR: arrayDir },
      });
      expect(state).toEqual({});
    });

    it('should throw on invalid JSON', async () => {
      const badDir = path.join(tmpDir, 'bad-json');
      await fs.mkdir(badDir, { recursive: true });
      await fs.writeFile(
        path.join(badDir, 'cli-state.json'),
        '{ broken json',
        'utf8'
      );

      await expect(
        readCliState({ env: { SIGNBOARD_CLI_CONFIG_DIR: badDir } })
      ).rejects.toThrow();
    });
  });

  // ── writeCliState ────────────────────────────────────────────────────

  describe('writeCliState', () => {
    it('should create the config directory and write state', async () => {
      const writeDir = path.join(tmpDir, 'write-test', 'nested');
      const statePath = await writeCliState(
        { foo: 'bar' },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: writeDir } }
      );

      expect(statePath).toBe(path.join(writeDir, 'cli-state.json'));

      const raw = await fs.readFile(statePath, 'utf8');
      expect(JSON.parse(raw)).toEqual({ foo: 'bar' });
    });

    it('should pretty-print JSON with 2-space indent', async () => {
      const prettyDir = path.join(tmpDir, 'pretty-test');
      await writeCliState(
        { a: 1 },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: prettyDir } }
      );

      const raw = await fs.readFile(
        path.join(prettyDir, 'cli-state.json'),
        'utf8'
      );
      expect(raw).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('should overwrite existing state file', async () => {
      const overwriteDir = path.join(tmpDir, 'overwrite-test');
      await writeCliState(
        { first: true },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: overwriteDir } }
      );
      await writeCliState(
        { second: true },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: overwriteDir } }
      );

      const raw = await fs.readFile(
        path.join(overwriteDir, 'cli-state.json'),
        'utf8'
      );
      expect(JSON.parse(raw)).toEqual({ second: true });
    });
  });

  // ── setCurrentBoard ──────────────────────────────────────────────────

  describe('setCurrentBoard', () => {
    let boardDir;

    beforeAll(async () => {
      boardDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-board-'));
    });

    afterAll(async () => {
      await fs.rm(boardDir, { recursive: true, force: true });
    });

    it('should set the current board and return result', async () => {
      const configDir = path.join(tmpDir, 'set-board');
      const result = await setCurrentBoard(boardDir, {
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });

      expect(result.currentBoard).toBe(path.resolve(boardDir));
      expect(result.statePath).toBe(path.join(configDir, 'cli-state.json'));
    });

    it('should persist the board in state file', async () => {
      const configDir = path.join(tmpDir, 'set-board-persist');
      await setCurrentBoard(boardDir, {
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });

      const state = await readCliState({
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });
      expect(state.currentBoard).toBe(path.resolve(boardDir));
    });

    it('should merge with existing state', async () => {
      const configDir = path.join(tmpDir, 'set-board-merge');
      await writeCliState(
        { existingKey: 'preserved' },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: configDir } }
      );

      await setCurrentBoard(boardDir, {
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });

      const state = await readCliState({
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });
      expect(state.existingKey).toBe('preserved');
      expect(state.currentBoard).toBe(path.resolve(boardDir));
    });

    it('should resolve empty string to cwd', async () => {
      const configDir = path.join(tmpDir, 'set-board-empty');
      const result = await setCurrentBoard('', {
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });
      // Empty string resolves to process.cwd() via path.resolve
      expect(result.currentBoard).toBe(path.resolve(''));
    });

    it('should resolve whitespace-only string to cwd', async () => {
      const configDir = path.join(tmpDir, 'set-board-ws');
      const result = await setCurrentBoard('   ', {
        env: { SIGNBOARD_CLI_CONFIG_DIR: configDir },
      });
      expect(result.currentBoard).toBe(path.resolve(''));
    });

    it('should throw when board directory does not exist', async () => {
      await expect(
        setCurrentBoard('/nonexistent/path/to/board')
      ).rejects.toThrow('Board root does not exist');
    });

    it('should throw when board path is a file, not a directory', async () => {
      const filePath = path.join(tmpDir, 'not-a-dir.txt');
      await fs.writeFile(filePath, 'hello', 'utf8');

      await expect(setCurrentBoard(filePath)).rejects.toThrow(
        'Board root is not a directory'
      );
    });
  });

  // ── getCurrentBoard ──────────────────────────────────────────────────

  describe('getCurrentBoard', () => {
    it('should return empty string when no board is set', async () => {
      const emptyDir = path.join(tmpDir, 'get-empty');
      const board = await getCurrentBoard({
        env: { SIGNBOARD_CLI_CONFIG_DIR: emptyDir },
      });
      expect(board).toBe('');
    });

    it('should return empty string when currentBoard is empty string', async () => {
      const emptyBoardDir = path.join(tmpDir, 'get-empty-board');
      await writeCliState(
        { currentBoard: '' },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: emptyBoardDir } }
      );

      const board = await getCurrentBoard({
        env: { SIGNBOARD_CLI_CONFIG_DIR: emptyBoardDir },
      });
      expect(board).toBe('');
    });

    it('should return the resolved board path', async () => {
      const getDir = path.join(tmpDir, 'get-board');
      await writeCliState(
        { currentBoard: '/some/board/path' },
        { env: { SIGNBOARD_CLI_CONFIG_DIR: getDir } }
      );

      const board = await getCurrentBoard({
        env: { SIGNBOARD_CLI_CONFIG_DIR: getDir },
      });
      expect(board).toBe(path.resolve('/some/board/path'));
    });
  });
});
