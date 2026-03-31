const fs = require('fs').promises;
const path = require('path');
const {
  addWarning,
  appendSections,
  buildMarkdownSection,
  buildMetadataBody,
  createCard,
  createImportContext,
  createList,
  ensureLabel,
  normalizeHexColor,
  normalizeImportedLabelColors,
  normalizeIsoDateFromValue,
  pathExists,
  persistLabels,
  readDirectoryEntries,
} = require('./shared');

const TASKS_MD_TAG_PATTERN = /\[tag:([^\]]+)\]/gi;
const TASKS_MD_DUE_PATTERN = /\[due:([^\]]+)\]/i;
const TASKS_MD_COLOR_VAR_PATTERN = /^var\(\s*--color-alt-([1-7])\s*\)$/i;
const TASKS_MD_ALT_COLOR_MAP = Object.freeze({
  1: { colorLight: '#ed333b', colorDark: '#a51d2d' },
  2: { colorLight: '#ffa348', colorDark: '#c64600' },
  3: { colorLight: '#f5c211', colorDark: '#e5a50a' },
  4: { colorLight: '#b5835a', colorDark: '#63452c' },
  5: { colorLight: '#57e389', colorDark: '#26a269' },
  6: { colorLight: '#c061cb', colorDark: '#613583' },
  7: { colorLight: '#62a0ea', colorDark: '#1a5fb4' },
});
const TASKS_MD_SORT_COLLATOR = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

function dedupeStrings(values = []) {
  const results = [];
  const seen = new Set();

  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(normalized);
  }

  return results;
}

function compareNames(left, right) {
  return TASKS_MD_SORT_COLLATOR.compare(String(left || ''), String(right || ''));
}

function toPosixRelative(fromPath, toPath) {
  const relativePath = path.relative(fromPath, toPath);
  if (!relativePath || relativePath === '.') {
    return '';
  }
  return relativePath.split(path.sep).join('/');
}

function getTasksMdBoardKey(tasksRoot, projectRoot) {
  if (!tasksRoot || !projectRoot) {
    return '';
  }

  const relativePath = toPosixRelative(tasksRoot, projectRoot);
  if (!relativePath || relativePath.startsWith('..')) {
    return '';
  }

  return `/${relativePath}`;
}

