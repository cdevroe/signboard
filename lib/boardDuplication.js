const fs = require('fs').promises;
const path = require('path');
const { randomBytes } = require('crypto');
const cardFrontmatter = require('./cardFrontmatter');
const boardLabels = require('./boardLabels');
const obsidianIntegration = require('./obsidianIntegration');

const CARD_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CARD_FILE_NAME_PATTERN = /^(.*-)([A-Za-z0-9]{5})(\.md)$/;
const SIGNBOARD_CARD_URI_PATTERN = /signboard:\/\/open-card\?([^\s"'<>)]*)/g;
const BOARD_SETTINGS_FILE_NAME = 'board-settings.md';
const MANAGED_OBSIDIAN_BASE_FILE_NAME = 'Signboard Board.base';

function trimString(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeAbsolutePath(value) {
  const normalized = trimString(value);
  return normalized ? path.resolve(normalized) : '';
}

function isPathInsideRoot(rootPath, targetPath) {
  const root = normalizeAbsolutePath(rootPath);
  const target = normalizeAbsolutePath(targetPath);
  if (!root || !target) {
    return false;
  }

  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sanitizeBoardDirectoryName(rawName) {
  return trimString(rawName)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '');
}

function randomCardId(length = 5) {
  const bytes = randomBytes(length);
  let id = '';
  for (const byte of bytes) {
    id += CARD_ID_ALPHABET[byte % CARD_ID_ALPHABET.length];
  }
  return id;
}

function getCardIdFromFileName(fileName) {
  const match = trimString(fileName).match(CARD_FILE_NAME_PATTERN);
  return match ? match[2] : '';
}

function isCardMarkdownPath(boardRoot, filePath) {
  const normalizedPath = normalizeAbsolutePath(filePath);
  if (!normalizedPath || path.extname(normalizedPath).toLowerCase() !== '.md') {
    return false;
  }

  const fileName = path.basename(normalizedPath);
  if (fileName === BOARD_SETTINGS_FILE_NAME || !CARD_FILE_NAME_PATTERN.test(fileName)) {
    return false;
  }

  const parentDirectory = path.dirname(normalizedPath);
  return parentDirectory !== normalizeAbsolutePath(boardRoot) && isPathInsideRoot(boardRoot, normalizedPath);
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function walkCardFiles(boardRoot, directoryPath = boardRoot, cardFiles = []) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await walkCardFiles(boardRoot, entryPath, cardFiles);
      continue;
    }

    if (entry.isFile() && isCardMarkdownPath(boardRoot, entryPath)) {
      cardFiles.push(entryPath);
    }
  }

  return cardFiles;
}

function getUniqueCardId(usedIds) {
  let cardId = randomCardId();
  while (usedIds.has(cardId)) {
    cardId = randomCardId();
  }
  usedIds.add(cardId);
  return cardId;
}

async function renameCopiedCardsWithFreshIds(boardRoot) {
  const cardFiles = await walkCardFiles(boardRoot);
  const usedIds = new Set(cardFiles.map((filePath) => getCardIdFromFileName(path.basename(filePath))).filter(Boolean));
  const cards = [];

  for (const cardPath of cardFiles) {
    const fileName = path.basename(cardPath);
    const match = fileName.match(CARD_FILE_NAME_PATTERN);
    if (!match) {
      continue;
    }

    const oldId = match[2];
    let newId = getUniqueCardId(usedIds);
    let newFileName = `${match[1]}${newId}${match[3]}`;
    let newPath = path.join(path.dirname(cardPath), newFileName);

    while (await pathExists(newPath)) {
      usedIds.delete(newId);
      newId = getUniqueCardId(usedIds);
      newFileName = `${match[1]}${newId}${match[3]}`;
      newPath = path.join(path.dirname(cardPath), newFileName);
    }

    await fs.rename(cardPath, newPath);
    cards.push({
      oldId,
      newId,
      oldPath: cardPath,
      newPath,
    });
  }

  return cards;
}

function rewriteSignboardCardUris(value, idMap) {
  const source = trimString(value);
  if (!source || !(idMap instanceof Map) || idMap.size === 0) {
    return value;
  }

  return source.replace(SIGNBOARD_CARD_URI_PATTERN, (match, queryString) => {
    const params = new URLSearchParams(queryString);
    const currentId = params.get('id') || '';
    const nextId = idMap.get(currentId);
    if (!nextId) {
      return match;
    }

    params.set('id', nextId);
    return `signboard://open-card?${params.toString()}`;
  });
}

function rewritePathInsideCopiedBoard(value, sourceBoardRoot, destinationBoardRoot) {
  const candidatePath = normalizeAbsolutePath(value);
  if (!candidatePath || !isPathInsideRoot(sourceBoardRoot, candidatePath)) {
    return value;
  }

  return path.join(
    normalizeAbsolutePath(destinationBoardRoot),
    path.relative(normalizeAbsolutePath(sourceBoardRoot), candidatePath),
  );
}

function rewriteLinkedObjects(linkedObjects, context) {
  if (!Array.isArray(linkedObjects)) {
    return linkedObjects;
  }

  return linkedObjects.map((linkedObject) => {
    if (!linkedObject || typeof linkedObject !== 'object' || Array.isArray(linkedObject)) {
      return linkedObject;
    }

    const nextObject = { ...linkedObject };
    if (nextObject.type === 'file' || nextObject.type === 'folder') {
      nextObject.path = rewritePathInsideCopiedBoard(nextObject.path, context.sourceBoardRoot, context.destinationBoardRoot);
    }

    for (const key of ['url', 'target', 'raw']) {
      if (typeof nextObject[key] === 'string') {
        nextObject[key] = rewriteSignboardCardUris(nextObject[key], context.idMap);
      }
    }

    return nextObject;
  });
}

async function refreshCopiedCardMetadata(boardRoot, cards, context) {
  for (const card of cards) {
    const currentCard = await cardFrontmatter.readCard(card.newPath);
    const rewrittenLinkedObjects = rewriteLinkedObjects(currentCard.frontmatter.linked_objects, context);
    const rewrittenBody = rewriteSignboardCardUris(currentCard.body, context.idMap);
    const frontmatter = {
      ...currentCard.frontmatter,
      linked_objects: rewrittenLinkedObjects,
    };

    delete frontmatter.signboard_id;
    delete frontmatter.signboard_uri;

    const nextFrontmatter = obsidianIntegration.normalizeSignboardCardFrontmatter({
      boardRoot,
      cardPath: card.newPath,
      frontmatter,
    });

    await cardFrontmatter.writeCard(card.newPath, {
      frontmatter: nextFrontmatter,
      body: rewrittenBody,
    });
  }
}

async function resetCopiedManagedObsidianBase(boardRoot) {
  const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });
  if (!settings || !settings.obsidianBase || !settings.obsidianBase.managedHash) {
    return false;
  }

  await boardLabels.updateBoardSettings(boardRoot, { obsidianBase: {} });
  await fs.rm(path.join(boardRoot, MANAGED_OBSIDIAN_BASE_FILE_NAME), { force: true });
  return true;
}

