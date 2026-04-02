const fs = require('fs').promises;
const path = require('path');
const boardLabels = require('./boardLabels');
const cardFrontmatter = require('./cardFrontmatter');
const { insertCardFileAtTop } = require('./cardOrdering');
const {
  clearCardArchiveState,
  formatActivityTimestamp,
  getListDisplayName,
  normalizeCardActivityEntries,
  recordCardListMove: applyCardListMove,
  setCardArchiveState,
} = require('./cardLifecycle');

const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const ARCHIVED_LIST_METADATA_FILE = '.signboard-archive.json';
const CARD_PREFIX_PATTERN = /^(\d{3})(.*)$/;

const archiveNameCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function trimStringValue(value) {
  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareArchiveNames(left, right) {
  return archiveNameCollator.compare(String(left || ''), String(right || ''));
}

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

function getArchivedListMetadataPath(listPath) {
  return path.join(listPath, ARCHIVED_LIST_METADATA_FILE);
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

function getCardIdFromFileName(fileName) {
  const normalized = String(fileName || '');
  if (!normalized.endsWith('.md') || normalized.length < 8) {
    return '';
  }

  return normalized.slice(normalized.length - 8, normalized.length - 3);
}

function getFallbackTimestampFromStats(stats) {
  if (!stats) {
    return '';
  }

  const birthtimeMs = Number(stats.birthtimeMs) || 0;
  if (birthtimeMs > 0) {
    return new Date(birthtimeMs).toISOString();
  }

  const mtimeMs = Number(stats.mtimeMs) || 0;
  if (mtimeMs > 0) {
    return new Date(mtimeMs).toISOString();
  }

  return '';
}

function buildPreviewText(bodyValue) {
  const body = typeof bodyValue === 'string' ? bodyValue : '';
  if (!body) {
    return '';
  }

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (lines.length === 0) {
    return '';
  }

  const preview = lines.join(' ');
  if (preview.length <= 240) {
    return preview;
  }

  return `${preview.slice(0, 237)}...`;
}

function normalizeArchivedListActivityEntries(entries) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .filter((entry) => isObject(entry))
    .map((entry) => {
      const type = trimStringValue(entry.type);
      if (!type) {
        return null;
      }

      const normalized = {
        type,
      };

      const at = trimStringValue(entry.at);
      if (at) {
        normalized.at = at;
      }

      const originalListDirectoryName = trimStringValue(entry.originalListDirectoryName);
      if (originalListDirectoryName) {
        normalized.originalListDirectoryName = originalListDirectoryName;
      }

      const originalListDisplayName = trimStringValue(entry.originalListDisplayName);
      if (originalListDisplayName) {
        normalized.originalListDisplayName = originalListDisplayName;
      }

      const toListDirectoryName = trimStringValue(entry.toListDirectoryName);
      if (toListDirectoryName) {
        normalized.toListDirectoryName = toListDirectoryName;
      }

      const toListDisplayName = trimStringValue(entry.toListDisplayName);
      if (toListDisplayName) {
        normalized.toListDisplayName = toListDisplayName;
      }

      return normalized;
    })
    .filter(Boolean);
}

function appendArchivedListActivity(metadata = {}, type, details = {}, options = {}) {
  const normalizedType = trimStringValue(type);
  if (!normalizedType) {
    return isObject(metadata) ? { ...metadata } : {};
  }

  const nextMetadata = isObject(metadata) ? { ...metadata } : {};
  const activityEntries = normalizeArchivedListActivityEntries(nextMetadata.activity);
  const nextEntry = {
    type: normalizedType,
    at: trimStringValue(options.at) || formatActivityTimestamp(),
  };

  const detailSource = isObject(details) ? details : {};
  for (const key of ['originalListDirectoryName', 'originalListDisplayName', 'toListDirectoryName', 'toListDisplayName']) {
    const trimmed = trimStringValue(detailSource[key]);
    if (trimmed) {
      nextEntry[key] = trimmed;
    }
  }

  activityEntries.push(nextEntry);
  nextMetadata.activity = activityEntries;
  return nextMetadata;
}

async function readArchivedListMetadata(listPath, options = {}) {
  const metadataPath = getArchivedListMetadataPath(listPath);
  let parsed = {};

  if (await pathExists(metadataPath)) {
    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      const candidate = JSON.parse(raw);
      if (isObject(candidate)) {
        parsed = candidate;
      }
    } catch {
      parsed = {};
    }
  }

  const stats = options.stats || await fs.stat(listPath);
  const directoryName = path.basename(listPath);
  const originalListDirectoryName = trimStringValue(parsed.originalListDirectoryName) || directoryName;
  const originalListDisplayName = trimStringValue(parsed.originalListDisplayName)
    || getListDisplayName(originalListDirectoryName)
    || 'Unknown original list';
  const archivedAt = trimStringValue(parsed.archivedAt) || getFallbackTimestampFromStats(stats);

  return {
    originalListDirectoryName,
    originalListDisplayName,
    archivedAt,
    activity: normalizeArchivedListActivityEntries(parsed.activity),
  };
}

