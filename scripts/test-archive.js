const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const cardFrontmatter = require('../lib/cardFrontmatter');
const {
  ARCHIVE_DIRECTORY_NAME,
  ARCHIVED_LIST_METADATA_FILE,
  archiveCard,
  archiveList,
  listArchiveEntries,
  readArchiveEntry,
  recordCardListMove,
  restoreArchivedCard,
  restoreArchivedList,
} = require('../lib/archive');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function createBoardRoot(root, boardName) {
  const boardRoot = path.join(root, boardName);
  await fs.mkdir(boardRoot, { recursive: true });
  return boardRoot;
}

async function writeCard(filePath, frontmatter = {}, body = '') {
  await cardFrontmatter.writeCard(filePath, {
    frontmatter,
    body,
  });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function getActivityTypes(frontmatter = {}) {
  return Array.isArray(frontmatter.activity)
    ? frontmatter.activity.map((entry) => entry && entry.type).filter(Boolean)
    : [];
}

async function testArchiveCardCreatesMetadataAndRestore(root) {
  const boardRoot = await createBoardRoot(root, 'Archive Card Metadata Board');
  const todoList = path.join(boardRoot, '000-To-do-stock');
  const doingList = path.join(boardRoot, '001-Doing-stock');
  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(doingList, { recursive: true });

  const archivedSourcePath = path.join(todoList, '000-plan-release-stock.md');
  const existingDoingCardPath = path.join(doingList, '000-existing-card-stock.md');
  await writeCard(archivedSourcePath, { title: 'Plan release' }, 'First task');
  await writeCard(existingDoingCardPath, { title: 'Existing card' }, 'Keep me below the restored card');

  const archived = await archiveCard(boardRoot, archivedSourcePath);
  assert.strictEqual(archived.alreadyArchived, false);
  assert.strictEqual(await pathExists(archivedSourcePath), false);
  assert.strictEqual(await pathExists(archived.archivedCardPath), true);

  const archivedCard = await cardFrontmatter.readCard(archived.archivedCardPath);
  assert.deepStrictEqual(archivedCard.frontmatter.archive, {
    archivedAt: archived.archivedAt,
    originalListDirectoryName: '000-To-do-stock',
    originalListDisplayName: 'To-do',
    archiveContainerType: 'standalone-card',
  });
  assert.deepStrictEqual(getActivityTypes(archivedCard.frontmatter), ['archived']);

  const archiveEntries = await listArchiveEntries(boardRoot);
  assert.strictEqual(archiveEntries.cards.length, 1);
  assert.strictEqual(archiveEntries.lists.length, 0);
  assert.strictEqual(archiveEntries.cards[0].insideArchivedList, false);
  assert.strictEqual(archiveEntries.cards[0].originalListDisplayName, 'To-do');

  const restored = await restoreArchivedCard(boardRoot, archived.archivedCardPath, doingList);
  assert.strictEqual(restored.targetListDirectoryName, '001-Doing-stock');
  assert.strictEqual(await pathExists(restored.restoredCardPath), true);

  const restoredFileNames = await fs.readdir(doingList);
  assert.ok(restoredFileNames.includes('000-plan-release-stock.md'));
  assert.ok(restoredFileNames.includes('001-existing-card-stock.md'));

  const restoredCard = await cardFrontmatter.readCard(restored.restoredCardPath);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(restoredCard.frontmatter, 'archive'), false);
  assert.deepStrictEqual(getActivityTypes(restoredCard.frontmatter), ['archived', 'restored']);

  const readDetail = await readArchiveEntry(boardRoot, restored.restoredCardPath).catch((error) => error);
  assert.ok(readDetail instanceof Error, 'Restored cards should no longer be readable as archive entries.');
}

