const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

async function syncDirectory(directoryPath) {
  let directoryHandle = null;

  try {
    directoryHandle = await fs.open(directoryPath, 'r');
    await directoryHandle.sync();
  } catch {
    // Directory fsync is best-effort and is not supported on every platform.
  } finally {
    if (directoryHandle) {
      await directoryHandle.close().catch(() => {});
    }
  }
}

async function atomicWriteFile(filePath, data, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const directoryPath = path.dirname(resolvedPath);
  const baseName = path.basename(resolvedPath);
  const encoding = typeof options === 'string'
    ? options
    : (options && options.encoding) || undefined;
  const tempPath = path.join(
    directoryPath,
    `.${baseName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  );
  let fileHandle = null;
  let shouldCleanupTemp = true;

  await fs.mkdir(directoryPath, { recursive: true });

  try {
    fileHandle = await fs.open(tempPath, 'wx');
    await fileHandle.writeFile(data, encoding ? { encoding } : undefined);
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = null;

    await fs.rename(tempPath, resolvedPath);
    shouldCleanupTemp = false;
    await syncDirectory(directoryPath);
  } finally {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }

    if (shouldCleanupTemp) {
      await fs.unlink(tempPath).catch(() => {});
    }
  }
}

module.exports = {
  atomicWriteFile,
};
