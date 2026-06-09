const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const cardFrontmatter = require('../lib/cardFrontmatter');
const {
  buildGeneratedBaseYaml,
  buildObsidianOpenUri,
  buildSignboardCardUri,
  createLinkedObsidianNote,
  findObsidianVaultRoot,
  getSignboardCardId,
  normalizeSignboardCardFrontmatter,
  parseObsidianWikilink,
  resolveObsidianRelatedNote,
  writeManagedObsidianBaseFile,
  writeObsidianBaseFile,
} = require('../lib/obsidianIntegration');

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-obsidian-integration-'));

  try {
    const vaultRoot = path.join(tmpDir, 'Vault');
    const boardRoot = path.join(vaultRoot, 'Signboard', 'Launch');
    const listRoot = path.join(boardRoot, '000-To-do-stock');
    const cardPath = path.join(listRoot, '001-launch-plan-ab123.md');

    await fs.mkdir(path.join(vaultRoot, '.obsidian'), { recursive: true });
    await fs.mkdir(listRoot, { recursive: true });
    await cardFrontmatter.writeCard(cardPath, {
      frontmatter: {
        title: 'Launch plan',
        signboard_id: 'old01',
        related: '[[Existing Note]]',
      },
      body: 'Body',
    });

    assert.strictEqual(getSignboardCardId(cardPath, { signboard_id: 'old01' }), 'ab123');
    assert.strictEqual(buildSignboardCardUri('ab123'), 'signboard://open-card?id=ab123');
    assert(buildObsidianOpenUri(cardPath).startsWith('obsidian://open?'));
    const trickyObsidianUri = buildObsidianOpenUri(path.join(
      tmpDir,
      'Mobile Documents',
      'iCloud~md~obsidian',
      'Obsidian Test',
      '002-a new to-do-XAxDO.md',
    ));
    assert(!trickyObsidianUri.includes('+'));
    assert(trickyObsidianUri.includes('Mobile%20Documents'));
    assert(trickyObsidianUri.includes('Obsidian%20Test'));
    assert(trickyObsidianUri.includes('002-a%20new%20to-do-XAxDO.md'));

    const normalized = normalizeSignboardCardFrontmatter({
      boardRoot,
      cardPath,
      frontmatter: {
        title: 'Launch plan',
        signboard_id: 'old01',
        related: '[[Existing Note]]',
      },
    });
    assert.strictEqual(normalized.signboard_id, 'ab123');
    assert.strictEqual(normalized.signboard_board, 'Launch');
    assert.strictEqual(normalized.signboard_list, 'To-do');
    assert.strictEqual(normalized.status, 'To-do');
    assert.deepStrictEqual(normalized.related, ['[[Existing Note]]']);

    const baseYaml = buildGeneratedBaseYaml(boardRoot, vaultRoot);
    const parsedBase = yaml.load(baseYaml, { schema: yaml.JSON_SCHEMA });
    assert.deepStrictEqual(parsedBase.filters.and.slice(0, 2), [
      'file.ext == "md"',
      'signboard_board == "Launch"',
    ]);
    assert(parsedBase.filters.and.includes('file.inFolder("Signboard/Launch")'));
    assert.deepStrictEqual(parsedBase.properties.title, { displayName: 'Title' });
    assert.deepStrictEqual(parsedBase.properties.linked_objects, { displayName: 'Linked Objects' });
    assert.strictEqual(parsedBase.views[0].type, 'table');
    assert.strictEqual(parsedBase.views[0].order[0], 'title');
    assert(parsedBase.views[0].order.includes('linked_objects'));
    assert(parsedBase.views[0].order.includes('file.name'));
    assert.strictEqual(parsedBase.views[1].type, 'cards');
    assert.strictEqual(parsedBase.views[1].order[0], 'title');

    const baseResult = await writeObsidianBaseFile(boardRoot);
    assert.strictEqual(baseResult.ok, true);
    assert.strictEqual(baseResult.inVault, true);
    assert.strictEqual(baseResult.managedHash.length, 64);
    assert.strictEqual(await findObsidianVaultRoot(boardRoot), vaultRoot);
    await fs.access(baseResult.basePath);

    await fs.rm(baseResult.basePath);
    const managedCreated = await writeManagedObsidianBaseFile(boardRoot);
    assert.strictEqual(managedCreated.ok, true);
    assert.strictEqual(managedCreated.written, true);
    assert.strictEqual(managedCreated.reason, 'CREATED');
    assert.strictEqual(managedCreated.managedHash.length, 64);

    await fs.appendFile(managedCreated.basePath, '\n# user customization\n', 'utf8');
    const managedSkipped = await writeManagedObsidianBaseFile(boardRoot, {
      managedHash: managedCreated.managedHash,
    });
    assert.strictEqual(managedSkipped.written, false);
    assert.strictEqual(managedSkipped.reason, 'USER_MODIFIED');
    const customizedBaseRaw = await fs.readFile(managedCreated.basePath, 'utf8');
    assert(customizedBaseRaw.includes('user customization'));

    const managedForced = await writeManagedObsidianBaseFile(boardRoot, {
      force: true,
      managedHash: managedCreated.managedHash,
    });
    assert.strictEqual(managedForced.written, true);
    assert.strictEqual(managedForced.reason, 'FORCED');
    const forcedBaseRaw = await fs.readFile(managedForced.basePath, 'utf8');
    assert(!forcedBaseRaw.includes('user customization'));

    const card = await cardFrontmatter.readCard(cardPath);
    const linkedNote = await createLinkedObsidianNote({ boardRoot, cardPath, card });
    assert.strictEqual(linkedNote.ok, true);
    assert.strictEqual(linkedNote.linkTarget, '[[Signboard/Launch/Linked Signboard Note]]');
    assert.strictEqual(linkedNote.notePath.endsWith('Linked Signboard Note.md'), true);
    const linkedNoteRaw = await fs.readFile(linkedNote.notePath, 'utf8');
    assert(linkedNoteRaw.includes('signboard_card_id: ab123'));
    assert(linkedNoteRaw.includes('signboard://open-card?id=ab123'));
    assert(!linkedNoteRaw.includes('# Launch plan'));
    assert(!linkedNoteRaw.includes('## Notes'));
    const secondLinkedNote = await createLinkedObsidianNote({ boardRoot, cardPath, card });
    assert.strictEqual(secondLinkedNote.linkTarget, '[[Signboard/Launch/Linked Signboard Note 2]]');
    assert.strictEqual(secondLinkedNote.notePath.endsWith('Linked Signboard Note 2.md'), true);
    assert.deepStrictEqual(parseObsidianWikilink('[[Signboard/Launch/Linked Signboard Note|Launch note]]'), {
      raw: '[[Signboard/Launch/Linked Signboard Note|Launch note]]',
      target: 'Signboard/Launch/Linked Signboard Note',
      alias: 'Launch note',
      displayName: 'Launch note',
    });
    const resolvedLinkedNote = await resolveObsidianRelatedNote({
      boardRoot,
      cardPath,
      related: linkedNote.linkTarget,
    });
    assert.strictEqual(resolvedLinkedNote.ok, true);
    assert.strictEqual(resolvedLinkedNote.notePath, linkedNote.notePath);
    assert(resolvedLinkedNote.obsidianUri.startsWith('obsidian://open?'));

    console.log('Obsidian integration tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('Obsidian integration tests failed.');
  console.error(error);
  process.exitCode = 1;
});
