const assert = require('assert');
const Module = require('module');
const helpers = require('../obsidian-plugin/signboard-helpers');

function createMockObsidianModule(options = {}) {
  class Modal {
    constructor(app) {
      this.app = app;
      this.contentEl = {
        textContent: '',
        appendChild() {},
      };
    }

    setTitle() {}
    open() {}
    close() {}
  }

  class Notice {
    constructor(message) {
      this.message = message;
    }
  }

  class Plugin {
    constructor(app) {
      this.app = app;
      this.registeredEvents = [];
      this.ribbonIcons = [];
      this.commands = [];
    }

    addStatusBarItem() {
      return {
        classList: { add() {} },
        textContent: '',
        remove() {},
      };
    }

    addRibbonIcon(icon, title, callback) {
      if (options.throwForIcons && options.throwForIcons.has(icon)) {
        throw new Error(`Missing icon: ${icon}`);
      }
      this.ribbonIcons.push({ icon, title, callback });
      return { remove() {} };
    }

    addCommand(command) {
      this.commands.push(command);
      return command;
    }

    registerEvent(eventRef) {
      this.registeredEvents.push(eventRef);
    }
  }

  class TFile {}
  class TFolder {}

  return {
    Modal,
    Notice,
    Plugin,
    TFile,
    TFolder,
  };
}

function createMockObsidianApp() {
  return {
    workspace: {
      getActiveFile: () => null,
      on: () => ({ e: { offref() {} } }),
    },
    metadataCache: {
      getFileCache: () => null,
      on: () => ({ e: { offref() {} } }),
    },
    vault: {
      adapter: {},
      getAbstractFileByPath: () => null,
      getMarkdownFiles: () => [],
      on: () => ({ e: { offref() {} } }),
    },
  };
}

async function testPluginLoadFallbacks() {
  const originalLoad = Module._load;
  const originalWarn = console.warn;
  const pluginPath = require.resolve('../obsidian-plugin/main');
  Module._load = function mockObsidianLoad(request, parent, isMain) {
    if (request === 'obsidian') {
      return createMockObsidianModule({
        throwForIcons: new Set(['layout-dashboard']),
      });
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  console.warn = () => {};

  try {
    delete require.cache[pluginPath];
    const SignboardCompanionPlugin = require(pluginPath);
    const plugin = new SignboardCompanionPlugin(createMockObsidianApp());
    await plugin.onload();
    assert.strictEqual(plugin.ribbonIcons.length, 1, 'plugin should register a fallback ribbon icon');
    assert.strictEqual(plugin.ribbonIcons[0].icon, 'dice', 'fallback icon should be used when the primary icon is unavailable');
    assert(plugin.commands.length >= 4, 'plugin should register command palette commands');
  } finally {
    Module._load = originalLoad;
    console.warn = originalWarn;
    delete require.cache[pluginPath];
  }
}

async function run() {
  assert.strictEqual(
    helpers.extractSignboardCardId('signboard://open-card?id=abc12'),
    'abc12',
    'should extract card id from signboard URI',
  );
  assert.strictEqual(
    helpers.extractSignboardCardId('abc12'),
    'abc12',
    'should accept a pasted card id',
  );
  assert.strictEqual(
    helpers.buildSignboardBoardUri('/Users/example/Vault/Board'),
    'signboard://open-board?path=%2FUsers%2Fexample%2FVault%2FBoard',
    'should encode board open URIs',
  );
  assert.strictEqual(
    helpers.getListDisplayName('001-Doing-stock'),
    'Doing',
    'should display stock list names',
  );
  assert.strictEqual(
    helpers.cleanCardTitleFromFileName('000-launch-plan-ab123.md'),
    'launch plan',
    'should derive titles from Signboard filenames',
  );

  const settings = helpers.buildBoardSettingsMarkdown();
  assert(settings.includes('labels:'), 'board settings should include labels');
  assert(settings.includes('colorLight: #22c55e'), 'board settings should include default label colors');

  const frontmatter = {
    related: '[[Existing]]',
    linked_objects: [
      {
        type: 'obsidian-note',
        title: 'Existing',
        target: '[[Existing]]',
      },
    ],
  };
  helpers.addLinkedObjectToFrontmatter(frontmatter, helpers.createObsidianNoteLinkedObject({
    title: 'Current Note',
    target: '[[Current Note]]',
    path: '/tmp/Current Note.md',
  }), '[[Current Note]]');
  assert.deepStrictEqual(frontmatter.related, ['[[Existing]]', '[[Current Note]]']);
  assert.strictEqual(frontmatter.linked_objects.length, 2);

  helpers.addLinkedObjectToFrontmatter(frontmatter, helpers.createObsidianNoteLinkedObject({
    title: 'Current Note',
    target: '[[Current Note]]',
    path: '/tmp/Current Note.md',
  }), '[[Current Note]]');
  assert.strictEqual(frontmatter.linked_objects.length, 2, 'linked object should dedupe by path');
  assert.deepStrictEqual(frontmatter.related, ['[[Existing]]', '[[Current Note]]'], 'related links should dedupe');

  const deletedNoteContext = helpers.getDeletedObsidianNoteMatchContext({
    vaultPath: 'Projects/Current Note.md',
    absolutePath: '/tmp/Current Note.md',
    basename: 'Current Note',
  });
  assert.strictEqual(
    helpers.linkedObjectMatchesDeletedObsidianNote(frontmatter.linked_objects[1], deletedNoteContext),
    true,
    'deleted note should match linked object path',
  );
  const cleanupFrontmatter = {
    related: ['[[Existing]]', '[[Projects/Current Note]]'],
    linked_objects: [
      {
        type: 'obsidian-note',
        title: 'Existing',
        target: '[[Existing]]',
      },
      {
        type: 'obsidian-note',
        title: 'Current Note',
        target: '[[Projects/Current Note]]',
        path: '/tmp/Current Note.md',
      },
    ],
  };
  const cleanupResult = helpers.removeDeletedObsidianNoteLinksFromFrontmatter(cleanupFrontmatter, deletedNoteContext);
  assert.strictEqual(cleanupResult.changed, true, 'deleted note cleanup should report a change');
  assert.deepStrictEqual(cleanupFrontmatter.related, ['[[Existing]]']);
  assert.deepStrictEqual(cleanupFrontmatter.linked_objects, [{
    type: 'obsidian-note',
    title: 'Existing',
    target: '[[Existing]]',
  }]);

  await testPluginLoadFallbacks();

  console.log('Obsidian plugin helper tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