async function writeArchivedListMetadata(listPath, metadata = {}) {
  const payload = {
    originalListDirectoryName: trimStringValue(metadata.originalListDirectoryName) || path.basename(listPath),
    originalListDisplayName: trimStringValue(metadata.originalListDisplayName)
      || getListDisplayName(trimStringValue(metadata.originalListDirectoryName) || path.basename(listPath))
      || 'Unknown original list',
    archivedAt: trimStringValue(metadata.archivedAt),
    activity: normalizeArchivedListActivityEntries(metadata.activity),
  };

  await fs.writeFile(
    getArchivedListMetadataPath(listPath),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );

  return payload;
}

async function listMarkdownCardFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort(compareArchiveNames);
}

async function mutateCard(cardPath, transform) {
  const currentCard = await cardFrontmatter.readCard(cardPath);
  const nextFrontmatter = typeof transform === 'function'
    ? transform(currentCard.frontmatter, currentCard)
    : currentCard.frontmatter;

  await cardFrontmatter.writeCard(cardPath, {
    frontmatter: nextFrontmatter,
    body: currentCard.body,
  });

  return {
    frontmatter: nextFrontmatter,
    body: currentCard.body,
  };
}

async function buildBoardLabelNameMap(boardRoot) {
  const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });
  const labels = Array.isArray(settings.labels) ? settings.labels : [];
  const map = new Map();

  for (const label of labels) {
    const id = trimStringValue(label && label.id);
    const name = trimStringValue(label && label.name);
    if (!id || !name) {
      continue;
    }

    map.set(id, name);
  }

  return map;
}

function normalizeArchivedCardState(frontmatter = {}, fallback = {}) {
  const archive = isObject(frontmatter.archive) ? frontmatter.archive : {};
  const originalListDirectoryName = trimStringValue(archive.originalListDirectoryName)
    || trimStringValue(fallback.originalListDirectoryName);
  const originalListDisplayName = trimStringValue(archive.originalListDisplayName)
    || trimStringValue(fallback.originalListDisplayName)
    || getListDisplayName(originalListDirectoryName)
    || 'Unknown original list';
  const archivedAt = trimStringValue(archive.archivedAt)
    || trimStringValue(fallback.archivedAt)
    || trimStringValue(fallback.fallbackArchivedAt);
  const archiveContainerType = trimStringValue(archive.archiveContainerType)
    || trimStringValue(fallback.archiveContainerType)
    || 'standalone-card';

  return {
    originalListDirectoryName,
    originalListDisplayName,
    archivedAt,
    archiveContainerType,
  };
}

