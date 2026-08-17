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

function applyNumberedPrefix(entryName, prefix) {
  const normalized = String(entryName || '').trim();
  const nextPrefix = toNumberedPrefix(prefix);

  if (/^\d+-/.test(normalized)) {
    return normalized.replace(/^\d+/, nextPrefix);
  }

  return `${nextPrefix}-${normalized.replace(/^-+/, '')}`;
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

async function getDirectoryEntryNames(directoryPath, predicate) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => (typeof predicate === 'function' ? predicate(entry) : true))
    .map((entry) => entry.name)
    .sort((left, right) => cardSortCollator.compare(left, right));
}

async function getExistingOrderedSources(sourcePaths) {
  const sources = [];
  const seen = new Set();

  for (const sourcePath of Array.isArray(sourcePaths) ? sourcePaths : []) {
    const sourcePathText = String(sourcePath || '').trim();
    if (!sourcePathText) {
      continue;
    }

    const normalizedPath = path.resolve(sourcePathText);
    if (seen.has(normalizedPath)) {
      continue;
    }

    if (!(await pathExists(normalizedPath))) {
      continue;
    }

    seen.add(normalizedPath);
    sources.push(normalizedPath);
  }

  return sources;
}

function assertNoDuplicateFinalNames(finalNames) {
  const seen = new Set();
  for (const finalName of finalNames) {
    if (seen.has(finalName)) {
      throw new Error(`ORDER_COLLISION:${finalName}`);
    }
    seen.add(finalName);
  }
}

async function reorderEntriesInDirectory({
  directoryPath,
  orderedSourcePaths,
  currentEntryNames,
  applyPrefix,
}) {
  const resolvedDirectoryPath = path.resolve(directoryPath);
  const currentEntries = Array.isArray(currentEntryNames) ? currentEntryNames : [];
  const currentPaths = currentEntries.map((entryName) => path.join(resolvedDirectoryPath, entryName));
  const currentPathSet = new Set(currentPaths);
  const finalSources = await getExistingOrderedSources(orderedSourcePaths);
  const finalSourceSet = new Set(finalSources);

  for (const currentPath of currentPaths) {
    if (!finalSourceSet.has(currentPath)) {
      finalSources.push(currentPath);
      finalSourceSet.add(currentPath);
    }
  }

  const finalNames = finalSources.map((sourcePath, index) => applyPrefix(path.basename(sourcePath), index));
  assertNoDuplicateFinalNames(finalNames);
  const finalEntries = finalSources.map((sourcePath, index) => ({
    originalSourcePath: sourcePath,
    finalEntryName: finalNames[index],
    finalPath: path.join(resolvedDirectoryPath, finalNames[index]),
    wasExistingEntry: currentPathSet.has(sourcePath),
  }));
  const changedCurrentPathSet = new Set(
    finalEntries
      .filter((entry) => entry.wasExistingEntry && entry.originalSourcePath !== entry.finalPath)
      .map((entry) => entry.originalSourcePath),
  );

  const stagedEntries = [];
  const stagedByPath = new Map();
  const finalizedEntries = [];
  const tempToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    for (let index = 0; index < currentEntries.length; index += 1) {
      const originalEntryName = currentEntries[index];
      const originalPath = path.join(resolvedDirectoryPath, originalEntryName);
      if (!changedCurrentPathSet.has(originalPath)) {
        continue;
      }
      const tempEntryName = `__sbtmp-${tempToken}-${String(index).padStart(3, '0')}.tmp`;
      const tempPath = path.join(resolvedDirectoryPath, tempEntryName);
      await fs.rename(originalPath, tempPath);

      const stagedEntry = {
        originalEntryName,
        originalPath,
        tempEntryName,
        tempPath,
      };
      stagedEntries.push(stagedEntry);
      stagedByPath.set(originalPath, stagedEntry);
    }

    for (let index = 0; index < finalSources.length; index += 1) {
      const sourcePath = finalSources[index];
      const stagedEntry = stagedByPath.get(sourcePath);
      const fromPath = stagedEntry ? stagedEntry.tempPath : sourcePath;
      const finalEntryName = finalNames[index];
      const finalPath = path.join(resolvedDirectoryPath, finalEntryName);
      if (fromPath === finalPath) {
        continue;
      }
      await fs.rename(fromPath, finalPath);
      finalizedEntries.push({
        originalSourcePath: sourcePath,
        finalEntryName,
        finalPath,
        restorePath: stagedEntry ? stagedEntry.tempPath : sourcePath,
        wasExistingEntry: currentPathSet.has(sourcePath),
      });
    }
  } catch (error) {
    for (const finalizedEntry of finalizedEntries.slice().reverse()) {
      await restoreRenameIfPossible(finalizedEntry.finalPath, finalizedEntry.restorePath);
    }

    for (const stagedEntry of stagedEntries.slice().reverse()) {
      await restoreRenameIfPossible(stagedEntry.tempPath, stagedEntry.originalPath);
    }

    throw error;
  }

  return finalEntries;
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

async function reorderCardFilesInList(listPath, orderedCardPaths) {
  const resolvedListPath = path.resolve(listPath);
  const currentCardFiles = await listCardFiles(resolvedListPath);
  const finalizedEntries = await reorderEntriesInDirectory({
    directoryPath: resolvedListPath,
    orderedSourcePaths: orderedCardPaths,
    currentEntryNames: currentCardFiles,
    applyPrefix: applyCardPrefix,
  });

  return finalizedEntries.map((entry) => ({
    sourcePath: entry.originalSourcePath,
    cardFile: entry.finalEntryName,
    cardPath: entry.finalPath,
    wasExistingCard: entry.wasExistingEntry,
  }));
}

async function reorderListDirectories(boardRoot, orderedListPaths) {
  const resolvedBoardRoot = path.resolve(boardRoot);
  const currentListDirectories = await getDirectoryEntryNames(
    resolvedBoardRoot,
    (entry) => entry.isDirectory() && entry.name !== 'XXX-Archive',
  );
  const finalizedEntries = await reorderEntriesInDirectory({
    directoryPath: resolvedBoardRoot,
    orderedSourcePaths: orderedListPaths,
    currentEntryNames: currentListDirectories,
    applyPrefix: applyNumberedPrefix,
  });

  return finalizedEntries.map((entry) => ({
    sourcePath: entry.originalSourcePath,
    listDirectoryName: entry.finalEntryName,
    listPath: entry.finalPath,
    wasExistingList: entry.wasExistingEntry,
  }));
}

module.exports = {
  insertCardFileAtTop,
  reorderCardFilesInList,
  reorderListDirectories,
};
