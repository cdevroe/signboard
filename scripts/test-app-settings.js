const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  DEFAULT_SMART_CARD_ACTIONS,
  readAppSettings,
  updateAppSettings,
  migrateAppSettingsFromBoardSettings,
} = require('../lib/appSettings');

function assertDefaultSmartCardActions(actions) {
  assert.deepStrictEqual(actions.map((action) => ({
    id: action.id,
    type: action.type,
    label: action.label,
    builtIn: action.builtIn,
  })), DEFAULT_SMART_CARD_ACTIONS().map((action) => ({
    id: action.id,
    type: action.type,
    label: action.label,
    builtIn: action.builtIn,
  })));
  assert(actions.every((action) => typeof action.prompt === 'string' && action.prompt.length > 0));
  const taskAction = actions.find((action) => action.id === 'generate-task-list');
  assert(taskAction.prompt.includes('Generate 6 practical checklist items'));
}

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-app-settings-'));

  try {
    const defaults = await readAppSettings(tmpDir);
    assert.deepStrictEqual(defaults.notifications, { enabled: false, time: '09:00' });
    assert.strictEqual(defaults.tooltipsEnabled, true);
    assert.deepStrictEqual(defaults.quickAdd, { globalShortcut: '' });
    assert.deepStrictEqual(defaults.externalPublishedCalendar, {
      enabled: false,
      port: 48273,
      token: '',
    });
    assert.deepStrictEqual(defaults.ai, {
      enabled: false,
      provider: 'ollama',
      ollama: {
        url: 'http://127.0.0.1:11434',
        model: 'llama3.2',
      },
      smartCardActions: defaults.ai.smartCardActions,
    });
    assertDefaultSmartCardActions(defaults.ai.smartCardActions);
    assert.strictEqual(defaults.migration.boardSettingsMigrated, false);

    const updated = await updateAppSettings(tmpDir, {
      notifications: { enabled: true, time: '08:30' },
      tooltipsEnabled: false,
      quickAdd: { globalShortcut: ' CommandOrControl + Shift + Space ' },
      externalPublishedCalendar: {
        enabled: true,
        port: '49152',
        token: 'calendar-token_123',
      },
      ai: {
        enabled: true,
        provider: 'unknown',
        ollama: {
          url: 'localhost:11434/',
          model: ' qwen2.5:7b ',
          taskCount: '8',
        },
        smartCardActions: [
          {
            id: 'generate-title',
            prompt: 'Custom title prompt',
          },
          {
            id: 'custom-follow-up',
            type: 'custom',
            label: ' Draft follow up ',
            prompt: ' Draft a follow-up section. ',
          },
          {
            id: 'bad-custom',
            type: 'custom',
            label: '',
            prompt: '',
          },
        ],
      },
    });
    assert.deepStrictEqual(updated.notifications, { enabled: true, time: '08:30' });
    assert.strictEqual(updated.tooltipsEnabled, false);
    assert.deepStrictEqual(updated.quickAdd, { globalShortcut: 'CommandOrControl+Shift+Space' });
    assert.deepStrictEqual(updated.externalPublishedCalendar, {
      enabled: true,
      port: 49152,
      token: 'calendar-token_123',
    });
    assert.deepStrictEqual(updated.ai, {
      enabled: true,
      provider: 'ollama',
      ollama: {
        url: 'http://localhost:11434',
        model: 'qwen2.5:7b',
      },
      smartCardActions: updated.ai.smartCardActions,
    });
    const defaultActionIds = DEFAULT_SMART_CARD_ACTIONS().map((action) => action.id);
    assert.strictEqual(updated.ai.smartCardActions.length, defaultActionIds.length + 1);
    assert.deepStrictEqual(
      updated.ai.smartCardActions.map((action) => action.id),
      [
        'generate-title',
        'custom-follow-up',
        ...defaultActionIds.filter((actionId) => actionId !== 'generate-title'),
      ],
    );
    assert.strictEqual(updated.ai.smartCardActions[0].id, 'generate-title');
    assert.strictEqual(updated.ai.smartCardActions[0].prompt, 'Custom title prompt');
    assert.deepStrictEqual(updated.ai.smartCardActions[1], {
      id: 'custom-follow-up',
      type: 'custom',
      label: 'Draft follow up',
      prompt: 'Draft a follow-up section.',
      builtIn: false,
    });

    const secondTmpDir = path.join(tmpDir, 'migration');
    await fs.mkdir(secondTmpDir);
    const migrated = await migrateAppSettingsFromBoardSettings(secondTmpDir, '/tmp/first-board', {
      notifications: { enabled: true, time: '24:15' },
      tooltipsEnabled: false,
    });
    assert.strictEqual(migrated.migrated, true);
    assert.deepStrictEqual(migrated.settings.notifications, { enabled: true, time: '24:15' });
    assert.strictEqual(migrated.settings.tooltipsEnabled, false);
    assert.deepStrictEqual(migrated.settings.quickAdd, { globalShortcut: '' });
    assert.deepStrictEqual(migrated.settings.externalPublishedCalendar, {
      enabled: false,
      port: 48273,
      token: '',
    });
    assert.deepStrictEqual(migrated.settings.ai, {
      enabled: false,
      provider: 'ollama',
      ollama: {
        url: 'http://127.0.0.1:11434',
        model: 'llama3.2',
      },
      smartCardActions: migrated.settings.ai.smartCardActions,
    });
    assertDefaultSmartCardActions(migrated.settings.ai.smartCardActions);
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