async function buildArchivedCardEntry(boardRoot, cardPath, labelNameMap, options = {}) {
  const [card, stats] = await Promise.all([
    cardFrontmatter.readCard(cardPath),
    fs.stat(cardPath),
  ]);
  const fileName = path.basename(cardPath);
  const archivedListPath = trimStringValue(options.archivedListPath);
  const archivedListDirectoryName = archivedListPath ? path.basename(archivedListPath) : '';
  const state = normalizeArchivedCardState(card.frontmatter, {
    originalListDirectoryName: options.originalListDirectoryName,
    originalListDisplayName: options.originalListDisplayName,
    archivedAt: options.archivedAt,
    archiveContainerType: options.archiveContainerType,
    fallbackArchivedAt: getFallbackTimestampFromStats(stats),
  });

  const labelIds = Array.isArray(card.frontmatter.labels)
    ? card.frontmatter.labels.map((labelId) => String(labelId)).filter(Boolean)
    : [];
  const labelNames = labelIds
    .map((labelId) => labelNameMap.get(labelId) || labelId)
    .filter(Boolean);

  return {
    kind: 'card',
    entryPath: cardPath,
    archivedCardPath: cardPath,
    archivedCardFile: fileName,
    title: trimStringValue(card.frontmatter.title) || 'Untitled',
    cardId: getCardIdFromFileName(fileName),
    originalListDirectoryName: state.originalListDirectoryName,
    originalListDisplayName: state.originalListDisplayName,
    archivedAt: state.archivedAt,
    archiveContainerType: state.archiveContainerType,
    archivedListPath,
    archivedListDirectoryName,
    insideArchivedList: Boolean(archivedListPath),
    labels: labelIds,
    labelNames,
    due: trimStringValue(card.frontmatter.due),
    previewText: buildPreviewText(card.body),
  };
}

function toPublicArchivedListEntry(listPath, metadata, cardCount) {
  const listDirectoryName = path.basename(listPath);
  return {
    kind: 'list',
    entryPath: listPath,
    archivedListPath: listPath,
    listDirectoryName,
    listDisplayName: getListDisplayName(listDirectoryName) || listDirectoryName,
    originalListDirectoryName: trimStringValue(metadata.originalListDirectoryName) || listDirectoryName,
    originalListDisplayName: trimStringValue(metadata.originalListDisplayName)
      || getListDisplayName(trimStringValue(metadata.originalListDirectoryName) || listDirectoryName)
      || 'Unknown original list',
    archivedAt: trimStringValue(metadata.archivedAt),
    cardCount: Number(cardCount) || 0,
  };
}

function compareArchivedEntriesByNewest(left, right) {
  const leftAt = Date.parse(trimStringValue(left && left.archivedAt));
  const rightAt = Date.parse(trimStringValue(right && right.archivedAt));
  const normalizedLeftAt = Number.isFinite(leftAt) ? leftAt : 0;
  const normalizedRightAt = Number.isFinite(rightAt) ? rightAt : 0;
  if (normalizedLeftAt !== normalizedRightAt) {
    return normalizedRightAt - normalizedLeftAt;
  }

  return compareArchiveNames(left && (left.title || left.listDisplayName || left.entryPath), right && (right.title || right.listDisplayName || right.entryPath));
}

