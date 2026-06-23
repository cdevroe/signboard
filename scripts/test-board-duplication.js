const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');
const { duplicateBoard } = require('../lib/boardDuplication');

async function writeCard(filePath, frontmatter, body) {
  await cardFrontmatter.writeCard(filePath, { frontmatter, body });
}

async function main() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-board-duplication-'));
  const sourceRoot = path.join(tmpRoot, 'Source Board');
  const destinationParent = path.join(tmpRoot, 'Copies');
  const todoList = path.join(sourceRoot, '001-To-do-stock');
  const doingList = path.join(sourceRoot, '002-Doing-stock');
  const archiveList = path.join(sourceRoot, 'XXX-Archive');
  const assetDirectory = path.join(sourceRoot, 'assets');
  const sourceAssetPath = path.join(assetDirectory, 'reference.txt');

  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(doingList, { recursive: true });
  await fs.mkdir(archiveList, { recursive: true });
  await fs.mkdir(assetDirectory, { recursive: true });
  await fs.mkdir(destinationParent, { recursive: true });
  await fs.writeFile(sourceAssetPath, 'asset', 'utf8');

  await boardLabels.writeBoardSettings(sourceRoot, {
    labels: [{ id: 'label-1', name: 'Release', colorLight: '#0B5FFF', colorDark: '#6FCF97' }],
    colorScheme: 'harvest',
    obsidianBase: {
      managedHash: 'a'.repeat(64),
      updatedAt: '2026-06-23T00:00:00.000Z',
    },
  });
  await fs.writeFile(path.join(sourceRoot, 'Signboard Board.base'), 'managed base', 'utf8');

  await writeCard(
    path.join(todoList, '000-source-card-Ab123.md'),
    {
      title: 'Source card',
      labels: ['label-1'],
      signboard_id: 'Ab123',
      signboard_uri: 'signboard://open-card?id=Ab123',
      signboard_board: 'Source Board',
      signboard_list: 'To-do',
      status: 'To-do',
      linked_objects: [
        { type: 'file', title: 'Reference', path: sourceAssetPath },
        { type: 'signboard-link', title: 'Doing card', url: 'signboard://open-card?id=Xy789' },
      ],
    },
    'See signboard://open-card?id=Xy789',
  );
  await writeCard(
    path.join(doingList, '001-doing-card-Xy789.md'),
    {
      title: 'Doing card',
      signboard_id: 'Xy789',
      signboard_uri: 'signboard://open-card?id=Xy789',
      signboard_board: 'Source Board',
      signboard_list: 'Doing',
      status: 'Doing',
    },
    'Doing body',
  );
  await writeCard(
    path.join(archiveList, '002-archived-card-Zz999.md'),
    {
      title: 'Archived card',
      signboard_id: 'Zz999',
      signboard_uri: 'signboard://open-card?id=Zz999',
    },
    'Archived body',
  );

  const result = await duplicateBoard({
    sourceBoardRoot: sourceRoot,
    destinationParentPath: destinationParent,
    boardName: 'Source Board Copy',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.cardsDuplicated, 3);
  assert.strictEqual(result.boardRoot, path.join(destinationParent, 'Source Board Copy'));
  assert.strictEqual(await fs.access(path.join(sourceRoot, '001-To-do-stock', '000-source-card-Ab123.md')).then(() => true), true);

  const copiedTodoFiles = await fs.readdir(path.join(result.boardRoot, '001-To-do-stock'));
  const copiedSourceFile = copiedTodoFiles.find((fileName) => fileName.startsWith('000-source-card-'));
  assert.ok(copiedSourceFile);
  assert.notStrictEqual(copiedSourceFile, '000-source-card-Ab123.md');

  const copiedSourcePath = path.join(result.boardRoot, '001-To-do-stock', copiedSourceFile);
  const copiedSourceCard = await cardFrontmatter.readCard(copiedSourcePath);
  const copiedDoingId = result.cardIdMap.Xy789;
  assert.ok(copiedDoingId);
  assert.strictEqual(copiedSourceCard.frontmatter.signboard_board, 'Source Board Copy');
  assert.strictEqual(copiedSourceCard.frontmatter.signboard_list, 'To-do');
  assert.strictEqual(copiedSourceCard.frontmatter.status, 'To-do');
  assert.notStrictEqual(copiedSourceCard.frontmatter.signboard_id, 'Ab123');
  assert.strictEqual(
    copiedSourceCard.frontmatter.signboard_uri,
    `signboard://open-card?id=${copiedSourceCard.frontmatter.signboard_id}`,
  );
  assert.strictEqual(
    copiedSourceCard.frontmatter.linked_objects[0].path,
    path.join(result.boardRoot, 'assets', 'reference.txt'),
  );
  assert.strictEqual(
    copiedSourceCard.frontmatter.linked_objects[1].url,
    `signboard://open-card?id=${copiedDoingId}`,
  );
  assert.strictEqual(copiedSourceCard.body, `See signboard://open-card?id=${copiedDoingId}`);

  const copiedSettings = await boardLabels.readBoardSettings(result.boardRoot, { ensureFile: false });
  assert.deepStrictEqual(copiedSettings.obsidianBase, { managedHash: '', updatedAt: '' });
  await assert.rejects(
    fs.access(path.join(result.boardRoot, 'Signboard Board.base')),
    /ENOENT/,
  );

  const archivedFiles = await fs.readdir(path.join(result.boardRoot, 'XXX-Archive'));
  assert.ok(archivedFiles.some((fileName) => fileName.startsWith('002-archived-card-') && fileName !== '002-archived-card-Zz999.md'));

  await fs.rm(tmpRoot, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
