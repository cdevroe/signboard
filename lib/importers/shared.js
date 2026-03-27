const fs = require('fs').promises;
const path = require('path');
const boardLabels = require('../boardLabels');
const cardFrontmatter = require('../cardFrontmatter');
const { ARCHIVE_DIRECTORY_NAME } = require('../cliBoard');

const IMPORT_LABEL_COLOR_PALETTE = [
  { colorLight: '#f59e0b', colorDark: '#d97706' },
  { colorLight: '#a855f7', colorDark: '#7e22ce' },
  { colorLight: '#14b8a6', colorDark: '#0f766e' },
  { colorLight: '#ec4899', colorDark: '#be185d' },
  { colorLight: '#84cc16', colorDark: '#4d7c0f' },
  { colorLight: '#f97316', colorDark: '#c2410c' },
];

const TRELLO_COLOR_MAP = Object.freeze({
  green: { colorLight: '#22c55e', colorDark: '#16a34a' },
  yellow: { colorLight: '#eab308', colorDark: '#ca8a04' },
  orange: { colorLight: '#f97316', colorDark: '#c2410c' },
  red: { colorLight: '#ef4444', colorDark: '#dc2626' },
  purple: { colorLight: '#a855f7', colorDark: '#7e22ce' },
  blue: { colorLight: '#3b82f6', colorDark: '#2563eb' },
  sky: { colorLight: '#0ea5e9', colorDark: '#0284c7' },
  lime: { colorLight: '#84cc16', colorDark: '#65a30d' },
  pink: { colorLight: '#ec4899', colorDark: '#db2777' },
  black: { colorLight: '#475569', colorDark: '#334155' },
});

function randomSuffix(length = 5) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return output;
}

function zeroPadNumber(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(3, '0');
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

function slugifyIdentifier(rawValue) {
  const cleaned = String(rawValue || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'item';
}

function normalizeAbsolutePath(rawPath) {
  const candidate = String(rawPath || '').trim();
  return candidate ? path.resolve(candidate) : '';
}

function formatLocalIsoDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeIsoDateFromValue(value) {
  if (value == null) {
    return '';
  }

  const candidate = String(value).trim();
  if (!candidate) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return candidate;
  }

  const asDate = new Date(candidate);
  if (!Number.isNaN(asDate.getTime())) {
    return formatLocalIsoDate(asDate);
  }

  return '';
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

async function readDirectoryEntries(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function getNextListPrefix(boardRoot) {
  const entries = await readDirectoryEntries(boardRoot);
  let maxPrefix = -1;

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIRECTORY_NAME) {
      continue;
    }

    const match = String(entry.name).match(/^(\d{3})-/);
    if (!match) {
      continue;
    }

    const prefix = Number(match[1]);
    if (Number.isFinite(prefix) && prefix > maxPrefix) {
      maxPrefix = prefix;
    }
  }

  return maxPrefix + 1;
}

async function getNextCardPrefix(listPath) {
  const entries = await readDirectoryEntries(listPath);
  let maxPrefix = -1;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const match = String(entry.name).match(/^(\d{3})-/);
    if (!match) {
      continue;
    }

    const prefix = Number(match[1]);
    if (Number.isFinite(prefix) && prefix > maxPrefix) {
      maxPrefix = prefix;
    }
  }

  return maxPrefix + 1;
}

function normalizeLabelName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeHexColor(value, fallback) {
  const source = String(value || '').trim().toLowerCase();
  if (!source) {
    return fallback;
  }

  if (/^#?[a-f0-9]{3}$/.test(source)) {
    const compact = source.replace('#', '');
    return `#${compact[0]}${compact[0]}${compact[1]}${compact[1]}${compact[2]}${compact[2]}`;
  }

  if (/^#?[a-f0-9]{6}$/.test(source)) {
    return source.startsWith('#') ? source : `#${source}`;
  }

  return fallback;
}

function normalizeImportedLabelColors(rawColors = {}, fallbackIndex = 0) {
  const fallback = IMPORT_LABEL_COLOR_PALETTE[fallbackIndex % IMPORT_LABEL_COLOR_PALETTE.length];
  return {
    colorLight: normalizeHexColor(rawColors.colorLight, fallback.colorLight),
    colorDark: normalizeHexColor(rawColors.colorDark, fallback.colorDark),
  };
}

function getTrelloLabelColors(colorName, fallbackIndex = 0) {
  const normalized = String(colorName || '').trim().toLowerCase();
  const mapped = TRELLO_COLOR_MAP[normalized];
  return normalizeImportedLabelColors(mapped || {}, fallbackIndex);
}

function createSummary(importer, sourcePaths = []) {
  return {
    ok: true,
    importer,
    sources: Array.isArray(sourcePaths) ? sourcePaths.map((entry) => String(entry || '')) : [],
    listsCreated: 0,
    cardsCreated: 0,
    labelsCreated: 0,
    archivedCards: 0,
    warnings: [],
  };
}