async function listArchiveEntries(boardRoot) {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  await ensureDirectory(normalizedBoardRoot, 'Board root');

  const archiveRoot = getArchiveRoot(normalizedBoardRoot);
  if (!(await pathExists(archiveRoot))) {
    return {
      ok: true,
      boardRoot: normalizedBoardRoot,
      archiveRoot,
      cards: [],
      lists: [],
    };
  }

  await ensureDirectory(archiveRoot, 'Archive directory');
  const labelNameMap = await buildBoardLabelNameMap(normalizedBoardRoot);
  const entries = await fs.readdir(archiveRoot, { withFileTypes: true });
  const cards = [];
  const lists = [];

  const sortedEntries = entries.slice().sort((left, right) => compareArchiveNames(left.name, right.name));
  for (const entry of sortedEntries) {
    const entryPath = path.join(archiveRoot, entry.name);

    if (entry.isFile() && entry.name.endsWith('.md')) {
      cards.push(await buildArchivedCardEntry(normalizedBoardRoot, entryPath, labelNameMap, {
        archiveContainerType: 'standalone-card',
      }));
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const metadata = await readArchivedListMetadata(entryPath);
    const cardFiles = await listMarkdownCardFiles(entryPath);
    lists.push(toPublicArchivedListEntry(entryPath, metadata, cardFiles.length));

    for (const cardFile of cardFiles) {
      cards.push(await buildArchivedCardEntry(normalizedBoardRoot, path.join(entryPath, cardFile), labelNameMap, {
        archivedListPath: entryPath,
        archiveContainerType: 'archived-list',
        originalListDirectoryName: metadata.originalListDirectoryName,
        originalListDisplayName: metadata.originalListDisplayName,
        archivedAt: metadata.archivedAt,
      }));
    }
  }

  cards.sort(compareArchivedEntriesByNewest);
  lists.sort(compareArchivedEntriesByNewest);

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archiveRoot,
    cards,
    lists,
  };
}

async function readArchiveEntry(boardRoot, entryPath) {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  const normalizedEntryPath = normalizeAbsolutePath(entryPath);
  await ensureDirectory(normalizedBoardRoot, 'Board root');

  const archiveRoot = getArchiveRoot(normalizedBoardRoot);
  if (!isPathInside(archiveRoot, normalizedEntryPath)) {
    throw new Error('Archive entry resolved outside archive root.');
  }

  const stats = await fs.stat(normalizedEntryPath);

  if (stats.isFile()) {
    await ensureFile(normalizedEntryPath, 'Archived card');
    const labelNameMap = await buildBoardLabelNameMap(normalizedBoardRoot);
    const archivedListPath = path.dirname(normalizedEntryPath) === archiveRoot
      ? ''
      : path.dirname(normalizedEntryPath);
    let listMetadata = null;
    if (archivedListPath) {
      listMetadata = await readArchivedListMetadata(archivedListPath);
    }

    const entry = await buildArchivedCardEntry(normalizedBoardRoot, normalizedEntryPath, labelNameMap, {
      archivedListPath,
      archiveContainerType: archivedListPath ? 'archived-list' : 'standalone-card',
      originalListDirectoryName: listMetadata && listMetadata.originalListDirectoryName,
      originalListDisplayName: listMetadata && listMetadata.originalListDisplayName,
      archivedAt: listMetadata && listMetadata.archivedAt,
    });
    const card = await cardFrontmatter.readCard(normalizedEntryPath);

    return {
      ok: true,
      kind: 'card',
      entry: {
        ...entry,
        card: {
          frontmatter: card.frontmatter,
          body: card.body,
        },
        activity: normalizeCardActivityEntries(card.frontmatter.activity),
      },
    };
  }

  await ensureDirectory(normalizedEntryPath, 'Archived list');
  const metadata = await readArchivedListMetadata(normalizedEntryPath, { stats });
  const cardFiles = await listMarkdownCardFiles(normalizedEntryPath);
  const labelNameMap = await buildBoardLabelNameMap(normalizedBoardRoot);
  const cards = await Promise.all(
    cardFiles.map((cardFile) => buildArchivedCardEntry(
      normalizedBoardRoot,
      path.join(normalizedEntryPath, cardFile),
      labelNameMap,
      {
        archivedListPath: normalizedEntryPath,
        archiveContainerType: 'archived-list',
        originalListDirectoryName: metadata.originalListDirectoryName,
        originalListDisplayName: metadata.originalListDisplayName,
        archivedAt: metadata.archivedAt,
      },
    )),
  );

  return {
    ok: true,
    kind: 'list',
    entry: {
      ...toPublicArchivedListEntry(normalizedEntryPath, metadata, cardFiles.length),
      activity: normalizeArchivedListActivityEntries(metadata.activity),
      cards,
    },
  };
}

