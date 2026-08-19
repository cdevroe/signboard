const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  DEFAULT_SMART_BOARD_ACTIONS,
  DEFAULT_SMART_CARD_ACTIONS,
  readAppSettings,
  updateAppSettings,
  migrateAppSettingsFromBoardSettings,
} = require('../lib/appSettings');

function assertDefaultSmartBoardActions(actions) {
  assert.deepStrictEqual(actions, DEFAULT_SMART_BOARD_ACTIONS());
  assert.strictEqual(actions.find((action) => action.id === 'ask-board').editable, false);
  assert.deepStrictEqual(actions.find((action) => action.id === 'create-cards').capabilities, ['create-card']);
  assert.deepStrictEqual(actions.find((action) => action.id === 'label-board').capabilities, ['add-labels']);
  assert(actions.find((action) => action.id === 'board-brief').prompt.includes('by title and list name'));
  assert(!actions.find((action) => action.id === 'quick-wins').prompt.includes('by its exact card ID'));
}

function assertDefaultSmartCardActions(actions) {
  assert.deepStrictEqual(actions.map((action) => ({
    id: action.id,
    type: action.type,
    target: action.target,
    label: action.label,
    builtIn: action.builtIn,
    editable: action.editable,
  })), DEFAULT_SMART_CARD_ACTIONS().map((action) => ({
    id: action.id,
    type: action.type,
    target: action.target,
    label: action.label,
    builtIn: action.builtIn,
    editable: action.editable,
  })));
  assert(actions.every((action) => (
    action.id === 'quick-smart-action' || action.id === 'question-card'
      ? action.prompt === ''
      : typeof action.prompt === 'string' && action.prompt.length > 0
  )));
  const taskAction = actions.find((action) => action.id === 'generate-task-list');
  assert(taskAction.prompt.includes('Generate 6 practical checklist items'));
  const quickAction = actions.find((action) => action.id === 'quick-smart-action');
  assert.strictEqual(quickAction.editable, false);
  const questionAction = actions.find((action) => action.id === 'question-card');
  assert.strictEqual(questionAction.editable, false);
  assert.strictEqual(questionAction.type, 'question');
}

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-app-settings-'));

  try {
    const defaults = await readAppSettings(tmpDir);
    assert.deepStrictEqual(defaults.notifications, { enabled: false, time: '09:00' });
    assert.strictEqual(defaults.tooltipsEnabled, true);
    assert.deepStrictEqual(defaults.quickAdd, { globalShortcut: '' });
    assert.deepStrictEqual(defaults.appearance, { themeSource: 'signboard' });
    assert.deepStrictEqual(defaults.externalPublishedCalendar, {
      enabled: false,
      port: 48273,
      token: '',
    });
    assert.deepStrictEqual(defaults.ai, {
      enabled: false,
      normal: {
        provider: 'ollama',
        model: 'llama3.2',
      },
      advanced: {
        enabled: false,
        provider: 'ollama',
        model: '',
      },
      providers: {
        ollama: { url: 'http://127.0.0.1:11434' },
        lmStudio: { url: 'http://127.0.0.1:1234' },
        openai: {},
        gemini: {},
        anthropic: {},
      },
      smartBoardActions: defaults.ai.smartBoardActions,
      smartCardActions: defaults.ai.smartCardActions,
    });
    assertDefaultSmartBoardActions(defaults.ai.smartBoardActions);
    assertDefaultSmartCardActions(defaults.ai.smartCardActions);
    assert.strictEqual(defaults.migration.boardSettingsMigrated, false);

    const updated = await updateAppSettings(tmpDir, {
      notifications: { enabled: true, time: '08:30' },
      tooltipsEnabled: false,
      quickAdd: { globalShortcut: ' CommandOrControl + Shift + Space ' },
      appearance: { themeSource: 'omarchy' },
      externalPublishedCalendar: {
        enabled: true,
        port: '49152',
        token: 'calendar-token_123',
      },
      ai: {
        enabled: true,
        normal: {
          provider: 'unknown',
          model: ' qwen2.5:7b ',
        },
        advanced: {
          enabled: true,
          provider: 'anthropic',
          model: ' claude-sonnet-test ',
        },
        providers: {
          ollama: { url: 'localhost:11434/' },
          lmStudio: { url: 'localhost:1234/v1/' },
        },
        smartCardActions: [
          {
            id: 'generate-title',
            prompt: 'Custom title prompt',
          },
          {
            id: 'custom-follow-up',
            type: 'custom',
            target: 'labels',
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
    assert.deepStrictEqual(updated.appearance, { themeSource: 'omarchy' });
    assert.deepStrictEqual(updated.externalPublishedCalendar, {
      enabled: true,
      port: 49152,
      token: 'calendar-token_123',
    });
    assert.deepStrictEqual(updated.ai, {
      enabled: true,
      normal: {
        provider: 'ollama',
        model: 'qwen2.5:7b',
      },
      advanced: {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-sonnet-test',
      },
      providers: {
        ollama: { url: 'http://localhost:11434' },
        lmStudio: { url: 'http://localhost:1234' },
        openai: {},
        gemini: {},
        anthropic: {},
      },
      smartBoardActions: updated.ai.smartBoardActions,
      smartCardActions: updated.ai.smartCardActions,
    });
    assertDefaultSmartBoardActions(updated.ai.smartBoardActions);
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
      target: 'labels',
      label: 'Draft follow up',
      prompt: 'Draft a follow-up section.',
      builtIn: false,
    });

    const boardActionsUpdated = await updateAppSettings(tmpDir, {
      ai: {
        ...updated.ai,
        smartBoardActions: [
          {
            id: 'board-brief',
            prompt: 'Write a very short board brief.',
          },
          {
            id: 'custom-board-report',
            mode: 'report',
            label: ' Client update ',
            description: ' Summarize client-facing progress. ',
            prompt: ' Summarize completed work and next steps. ',
            capabilities: ['archive-card'],
          },
          {
            id: 'custom-board-cleanup',
            mode: 'changes',
            label: ' Cleanup ',
            prompt: ' Propose label and archive changes. ',
            capabilities: ['add-labels', 'archive-card', 'not-supported'],
          },
        ],
      },
    });
    assert.strictEqual(boardActionsUpdated.ai.smartBoardActions[0].prompt, 'Write a very short board brief.');
    assert.deepStrictEqual(boardActionsUpdated.ai.smartBoardActions[1], {
      id: 'custom-board-report',
      mode: 'report',
      label: 'Client update',
      description: 'Summarize client-facing progress.',
      prompt: 'Summarize completed work and next steps.',
      capabilities: [],
      builtIn: false,
    });
    assert.deepStrictEqual(boardActionsUpdated.ai.smartBoardActions[2].capabilities, ['add-labels', 'archive-card']);

    const lmStudioUpdated = await updateAppSettings(tmpDir, {
      ai: {
        enabled: true,
        provider: 'lm-studio',
        lmStudio: {
          url: 'localhost:1234/v1/',
          model: ' lmstudio-community/Qwen3-4B-GGUF ',
        },
        smartCardActions: updated.ai.smartCardActions,
      },
    });
    assert.deepStrictEqual(lmStudioUpdated.ai.normal, {
      provider: 'lm-studio',
      model: 'lmstudio-community/Qwen3-4B-GGUF',
    });
    assert.deepStrictEqual(lmStudioUpdated.ai.providers.lmStudio, { url: 'http://localhost:1234' });
    assert.deepStrictEqual(lmStudioUpdated.ai.providers.ollama, { url: 'http://127.0.0.1:11434' });
    assert.strictEqual(lmStudioUpdated.ai.advanced.enabled, false);

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
    assert.deepStrictEqual(migrated.settings.appearance, { themeSource: 'signboard' });
    assert.deepStrictEqual(migrated.settings.externalPublishedCalendar, {
      enabled: false,
      port: 48273,
      token: '',
    });
    assert.deepStrictEqual(migrated.settings.ai, {
      enabled: false,
      normal: {
        provider: 'ollama',
        model: 'llama3.2',
      },
      advanced: {
        enabled: false,
        provider: 'ollama',
        model: '',
      },
      providers: {
        ollama: { url: 'http://127.0.0.1:11434' },
        lmStudio: { url: 'http://127.0.0.1:1234' },
        openai: {},
        gemini: {},
        anthropic: {},
      },
      smartBoardActions: migrated.settings.ai.smartBoardActions,
      smartCardActions: migrated.settings.ai.smartCardActions,
    });
    assertDefaultSmartBoardActions(migrated.settings.ai.smartBoardActions);
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
