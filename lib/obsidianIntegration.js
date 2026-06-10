const fs = require('fs').promises;
const path = require('path');
const { createHash } = require('crypto');
const yaml = require('js-yaml');

const CARD_ID_PATTERN = /-([A-Za-z0-9]{5})\.md$/;
const LIST_NAME_PATTERN = /^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/;
const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const DEFAULT_BASE_FILE_NAME = 'Signboard Board.base';
const LINKED_SIGNBOARD_NOTE_BASE_NAME = 'Linked Signboard Note';

function trimString(value) {
  return value == null ? '' : String(value).trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeFileSegment(value, fallback = 'Untitled') {
  const cleaned = trimString(value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || fallback;
}

function getBoardDisplayName(boardRoot) {
  const normalized = trimString(boardRoot).replace(/[\\/]+$/, '');
  return path.basename(normalized) || 'Board';
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

function getCardFileId(cardPath) {
  const match = path.basename(trimString(cardPath)).match(CARD_ID_PATTERN);
  return match ? match[1] : '';
}

function getSignboardCardId(cardPath, frontmatter = {}) {
  return getCardFileId(cardPath) || trimString(frontmatter.signboard_id);
}

function buildSignboardCardUri(cardId) {
  const normalizedId = trimString(cardId);
  return normalizedId ? `signboard://open-card?id=${encodeURIComponent(normalizedId)}` : '';
}

function buildObsidianUriQuery(params = []) {
  return params
    .filter((entry) => Array.isArray(entry) && trimString(entry[0]) && trimString(entry[1]))
    .map(([key, value]) => `${encodeURIComponent(trimString(key))}=${encodeURIComponent(trimString(value))}`)
    .join('&');
}

function buildObsidianOpenUri(filePath, options = {}) {
  const normalizedPath = trimString(filePath);
  if (!normalizedPath) {
    return '';
  }

  const params = [
    ['path', path.resolve(normalizedPath)],
  ];
  const paneType = trimString(options.paneType || 'tab');
  if (paneType) {
    params.push(['paneType', paneType]);
  }

  return `obsidian://open?${buildObsidianUriQuery(params)}`;
}

function normalizeStringList(value) {
  const source = Array.isArray(value)
    ? value
    : (trimString(value) ? [value] : []);
  const seen = new Set();
  const cleaned = [];

  for (const item of source) {
    const normalized = trimString(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    cleaned.push(normalized);
  }

  return cleaned;
}

function addUniqueStringListValue(value, nextItem) {
  const values = normalizeStringList(value);
  const normalizedItem = trimString(nextItem);
  if (normalizedItem && !values.includes(normalizedItem)) {
    values.push(normalizedItem);
  }
  return values;
}

function normalizeSignboardCardFrontmatter({
  boardRoot,
  cardPath,
  frontmatter = {},
} = {}) {
  const source = isObject(frontmatter) ? { ...frontmatter } : {};
  const cardId = getSignboardCardId(cardPath, source);
  const listDirectoryName = path.basename(path.dirname(trimString(cardPath)));
  const listDisplayName = getListDisplayName(listDirectoryName);

  if (cardId) {
    source.signboard_id = cardId;
    source.signboard_uri = buildSignboardCardUri(cardId);
  }

  source.signboard_board = getBoardDisplayName(boardRoot);
  source.signboard_list = listDisplayName;
  source.status = listDisplayName;

  const related = normalizeStringList(source.related);
  if (related.length > 0) {
    source.related = related;
  } else {
    delete source.related;
  }

  return source;
}

async function pathIsDirectory(candidatePath) {
  try {
    const stats = await fs.stat(candidatePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findObsidianVaultRoot(startPath) {
  let currentPath = path.resolve(trimString(startPath));
  if (!currentPath) {
    return '';
  }

  try {
    const stats = await fs.stat(currentPath);
    if (stats.isFile()) {
      currentPath = path.dirname(currentPath);
    }
  } catch {
    currentPath = path.dirname(currentPath);
  }

  while (currentPath && currentPath !== path.dirname(currentPath)) {
    if (await pathIsDirectory(path.join(currentPath, '.obsidian'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return '';
}

function toVaultRelativePath(vaultRoot, targetPath) {
  const relativePath = path.relative(path.resolve(vaultRoot), path.resolve(targetPath));
  return relativePath.split(path.sep).join('/');
}

function toObsidianLinkTarget(vaultRoot, notePath) {
  const relativePath = toVaultRelativePath(vaultRoot, notePath);
  return relativePath.replace(/\.md$/i, '');
}

function pathIsInsideRoot(rootPath, targetPath) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function hashBaseContent(content) {
  return createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function buildGeneratedBaseYaml(boardRoot, vaultRoot = '') {
  const boardName = getBoardDisplayName(boardRoot);
  const boardRelativeFolder = vaultRoot ? toVaultRelativePath(vaultRoot, boardRoot) : '';
  const filters = [
    'file.ext == "md"',
    `signboard_board == "${boardName.replace(/"/g, '\\"')}"`,
  ];

  if (boardRelativeFolder && boardRelativeFolder !== '.') {
    filters.push(`file.inFolder("${boardRelativeFolder.replace(/"/g, '\\"')}")`);
  }

  const config = {
    filters: {
      and: filters,
    },
    properties: {
      title: { displayName: 'Title' },
      signboard_board: { displayName: 'Board' },
      status: { displayName: 'Status' },
      due: { displayName: 'Due' },
      labels: { displayName: 'Labels' },
      related: { displayName: 'Related' },
      linked_objects: { displayName: 'Linked Objects' },
      signboard_uri: { displayName: 'Signboard' },
      'file.name': { displayName: 'File' },
      'file.mtime': { displayName: 'Modified' },
    },
    views: [
      {
        type: 'table',
        name: 'Cards',
        order: [
          'title',
          'status',
          'due',
          'labels',
          'related',
          'linked_objects',
          'signboard_uri',
          'file.name',
          'file.mtime',
        ],
      },
      {
        type: 'cards',
        name: 'Card Gallery',
        order: [
          'title',
          'status',
          'due',
          'labels',
          'file.name',
        ],
      },
    ],
  };

  return yaml.dump(config, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    noCompatMode: true,
    sortKeys: false,
  });
}

async function writeObsidianBaseFile(boardRoot) {
  const resolvedBoardRoot = path.resolve(trimString(boardRoot));
  const vaultRoot = await findObsidianVaultRoot(resolvedBoardRoot);
  const basePath = path.join(resolvedBoardRoot, DEFAULT_BASE_FILE_NAME);
  const baseYaml = buildGeneratedBaseYaml(resolvedBoardRoot, vaultRoot);
  await fs.writeFile(basePath, baseYaml, 'utf8');
  return {
    ok: true,
    basePath,
    vaultRoot,
    inVault: Boolean(vaultRoot),
    managedHash: hashBaseContent(baseYaml),
  };
}

async function writeManagedObsidianBaseFile(boardRoot, options = {}) {
  const resolvedBoardRoot = path.resolve(trimString(boardRoot));
  const vaultRoot = await findObsidianVaultRoot(resolvedBoardRoot);
  const basePath = path.join(resolvedBoardRoot, DEFAULT_BASE_FILE_NAME);

  if (!vaultRoot) {
    return {
      ok: true,
      basePath,
      vaultRoot: '',
      inVault: false,
      written: false,
      reason: 'NOT_IN_OBSIDIAN_VAULT',
      managedHash: '',
    };
  }

  const baseYaml = buildGeneratedBaseYaml(resolvedBoardRoot, vaultRoot);
  const generatedHash = hashBaseContent(baseYaml);
  const previousManagedHash = trimString(options.managedHash).toLowerCase();
  const force = options.force === true;
  let existingContent = '';
  let hasExistingBase = true;

  try {
    existingContent = await fs.readFile(basePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      hasExistingBase = false;
    } else {
      throw error;
    }
  }

  if (!hasExistingBase || force) {
    await fs.writeFile(basePath, baseYaml, 'utf8');
    return {
      ok: true,
      basePath,
      vaultRoot,
      inVault: true,
      written: true,
      reason: hasExistingBase ? 'FORCED' : 'CREATED',
      managedHash: generatedHash,
    };
  }

  const existingHash = hashBaseContent(existingContent);
  if (existingHash === generatedHash) {
    return {
      ok: true,
      basePath,
      vaultRoot,
      inVault: true,
      written: false,
      reason: 'UNCHANGED',
      managedHash: generatedHash,
    };
  }

  if (previousManagedHash && existingHash === previousManagedHash) {
    await fs.writeFile(basePath, baseYaml, 'utf8');
    return {
      ok: true,
      basePath,
      vaultRoot,
      inVault: true,
      written: true,
      reason: 'UPDATED',
      managedHash: generatedHash,
    };
  }

  return {
    ok: true,
    basePath,
    vaultRoot,
    inVault: true,
    written: false,
    reason: 'USER_MODIFIED',
    managedHash: previousManagedHash,
  };
}

function buildLinkedNoteContent({
  cardId,
  boardName,
} = {}) {
  const signboardUri = buildSignboardCardUri(cardId);
  const frontmatter = yaml.dump({
    signboard_card_id: cardId,
    signboard_board: boardName,
    signboard_uri: signboardUri,
  }, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    noCompatMode: true,
    sortKeys: false,
  });

  return [
    '---',
    frontmatter.trimEnd(),
    '---',
    '',
  ].join('\n');
}

async function createLinkedObsidianNote({
  boardRoot,
  cardPath,
  card,
} = {}) {
  const resolvedBoardRoot = path.resolve(trimString(boardRoot));
  const resolvedCardPath = path.resolve(trimString(cardPath));
  const sourceCard = isObject(card) ? card : {};
  const frontmatter = isObject(sourceCard.frontmatter) ? sourceCard.frontmatter : {};
  const boardName = getBoardDisplayName(resolvedBoardRoot);
  const cardId = getSignboardCardId(resolvedCardPath, frontmatter);
  const vaultRoot = await findObsidianVaultRoot(resolvedBoardRoot);
  const noteFileNameBase = sanitizeFileSegment(LINKED_SIGNBOARD_NOTE_BASE_NAME, LINKED_SIGNBOARD_NOTE_BASE_NAME);
  let notePath = path.join(resolvedBoardRoot, `${noteFileNameBase}.md`);
  let suffix = 2;

  while (true) {
    try {
      await fs.access(notePath);
      notePath = path.join(resolvedBoardRoot, `${noteFileNameBase} ${suffix}.md`);
      suffix += 1;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        break;
      }
      throw error;
    }
  }

  await fs.writeFile(notePath, buildLinkedNoteContent({
    cardId,
    boardName,
  }), 'utf8');

  const linkTarget = vaultRoot
    ? `[[${toObsidianLinkTarget(vaultRoot, notePath)}]]`
    : notePath;

  return {
    ok: true,
    notePath,
    linkTarget,
    vaultRoot,
    inVault: Boolean(vaultRoot),
  };
}

async function createLinkedObsidianNoteAtPath({
  boardRoot,
  cardPath,
  card,
  notePath,
} = {}) {
  const resolvedBoardRoot = path.resolve(trimString(boardRoot));
  const resolvedCardPath = path.resolve(trimString(cardPath));
  const resolvedNotePath = path.resolve(trimString(notePath));
  const sourceCard = isObject(card) ? card : {};
  const frontmatter = isObject(sourceCard.frontmatter) ? sourceCard.frontmatter : {};
  const boardName = getBoardDisplayName(resolvedBoardRoot);
  const cardId = getSignboardCardId(resolvedCardPath, frontmatter);
  const vaultRoot = await findObsidianVaultRoot(resolvedCardPath || resolvedBoardRoot);

  if (!vaultRoot) {
    return {
      ok: false,
      error: 'NOT_IN_OBSIDIAN_VAULT',
      notePath: resolvedNotePath,
      vaultRoot: '',
      inVault: false,
    };
  }

  if (!pathIsInsideRoot(vaultRoot, resolvedNotePath)) {
    return {
      ok: false,
      error: 'NOTE_OUTSIDE_OBSIDIAN_VAULT',
      notePath: resolvedNotePath,
      vaultRoot,
      inVault: true,
    };
  }

  if (await fileExists(resolvedNotePath)) {
    return {
      ok: false,
      error: 'NOTE_ALREADY_EXISTS',
      notePath: resolvedNotePath,
      vaultRoot,
      inVault: true,
      linkTarget: `[[${toObsidianLinkTarget(vaultRoot, resolvedNotePath)}]]`,
    };
  }

  await fs.mkdir(path.dirname(resolvedNotePath), { recursive: true });
  await fs.writeFile(resolvedNotePath, buildLinkedNoteContent({
    cardId,
    boardName,
  }), 'utf8');

  return {
    ok: true,
    notePath: resolvedNotePath,
    linkTarget: `[[${toObsidianLinkTarget(vaultRoot, resolvedNotePath)}]]`,
    vaultRoot,
    inVault: true,
  };
}

function parseObsidianWikilink(value) {
  const raw = trimString(value);
  const match = raw.match(/^!?\[\[([^\]]+)\]\]$/);
  if (!match) {
    return null;
  }

  const inner = trimString(match[1]);
  const pipeIndex = inner.indexOf('|');
  const targetWithAnchor = trimString(pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner);
  const alias = trimString(pipeIndex >= 0 ? inner.slice(pipeIndex + 1) : '');
  const target = trimString(targetWithAnchor.split('#')[0]).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!target) {
    return null;
  }

  const targetBaseName = path.basename(target).replace(/\.md$/i, '');
  return {
    raw,
    target,
    alias,
    displayName: alias || targetBaseName || target,
  };
}

async function fileExists(candidatePath) {
  try {
    const stats = await fs.stat(candidatePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function findVaultNoteByFileName(vaultRoot, fileName) {
  const stack = [path.resolve(vaultRoot)];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === '.obsidian') {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return entryPath;
      }

      if (entry.isDirectory()) {
        stack.push(entryPath);
      }
    }
  }

  return '';
}

async function resolveObsidianRelatedNote({
  boardRoot,
  cardPath,
  related,
} = {}) {
  const parsed = parseObsidianWikilink(related);
  if (!parsed) {
    return {
      ok: false,
      error: 'INVALID_OBSIDIAN_LINK',
    };
  }

  const vaultRoot = await findObsidianVaultRoot(cardPath || boardRoot);
  if (!vaultRoot) {
    return {
      ok: false,
      error: 'NOT_IN_OBSIDIAN_VAULT',
      parsed,
      vaultRoot: '',
    };
  }

  if (path.isAbsolute(parsed.target)) {
    return {
      ok: false,
      error: 'INVALID_OBSIDIAN_LINK',
      parsed,
      vaultRoot,
    };
  }

  const relativeNotePath = parsed.target.endsWith('.md') ? parsed.target : `${parsed.target}.md`;
  const directNotePath = path.resolve(vaultRoot, relativeNotePath);
  if (!pathIsInsideRoot(vaultRoot, directNotePath)) {
    return {
      ok: false,
      error: 'INVALID_OBSIDIAN_LINK',
      parsed,
      vaultRoot,
    };
  }

  let notePath = '';
  if (await fileExists(directNotePath)) {
    notePath = directNotePath;
  } else if (!parsed.target.includes('/')) {
    notePath = await findVaultNoteByFileName(vaultRoot, path.basename(relativeNotePath));
  }

  if (!notePath) {
    return {
      ok: false,
      error: 'NOTE_NOT_FOUND',
      parsed,
      vaultRoot,
      notePath: directNotePath,
    };
  }

  return {
    ok: true,
    parsed,
    notePath,
    vaultRoot,
    obsidianUri: buildObsidianOpenUri(notePath),
  };
}

module.exports = {
  DEFAULT_BASE_FILE_NAME,
  addUniqueStringListValue,
  buildGeneratedBaseYaml,
  buildObsidianOpenUri,
  buildSignboardCardUri,
  createLinkedObsidianNote,
  createLinkedObsidianNoteAtPath,
  findObsidianVaultRoot,
  getCardFileId,
  getSignboardCardId,
  hashBaseContent,
  normalizeSignboardCardFrontmatter,
  normalizeStringList,
  parseObsidianWikilink,
  resolveObsidianRelatedNote,
  toObsidianLinkTarget,
  writeManagedObsidianBaseFile,
  writeObsidianBaseFile,
};
