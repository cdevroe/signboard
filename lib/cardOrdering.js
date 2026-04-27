const fs = require('fs').promises;
const path = require('path');

const cardSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function toNumberedPrefix(value) {
  return String(value).padStart(3, '0');
}

function applyCardPrefix(fileName, prefix) {
  const normalized = String(fileName || '').trim();
  const nextPrefix = toNumberedPrefix(prefix);

  if (/^\d+-/.test(normalized)) {
    return normalized.replace(/^\d+/, nextPrefix);
  }

  if (normalized.endsWith('.md')) {
    const baseName = normalized.slice(0, -3).replace(/^-+/, '');
    return `${nextPrefix}-${baseName}.md`;
  }

  return `${nextPrefix}-${normalized}`;
}

async function listCardFiles(listPath) {
  const entries = await fs.readdir(listPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((left, right) => cardSortCollator.compare(left, right));
}

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

async function restoreRenameIfPossible(fromPath, toPath) {
  try {
    if ((await pathExists(fromPath)) && !(await pathExists(toPath))) {
      await fs.rename(fromPath, toPath);
    }
  } catch {
    // Best-effort rollback only; keep the original failure as the actionable error.
  }
}

async function insertCardFileAtTop(listPath, sourcePath, sourceFileName) {
  const resolvedListPath = path.resolve(listPath);
  const resolvedSourcePath = path.resolve(sourcePath);
  const existingCardFiles = (await listCardFiles(resolvedListPath))
    .filter((fileName) => path.resolve(path.join(resolvedListPath, fileName)) !== resolvedSourcePath);
  const stagedCards = [];
  const tempToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const insertedFileName = applyCardPrefix(sourceFileName, 0);
  const insertedPath = path.join(resolvedListPath, insertedFileName);
  const finalizedCards = [];

  try {
    for (let index = 0; index < existingCardFiles.length; index += 1) {
      const originalFileName = existingCardFiles[index];
      const tempFileName = `__sbtmp-${tempToken}-${String(index).padStart(3, '0')}.tmp`;
      await fs.rename(
        path.join(resolvedListPath, originalFileName),
        path.join(resolvedListPath, tempFileName),
      );
      stagedCards.push({ originalFileName, tempFileName });
    }

    await fs.rename(resolvedSourcePath, insertedPath);

    for (let index = 0; index < stagedCards.length; index += 1) {
      const stagedCard = stagedCards[index];
      const finalFileName = applyCardPrefix(stagedCard.originalFileName, index + 1);
      await fs.rename(
        path.join(resolvedListPath, stagedCard.tempFileName),
        path.join(resolvedListPath, finalFileName),
      );
      finalizedCards.push({ originalFileName: stagedCard.originalFileName, finalFileName });
    }
  } catch (error) {
    await restoreRenameIfPossible(insertedPath, resolvedSourcePath);

    for (const finalizedCard of finalizedCards.slice().reverse()) {
      await restoreRenameIfPossible(
        path.join(resolvedListPath, finalizedCard.finalFileName),
        path.join(resolvedListPath, finalizedCard.originalFileName),
      );
    }

    for (const stagedCard of stagedCards.slice().reverse()) {
      await restoreRenameIfPossible(
        path.join(resolvedListPath, stagedCard.tempFileName),
        path.join(resolvedListPath, stagedCard.originalFileName),
      );
    }

    throw error;
  }

  return insertedFileName;
}

module.exports = {
  insertCardFileAtTop,
};