async function createImportContext(boardRoot, importer, sourcePaths = []) {
  const resolvedBoardRoot = normalizeAbsolutePath(boardRoot);
  if (!resolvedBoardRoot) {
    throw new Error('Board root is required.');
  }

  const settings = await boardLabels.readBoardSettings(resolvedBoardRoot, { ensureFile: true });
  const existingEntries = await readDirectoryEntries(resolvedBoardRoot);
  const existingListNames = new Set();

  for (const entry of existingEntries) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIRECTORY_NAME) {
      continue;
    }

    const match = String(entry.name).match(/^\d{3}-(.*?)-(?:[^-]{5}|stock)$/);
    if (match && match[1]) {
      existingListNames.add(String(match[1]).toLowerCase());
    }
  }

  const labelNameToId = new Map();
  const labels = Array.isArray(settings.labels) ? settings.labels.map((label) => ({ ...label })) : [];
  for (const label of labels) {
    const normalized = normalizeLabelName(label.name);
    if (normalized && !labelNameToId.has(normalized)) {
      labelNameToId.set(normalized, label.id);
    }
  }

  return {
    boardRoot: resolvedBoardRoot,
    importer,
    sourcePaths: Array.isArray(sourcePaths) ? sourcePaths.map((entry) => normalizeAbsolutePath(entry)) : [],
    summary: createSummary(importer, sourcePaths),
    nextListPrefix: await getNextListPrefix(resolvedBoardRoot),
    nextCardPrefixByListPath: new Map(),
    existingListNames,
    labels,
    labelNameToId,
    labelIdSet: new Set(labels.map((label) => String(label.id || ''))),
    labelsDirty: false,
  };
}

function addWarning(context, message) {
  const warning = String(message || '').trim();
  if (!warning) {
    return;
  }

  if (!context.summary.warnings.includes(warning)) {
    context.summary.warnings.push(warning);
  }
}

function createUniqueLabelId(context, baseName) {
  const baseId = `import-${slugifyIdentifier(baseName)}`;
  let candidate = baseId;
  let suffix = 2;

  while (context.labelIdSet.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  context.labelIdSet.add(candidate);
  return candidate;
}

async function ensureLabel(context, rawName, rawColors = {}) {
  const labelName = String(rawName || '').trim();
  if (!labelName) {
    return '';
  }

  const normalized = normalizeLabelName(labelName);
  const existingId = context.labelNameToId.get(normalized);
  if (existingId) {
    return existingId;
  }

  const colors = normalizeImportedLabelColors(rawColors, context.labels.length);
  const label = {
    id: createUniqueLabelId(context, labelName),
    name: labelName,
    colorLight: colors.colorLight,
    colorDark: colors.colorDark,
  };

  context.labels.push(label);
  context.labelNameToId.set(normalized, label.id);
  context.labelsDirty = true;
  context.summary.labelsCreated += 1;
  return label.id;
}

async function persistLabels(context) {
  if (!context.labelsDirty) {
    return;
  }

  const nextSettings = await boardLabels.updateBoardSettings(context.boardRoot, {
    labels: context.labels,
  });
  context.labels = Array.isArray(nextSettings.labels) ? nextSettings.labels.map((label) => ({ ...label })) : [];
  context.labelsDirty = false;
}

function makeListNameUnique(context, rawName) {
  const original = sanitizeListName(rawName);
  let candidate = original;
  let suffix = 2;

  while (context.existingListNames.has(candidate.toLowerCase())) {
    candidate = `${original} (${suffix})`;
    suffix += 1;
  }

  context.existingListNames.add(candidate.toLowerCase());
  return candidate;
}

async function createList(context, rawName) {
  const displayName = makeListNameUnique(context, rawName);
  const directoryName = `${zeroPadNumber(context.nextListPrefix)}-${sanitizeListName(displayName)}-${randomSuffix()}`;
  const listPath = path.join(context.boardRoot, directoryName);
  context.nextListPrefix += 1;
  await fs.mkdir(listPath, { recursive: false });
  context.nextCardPrefixByListPath.set(listPath, 0);
  context.summary.listsCreated += 1;

  return {
    displayName,
    directoryName,
    path: listPath,
  };
}

async function ensureArchiveList(context) {
  const archivePath = path.join(context.boardRoot, ARCHIVE_DIRECTORY_NAME);
  if (!(await pathExists(archivePath))) {
    await fs.mkdir(archivePath, { recursive: true });
  }

  if (!context.nextCardPrefixByListPath.has(archivePath)) {
    context.nextCardPrefixByListPath.set(archivePath, await getNextCardPrefix(archivePath));
  }

  return {
    displayName: 'Archive',
    directoryName: ARCHIVE_DIRECTORY_NAME,
    path: archivePath,
  };
}

async function getNextCardPrefixForList(context, listPath) {
  if (context.nextCardPrefixByListPath.has(listPath)) {
    const nextPrefix = context.nextCardPrefixByListPath.get(listPath);
    context.nextCardPrefixByListPath.set(listPath, nextPrefix + 1);
    return nextPrefix;
  }

  const nextPrefix = await getNextCardPrefix(listPath);
  context.nextCardPrefixByListPath.set(listPath, nextPrefix + 1);
  return nextPrefix;
}

function normalizeSectionBody(body) {
  const text = typeof body === 'string' ? body.replace(/\s+$/, '') : '';
  return text.trim() ? text.replace(/^\n+/, '') : '';
}

function buildMarkdownSection(title, body) {
  const normalizedBody = normalizeSectionBody(body);
  if (!normalizedBody) {
    return '';
  }

  return `## ${String(title || '').trim()}\n\n${normalizedBody}`;
}

function buildMetadataBody(metadata = {}) {
  const lines = [];
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    const label = String(key || '').trim();
    if (!label) {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`- **${label}:** ${value.join(', ')}`);
      continue;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      continue;
    }

    lines.push(`- **${label}:** ${normalized}`);
  }

  return lines.join('\n');
}