async function readJsonFileIfExists(filePath) {
  if (!filePath || !(await pathExists(filePath))) {
    return null;
  }

  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Tasks.md config file ${path.basename(filePath)}: ${error?.message || error}`);
  }
}

async function detectTasksMdConfig(projectRoot) {
  const candidates = [];
  const projectName = path.basename(projectRoot);
  if (projectName.toLowerCase() === 'tasks') {
    candidates.push(projectRoot);
  }

  const parentRoot = path.dirname(projectRoot);
  if (path.basename(parentRoot).toLowerCase() === 'tasks') {
    candidates.push(parentRoot);
  }

  for (const tasksRoot of candidates) {
    const configRoot = path.join(path.dirname(tasksRoot), 'config');
    if (!(await pathExists(configRoot))) {
      continue;
    }

    return {
      tasksRoot,
      tagsPath: path.join(configRoot, 'tags.json'),
      sortPath: path.join(configRoot, 'sort.json'),
    };
  }

  return {
    tasksRoot: '',
    tagsPath: '',
    sortPath: '',
  };
}

function getConfigEntry(configData, boardKey) {
  if (!configData || typeof configData !== 'object') {
    return null;
  }

  const candidateKeys = [
    boardKey,
    boardKey ? boardKey.replace(/\/+$/, '') : '',
    boardKey ? boardKey.replace(/^\/+/, '') : '',
    '',
  ].filter((value, index, array) => array.indexOf(value) === index);

  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(configData, key)) {
      return configData[key];
    }
  }

  return null;
}

function normalizeTasksMdLabelColors(rawValue, fallbackIndex = 0) {
  const source = String(rawValue || '').trim();
  if (!source) {
    return normalizeImportedLabelColors({}, fallbackIndex);
  }

  const altMatch = source.match(TASKS_MD_COLOR_VAR_PATTERN);
  if (altMatch) {
    const mapped = TASKS_MD_ALT_COLOR_MAP[Number(altMatch[1])];
    return normalizeImportedLabelColors(mapped || {}, fallbackIndex);
  }

  const hex = normalizeHexColor(source, '');
  if (hex) {
    return {
      colorLight: hex,
      colorDark: hex,
    };
  }

  return normalizeImportedLabelColors({}, fallbackIndex);
}

function getTasksMdTagColor(rawConfig, tagName) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return '';
  }

  const normalizedTagName = String(tagName || '').trim().toLowerCase();
  if (!normalizedTagName) {
    return '';
  }

  for (const [name, value] of Object.entries(rawConfig)) {
    if (String(name || '').trim().toLowerCase() === normalizedTagName) {
      return value;
    }
  }

  return '';
}

function extractTasksMdTags(content) {
  const tags = [];
  let match;

  while ((match = TASKS_MD_TAG_PATTERN.exec(String(content || '')))) {
    const tagName = String(match[1] || '').trim();
    if (tagName) {
      tags.push(tagName);
    }
  }

  TASKS_MD_TAG_PATTERN.lastIndex = 0;
  return dedupeStrings(tags);
}

function extractTasksMdDue(content) {
  const match = String(content || '').match(TASKS_MD_DUE_PATTERN);
  if (!match) {
    return {
      due: '',
      raw: '',
    };
  }

  const rawValue = String(match[1] || '').trim();
  return {
    due: normalizeIsoDateFromValue(rawValue),
    raw: rawValue,
  };
}

function stripTasksMdMarkers(content) {
  return String(content || '')
    .replace(TASKS_MD_TAG_PATTERN, '')
    .replace(TASKS_MD_DUE_PATTERN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');
}

function buildTasksMdMetadataSection(projectRoot, laneName, filePath, stats, rawDueValue) {
  const metadata = {
    Source: 'Tasks.md',
    'Tasks.md project': path.basename(projectRoot),
    'Original lane': laneName,
    'Tasks.md path': toPosixRelative(projectRoot, filePath),
    Created: stats?.birthtime ? stats.birthtime.toISOString() : '',
    'Last updated': stats?.mtime ? stats.mtime.toISOString() : '',
    'Raw due marker': rawDueValue || '',
  };

  return buildMarkdownSection('Imported metadata', buildMetadataBody(metadata));
}

function sortLaneNames(laneNames, sortEntry) {
  const configuredNames = sortEntry && typeof sortEntry === 'object'
    ? Object.keys(sortEntry)
    : [];
  const configuredOrder = new Map(configuredNames.map((name, index) => [String(name), index]));
  const remaining = [];
  const ordered = [];

  for (const laneName of laneNames) {
    if (configuredOrder.has(laneName)) {
      ordered.push(laneName);
    } else {
      remaining.push(laneName);
    }
  }

  ordered.sort((left, right) => configuredOrder.get(left) - configuredOrder.get(right));
  remaining.sort(compareNames);
  return [...ordered, ...remaining];
}

function sortLaneCards(cardEntries, orderedCardNames = []) {
  const configuredOrder = new Map(
    Array.isArray(orderedCardNames)
      ? orderedCardNames.map((name, index) => [String(name || ''), index])
      : [],
  );

  return [...cardEntries].sort((left, right) => {
    const leftName = path.basename(left.name, path.extname(left.name));
    const rightName = path.basename(right.name, path.extname(right.name));
    const leftIndex = configuredOrder.has(leftName) ? configuredOrder.get(leftName) : Number.POSITIVE_INFINITY;
    const rightIndex = configuredOrder.has(rightName) ? configuredOrder.get(rightName) : Number.POSITIVE_INFINITY;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return compareNames(leftName, rightName);
  });
}

async function resolveTasksMdSource(sourcePaths) {
  const resolvedPaths = dedupeStrings(sourcePaths.map((entry) => path.resolve(String(entry || '').trim())).filter(Boolean));
  if (resolvedPaths.length === 0) {
    throw new Error('Tasks.md import requires at least one source path.');
  }

  const directories = [];
  let selectedTagsPath = '';
  let selectedSortPath = '';
  for (const sourcePath of resolvedPaths) {
    const stats = await fs.stat(sourcePath);
    if (stats.isDirectory()) {
      directories.push(sourcePath);
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    const fileName = path.basename(sourcePath).toLowerCase();
    if (fileName === 'tags.json') {
      selectedTagsPath = sourcePath;
    } else if (fileName === 'sort.json') {
      selectedSortPath = sourcePath;
    }
  }

  if (directories.length !== 1) {
    throw new Error('Tasks.md import expects exactly one project directory.');
  }

  const projectRoot = directories[0];
  const detectedConfig = await detectTasksMdConfig(projectRoot);
  const boardKey = getTasksMdBoardKey(detectedConfig.tasksRoot, projectRoot);
  const tagsPath = selectedTagsPath || detectedConfig.tagsPath;
  const sortPath = selectedSortPath || detectedConfig.sortPath;
  const tagsData = await readJsonFileIfExists(tagsPath);
  const sortData = await readJsonFileIfExists(sortPath);
  const tagsConfig = getConfigEntry(tagsData, boardKey);
  const sortConfig = getConfigEntry(sortData, boardKey);

  return {
    projectRoot,
    boardKey,
    tagsConfig: tagsConfig && typeof tagsConfig === 'object' ? tagsConfig : {},
    sortConfig: sortConfig && typeof sortConfig === 'object' ? sortConfig : {},
    hasDetectedConfig: Boolean(tagsData || sortData),
  };
}

async function importTasksMd(options = {}) {
  const sourcePaths = Array.isArray(options.sourcePaths) ? options.sourcePaths : [];
  const resolved = await resolveTasksMdSource(sourcePaths);
  const context = await createImportContext(options.boardRoot, 'tasksmd', sourcePaths);
  const projectEntries = await readDirectoryEntries(resolved.projectRoot);
  const laneEntries = projectEntries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
  const laneNames = sortLaneNames(laneEntries.map((entry) => entry.name), resolved.sortConfig);

  if (laneNames.length === 0) {
    throw new Error('No lane directories were found in the selected Tasks.md project.');
  }

  if (!resolved.hasDetectedConfig) {
    addWarning(
      context,
      'Tasks.md keeps manual ordering and tag colors in a separate config directory. This import preserved lanes, markdown, tag markers, and due markers, but used default ordering and label colors.',
    );
  }

  for (const laneName of laneNames) {
    const lanePath = path.join(resolved.projectRoot, laneName);
    const laneList = await createList(context, laneName);
    const laneEntries = await readDirectoryEntries(lanePath);
    const cardEntries = laneEntries.filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.'));
    const orderedCards = sortLaneCards(cardEntries, resolved.sortConfig[laneName]);

    for (const cardEntry of orderedCards) {
      const filePath = path.join(lanePath, cardEntry.name);
      const [content, stats] = await Promise.all([
        fs.readFile(filePath, 'utf8'),
        fs.stat(filePath),
      ]);

      const tags = extractTasksMdTags(content);
      const dueInfo = extractTasksMdDue(content);
      const labelIds = [];
      for (const tagName of tags) {
        const labelId = await ensureLabel(
          context,
          tagName,
          normalizeTasksMdLabelColors(getTasksMdTagColor(resolved.tagsConfig, tagName), context.labels.length),
        );
        if (labelId) {
          labelIds.push(labelId);
        }
      }

      if (dueInfo.raw && !dueInfo.due) {
        addWarning(context, `One or more Tasks.md due markers could not be normalized and were left in imported metadata.`);
      }

      const body = appendSections(stripTasksMdMarkers(content), [
        buildTasksMdMetadataSection(resolved.projectRoot, laneName, filePath, stats, dueInfo.raw && !dueInfo.due ? dueInfo.raw : ''),
      ]);

      await createCard(context, laneList, {
        title: path.basename(cardEntry.name, '.md'),
        due: dueInfo.due,
        labels: labelIds,
        body,
      });
    }
  }

  await persistLabels(context);
  return context.summary;
}

module.exports = {
  importTasksMd,
};
