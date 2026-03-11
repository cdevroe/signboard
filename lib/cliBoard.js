const fs = require('fs').promises;
const path = require('path');
const cardFrontmatter = require('./cardFrontmatter');
const boardLabels = require('./boardLabels');
const {
  parseIsoDateStringToLocalDate,
  getTaskListSummary,
  getTaskListDueDates,
} = require('./taskList');

const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const LIST_NAME_PATTERN = /^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/;
const CARD_ID_PATTERN = /-([A-Za-z0-9]{5})\.md$/;

const listSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

const cardSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function normalizeBoardRoot(boardRoot) {
  const normalized = String(boardRoot || '').trim();
  if (!normalized) {
    throw new Error('boardRoot is required.');
  }

  return path.resolve(normalized);
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

async function ensureBoardRoot(boardRoot) {
  const resolved = normalizeBoardRoot(boardRoot);
  await ensureDirectory(resolved, 'Board root');
  return resolved;
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

function randomSuffix(length = 5) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return output;
}

function zeroPadNumber(value) {
  return String(value).padStart(3, '0');
}

function sanitizeListName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Untitled';
}

function sanitizeCardSlug(rawName) {
  const cleaned = String(rawName || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'untitled';
}

function getListDisplayName(listDirectoryName) {
  const normalized = String(listDirectoryName || '').trim();
  if (!normalized) {
    return 'Untitled';
  }

  if (normalized === ARCHIVE_DIRECTORY_NAME) {
    return 'Archive';
  }

  const match = normalized.match(LIST_NAME_PATTERN);
  if (match) {
    return String(match[2] || '').trim() || 'Untitled';
  }

  return normalized;
}

function getCardId(fileName) {
  const match = String(fileName || '').match(CARD_ID_PATTERN);
  return match ? match[1] : '';
}

function normalizeSearchTokens(query) {
  const normalized = String(query || '').trim().toLowerCase();
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function cardMatchesSearch(record, query) {
  const tokens = normalizeSearchTokens(query);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = `${String(record.title || '')}\n${String(record.body || '')}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function todayLocalDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toIsoDateString(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function createDateRangeEnd(startDate, daysAhead) {
  return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + daysAhead);
}

function startOfWeek(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
}

function endOfWeek(dateValue) {
  const start = startOfWeek(dateValue);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

function compareOptionalIsoDates(left, right) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.localeCompare(right);
}

function getDueDatesForRecord(record, dueSource = 'any') {
  const entries = [];
  const source = String(dueSource || 'any');

  if ((source === 'any' || source === 'card') && record.due) {
    entries.push({ source: 'card', date: record.due });
  }

  if (source === 'any' || source === 'task') {
    for (const taskDate of record.taskDueDates) {
      entries.push({ source: 'task', date: taskDate });
    }
  }

  return entries;
}

function buildDueMatcher(dueFilterValue) {
  const raw = String(dueFilterValue || '').trim().toLowerCase();
  if (!raw || raw === 'any') {
    return null;
  }

  const today = todayLocalDate();
  const todayIso = toIsoDateString(today);
  const tomorrowIso = toIsoDateString(createDateRangeEnd(today, 1));
  const thisWeekEndIso = toIsoDateString(endOfWeek(today));

  if (raw === 'none') {
    return (dates) => dates.length === 0;
  }

  if (raw === 'today') {
    return (dates) => dates.some((entry) => entry.date === todayIso);
  }

  if (raw === 'tomorrow') {
    return (dates) => dates.some((entry) => entry.date === tomorrowIso);
  }

  if (raw === 'overdue') {
    return (dates) => dates.some((entry) => entry.date < todayIso);
  }

  if (raw === 'upcoming') {
    return (dates) => dates.some((entry) => entry.date >= todayIso);
  }

  if (raw === 'this-week') {
    return (dates) => dates.some((entry) => entry.date >= todayIso && entry.date <= thisWeekEndIso);
  }

  const nextMatch = raw.match(/^next:(\d+)$/);
  if (nextMatch) {
    const days = Number(nextMatch[1]);
    const endIso = toIsoDateString(createDateRangeEnd(today, days));
    return (dates) => dates.some((entry) => entry.date >= todayIso && entry.date <= endIso);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return (dates) => dates.some((entry) => entry.date === raw);
  }

  throw new Error(`Unsupported due filter: ${dueFilterValue}`);
}

async function listLists(boardRoot, options = {}) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const includeArchive = options.includeArchive === true;
  const withCardCounts = options.withCardCounts !== false;
  const entries = await fs.readdir(resolvedBoardRoot, { withFileTypes: true });
  const lists = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryName = entry.name;
    const isArchive = directoryName === ARCHIVE_DIRECTORY_NAME;
    if (isArchive && !includeArchive) {
      continue;
    }

    const listPath = path.join(resolvedBoardRoot, directoryName);
    let cardCount = null;

    if (withCardCounts) {
      const cardEntries = await fs.readdir(listPath, { withFileTypes: true });
      cardCount = cardEntries.filter((cardEntry) => cardEntry.isFile() && cardEntry.name.endsWith('.md')).length;
    }

    lists.push({
      directoryName,
      displayName: getListDisplayName(directoryName),
      path: listPath,
      isArchive,
      cardCount,
    });
  }

  lists.sort((left, right) => listSortCollator.compare(left.directoryName, right.directoryName));
  return lists;
}

function normalizeMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveUniqueMatch(items, ref, matchers, label) {
  const normalizedRef = normalizeMatchValue(ref);
  if (!normalizedRef) {
    throw new Error(`${label} reference is required.`);
  }

  for (const matcher of matchers) {
    const exactMatches = items.filter((item) => matcher(item, normalizedRef, true));
    if (exactMatches.length === 1) {
      return exactMatches[0];
    }
    if (exactMatches.length > 1) {
      throw new Error(`Ambiguous ${label} reference "${ref}".`);
    }
  }

  for (const matcher of matchers) {
    const partialMatches = items.filter((item) => matcher(item, normalizedRef, false));
    if (partialMatches.length === 1) {
      return partialMatches[0];
    }
    if (partialMatches.length > 1) {
      throw new Error(`Ambiguous ${label} reference "${ref}".`);
    }
  }

  throw new Error(`Could not find ${label}: ${ref}`);
}

async function resolveList(boardRoot, listRef, options = {}) {
  const lists = await listLists(boardRoot, {
    includeArchive: options.includeArchive === true,
    withCardCounts: options.withCardCounts,
  });

  return resolveUniqueMatch(
    lists,
    listRef,
    [
      (item, ref, exact) => {
        const value = normalizeMatchValue(item.directoryName);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeMatchValue(item.displayName);
        return exact ? value === ref : value.includes(ref);
      },
    ],
    'list',
  );
}

async function nextListPrefix(boardRoot) {
  const lists = await listLists(boardRoot, { includeArchive: false, withCardCounts: false });
  let maxPrefix = -1;

  for (const listEntry of lists) {
    const match = String(listEntry.directoryName).match(/^(\d{3})-/);
    if (!match) {
      continue;
    }

    const prefix = Number(match[1]);
    if (Number.isFinite(prefix) && prefix > maxPrefix) {
      maxPrefix = prefix;
    }
  }

  return zeroPadNumber(maxPrefix + 1);
}

async function createList(boardRoot, listName) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const prefix = await nextListPrefix(resolvedBoardRoot);
  const sanitizedName = sanitizeListName(String(listName || '').slice(0, 25));
  const directoryName = `${prefix}-${sanitizedName}-${randomSuffix()}`;
  const listPath = path.join(resolvedBoardRoot, directoryName);

  await fs.mkdir(listPath);

  return {
    boardRoot: resolvedBoardRoot,
    directoryName,
    displayName: getListDisplayName(directoryName),
    path: listPath,
  };
}

async function renameList(boardRoot, listRef, newName) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const listEntry = await resolveList(resolvedBoardRoot, listRef, { includeArchive: true });

  if (listEntry.isArchive) {
    throw new Error('Archive list cannot be renamed.');
  }

  const match = listEntry.directoryName.match(LIST_NAME_PATTERN);
  if (!match) {
    throw new Error(`List name cannot be safely renamed: ${listEntry.directoryName}`);
  }

  const nextDirectoryName = `${match[1]}${sanitizeListName(newName)}${match[3]}`;
  if (nextDirectoryName === listEntry.directoryName) {
    return {
      before: listEntry,
      after: listEntry,
      changed: false,
    };
  }

  const nextPath = path.join(resolvedBoardRoot, nextDirectoryName);
  if (await pathExists(nextPath)) {
    throw new Error(`A list already exists at ${nextDirectoryName}`);
  }

  await fs.rename(listEntry.path, nextPath);

  return {
    before: listEntry,
    after: {
      ...listEntry,
      directoryName: nextDirectoryName,
      displayName: getListDisplayName(nextDirectoryName),
      path: nextPath,
    },
    changed: true,
  };
}

async function nextCardPrefix(listPath) {
  const entries = await fs.readdir(listPath, { withFileTypes: true });
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

  return zeroPadNumber(maxPrefix + 1);
}

async function loadCardRecord(boardRoot, listEntry, fileName) {
  const cardPath = path.join(listEntry.path, fileName);
  const [card, stats] = await Promise.all([
    cardFrontmatter.readCard(cardPath),
    fs.stat(cardPath),
  ]);
  const taskSummary = getTaskListSummary(card.body);
  const taskDueDates = getTaskListDueDates(card.body);
  const labels = Array.isArray(card.frontmatter.labels)
    ? card.frontmatter.labels.map((labelId) => String(labelId))
    : [];

  return {
    boardRoot,
    listDirectoryName: listEntry.directoryName,
    listDisplayName: listEntry.displayName,
    listPath: listEntry.path,
    fileName,
    filePath: cardPath,
    cardId: getCardId(fileName),
    title: String(card.frontmatter.title || '').trim() || 'Untitled',
    body: card.body,
    due: String(card.frontmatter.due || '').trim(),
    labels,
    frontmatter: card.frontmatter,
    taskSummary,
    taskDueDates,
    mtimeMs: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.ctimeMs,
  };
}

async function listCards(boardRoot, options = {}) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const includeArchive = options.includeArchive === true;
  const listRefs = Array.isArray(options.listRefs)
    ? options.listRefs.filter(Boolean)
    : (options.listRef ? [options.listRef] : []);
  const selectedLists = listRefs.length > 0
    ? await Promise.all(listRefs.map((listRef) => resolveList(resolvedBoardRoot, listRef, { includeArchive })))
    : await listLists(resolvedBoardRoot, { includeArchive, withCardCounts: false });
  const boardSettings = await boardLabels.readBoardSettings(resolvedBoardRoot, { ensureFile: false });
  const labelMap = new Map(boardSettings.labels.map((label) => [label.id, label.name]));
  const dueMatcher = buildDueMatcher(options.due);
  const dueSource = String(options.dueSource || 'any').toLowerCase();
  const labelMode = String(options.labelMode || 'any').toLowerCase() === 'all' ? 'all' : 'any';
  const labelIds = options.labelRefs && options.labelRefs.length > 0
    ? await resolveLabelIds(resolvedBoardRoot, options.labelRefs)
    : [];
  const records = [];

  for (const listEntry of selectedLists) {
    const entries = await fs.readdir(listEntry.path, { withFileTypes: true });
    const cardNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort((left, right) => cardSortCollator.compare(left, right));

    const loaded = await Promise.all(
      cardNames.map((fileName) => loadCardRecord(resolvedBoardRoot, listEntry, fileName))
    );

    for (const record of loaded) {
      const normalizedLabelNames = record.labels
        .map((labelId) => labelMap.get(labelId) || labelId)
        .sort((left, right) => listSortCollator.compare(left, right));

      const nextRecord = {
        ...record,
        labelNames: normalizedLabelNames,
      };

      if (!cardMatchesSearch(nextRecord, options.search)) {
        continue;
      }

      if (labelIds.length > 0) {
        const hasMatch = labelMode === 'all'
          ? labelIds.every((labelId) => nextRecord.labels.includes(labelId))
          : labelIds.some((labelId) => nextRecord.labels.includes(labelId));

        if (!hasMatch) {
          continue;
        }
      }

      if (dueMatcher) {
        const dueDates = getDueDatesForRecord(nextRecord, dueSource);
        if (!dueMatcher(dueDates)) {
          continue;
        }
      }

      records.push(nextRecord);
    }
  }

  const sortBy = String(options.sort || 'list').toLowerCase();
  records.sort((left, right) => {
    if (sortBy === 'title') {
      return listSortCollator.compare(left.title, right.title);
    }

    if (sortBy === 'due') {
      const leftEarliest = getEarliestDueDate(left, dueSource);
      const rightEarliest = getEarliestDueDate(right, dueSource);
      const dueComparison = compareOptionalIsoDates(leftEarliest, rightEarliest);
      if (dueComparison !== 0) {
        return dueComparison;
      }
    }

    if (sortBy === 'updated') {
      const updatedDelta = right.mtimeMs - left.mtimeMs;
      if (updatedDelta !== 0) {
        return updatedDelta;
      }
    }

    const listComparison = listSortCollator.compare(left.listDirectoryName, right.listDirectoryName);
    if (listComparison !== 0) {
      return listComparison;
    }

    const fileComparison = cardSortCollator.compare(left.fileName, right.fileName);
    if (fileComparison !== 0) {
      return fileComparison;
    }

    return listSortCollator.compare(left.title, right.title);
  });

  const limit = Number(options.limit);
  if (Number.isInteger(limit) && limit >= 0) {
    return records.slice(0, limit);
  }

  return records;
}

function getEarliestDueDate(record, dueSource = 'any') {
  const dueDates = getDueDatesForRecord(record, dueSource).map((entry) => entry.date).sort();
  return dueDates[0] || '';
}

async function resolveLabelIds(boardRoot, labelRefs) {
  const boardSettings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });
  const labels = Array.isArray(boardSettings.labels) ? boardSettings.labels : [];

  return labelRefs.map((labelRef) => {
    const normalizedRef = normalizeMatchValue(labelRef);
    if (!normalizedRef) {
      throw new Error('Label reference cannot be empty.');
    }

    const exactById = labels.find((label) => normalizeMatchValue(label.id) === normalizedRef);
    if (exactById) {
      return exactById.id;
    }

    const exactByName = labels.find((label) => normalizeMatchValue(label.name) === normalizedRef);
    if (exactByName) {
      return exactByName.id;
    }

    const partialMatches = labels.filter((label) => (
      normalizeMatchValue(label.id).includes(normalizedRef) ||
      normalizeMatchValue(label.name).includes(normalizedRef)
    ));

    if (partialMatches.length === 1) {
      return partialMatches[0].id;
    }

    if (partialMatches.length > 1) {
      throw new Error(`Ambiguous label reference "${labelRef}".`);
    }

    throw new Error(`Could not find label: ${labelRef}`);
  });
}

async function resolveCard(boardRoot, options = {}) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const includeArchive = options.includeArchive === true;
  const cardRef = String(options.cardRef || '').trim();
  if (!cardRef) {
    throw new Error('card reference is required.');
  }

  const cards = await listCards(resolvedBoardRoot, {
    includeArchive,
    listRefs: options.listRef ? [options.listRef] : [],
  });

  return resolveUniqueMatch(
    cards,
    cardRef,
    [
      (item, ref, exact) => {
        const value = normalizeMatchValue(item.fileName);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeMatchValue(item.cardId);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeMatchValue(item.title);
        return exact ? value === ref : value.includes(ref);
      },
    ],
    'card',
  );
}

function normalizeDueInput(dueValue) {
  const normalized = String(dueValue || '').trim();
  if (!normalized || normalized.toLowerCase() === 'none') {
    return null;
  }

  if (!parseIsoDateStringToLocalDate(normalized)) {
    throw new Error(`Due dates must use YYYY-MM-DD. Received: ${dueValue}`);
  }

  return normalized;
}

async function createCard(boardRoot, options = {}) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const listEntry = await resolveList(resolvedBoardRoot, options.listRef, { includeArchive: true });
  const title = String(options.title || '').trim();
  if (!title) {
    throw new Error('Card title is required.');
  }

  const prefix = await nextCardPrefix(listEntry.path);
  const fileName = `${prefix}-${sanitizeCardSlug(title).slice(0, 25)}-${randomSuffix()}.md`;
  const filePath = path.join(listEntry.path, fileName);
  const due = normalizeDueInput(options.due);
  const labelIds = options.labelRefs && options.labelRefs.length > 0
    ? await resolveLabelIds(resolvedBoardRoot, options.labelRefs)
    : [];

  await cardFrontmatter.writeCard(filePath, {
    frontmatter: {
      title,
      due,
      labels: labelIds,
    },
    body: typeof options.body === 'string' ? options.body : '',
  });

  return loadCardRecord(resolvedBoardRoot, listEntry, fileName);
}

async function editCard(boardRoot, options = {}) {
  const resolvedBoardRoot = await ensureBoardRoot(boardRoot);
  const cardRecord = await resolveCard(resolvedBoardRoot, {
    cardRef: options.cardRef,
    listRef: options.listRef,
    includeArchive: true,
  });
  const current = await cardFrontmatter.readCard(cardRecord.filePath);
  const nextFrontmatter = { ...current.frontmatter };
  const currentLabels = Array.isArray(nextFrontmatter.labels)
    ? nextFrontmatter.labels.map((labelId) => String(labelId))
    : [];
  let nextBody = current.body;

  if (Object.prototype.hasOwnProperty.call(options, 'title')) {
    const title = String(options.title || '').trim();
    if (!title) {
      throw new Error('Card title cannot be empty.');
    }
    nextFrontmatter.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    nextBody = String(options.body || '');
  }

  if (typeof options.appendBody === 'string' && options.appendBody.length > 0) {
    nextBody = nextBody ? `${nextBody}\n${options.appendBody}` : options.appendBody;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'due')) {
    nextFrontmatter.due = normalizeDueInput(options.due);
  }

  if (options.setLabelRefs && options.setLabelRefs.length > 0) {
    nextFrontmatter.labels = await resolveLabelIds(resolvedBoardRoot, options.setLabelRefs);
  } else {
    const nextLabelSet = new Set(currentLabels);

    if (options.addLabelRefs && options.addLabelRefs.length > 0) {
      for (const labelId of await resolveLabelIds(resolvedBoardRoot, options.addLabelRefs)) {
        nextLabelSet.add(labelId);
      }
    }

    if (options.removeLabelRefs && options.removeLabelRefs.length > 0) {
      for (const labelId of await resolveLabelIds(resolvedBoardRoot, options.removeLabelRefs)) {
        nextLabelSet.delete(labelId);
      }
    }

    nextFrontmatter.labels = [...nextLabelSet];
  }

  await cardFrontmatter.writeCard(cardRecord.filePath, {
    frontmatter: nextFrontmatter,
    body: nextBody,
  });

  let finalFilePath = cardRecord.filePath;
  let finalListEntry = {
    directoryName: cardRecord.listDirectoryName,
    displayName: cardRecord.listDisplayName,
    path: cardRecord.listPath,
  };

  if (options.moveToListRef) {
    const targetList = await resolveList(resolvedBoardRoot, options.moveToListRef, { includeArchive: true });
    const nextPath = path.join(targetList.path, cardRecord.fileName);
    if (nextPath !== cardRecord.filePath) {
      if (await pathExists(nextPath)) {
        throw new Error(`Destination card already exists: ${targetList.directoryName}/${cardRecord.fileName}`);
      }
      await fs.rename(cardRecord.filePath, nextPath);
      finalFilePath = nextPath;
      finalListEntry = targetList;
    }
  }

  return loadCardRecord(resolvedBoardRoot, finalListEntry, path.basename(finalFilePath));
}

function summarizeDue(record) {
  const pieces = [];
  if (record.due) {
    pieces.push(record.due);
  }
  if (record.taskDueDates.length > 0) {
    const taskDue = record.taskDueDates.join(',');
    pieces.push(record.due ? `tasks:${taskDue}` : `task:${taskDue}`);
  }
  return pieces.join(' | ');
}

module.exports = {
  ARCHIVE_DIRECTORY_NAME,
  getListDisplayName,
  getCardId,
  listLists,
  resolveList,
  createList,
  renameList,
  listCards,
  resolveCard,
  createCard,
  editCard,
  resolveLabelIds,
  summarizeDue,
  getEarliestDueDate,
};
