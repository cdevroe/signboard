const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { ARCHIVE_DIRECTORY_NAME, archiveCard, archiveList } = require('../lib/archive');

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

async function testArchiveCardCreatesArchiveAndRenumbersOnCollision(root) {
  const boardRoot = await createBoardRoot(root, 'Archive Cards Board');
  const todoList = path.join(boardRoot, '000-To-do-stock');
  const doingList = path.join(boardRoot, '001-Doing-stock');

  await fs.mkdir(todoList, { recursive: true });
  await fs.mkdir(doingList, { recursive: true });

  const firstCardPath = path.join(todoList, '000-plan-release-stock.md');
  const secondCardPath = path.join(doingList, '000-plan-release-stock.md');
  await fs.writeFile(firstCardPath, '# Plan release\n', 'utf8');
  await fs.writeFile(secondCardPath, '# Another plan\n', 'utf8');

  const firstResult = await archiveCard(boardRoot, firstCardPath);
  assert.strictEqual(firstResult.archivedCardFile, '000-plan-release-stock.md');
  assert.strictEqual(await pathExists(path.join(boardRoot, ARCHIVE_DIRECTORY_NAME)), true);
  assert.strictEqual(await pathExists(firstCardPath), false);
  assert.strictEqual(
    await pathExists(path.join(boardRoot, ARCHIVE_DIRECTORY_NAME, '000-plan-release-stock.md')),
    true,
  );

  const secondResult = await archiveCard(boardRoot, secondCardPath);
  assert.strictEqual(secondResult.archivedCardFile, '001-plan-release-stock.md');
  assert.strictEqual(await pathExists(secondCardPath), false);
  assert.strictEqual(
    await pathExists(path.join(boardRoot, ARCHIVE_DIRECTORY_NAME, '001-plan-release-stock.md')),
    true,
  );
}

async function testArchiveListAddsSuffixOnCollision(root) {
  const boardRoot = await createBoardRoot(root, 'Archive Lists Board');
  const workingList = path.join(boardRoot, '001-Working-stock');
  const archiveRoot = path.join(boardRoot, ARCHIVE_DIRECTORY_NAME);

  await fs.mkdir(workingList, { recursive: true });
  await fs.mkdir(path.join(archiveRoot, '001-Working-stock'), { recursive: true });
  await fs.writeFile(path.join(workingList, '000-ship-it-stock.md'), '# Ship it\n', 'utf8');

  const result = await archiveList(boardRoot, workingList);
  assert.strictEqual(result.alreadyArchived, false);
  assert.ok(/^001-Working-stock-[A-Za-z0-9]{5}$/.test(result.archivedDirectoryName));
  assert.strictEqual(await pathExists(workingList), false);
  assert.strictEqual(await pathExists(path.join(archiveRoot, result.archivedDirectoryName)), true);
  assert.strictEqual(
    await pathExists(path.join(archiveRoot, result.archivedDirectoryName, '000-ship-it-stock.md')),
    true,
  );
}

async function testAlreadyArchivedNoOps(root) {
  const boardRoot = await createBoardRoot(root, 'Already Archived Board');
  const archiveRoot = path.join(boardRoot, ARCHIVE_DIRECTORY_NAME);
  const archivedList = path.join(archiveRoot, '000-Old-stock');
  const archivedCardPath = path.join(archiveRoot, '000-old-card-stock.md');

  await fs.mkdir(archivedList, { recursive: true });
  await fs.writeFile(archivedCardPath, '# Archived card\n', 'utf8');

  const archivedCardResult = await archiveCard(boardRoot, archivedCardPath);
  assert.strictEqual(archivedCardResult.alreadyArchived, true);
  assert.strictEqual(archivedCardResult.archivedCardPath, archivedCardPath);

  const archivedListResult = await archiveList(boardRoot, archivedList);
  assert.strictEqual(archivedListResult.alreadyArchived, true);
  assert.strictEqual(archivedListResult.archivedListPath, archivedList);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-archive-'));

  try {
    await testArchiveCardCreatesArchiveAndRenumbersOnCollision(root);
    await testArchiveListAddsSuffixOnCollision(root);
    await testAlreadyArchivedNoOps(root);
    console.log('Archive tests passed.');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
