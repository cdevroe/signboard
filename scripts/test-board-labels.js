const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  readBoardSettings,
  updateBoardLabels,
  updateBoardThemeOverrides,
  updateBoardSettings,
  readLegacyBoardAppSettings,
  cardMatchesLabelFilter,
  isAutoDetectedCompletedListName,
  isCompletedListByWorkflow,
} = require('../lib/boardLabels');

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-board-labels-'));
  const boardPath = path.join(tmpDir, 'board-one');
  await fs.mkdir(boardPath, { recursive: true });

  try {
    // 1) Missing board-settings file should create defaults.
    const defaults = await readBoardSettings(boardPath);
    assert.strictEqual(defaults.labels.length, 3);
    assert.strictEqual(defaults.labels[0].id, 'label-1');
    assert.deepStrictEqual(defaults.themeOverrides, { light: {}, dark: {} });
    assert.deepStrictEqual(defaults.workflow, {
      autoDetectCompletedLists: true,
      completedListNames: [],
      ignoredCompletedListNames: [],
    });

    const settingsPath = path.join(boardPath, 'board-settings.md');
    const writtenRaw = await fs.readFile(settingsPath, 'utf8');
    assert(writtenRaw.includes('labels:'), 'board-settings.md should contain labels');
    assert(!writtenRaw.includes('notifications:'), 'board-settings.md should not contain app notification settings');
    assert(!writtenRaw.includes('tooltipsEnabled:'), 'board-settings.md should not contain app tooltip settings');

    // 2) Updating labels should persist and preserve ids.
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
    assert.deepStrictEqual(reloaded.labels, updatedLabels);
    assert.deepStrictEqual(reloaded.themeOverrides, { light: {}, dark: {} });

    // 3) Theme overrides should persist and normalize values.
    await updateBoardThemeOverrides(boardPath, {
      light: { boardBackground: 'dfe4f2' },
      dark: { boardBackground: '#0b1220' },
    });
    const withThemeOverrides = await readBoardSettings(boardPath);
    assert.deepStrictEqual(withThemeOverrides.themeOverrides, {
      light: { boardBackground: '#dfe4f2' },
      dark: { boardBackground: '#0b1220' },
    });

    // 4) Updating full settings can clear overrides and preserve labels.
    await updateBoardSettings(boardPath, {
      labels: updatedLabels,
      themeOverrides: { light: {}, dark: {} },
      workflow: {
        autoDetectCompletedLists: false,
        completedListNames: ['003-Done-abc12'],
      },
    });
    const clearedOverrides = await readBoardSettings(boardPath);
    assert.deepStrictEqual(clearedOverrides.themeOverrides, { light: {}, dark: {} });
    assert.deepStrictEqual(clearedOverrides.labels, updatedLabels);
    assert.deepStrictEqual(clearedOverrides.workflow, {
      autoDetectCompletedLists: false,
      completedListNames: ['003-Done-abc12'],
      ignoredCompletedListNames: [],
    });

    const legacyAppBoardPath = path.join(tmpDir, 'board-app-legacy');
    await fs.mkdir(legacyAppBoardPath, { recursive: true });
    await fs.writeFile(path.join(legacyAppBoardPath, 'board-settings.md'), [
      '---',
      'labels:',
      '  - id: "legacy-app"',
      '    name: "Legacy App"',
      '    colorLight: "#22c55e"',
      '    colorDark: "#16a34a"',
      'notifications:',
      '  enabled: true',
      '  time: "08:30"',
      'tooltipsEnabled: false',
      '---',
    ].join('\n'), 'utf8');

    const legacyAppSettings = await readLegacyBoardAppSettings(legacyAppBoardPath);
    assert.deepStrictEqual(legacyAppSettings.notifications, { enabled: true, time: '08:30' });
    assert.strictEqual(legacyAppSettings.tooltipsEnabled, false);
    assert.strictEqual(legacyAppSettings.hasLegacyAppSettings, true);
    await readBoardSettings(legacyAppBoardPath);
    const legacyAppRaw = await fs.readFile(path.join(legacyAppBoardPath, 'board-settings.md'), 'utf8');
    assert(!legacyAppRaw.includes('notifications:'), 'legacy app notification settings should be removed on rewrite');
    assert(!legacyAppRaw.includes('tooltipsEnabled:'), 'legacy app tooltip settings should be removed on rewrite');

    // 5) Legacy labels.md file should be migrated to board-settings.md.
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
    assert.strictEqual(migrated.labels[0].id, 'legacy-1');
    const migratedRaw = await fs.readFile(path.join(legacyBoardPath, 'board-settings.md'), 'utf8');
    assert(migratedRaw.includes('legacy-1'), 'legacy labels should be written to board-settings.md');

    // 6) Filtering is OR-based.
    assert.strictEqual(cardMatchesLabelFilter(['label-1'], []), true);
    assert.strictEqual(cardMatchesLabelFilter([], ['label-1']), false);
    assert.strictEqual(cardMatchesLabelFilter(['label-2', 'label-9'], ['label-1', 'label-2']), true);
    assert.strictEqual(cardMatchesLabelFilter(['label-3'], ['label-1', 'label-2']), false);

    // 7) Workflow settings detect common completed-list names while preserving manual overrides.
    assert.strictEqual(isAutoDetectedCompletedListName('004-Done-abc12'), true);
    assert.strictEqual(isAutoDetectedCompletedListName('003-Completed-stock'), true);
    assert.strictEqual(isAutoDetectedCompletedListName('002-Doing-abc12'), false);
    assert.strictEqual(isCompletedListByWorkflow('004-Done-abc12', defaults.workflow), true);
    assert.strictEqual(isCompletedListByWorkflow('002-Doing-abc12', defaults.workflow), false);
    assert.strictEqual(isCompletedListByWorkflow('004-Done-abc12', {
      autoDetectCompletedLists: true,
      completedListNames: [],
      ignoredCompletedListNames: ['004-Done-abc12'],
    }), false);
    assert.strictEqual(isCompletedListByWorkflow('002-Doing-abc12', {
      autoDetectCompletedLists: false,
      completedListNames: ['002-Doing-abc12'],
    }), true);

    console.log('Board label tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('Board label tests failed.');
  console.error(error);
  process.exitCode = 1;
});
