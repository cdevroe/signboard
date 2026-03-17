import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  readBoardSettings,
  updateBoardLabels,
  updateBoardThemeOverrides,
  updateBoardSettings,
  cardMatchesLabelFilter,
} = require('../lib/boardLabels');

describe('boardLabels', () => {
  let tmpDir;
  let boardPath;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-board-labels-'));
    boardPath = path.join(tmpDir, 'board-one');
    await fs.mkdir(boardPath, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create defaults for missing board-settings file', async () => {
    const defaults = await readBoardSettings(boardPath);
    expect(defaults.labels.length).toBe(3);
    expect(defaults.labels[0].id).toBe('label-1');
    expect(defaults.themeOverrides).toEqual({ light: {}, dark: {} });
    expect(defaults.notifications).toEqual({ enabled: false, time: '09:00' });

    const settingsPath = path.join(boardPath, 'board-settings.md');
    const writtenRaw = await fs.readFile(settingsPath, 'utf8');
    expect(writtenRaw).toContain('labels:');
  });

  it('should persist updated labels and preserve ids', async () => {
    const updatedLabels = [
      {
        id: 'label-priority',
        name: 'Priority',
        colorLight: '#f59e0b',
        colorDark: '#d97706',
      },
      {
        id: 'label-bug',
        name: 'Bug',
        colorLight: '#ef4444',
        colorDark: '#dc2626',
      },
    ];

    await updateBoardLabels(boardPath, updatedLabels);
    const reloaded = await readBoardSettings(boardPath);
    expect(reloaded.labels).toEqual(updatedLabels);
    expect(reloaded.themeOverrides).toEqual({ light: {}, dark: {} });
    expect(reloaded.notifications).toEqual({ enabled: false, time: '09:00' });
  });

  it('should persist theme overrides and normalize values', async () => {
    await updateBoardThemeOverrides(boardPath, {
      light: { boardBackground: 'dfe4f2' },
      dark: { boardBackground: '#0b1220' },
    });
    const withThemeOverrides = await readBoardSettings(boardPath);
    expect(withThemeOverrides.themeOverrides).toEqual({
      light: { boardBackground: '#dfe4f2' },
      dark: { boardBackground: '#0b1220' },
    });
    expect(withThemeOverrides.notifications).toEqual({ enabled: false, time: '09:00' });
  });

  it('should clear overrides and preserve labels when updating full settings', async () => {
    const updatedLabels = [
      {
        id: 'label-priority',
        name: 'Priority',
        colorLight: '#f59e0b',
        colorDark: '#d97706',
      },
      {
        id: 'label-bug',
        name: 'Bug',
        colorLight: '#ef4444',
        colorDark: '#dc2626',
      },
    ];

    await updateBoardSettings(boardPath, {
      labels: updatedLabels,
      themeOverrides: { light: {}, dark: {} },
      notifications: { enabled: true, time: '08:30' },
    });
    const clearedOverrides = await readBoardSettings(boardPath);
    expect(clearedOverrides.themeOverrides).toEqual({ light: {}, dark: {} });
    expect(clearedOverrides.labels).toEqual(updatedLabels);
    expect(clearedOverrides.notifications).toEqual({ enabled: true, time: '08:30' });

    await updateBoardSettings(boardPath, {
      notifications: { enabled: true, time: '24:15' },
    });
    const withLateNotifications = await readBoardSettings(boardPath);
    expect(withLateNotifications.notifications).toEqual({ enabled: true, time: '24:15' });
  });

  it('should migrate legacy labels.md to board-settings.md', async () => {
    const legacyBoardPath = path.join(tmpDir, 'board-two');
    await fs.mkdir(legacyBoardPath, { recursive: true });
    const legacySource = [
      '---',
      'labels:',
      '  - id: "legacy-1"',
      '    name: "Legacy"',
      '    colorLight: "#22c55e"',
      '    colorDark: "#16a34a"',
      '---',
    ].join('\n');
    await fs.writeFile(path.join(legacyBoardPath, 'labels.md'), legacySource, 'utf8');

    const migrated = await readBoardSettings(legacyBoardPath);
    expect(migrated.labels[0].id).toBe('legacy-1');
    const migratedRaw = await fs.readFile(path.join(legacyBoardPath, 'board-settings.md'), 'utf8');
    expect(migratedRaw).toContain('legacy-1');
  });

  it('should use OR-based label filtering', () => {
    expect(cardMatchesLabelFilter(['label-1'], [])).toBe(true);
    expect(cardMatchesLabelFilter([], ['label-1'])).toBe(false);
    expect(cardMatchesLabelFilter(['label-2', 'label-9'], ['label-1', 'label-2'])).toBe(true);
    expect(cardMatchesLabelFilter(['label-3'], ['label-1', 'label-2'])).toBe(false);
  });
});
