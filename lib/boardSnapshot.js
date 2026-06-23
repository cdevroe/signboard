const fs = require('fs').promises;
const path = require('path');
const boardLabels = require('./boardLabels');
const cardFrontmatter = require('./cardFrontmatter');
const { readCardWithTimestamps } = require('./cardTimestamps');
const {
  parseTaskListItems,
} = require('./taskList');

const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';

const snapshotNameCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function normalizeSnapshotError(error, targetPath) {
  return {
    path: targetPath,
    code: error && typeof error.code === 'string' ? error.code : '',
    message: error && typeof error.message === 'string' ? error.message : String(error || 'Unknown error'),
  };
}

function compareNames(left, right) {
  return snapshotNameCollator.compare(left, right);
}

function getTaskSummaryFromItems(items) {
  const taskItems = Array.isArray(items) ? items : [];
  let completed = 0;

  for (const item of taskItems) {
    if (item && item.isCompleted) {
      completed += 1;
    }
  }

  return {
    total: taskItems.length,
    completed,
    remaining: Math.max(0, taskItems.length - completed),
  };
}

function collectTaskDateValues(items, fieldName, options = {}) {
  const taskItems = Array.isArray(items) ? items : [];
  const includeCompleted = options.includeCompleted === true;
  const values = new Set();

  for (const item of taskItems) {
    if (!item || (!includeCompleted && item.isCompleted)) {
      continue;
    }

    const value = String(item[fieldName] || '').trim();
    if (value) {
      values.add(value);
    }
  }

  return [...values].sort();
}

async function listBoardDirectories(boardRoot, options = {}) {
  const includeArchive = options.includeArchive === true;
  const entries = await fs.readdir(boardRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((entryName) => includeArchive || entryName !== ARCHIVE_DIRECTORY_NAME)
    .sort(compareNames);
}

async function listMarkdownCardFileNames(listPath) {
  const entries = await fs.readdir(listPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort(compareNames);
}

async function readSnapshotCard(cardPath, cardName, errors, options = {}) {
  const includeTimestamps = options.includeTimestamps !== false;
  const includeTaskItems = options.includeTaskItems !== false;

  try {
    const card = includeTimestamps
      ? await readCardWithTimestamps(cardPath)
      : await cardFrontmatter.readCard(cardPath);
    const body = String(card && typeof card.body === 'string' ? card.body : '');
    const taskItems = parseTaskListItems(body);
    const snapshotCard = {
      cardName,
      cardPath,
      frontmatter: card && card.frontmatter && typeof card.frontmatter === 'object'
        ? card.frontmatter
        : {},
      body,
      taskSummary: getTaskSummaryFromItems(taskItems),
      taskStartDates: collectTaskDateValues(taskItems, 'start', { includeCompleted: true }),
      incompleteTaskStartDates: collectTaskDateValues(taskItems, 'start'),
      taskDueDates: collectTaskDateValues(taskItems, 'due', { includeCompleted: true }),
      incompleteTaskDueDates: collectTaskDateValues(taskItems, 'due'),
    };

    if (includeTimestamps) {
      snapshotCard.timestamps = card && card.timestamps && typeof card.timestamps === 'object'
        ? card.timestamps
        : {};
    }

    if (includeTaskItems) {
      snapshotCard.taskItems = taskItems;
    }

    return snapshotCard;
  } catch (error) {
    errors.push(normalizeSnapshotError(error, cardPath));
    return null;
  }
}

async function readSnapshotList(boardRoot, listName, errors, options = {}) {
  const listPath = path.join(boardRoot, listName);
  let cardNames = [];

  try {
    cardNames = await listMarkdownCardFileNames(listPath);
  } catch (error) {
    errors.push(normalizeSnapshotError(error, listPath));
  }

  const cards = (await Promise.all(
    cardNames.map((cardName) => readSnapshotCard(path.join(listPath, cardName), cardName, errors, options)),
  )).filter(Boolean);

  return {
    listName,
    listPath,
    cards,
  };
}

async function readBoardSnapshot(boardRoot, options = {}) {
  const normalizedBoardRoot = path.resolve(String(boardRoot || ''));
  const includeArchive = options.includeArchive === true;
  const includeBoardSettings = options.includeBoardSettings !== false;
  const snapshotOptions = {
    includeTimestamps: options.includeTimestamps !== false,
    includeTaskItems: options.includeTaskItems !== false,
  };
  const errors = [];
  const [listNames, boardSettings] = await Promise.all([
    listBoardDirectories(normalizedBoardRoot, { includeArchive }),
    includeBoardSettings
      ? boardLabels.readBoardSettings(normalizedBoardRoot, {
        ensureFile: options.ensureBoardSettings !== false,
      }).catch((error) => {
        errors.push(normalizeSnapshotError(error, path.join(normalizedBoardRoot, 'board-settings.md')));
        return null;
      })
      : Promise.resolve(null),
  ]);

  const lists = await Promise.all(
    listNames.map((listName) => readSnapshotList(normalizedBoardRoot, listName, errors, snapshotOptions)),
  );

  return {
    ok: errors.length === 0,
    boardRoot: normalizedBoardRoot,
    boardName: path.basename(normalizedBoardRoot),
    boardSettings,
    lists,
    errors,
  };
}

module.exports = {
  readBoardSnapshot,
};
