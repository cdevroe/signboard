const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { insertCardFileAtTop } = require('../lib/cardOrdering');

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

async function run() {
  await testInsertCardFileAtTop();
  await testInsertCardFileAtTopRollback();
  console.log('Card ordering tests passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