function getListContextFromPath(listPath) {
  const directoryName = path.basename(listPath);
  return {
    directoryName,
    displayName: getListDisplayName(directoryName) || directoryName,
  };
}

async function maybeRemoveEmptyArchivedListContainer(archivedListPath) {
  const normalizedListPath = trimStringValue(archivedListPath);
  if (!normalizedListPath || !(await pathExists(normalizedListPath))) {
    return false;
  }

  const remainingCardFiles = await listMarkdownCardFiles(normalizedListPath);
  if (remainingCardFiles.length > 0) {
    return false;
  }

  const metadataPath = getArchivedListMetadataPath(normalizedListPath);
  if (await pathExists(metadataPath)) {
    await fs.rm(metadataPath, { force: true });
  }

  await fs.rmdir(normalizedListPath);
  return true;
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
  const sourceListPath = path.dirname(normalizedCardPath);
  const sourceList = getListContextFromPath(sourceListPath);
  const archivedAt = formatActivityTimestamp();

  let archivedCardFile = path.basename(normalizedCardPath);
  let archivedCardPath = path.join(archiveRoot, archivedCardFile);

  while (await pathExists(archivedCardPath)) {
    const nextPrefix = await nextArchiveCardPrefix(archiveRoot);
    archivedCardFile = buildArchivedCardFileName(archivedCardFile, nextPrefix);
    archivedCardPath = path.join(archiveRoot, archivedCardFile);
  }

  await fs.rename(normalizedCardPath, archivedCardPath);
  await mutateCard(archivedCardPath, (frontmatter) => setCardArchiveState(frontmatter, {
    archivedAt,
    originalListDirectoryName: sourceList.directoryName,
    originalListDisplayName: sourceList.displayName,
    archiveContainerType: 'standalone-card',
  }));

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archiveRoot,
    cardFile: path.basename(normalizedCardPath),
    archivedCardFile,
    archivedCardPath,
    alreadyArchived: false,
    originalListDirectoryName: sourceList.directoryName,
    originalListDisplayName: sourceList.displayName,
    archivedAt,
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

  const sourceList = getListContextFromPath(normalizedListPath);
  const archivedAt = formatActivityTimestamp();
  const archiveRoot = await ensureArchiveRoot(normalizedBoardRoot);
  const originalDirectoryName = path.basename(normalizedListPath);
  let archivedDirectoryName = originalDirectoryName;
  let archivedListPath = path.join(archiveRoot, archivedDirectoryName);

  while (await pathExists(archivedListPath)) {
    archivedDirectoryName = `${originalDirectoryName}-${randomSuffix()}`;
    archivedListPath = path.join(archiveRoot, archivedDirectoryName);
  }

  await fs.rename(normalizedListPath, archivedListPath);

  const existingMetadata = await readArchivedListMetadata(archivedListPath).catch(() => ({
    originalListDirectoryName: sourceList.directoryName,
    originalListDisplayName: sourceList.displayName,
    archivedAt: '',
    activity: [],
  }));
  const nextMetadata = appendArchivedListActivity({
    ...existingMetadata,
    originalListDirectoryName: sourceList.directoryName,
    originalListDisplayName: sourceList.displayName,
    archivedAt,
  }, 'archived', {
    originalListDirectoryName: sourceList.directoryName,
    originalListDisplayName: sourceList.displayName,
  }, {
    at: archivedAt,
  });
  await writeArchivedListMetadata(archivedListPath, nextMetadata);

  const cardFiles = await listMarkdownCardFiles(archivedListPath);
  for (const cardFile of cardFiles) {
    await mutateCard(path.join(archivedListPath, cardFile), (frontmatter) => setCardArchiveState(frontmatter, {
      archivedAt,
      originalListDirectoryName: sourceList.directoryName,
      originalListDisplayName: sourceList.displayName,
      archiveContainerType: 'archived-list',
    }));
  }

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archiveRoot,
    listDirectoryName: originalDirectoryName,
    archivedDirectoryName,
    archivedListPath,
    alreadyArchived: false,
    originalListDisplayName: sourceList.displayName,
    archivedAt,
  };
}