async function testArchiveListBrowserAndCardExtraction(root) {
  const boardRoot = await createBoardRoot(root, 'Archive List Browser Board');
  const inboxList = path.join(boardRoot, '000-Inbox-stock');
  const backlogList = path.join(boardRoot, '001-Backlog-stock');
  await fs.mkdir(inboxList, { recursive: true });
  await fs.mkdir(backlogList, { recursive: true });

  const firstArchivedCard = path.join(backlogList, '000-prepare-demo-stock.md');
  const secondArchivedCard = path.join(backlogList, '001-share-demo-stock.md');
  await writeCard(firstArchivedCard, { title: 'Prepare demo', labels: ['label-1'] }, 'Explain the update');
  await writeCard(secondArchivedCard, { title: 'Share demo' }, 'Send it to the team');

  const archivedList = await archiveList(boardRoot, backlogList);
  const archivedListMetadataPath = path.join(archivedList.archivedListPath, ARCHIVED_LIST_METADATA_FILE);
  assert.strictEqual(await pathExists(archivedListMetadataPath), true);

  const archivedListMetadata = await readJson(archivedListMetadataPath);
  assert.strictEqual(archivedListMetadata.originalListDirectoryName, '001-Backlog-stock');
  assert.strictEqual(archivedListMetadata.originalListDisplayName, 'Backlog');
  assert.deepStrictEqual(
    archivedListMetadata.activity.map((entry) => entry.type),
    ['archived'],
  );

  const archivedCardRecord = await cardFrontmatter.readCard(path.join(archivedList.archivedListPath, '000-prepare-demo-stock.md'));
  assert.strictEqual(archivedCardRecord.frontmatter.archive.archiveContainerType, 'archived-list');
  assert.strictEqual(archivedCardRecord.frontmatter.archive.originalListDisplayName, 'Backlog');

  const archiveEntries = await listArchiveEntries(boardRoot);
  assert.strictEqual(archiveEntries.lists.length, 1);
  assert.strictEqual(archiveEntries.cards.length, 2);
  assert.strictEqual(archiveEntries.lists[0].cardCount, 2);
  assert.ok(archiveEntries.cards.every((entry) => entry.insideArchivedList));

  const archivedListDetail = await readArchiveEntry(boardRoot, archivedList.archivedListPath);
  assert.strictEqual(archivedListDetail.kind, 'list');
  assert.strictEqual(archivedListDetail.entry.cards.length, 2);

  const firstCardEntry = archiveEntries.cards.find((entry) => entry.title === 'Prepare demo');
  const extracted = await restoreArchivedCard(boardRoot, firstCardEntry.entryPath, inboxList);
  assert.strictEqual(extracted.removedEmptyArchiveList, false);
  assert.strictEqual(await pathExists(archivedList.archivedListPath), true);

  const partiallyRestoredCard = await cardFrontmatter.readCard(extracted.restoredCardPath);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(partiallyRestoredCard.frontmatter, 'archive'), false);
  assert.deepStrictEqual(getActivityTypes(partiallyRestoredCard.frontmatter), ['archived', 'restored']);

  const secondCardEntry = (await listArchiveEntries(boardRoot)).cards.find((entry) => entry.title === 'Share demo');
  const extractedFinalCard = await restoreArchivedCard(boardRoot, secondCardEntry.entryPath, inboxList);
  assert.strictEqual(extractedFinalCard.removedEmptyArchiveList, true);
  assert.strictEqual(await pathExists(archivedList.archivedListPath), false);
}

