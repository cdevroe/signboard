const CARD_ID_PATTERN = /-([A-Za-z0-9]{5})\.md$/;
const LIST_NAME_PATTERN = /^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/;
const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const DEFAULT_BOARD_LIST_NAMES = Object.freeze([
  '000-To-do-stock',
  '001-Doing-stock',
  '002-Done-stock',
  ARCHIVE_DIRECTORY_NAME,
]);
const DEFAULT_LABELS = Object.freeze([
  Object.freeze({
    id: 'label-1',
    name: 'Label 1',
    colorLight: '#22c55e',
    colorDark: '#16a34a',
  }),
  Object.freeze({
    id: 'label-2',
    name: 'Label 2',
    colorLight: '#3b82f6',
    colorDark: '#2563eb',
  }),
  Object.freeze({
    id: 'label-3',
    name: 'Label 3',
    colorLight: '#ef4444',
    colorDark: '#dc2626',
  }),
]);

function trimString(value) {
  return value == null ? '' : String(value).trim();
}

function slashPath(value) {
  return trimString(value).replace(/\\/g, '/').replace(/\/+/g, '/');
}

function getBaseName(value) {
  const parts = slashPath(value).replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function slugify(value, fallback = 'card') {
  const slug = trimString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || fallback;
}

function randomId(existingIds = new Set()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const seen = existingIds instanceof Set ? existingIds : new Set(existingIds || []);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const value = [...Array(5)]
      .map(() => alphabet.charAt(Math.floor(Math.random() * alphabet.length)))
      .join('');
    if (!seen.has(value)) {
      seen.add(value);
      return value;
    }
  }

  const fallback = Date.now().toString(36).slice(-5).padStart(5, '0');
  seen.add(fallback);
  return fallback;
}

function getCardFileId(filePath) {
  const match = getBaseName(filePath).match(CARD_ID_PATTERN);
  return match ? match[1] : '';
}

function buildSignboardCardUri(cardId) {
  const normalizedId = trimString(cardId);
  return normalizedId ? `signboard://open-card?id=${encodeURIComponent(normalizedId)}` : '';
}

function buildSignboardBoardUri(boardPath) {
  const normalizedPath = trimString(boardPath);
  return normalizedPath ? `signboard://open-board?path=${encodeURIComponent(normalizedPath)}` : '';
}

function extractSignboardCardId(value) {
  const input = trimString(value);
  if (!input) {
    return '';
  }

  try {
    const parsedUrl = new URL(input);
    if (parsedUrl.protocol === 'signboard:' && (parsedUrl.hostname || '').toLowerCase() === 'open-card') {
      return trimString(parsedUrl.searchParams.get('id'));
    }
  } catch {
    // Fall back to loose ID extraction.
  }

  const looseMatch = input.match(/[?&]id=([A-Za-z0-9]{5,64})\b/) || input.match(/\b([A-Za-z0-9]{5,64})\b/);
  return looseMatch ? looseMatch[1] : '';
}

function getListDisplayName(listDirectoryName) {
  const normalized = trimString(listDirectoryName);
  if (!normalized) {
    return 'Untitled';
  }

  if (normalized === ARCHIVE_DIRECTORY_NAME) {
    return 'Archive';
  }

  const match = normalized.match(LIST_NAME_PATTERN);
  if (match) {
    return trimString(match[2]) || 'Untitled';
  }

  return normalized.replace(/^\d+-/, '') || 'Untitled';
}

function cleanCardTitleFromFileName(filePath) {
  const basename = getBaseName(filePath).replace(/\.md$/i, '');
  return basename
    .replace(/^\d{3}-/, '')
    .replace(/-[A-Za-z0-9]{5}$/, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';
}

function buildCardFileName(index, title, existingIds = new Set()) {
  const order = String(Math.max(0, Number(index) || 0)).padStart(3, '0');
  const id = randomId(existingIds);
  return `${order}-${slugify(title)}-${id}.md`;
}

function buildBoardSettingsMarkdown() {
  const labelLines = DEFAULT_LABELS.flatMap((label) => ([
    `  - id: ${label.id}`,
    `    name: ${label.name}`,
    `    colorLight: ${label.colorLight}`,
    `    colorDark: ${label.colorDark}`,
  ]));

  return [
    '---',
    'labels:',
    ...labelLines,
    '---',
    '',
  ].join('\n');
}

function normalizeStringList(value) {
  const values = Array.isArray(value)
    ? value
    : (trimString(value) ? [value] : []);
  const seen = new Set();
  const normalized = [];

  for (const item of values) {
    const nextItem = trimString(item);
    if (!nextItem || seen.has(nextItem)) {
      continue;
    }
    seen.add(nextItem);
    normalized.push(nextItem);
  }

  return normalized;
}

function createObsidianNoteLinkedObject({ title, target, path } = {}) {
  const normalizedTarget = trimString(target);
  const normalizedPath = trimString(path);
  return {
    type: 'obsidian-note',
    title: trimString(title) || 'Obsidian note',
    target: normalizedTarget,
    ...(normalizedPath ? { path: normalizedPath } : {}),
  };
}

function getLinkedObjectKey(linkedObject = {}) {
  const type = trimString(linkedObject.type);
  if (type === 'obsidian-note') {
    return `${type}:${trimString(linkedObject.path) || trimString(linkedObject.target)}`;
  }
  if (type === 'file' || type === 'folder') {
    return `${type}:${trimString(linkedObject.path)}`;
  }
  if (type === 'url' || type === 'app-link' || type === 'signboard-link') {
    return `${type}:${trimString(linkedObject.url || linkedObject.target)}`;
  }
  return `${type}:${trimString(linkedObject.target || linkedObject.url || linkedObject.path || linkedObject.title)}`;
}

function addLinkedObjectToFrontmatter(frontmatter, linkedObject, relatedLink = '') {
  const target = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  const existingObjects = Array.isArray(target.linked_objects)
    ? target.linked_objects.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
  const linkedObjectKey = getLinkedObjectKey(linkedObject);
  const filteredObjects = linkedObjectKey
    ? existingObjects.filter((item) => getLinkedObjectKey(item) !== linkedObjectKey)
    : existingObjects;

  if (linkedObjectKey) {
    filteredObjects.push(linkedObject);
    target.linked_objects = filteredObjects;
  }

  const normalizedRelated = normalizeStringList(target.related);
  const normalizedRelatedLink = trimString(relatedLink);
  if (normalizedRelatedLink && !normalizedRelated.includes(normalizedRelatedLink)) {
    normalizedRelated.push(normalizedRelatedLink);
  }

  if (normalizedRelated.length > 0) {
    target.related = normalizedRelated;
  }

  return target;
}

module.exports = {
  ARCHIVE_DIRECTORY_NAME,
  DEFAULT_BOARD_LIST_NAMES,
  buildBoardSettingsMarkdown,
  buildCardFileName,
  buildSignboardBoardUri,
  buildSignboardCardUri,
  cleanCardTitleFromFileName,
  createObsidianNoteLinkedObject,
  extractSignboardCardId,
  getCardFileId,
  getListDisplayName,
  normalizeStringList,
  randomId,
  slashPath,
  slugify,
  addLinkedObjectToFrontmatter,
};
