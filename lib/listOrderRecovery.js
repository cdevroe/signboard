const fs = require('fs').promises;
const path = require('path');

const RECOVERY_FILE = '.signboard-list-order.json';
const retryDelays = [50, 150, 300];

async function renameListWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await fs.rename(from, to); }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= retryDelays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }
}

async function assertNoListOrderRecovery(boardRoot) {
  try { await fs.lstat(path.join(boardRoot, RECOVERY_FILE)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`List order recovery is required. Preserve ${RECOVERY_FILE} and the board folders before making further list changes.`);
}

async function prepareListOrderRecovery(boardRoot, entries, stagedEntries) {
  const file = path.join(boardRoot, RECOVERY_FILE);
  // Exclusive creation also prevents two cooperating reorders from staging at once.
  const handle = await fs.open(file, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ version: 1, entries: entries.map((entry) => ({
      original: path.basename(entry.originalSourcePath),
      temporary: stagedEntries.find((staged) => staged.originalPath === entry.originalSourcePath)?.tempEntryName || null,
      final: entry.finalEntryName,
    })) }, null, 2) + '\n');
    await handle.sync();
  } finally { await handle.close(); }
  return {
    rename: renameListWithRetry,
    async restore(from, to) {
      // Never overwrite a folder created by another writer during recovery.
      try { await fs.lstat(to); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return renameListWithRetry(from, to);
      }
      throw new Error(`Cannot restore ${path.basename(from)}: ${path.basename(to)} already exists.`);
    },
    async finish() { await fs.unlink(file); },
    incomplete(error, failures) {
      return new AggregateError([error, ...failures],
        `List order recovery is incomplete. Preserve ${RECOVERY_FILE} and the board folders; original and temporary names are recorded there.`);
    },
  };
}

module.exports = { assertNoListOrderRecovery, prepareListOrderRecovery };