async function duplicateBoard(options = {}) {
  const sourceBoardRoot = normalizeAbsolutePath(options.sourceBoardRoot);
  const destinationParentPath = normalizeAbsolutePath(options.destinationParentPath);
  const boardName = sanitizeBoardDirectoryName(options.boardName);

  if (!sourceBoardRoot) {
    throw new Error('INVALID_SOURCE_BOARD_ROOT');
  }
  if (!destinationParentPath) {
    throw new Error('INVALID_DESTINATION_PARENT');
  }
  if (!boardName) {
    throw new Error('INVALID_BOARD_NAME');
  }

  const sourceStats = await fs.stat(sourceBoardRoot);
  if (!sourceStats.isDirectory()) {
    throw new Error('SOURCE_BOARD_NOT_DIRECTORY');
  }

  const parentStats = await fs.stat(destinationParentPath);
  if (!parentStats.isDirectory()) {
    throw new Error('DESTINATION_PARENT_NOT_DIRECTORY');
  }

  const destinationBoardRoot = path.join(destinationParentPath, boardName);
  if (normalizeAbsolutePath(destinationBoardRoot) === sourceBoardRoot) {
    throw new Error('DESTINATION_MATCHES_SOURCE');
  }
  if (isPathInsideRoot(sourceBoardRoot, destinationBoardRoot)) {
    throw new Error('DESTINATION_INSIDE_SOURCE');
  }
  if (await pathExists(destinationBoardRoot)) {
    throw new Error('DESTINATION_ALREADY_EXISTS');
  }

  await fs.cp(sourceBoardRoot, destinationBoardRoot, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });

  const cards = await renameCopiedCardsWithFreshIds(destinationBoardRoot);
  const idMap = new Map(cards.map((card) => [card.oldId, card.newId]).filter(([oldId, newId]) => oldId && newId));
  await refreshCopiedCardMetadata(destinationBoardRoot, cards, {
    sourceBoardRoot,
    destinationBoardRoot,
    idMap,
  });
  const resetManagedObsidianBase = await resetCopiedManagedObsidianBase(destinationBoardRoot);

  return {
    ok: true,
    boardRoot: destinationBoardRoot,
    boardName,
    cardsDuplicated: cards.length,
    cardIdMap: Object.fromEntries(idMap.entries()),
    resetManagedObsidianBase,
  };
}

module.exports = {
  duplicateBoard,
  rewriteSignboardCardUris,
  sanitizeBoardDirectoryName,
};
