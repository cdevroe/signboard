const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { insertCardFileAtTop, reorderCardFilesInList, reorderListDirectories } = require('../lib/cardOrdering');

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

async function listEntries(directoryPath) {
  return (await fs.readdir(directoryPath)).sort();
}

async function testInsertCardFileAtTop() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-card-ordering-'));
  const sourceList = path.join(root, '000-Source-stock');
  const targetList = path.join(root, '001-Target-stock');

  try {
    await fs.mkdir(sourceList, { recursive: true });
    await fs.mkdir(targetList, { recursive: true });
    const sourcePath = path.join(sourceList, '005-moving-card-stock.md');
    await fs.writeFile(sourcePath, 'moving', 'utf8');
    await fs.writeFile(path.join(targetList, '000-existing-card-stock.md'), 'existing', 'utf8');
    await fs.writeFile(path.join(targetList, '001-second-card-stock.md'), 'second', 'utf8');

    const insertedFileName = await insertCardFileAtTop(targetList, sourcePath, path.basename(sourcePath));

    assert.strictEqual(insertedFileName, '000-moving-card-stock.md');
    assert.deepStrictEqual(await listEntries(targetList), [
      '000-moving-card-stock.md',
      '001-existing-card-stock.md',
      '002-second-card-stock.md',
    ]);
    assert.strictEqual(await pathExists(sourcePath), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testInsertCardFileAtTopRollback() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-card-ordering-rollback-'));
  const sourceList = path.join(root, '000-Source-stock');
  const targetList = path.join(root, '001-Target-stock');
  const originalRename = fs.rename;

  try {
    await fs.mkdir(sourceList, { recursive: true });
    await fs.mkdir(targetList, { recursive: true });
    const sourcePath = path.join(sourceList, '005-moving-card-stock.md');
    await fs.writeFile(sourcePath, 'moving', 'utf8');
    await fs.writeFile(path.join(targetList, '000-existing-card-stock.md'), 'existing', 'utf8');
    await fs.writeFile(path.join(targetList, '001-second-card-stock.md'), 'second', 'utf8');

    let failureInjected = false;
    fs.rename = async (fromPath, toPath) => {
      if (
        !failureInjected &&
        String(fromPath).includes('__sbtmp-') &&
        path.basename(toPath) === '001-existing-card-stock.md'
      ) {
        failureInjected = true;
        throw new Error('Injected rename failure');
      }

      return originalRename.call(fs, fromPath, toPath);
    };

    await assert.rejects(
      () => insertCardFileAtTop(targetList, sourcePath, path.basename(sourcePath)),
      /Injected rename failure/,
    );

    fs.rename = originalRename;

    assert.strictEqual(await pathExists(sourcePath), true);
    assert.deepStrictEqual(await listEntries(targetList), [
      '000-existing-card-stock.md',
      '001-second-card-stock.md',
    ]);
  } finally {
    fs.rename = originalRename;
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testReorderCardFilesInList() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-card-reorder-'));
  const listPath = path.join(root, '000-To-do-stock');

  try {
    await fs.mkdir(listPath, { recursive: true });
    await fs.writeFile(path.join(listPath, '000-first-card-aaaaa.md'), 'first', 'utf8');
    await fs.writeFile(path.join(listPath, '001-second-card-bbbbb.md'), 'second', 'utf8');
    await fs.writeFile(path.join(listPath, '002-third-card-ccccc.md'), 'third', 'utf8');

    const result = await reorderCardFilesInList(listPath, [
      path.join(listPath, '002-third-card-ccccc.md'),
      path.join(listPath, '000-first-card-aaaaa.md'),
      path.join(listPath, '001-second-card-bbbbb.md'),
    ]);

    assert.deepStrictEqual(result.map((entry) => entry.cardFile), [
      '000-third-card-ccccc.md',
      '001-first-card-aaaaa.md',
      '002-second-card-bbbbb.md',
    ]);
    assert.deepStrictEqual(await listEntries(listPath), [
      '000-third-card-ccccc.md',
      '001-first-card-aaaaa.md',
      '002-second-card-bbbbb.md',
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testReorderCardFilesAcrossLists() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-card-cross-reorder-'));
  const sourceList = path.join(root, '000-Source-stock');
  const targetList = path.join(root, '001-Target-stock');

  try {
    await fs.mkdir(sourceList, { recursive: true });
    await fs.mkdir(targetList, { recursive: true });
    const sourcePath = path.join(sourceList, '004-moving-card-ddddd.md');
    await fs.writeFile(sourcePath, 'moving', 'utf8');
    await fs.writeFile(path.join(targetList, '000-existing-card-aaaaa.md'), 'existing', 'utf8');
    await fs.writeFile(path.join(targetList, '001-second-card-bbbbb.md'), 'second', 'utf8');

    const result = await reorderCardFilesInList(targetList, [
      path.join(targetList, '000-existing-card-aaaaa.md'),
      sourcePath,
      path.join(targetList, '001-second-card-bbbbb.md'),
    ]);

    assert.deepStrictEqual(result.map((entry) => entry.cardFile), [
      '000-existing-card-aaaaa.md',
      '001-moving-card-ddddd.md',
      '002-second-card-bbbbb.md',
    ]);
    assert.deepStrictEqual(await listEntries(targetList), [
      '000-existing-card-aaaaa.md',
      '001-moving-card-ddddd.md',
      '002-second-card-bbbbb.md',
    ]);
    assert.strictEqual(await pathExists(sourcePath), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testUnchangedCardOrderDoesNotRenameFiles() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-card-reorder-unchanged-'));
  const listPath = path.join(root, '000-To-do-stock');
  const originalRename = fs.rename;

  try {
    await fs.mkdir(listPath, { recursive: true });
    const firstPath = path.join(listPath, '000-first-card-aaaaa.md');
    const secondPath = path.join(listPath, '001-second-card-bbbbb.md');
    await fs.writeFile(firstPath, 'first', 'utf8');
    await fs.writeFile(secondPath, 'second', 'utf8');

    let renameCount = 0;
    fs.rename = async (...args) => {
      renameCount += 1;
      return originalRename.call(fs, ...args);
    };

    const result = await reorderCardFilesInList(listPath, [firstPath, secondPath]);
    assert.strictEqual(renameCount, 0);
    assert.deepStrictEqual(result.map((entry) => entry.cardPath), [firstPath, secondPath]);
  } finally {
    fs.rename = originalRename;
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testReorderListDirectories() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-list-reorder-'));

  try {
    const todo = path.join(root, '000-To-do-stock');
    const doing = path.join(root, '001-Doing-stock');
    const done = path.join(root, '002-Done-stock');
    const archive = path.join(root, 'XXX-Archive');
    await fs.mkdir(todo, { recursive: true });
    await fs.mkdir(doing, { recursive: true });
    await fs.mkdir(done, { recursive: true });
    await fs.mkdir(archive, { recursive: true });

    const result = await reorderListDirectories(root, [done, todo, doing]);

    assert.deepStrictEqual(result.map((entry) => entry.listDirectoryName), [
      '000-Done-stock',
      '001-To-do-stock',
      '002-Doing-stock',
    ]);
    assert.deepStrictEqual(await listEntries(root), [
      '000-Done-stock',
      '001-To-do-stock',
      '002-Doing-stock',
      'XXX-Archive',
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function run() {
  await testInsertCardFileAtTop();
  await testInsertCardFileAtTopRollback();
  await testReorderCardFilesInList();
  await testReorderCardFilesAcrossLists();
  await testUnchangedCardOrderDoesNotRenameFiles();
  await testReorderListDirectories();
  console.log('Card ordering tests passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