async function testRestoreArchivedListWithRename(root) {
  const boardRoot = await createBoardRoot(root, 'Archive List Restore Board');
  const doingList = path.join(boardRoot, '001-Doing-stock');
  await fs.mkdir(doingList, { recursive: true });

  const cardPath = path.join(doingList, '000-follow-up-stock.md');
  await writeCard(cardPath, { title: 'Follow up' }, 'Call the customer');

  const archivedList = await archiveList(boardRoot, doingList);
  await fs.mkdir(doingList, { recursive: true });
  await writeCard(path.join(doingList, '000-current-doing-stock.md'), { title: 'Current doing' }, 'Still active');

  const collisionError = await restoreArchivedList(boardRoot, archivedList.archivedListPath).catch((error) => error);
  assert.ok(collisionError instanceof Error);
  assert.match(collisionError.message, /Destination list already exists/);

  const restored = await restoreArchivedList(boardRoot, archivedList.archivedListPath, '001-Doing Restored-stock');
  assert.strictEqual(await pathExists(restored.restoredListPath), true);

  const restoredListMetadataPath = path.join(restored.restoredListPath, ARCHIVED_LIST_METADATA_FILE);
  const restoredMetadata = await readJson(restoredListMetadataPath);
  assert.deepStrictEqual(
    restoredMetadata.activity.map((entry) => entry.type),
    ['archived', 'restored'],
  );

  const restoredCard = await cardFrontmatter.readCard(path.join(restored.restoredListPath, '000-follow-up-stock.md'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(restoredCard.frontmatter, 'archive'), false);
  assert.deepStrictEqual(getActivityTypes(restoredCard.frontmatter), ['archived', 'restored']);
}

async function testLegacyArchiveFallbacks(root) {
  const boardRoot = await createBoardRoot(root, 'Legacy Archive Board');
  const todoList = path.join(boardRoot, '000-To-do-stock');
  const archiveRoot = path.join(boardRoot, ARCHIVE_DIRECTORY_NAME);
  const archivedList = path.join(archiveRoot, '001-Old Ideas-stock');
  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(archivedList, { recursive: true });

  const legacyStandaloneCard = path.join(archiveRoot, '000-legacy-card-stock.md');
  const legacyListCard = path.join(archivedList, '000-legacy-list-card-stock.md');
  await fs.writeFile(legacyStandaloneCard, '# Legacy standalone card\n\nStill readable.\n', 'utf8');
  await fs.writeFile(legacyListCard, '# Legacy list card\n\nFrom an older archive.\n', 'utf8');

  const archiveEntries = await listArchiveEntries(boardRoot);
  const standaloneEntry = archiveEntries.cards.find((entry) => entry.archivedCardFile === '000-legacy-card-stock.md');
  const listEntry = archiveEntries.lists.find((entry) => entry.listDirectoryName === '001-Old Ideas-stock');
  assert.ok(standaloneEntry);
  assert.ok(listEntry);
  assert.strictEqual(standaloneEntry.originalListDisplayName, 'Unknown original list');
  assert.strictEqual(listEntry.originalListDisplayName, 'Old Ideas');

  const restored = await restoreArchivedCard(boardRoot, legacyStandaloneCard, todoList);
  const restoredCard = await cardFrontmatter.readCard(restored.restoredCardPath);
  assert.strictEqual(restoredCard.frontmatter.title, 'Legacy standalone card');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(restoredCard.frontmatter, 'archive'), false);
  assert.deepStrictEqual(getActivityTypes(restoredCard.frontmatter), ['restored']);
}

async function testRecordCardListMoveAppendsLifecycleEvent(root) {
  const boardRoot = await createBoardRoot(root, 'Archive Move Metadata Board');
  const todoList = path.join(boardRoot, '000-To-do-stock');
  const doingList = path.join(boardRoot, '001-Doing-stock');
  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(doingList, { recursive: true });

  const cardPath = path.join(doingList, '000-track-progress-stock.md');
  await writeCard(cardPath, { title: 'Track progress' }, 'Update the thread');

  const moved = await recordCardListMove(boardRoot, cardPath, todoList, doingList);
  assert.strictEqual(moved.moved, true);

  const movedCard = await cardFrontmatter.readCard(cardPath);
  assert.deepStrictEqual(getActivityTypes(movedCard.frontmatter), ['moved-list']);
  assert.strictEqual(movedCard.frontmatter.activity[0].fromListDisplayName, 'To-do');
  assert.strictEqual(movedCard.frontmatter.activity[0].toListDisplayName, 'Doing');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-archive-'));

  try {
    await testArchiveCardCreatesMetadataAndRestore(root);
    await testArchiveListBrowserAndCardExtraction(root);
    await testRestoreArchivedListWithRename(root);
    await testLegacyArchiveFallbacks(root);
    await testRecordCardListMoveAppendsLifecycleEvent(root);
    console.log('Archive tests passed.');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
