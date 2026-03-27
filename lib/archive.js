const fs = require('fs').promises;
const path = require('path');

const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const CARD_PREFIX_PATTERN = /^(\d{3})(.*)$/;

function normalizeAbsolutePath(rawPath) {
  const value = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!value) {
    throw new Error('Path is required.');
  }

  return path.resolve(value);
}

async function ensureDirectory(directoryPath, label) {
  let stats;

  try {
    stats = await fs.stat(directoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${directoryPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directoryPath}`);
  }
}

async function ensureFile(filePath, label) {
  let stats;

  try {
    stats = await fs.stat(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${filePath}`);
    }
    throw error;
  }

  if (!stats.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
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

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function randomSuffix(length = 5) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return output;
}

async function nextArchiveCardPrefix(archiveRoot) {
  const entries = await fs.readdir(archiveRoot, { withFileTypes: true });
  let maxPrefix = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const match = entry.name.match(/^(\d{3})-/);
    if (!match) {
      continue;
    }

    const prefix = Number(match[1]);
    if (Number.isFinite(prefix) && prefix > maxPrefix) {
      maxPrefix = prefix;
    }
  }

  return String(maxPrefix + 1).padStart(3, '0');
}

function getArchiveRoot(boardRoot) {
  return path.join(boardRoot, ARCHIVE_DIRECTORY_NAME);
}

async function ensureArchiveRoot(boardRoot) {
  const archiveRoot = getArchiveRoot(boardRoot);

  if (!(await pathExists(archiveRoot))) {
    await fs.mkdir(archiveRoot, { recursive: true });
    return archiveRoot;
  }

  await ensureDirectory(archiveRoot, 'Archive directory');
  return archiveRoot;
}

function isAlreadyArchived(boardRoot, sourcePath) {
  const archiveRoot = getArchiveRoot(boardRoot);
  return isPathInside(archiveRoot, sourcePath);
}

function buildArchivedCardFileName(cardFile, nextPrefix) {
  const match = String(cardFile || '').match(CARD_PREFIX_PATTERN);
  if (!match) {
    return `${nextPrefix}-${cardFile}`;
  }

  return `${nextPrefix}${match[2]}`;
}

async function archiveCard(boardRoot, cardPath) {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  const normalizedCardPath = normalizeAbsolutePath(cardPath);

  await ensureDirectory(normalizedBoardRoot, 'Board root');

  if (!isPathInside(normalizedBoardRoot, normalizedCardPath)) {
    throw new Error('Card path resolved outside board root.');
  }

  if (normalizedCardPath === normalizedBoardRoot) {
    throw new Error('Board root cannot be archived as a card.');
  }

  if (isAlreadyArchived(normalizedBoardRoot, normalizedCardPath)) {
    return {
      ok: true,
      boardRoot: normalizedBoardRoot,
      archiveRoot: getArchiveRoot(normalizedBoardRoot),
      cardFile: path.basename(normalizedCardPath),
      archivedCardFile: path.basename(normalizedCardPath),
      archivedCardPath: normalizedCardPath,
      alreadyArchived: true,
    };
  }

  await ensureFile(normalizedCardPath, 'Card');

  const archiveRoot = await ensureArchiveRoot(normalizedBoardRoot);
  let archivedCardFile = path.basename(normalizedCardPath);
  let archivedCardPath = path.join(archiveRoot, archivedCardFile);

  while (await pathExists(archivedCardPath)) {
    const nextPrefix = await nextArchiveCardPrefix(archiveRoot);
    archivedCardFile = buildArchivedCardFileName(archivedCardFile, nextPrefix);
    archivedCardPath = path.join(archiveRoot, archivedCardFile);
  }

  await fs.rename(normalizedCardPath, archivedCardPath);

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archiveRoot,
    cardFile: path.basename(normalizedCardPath),
    archivedCardFile,
    archivedCardPath,
    alreadyArchived: false,
  };
}

async function archiveList(boardRoot, listPath) {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  const normalizedListPath = normalizeAbsolutePath(listPath);

  await ensureDirectory(normalizedBoardRoot, 'Board root');

  if (!isPathInside(normalizedBoardRoot, normalizedListPath)) {
    throw new Error('List path resolved outside board root.');
  }

  if (normalizedListPath === normalizedBoardRoot) {
    throw new Error('Board root cannot be archived as a list.');
  }

  if (isAlreadyArchived(normalizedBoardRoot, normalizedListPath)) {
    return {
      ok: true,
      boardRoot: normalizedBoardRoot,
      archiveRoot: getArchiveRoot(normalizedBoardRoot),
      listDirectoryName: path.basename(normalizedListPath),
      archivedDirectoryName: path.basename(normalizedListPath),
      archivedListPath: normalizedListPath,
      alreadyArchived: true,
    };
  }

  await ensureDirectory(normalizedListPath, 'List');

  const archiveRoot = await ensureArchiveRoot(normalizedBoardRoot);
  const originalDirectoryName = path.basename(normalizedListPath);
  let archivedDirectoryName = originalDirectoryName;
  let archivedListPath = path.join(archiveRoot, archivedDirectoryName);

  while (await pathExists(archivedListPath)) {
    archivedDirectoryName = `${originalDirectoryName}-${randomSuffix()}`;
    archivedListPath = path.join(archiveRoot, archivedDirectoryName);
  }

  await fs.rename(normalizedListPath, archivedListPath);

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archiveRoot,
    listDirectoryName: originalDirectoryName,
    archivedDirectoryName,
    archivedListPath,
    alreadyArchived: false,
  };
}

module.exports = {
  ARCHIVE_DIRECTORY_NAME,
  archiveCard,
  archiveList,
};
