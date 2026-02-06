const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  readBoardSettings,
  updateBoardLabels,
  updateBoardThemeOverrides,
  updateBoardSettings,
  cardMatchesLabelFilter,
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

    const settingsPath = path.join(boardPath, 'board-settings.md');
    const writtenRaw = await fs.readFile(settingsPath, 'utf8');
    assert(writtenRaw.includes('labels:'), 'board-settings.md should contain labels');

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
    });
    const clearedOverrides = await readBoardSettings(boardPath);
    assert.deepStrictEqual(clearedOverrides.themeOverrides, { light: {}, dark: {} });
    assert.deepStrictEqual(clearedOverrides.labels, updatedLabels);

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
