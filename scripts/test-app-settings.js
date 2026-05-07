const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  readAppSettings,
  updateAppSettings,
  migrateAppSettingsFromBoardSettings,
} = require('../lib/appSettings');

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-app-settings-'));

  try {
    const defaults = await readAppSettings(tmpDir);
    assert.deepStrictEqual(defaults.notifications, { enabled: false, time: '09:00' });
    assert.strictEqual(defaults.tooltipsEnabled, true);
    assert.strictEqual(defaults.migration.boardSettingsMigrated, false);

    const updated = await updateAppSettings(tmpDir, {
      notifications: { enabled: true, time: '08:30' },
      tooltipsEnabled: false,
    });
    assert.deepStrictEqual(updated.notifications, { enabled: true, time: '08:30' });
    assert.strictEqual(updated.tooltipsEnabled, false);

    const secondTmpDir = path.join(tmpDir, 'migration');
    await fs.mkdir(secondTmpDir);
    const migrated = await migrateAppSettingsFromBoardSettings(secondTmpDir, '/tmp/first-board', {
      notifications: { enabled: true, time: '24:15' },
      tooltipsEnabled: false,
    });
    assert.strictEqual(migrated.migrated, true);
    assert.deepStrictEqual(migrated.settings.notifications, { enabled: true, time: '24:15' });
    assert.strictEqual(migrated.settings.tooltipsEnabled, false);
    assert.strictEqual(migrated.settings.migration.boardSettingsMigrated, true);
    assert.strictEqual(migrated.settings.migration.sourceBoardRoot, '/tmp/first-board');

    const skipped = await migrateAppSettingsFromBoardSettings(secondTmpDir, '/tmp/second-board', {
      notifications: { enabled: false, time: '09:00' },
      tooltipsEnabled: true,
    });
    assert.strictEqual(skipped.migrated, false);
    assert.strictEqual(skipped.settings.migration.sourceBoardRoot, '/tmp/first-board');
    assert.deepStrictEqual(skipped.settings.notifications, { enabled: true, time: '24:15' });

    console.log('App settings tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('App settings tests failed.');
  console.error(error);
  process.exitCode = 1;
});