function appendSections(baseBody = '', sections = []) {
  const parts = [];
  const normalizedBase = normalizeSectionBody(baseBody);
  if (normalizedBase) {
    parts.push(normalizedBase);
  }

  for (const section of Array.isArray(sections) ? sections : []) {
    const normalized = normalizeSectionBody(section);
    if (normalized) {
      parts.push(normalized);
    }
  }

  return parts.join('\n\n');
}

async function createCard(context, listEntry, card = {}) {
  const targetList = listEntry && listEntry.path ? listEntry : await ensureArchiveList(context);
  const title = String(card.title || '').trim() || 'Untitled';
  const nextPrefix = await getNextCardPrefixForList(context, targetList.path);
  const fileName = `${zeroPadNumber(nextPrefix)}-${sanitizeCardSlug(title).slice(0, 40)}-${randomSuffix()}.md`;
  const filePath = path.join(targetList.path, fileName);
  const normalizedFrontmatter = {
    title,
    due: normalizeIsoDateFromValue(card.due),
    labels: Array.isArray(card.labels) ? card.labels.filter(Boolean) : [],
  };

  await cardFrontmatter.writeCard(filePath, {
    frontmatter: normalizedFrontmatter,
    body: typeof card.body === 'string' ? card.body : '',
  });

  context.summary.cardsCreated += 1;
  if (targetList.directoryName === ARCHIVE_DIRECTORY_NAME) {
    context.summary.archivedCards += 1;
  }

  return {
    filePath,
    fileName,
    listPath: targetList.path,
  };
}

async function walkMarkdownFiles(rootPath, options = {}) {
  const ignoreNames = new Set(Array.isArray(options.ignoreNames) ? options.ignoreNames : ['.git', '.obsidian', 'node_modules']);
  const results = [];
  const resolvedRoot = normalizeAbsolutePath(rootPath);
  if (!resolvedRoot) {
    return results;
  }

  const stats = await fs.stat(resolvedRoot);
  if (stats.isFile()) {
    if (resolvedRoot.endsWith('.md')) {
      results.push(resolvedRoot);
    }
    return results;
  }

  const queue = [resolvedRoot];
  while (queue.length > 0) {
    const currentPath = queue.shift();
    const entries = await readDirectoryEntries(currentPath);
    for (const entry of entries) {
      if (ignoreNames.has(entry.name)) {
        continue;
      }

      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(nextPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(nextPath);
      }
    }
  }

  return results.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function normalizeFrontmatterTags(frontmatter = {}) {
  const values = [];
  const source = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  const candidates = [source.tags, source.tag];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      values.push(...candidate);
      continue;
    }

    if (typeof candidate === 'string') {
      values.push(...candidate.split(','));
    }
  }

  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    const tag = String(value || '').trim().replace(/^#/, '');
    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

function collectInlineTags(text) {
  const matches = [];
  const pattern = /(^|\s)#([A-Za-z0-9/_-]+)/g;
  let match;
  while ((match = pattern.exec(String(text || '')))) {
    matches.push(match[2]);
  }
  return matches;
}

module.exports = {
  ARCHIVE_DIRECTORY_NAME,
  appendSections,
  addWarning,
  buildMarkdownSection,
  buildMetadataBody,
  collectInlineTags,
  createCard,
  createImportContext,
  createList,
  createSummary,
  ensureArchiveList,
  ensureLabel,
  formatLocalIsoDate,
  getTrelloLabelColors,
  normalizeAbsolutePath,
  normalizeFrontmatterTags,
  normalizeHexColor,
  normalizeImportedLabelColors,
  normalizeIsoDateFromValue,
  pathExists,
  persistLabels,
  randomSuffix,
  readDirectoryEntries,
  sanitizeCardSlug,
  sanitizeListName,
  slugifyIdentifier,
  walkMarkdownFiles,
};