async function restoreArchivedCard(boardRoot, archivedCardPath, targetListPath) {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  const normalizedArchivedCardPath = normalizeAbsolutePath(archivedCardPath);
  const normalizedTargetListPath = normalizeAbsolutePath(targetListPath);

  await ensureDirectory(normalizedBoardRoot, 'Board root');

  const archiveRoot = getArchiveRoot(normalizedBoardRoot);
  if (!isPathInside(archiveRoot, normalizedArchivedCardPath)) {
    throw new Error('Archived card resolved outside archive root.');
  }

  if (!isPathInside(normalizedBoardRoot, normalizedTargetListPath)) {
    throw new Error('Target list resolved outside board root.');
  }

  await ensureFile(normalizedArchivedCardPath, 'Archived card');
  await ensureDirectory(normalizedTargetListPath, 'Target list');

  if (normalizedTargetListPath === archiveRoot || isPathInside(archiveRoot, normalizedTargetListPath)) {
    throw new Error('Target list cannot be inside archive.');
  }

  const sourceParentPath = path.dirname(normalizedArchivedCardPath);
  const archivedListPath = sourceParentPath === archiveRoot ? '' : sourceParentPath;
  const sourceFileName = path.basename(normalizedArchivedCardPath);
  const restoredAt = formatActivityTimestamp();
  const targetList = getListContextFromPath(normalizedTargetListPath);
  const restoredCardFile = await insertCardFileAtTop(normalizedTargetListPath, normalizedArchivedCardPath, sourceFileName);
  const restoredCardPath = path.join(normalizedTargetListPath, restoredCardFile);

  await mutateCard(restoredCardPath, (frontmatter) => clearCardArchiveState(frontmatter, {
    restoredAt,
    toListDirectoryName: targetList.directoryName,
    toListDisplayName: targetList.displayName,
  }));

  const removedEmptyArchiveList = archivedListPath
    ? await maybeRemoveEmptyArchivedListContainer(archivedListPath)
    : false;

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archivedCardPath: normalizedArchivedCardPath,
    restoredCardPath,
    restoredCardFile,
    targetListDirectoryName: targetList.directoryName,
    targetListDisplayName: targetList.displayName,
    removedEmptyArchiveList,
  };
}

async function restoreArchivedList(boardRoot, archivedListPath, restoredDirectoryName = '') {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  const normalizedArchivedListPath = normalizeAbsolutePath(archivedListPath);

  await ensureDirectory(normalizedBoardRoot, 'Board root');

  const archiveRoot = getArchiveRoot(normalizedBoardRoot);
  if (!isPathInside(archiveRoot, normalizedArchivedListPath)) {
    throw new Error('Archived list resolved outside archive root.');
  }

  await ensureDirectory(normalizedArchivedListPath, 'Archived list');

  const existingMetadata = await readArchivedListMetadata(normalizedArchivedListPath);
  const nextDirectoryName = trimStringValue(restoredDirectoryName)
    || trimStringValue(existingMetadata.originalListDirectoryName)
    || path.basename(normalizedArchivedListPath);
  const restoredListPath = path.join(normalizedBoardRoot, nextDirectoryName);

  if (!isPathInside(normalizedBoardRoot, restoredListPath) || isPathInside(archiveRoot, restoredListPath)) {
    throw new Error('Restored list path resolved outside board root.');
  }

  if (await pathExists(restoredListPath)) {
    throw new Error(`Destination list already exists: ${nextDirectoryName}`);
  }

  await fs.rename(normalizedArchivedListPath, restoredListPath);

  const restoredList = getListContextFromPath(restoredListPath);
  const restoredAt = formatActivityTimestamp();
  const updatedMetadata = appendArchivedListActivity({
    ...existingMetadata,
    originalListDirectoryName: trimStringValue(existingMetadata.originalListDirectoryName) || restoredList.directoryName,
    originalListDisplayName: trimStringValue(existingMetadata.originalListDisplayName)
      || getListDisplayName(trimStringValue(existingMetadata.originalListDirectoryName) || restoredList.directoryName)
      || 'Unknown original list',
  }, 'restored', {
    toListDirectoryName: restoredList.directoryName,
    toListDisplayName: restoredList.displayName,
  }, {
    at: restoredAt,
  });
  await writeArchivedListMetadata(restoredListPath, updatedMetadata);

  const restoredCardFiles = await listMarkdownCardFiles(restoredListPath);
  for (const cardFile of restoredCardFiles) {
    await mutateCard(path.join(restoredListPath, cardFile), (frontmatter) => clearCardArchiveState(frontmatter, {
      restoredAt,
      toListDirectoryName: restoredList.directoryName,
      toListDisplayName: restoredList.displayName,
    }));
  }

  return {
    ok: true,
    boardRoot: normalizedBoardRoot,
    archivedListPath: normalizedArchivedListPath,
    restoredListPath,
    restoredDirectoryName: restoredList.directoryName,
    restoredListDisplayName: restoredList.displayName,
  };
}

async function recordCardListMove(boardRoot, cardPath, fromListPath, toListPath) {
  const normalizedBoardRoot = normalizeAbsolutePath(boardRoot);
  const normalizedCardPath = normalizeAbsolutePath(cardPath);
  const normalizedFromListPath = normalizeAbsolutePath(fromListPath);
  const normalizedToListPath = normalizeAbsolutePath(toListPath);

  await ensureDirectory(normalizedBoardRoot, 'Board root');
  await ensureFile(normalizedCardPath, 'Card');

  if (!isPathInside(normalizedBoardRoot, normalizedCardPath)) {
    throw new Error('Card path resolved outside board root.');
  }

  if (!isPathInside(normalizedBoardRoot, normalizedFromListPath) || !isPathInside(normalizedBoardRoot, normalizedToListPath)) {
    throw new Error('List path resolved outside board root.');
  }

  if (normalizedFromListPath === normalizedToListPath) {
    return {
      ok: true,
      cardPath: normalizedCardPath,
      moved: false,
    };
  }

  const archiveRoot = getArchiveRoot(normalizedBoardRoot);
  if (
    normalizedFromListPath === archiveRoot ||
    normalizedToListPath === archiveRoot ||
    isPathInside(archiveRoot, normalizedFromListPath) ||
    isPathInside(archiveRoot, normalizedToListPath)
  ) {
    return {
      ok: true,
      cardPath: normalizedCardPath,
      moved: false,
    };
  }

  const fromList = getListContextFromPath(normalizedFromListPath);
  const toList = getListContextFromPath(normalizedToListPath);
  const movedAt = formatActivityTimestamp();

  await mutateCard(normalizedCardPath, (frontmatter) => applyCardListMove(frontmatter, {
    movedAt,
    fromListDirectoryName: fromList.directoryName,
    fromListDisplayName: fromList.displayName,
    toListDirectoryName: toList.directoryName,
    toListDisplayName: toList.displayName,
  }));

  return {
    ok: true,
    cardPath: normalizedCardPath,
    moved: true,
    fromListDirectoryName: fromList.directoryName,
    toListDirectoryName: toList.directoryName,
  };
}

module.exports = {
  ARCHIVE_DIRECTORY_NAME,
  ARCHIVED_LIST_METADATA_FILE,
  archiveCard,
  archiveList,
  listArchiveEntries,
  readArchiveEntry,
  recordCardListMove,
  restoreArchivedCard,
  restoreArchivedList,
};
