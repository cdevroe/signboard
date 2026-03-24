const fs = require('fs').promises;
const path = require('path');
const cardFrontmatter = require('../cardFrontmatter');
const {
  addWarning,
  appendSections,
  buildMarkdownSection,
  buildMetadataBody,
  collectInlineTags,
  createCard,
  createImportContext,
  createList,
  ensureLabel,
  formatLocalIsoDate,
  normalizeAbsolutePath,
  normalizeFrontmatterTags,
  normalizeImportedLabelColors,
  normalizeIsoDateFromValue,
  persistLabels,
  readDirectoryEntries,
  walkMarkdownFiles,
} = require('./shared');

const OBSIDIAN_KANBAN_SETTINGS_PATTERN = /%%\s*kanban:settings[\s\S]*?%%/i;
const OBSIDIAN_KANBAN_FRONTMATTER_PATTERN = /(^|\n)kanban-plugin:\s*board(?:\s|$)/i;
const TASK_LINE_PATTERN = /^([ \t]*)([-*+])\s+\[([ xX✓✔])\]\s+(.*)$/;
const TASK_LIST_KANBAN_COLUMN_PATTERN = /#\[([^\]]+)\]/g;
const CARD_BOARD_DUE_PATTERNS = [
  { type: 'cardboard', pattern: /@due\(([^)]+)\)/i },
  { type: 'dataview', pattern: /\[due::\s*([^\]]+)\]/i },
  { type: 'tasks', pattern: /📅\s*(\d{4}-\d{2}-\d{2})/i },
  { type: 'kanban', pattern: /@\{(\d{4}-\d{2}-\d{2})\}/i },
];
const CARD_BOARD_COMPLETED_PATTERNS = [
  /@completed\(([^)]+)\)/i,
  /✅\s*(\d{4}-\d{2}-\d{2}(?:T[0-9:.+-Z]+)?)/i,
];

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

function getFileStem(filePath) {
  return path.basename(String(filePath || ''), path.extname(String(filePath || '')));
}

function isObsidianKanbanContent(rawContent) {
  const source = String(rawContent || '');
  return OBSIDIAN_KANBAN_FRONTMATTER_PATTERN.test(source) || OBSIDIAN_KANBAN_SETTINGS_PATTERN.test(source);
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

function extractTaskColumnTags(text) {
  const tags = [];
  let match;
  const source = String(text || '');
  while ((match = TASK_LIST_KANBAN_COLUMN_PATTERN.exec(source))) {
    const tag = String(match[1] || '').trim();
    if (tag) {
      tags.push(tag);
    }
  }

  return dedupeStrings(tags);
}

function stripColumnTags(text) {
  return String(text || '').replace(TASK_LIST_KANBAN_COLUMN_PATTERN, '').replace(/\s+/g, ' ').trim();
}

function parseDueFromText(text) {
  const source = String(text || '');

  for (const matcher of CARD_BOARD_DUE_PATTERNS) {
    const match = source.match(matcher.pattern);
    if (!match) {
      continue;
    }

    const rawValue = String(match[1] || '').trim();
    if (!rawValue || rawValue.toLowerCase() === 'none') {
      return {
        type: matcher.type,
        raw: rawValue,
        due: '',
      };
    }

    return {
      type: matcher.type,
      raw: rawValue,
      due: normalizeIsoDateFromValue(rawValue),
    };
  }

  return null;
}

function parseCompletedFromText(text) {
  const source = String(text || '');
  for (const pattern of CARD_BOARD_COMPLETED_PATTERNS) {
    const match = source.match(pattern);
    if (!match) {
      continue;
    }

    const rawValue = String(match[1] || '').trim();
    if (!rawValue) {
      continue;
    }

    return {
      raw: rawValue,
      iso: normalizeIsoDateFromValue(rawValue),
    };
  }

  return null;
}

function stripConsumedTaskMetadata(text) {
  return String(text || '')
    .replace(TASK_LIST_KANBAN_COLUMN_PATTERN, '')
    .replace(/@\{(\d{4}-\d{2}-\d{2})\}/g, '')
    .replace(/@due\(([^)]+)\)/gi, '')
    .replace(/\[due::\s*[^\]]+\]/gi, '')
    .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
    .replace(/@completed\(([^)]+)\)/gi, '')
    .replace(/✅\s*\d{4}-\d{2}-\d{2}(?:T[0-9:.+-Z]+)?/g, '')
    .replace(/(^|\s)#([A-Za-z0-9/_-]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMarkdownTaskBlocks(rawContent, filePath) {
  const parsed = cardFrontmatter.parseCardContent(String(rawContent || ''));
  const body = String(parsed?.body || rawContent || '');
  const noteTags = normalizeFrontmatterTags(parsed?.frontmatter || {});
  const fileStem = getFileStem(filePath);
  const derivedDate = /^\d{4}-\d{2}-\d{2}$/.test(fileStem) ? fileStem : '';
  const lines = body.split(/\r?\n/);
  const tasks = [];
  let currentTask = null;

  function finalizeCurrentTask() {
    if (!currentTask) {
      return;
    }

    currentTask.body = currentTask.bodyLines.join('\n').replace(/\s+$/, '');
    currentTask.tags = dedupeStrings([
      ...noteTags,
      ...collectInlineTags(currentTask.rawLine),
    ]);
    currentTask.columnTags = dedupeStrings(extractTaskColumnTags(currentTask.rawLine));
    currentTask.dueInfo = parseDueFromText(currentTask.rawLine);
    currentTask.completedInfo = parseCompletedFromText(currentTask.rawLine);
    currentTask.due = currentTask.dueInfo && currentTask.dueInfo.due
      ? currentTask.dueInfo.due
      : derivedDate;
    currentTask.cleanedTitle = stripConsumedTaskMetadata(currentTask.rawLine);
    tasks.push(currentTask);
    currentTask = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(TASK_LINE_PATTERN);
    if (match && String(match[1] || '').length === 0) {
      finalizeCurrentTask();
      const checkboxValue = String(match[3] || '').replace(/\s+/g, '').toLowerCase();
      currentTask = {
        filePath,
        lineNumber: index + 1,
        rawLine: String(match[4] || ''),
        checked: checkboxValue === 'x' || checkboxValue === '✓' || checkboxValue === '✔',
        bodyLines: [],
      };
      continue;
    }

    if (currentTask) {
      currentTask.bodyLines.push(line);
    }
  }

  finalizeCurrentTask();
  return tasks;
}

function buildObsidianMetadataSection(metadata = {}) {
  return buildMarkdownSection('Imported metadata', buildMetadataBody(metadata));
}

function prefixListName(sourceName, listName, shouldPrefix) {
  const baseListName = String(listName || '').trim() || 'Untitled';
  if (!shouldPrefix) {
    return baseListName;
  }

  return `${String(sourceName || 'Imported').trim() || 'Imported'} - ${baseListName}`;
}

async function ensureLabelsForTags(context, tags = []) {
  const labelIds = [];
  const uniqueTags = dedupeStrings(tags);
  for (const tag of uniqueTags) {
    const colors = normalizeImportedLabelColors({}, labelIds.length);
    const labelId = await ensureLabel(context, tag, colors);
    if (labelId) {
      labelIds.push(labelId);
    }
  }

  return labelIds;
}

function createTaskBody(task, metadataSection, extraSections = []) {
  const sections = [];
  const body = String(task?.body || '').trim();
  if (body) {
    sections.push(body);
  }

  for (const section of extraSections) {
    if (section) {
      sections.push(section);
    }
  }

  sections.push(metadataSection);
  return appendSections('', sections);
}

function parseObsidianKanbanColumns(rawContent, filePath) {
  const lines = String(rawContent || '').split(/\r?\n/);
  const columns = [];
  let currentColumn = null;
  let currentCard = null;

  function finalizeCard() {
    if (!currentColumn || !currentCard) {
      return;
    }

    currentCard.body = currentCard.bodyLines.join('\n').replace(/\s+$/, '');
    currentColumn.cards.push(currentCard);
    currentCard = null;
  }

  function finalizeColumn() {
    finalizeCard();
    if (currentColumn) {
      columns.push(currentColumn);
      currentColumn = null;
    }
  }

  for (const rawLine of lines) {
    if (/^##\s+/.test(rawLine)) {
      finalizeColumn();
      currentColumn = {
        name: rawLine.replace(/^##\s+/, '').trim() || 'Untitled',
        cards: [],
      };
      continue;
    }

    if (!currentColumn) {
      continue;
    }

    const match = rawLine.match(TASK_LINE_PATTERN);
    if (match && String(match[1] || '').length === 0) {
      finalizeCard();
      currentCard = {
        rawLine: String(match[4] || ''),
        checked: String(match[3] || '').replace(/\s+/g, '').toLowerCase() === 'x',
        bodyLines: [],
      };
      continue;
    }

    if (currentCard) {
      currentCard.bodyLines.push(rawLine);
    }
  }

  finalizeColumn();

  return columns.map((column) => ({
    ...column,
    filePath,
    cards: column.cards.map((card) => {
      const dueInfo = parseDueFromText(card.rawLine);
      const tags = collectInlineTags(card.rawLine);
      return {
        ...card,
        due: dueInfo && dueInfo.due ? dueInfo.due : '',
        tags,
        cleanedTitle: stripConsumedTaskMetadata(card.rawLine),
      };
    }),
  }));
}

async function importObsidianKanbanBoard(context, board, shouldPrefix) {
  const columns = parseObsidianKanbanColumns(board.rawContent, board.filePath);
  const createdLists = new Map();
  const sourceName = board.sourceName;

  for (const column of columns) {
    const listEntry = await createList(context, prefixListName(sourceName, column.name, shouldPrefix));
    createdLists.set(column.name, listEntry);
  }

  for (const column of columns) {
    const targetList = createdLists.get(column.name);
    for (const card of column.cards) {
      const labelIds = await ensureLabelsForTags(context, card.tags);
      const metadataSection = buildObsidianMetadataSection({
        Source: 'Obsidian Kanban',
        'Source board': sourceName,
        'Source file': board.filePath,
        'Source column': column.name,
        'Original card line': card.rawLine,
        'Completed in source': card.checked ? 'Yes' : '',
      });
      const body = createTaskBody(card, metadataSection);

      await createCard(context, targetList, {
        title: card.cleanedTitle || 'Untitled',
        due: card.due,
        labels: labelIds,
        body,
      });
    }
  }
}

function extractCardBoardBoardsFromValue(value, results = []) {
  if (!value || typeof value !== 'object') {
    return results;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      extractCardBoardBoardsFromValue(entry, results);
    }
    return results;
  }

  if (Array.isArray(value.columns) && typeof value.name === 'string' && value.name.trim()) {
    results.push(value);
  }

  for (const entry of Object.values(value)) {
    extractCardBoardBoardsFromValue(entry, results);
  }

  return results;
}

function normalizeCardBoardColumn(rawColumn = {}, index = 0) {
  const candidateNames = [
    rawColumn.name,
    rawColumn.title,
    rawColumn.label,
    rawColumn.displayName,
  ].filter(Boolean);
  const name = String(candidateNames[0] || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
  const typeHint = [
    rawColumn.type,
    rawColumn.kind,
    rawColumn.columnType,
    rawColumn.variant,
    rawColumn.mode,
    name,
  ].filter(Boolean).join(' ').toLowerCase();
  const tagValue = String(
    rawColumn.tag ||
    rawColumn.tagName ||
    rawColumn.value ||
    rawColumn.columnTag ||
    ''
  ).replace(/^#/, '').trim();

  if (typeHint.includes('completed') || name.toLowerCase() === 'completed') {
    return { kind: 'completed', name, raw: rawColumn };
  }

  if (typeHint.includes('untagged')) {
    return { kind: 'untagged', name, raw: rawColumn };
  }

  if (typeHint.includes('other') && typeHint.includes('tag')) {
    return { kind: 'other-tags', name, raw: rawColumn };
  }

  if (typeHint.includes('undated')) {
    return { kind: 'undated', name, raw: rawColumn };
  }

  if (tagValue || typeHint.includes('tag')) {
    return {
      kind: 'tag',
      name,
      tag: tagValue || name.replace(/^#/, '').trim(),
      raw: rawColumn,
    };
  }

  const from = rawColumn.from ?? rawColumn.start ?? rawColumn.left ?? rawColumn.lower;
  const to = rawColumn.to ?? rawColumn.end ?? rawColumn.right ?? rawColumn.upper;
  const before = rawColumn.before ?? rawColumn.max ?? rawColumn.dayBefore;
  const after = rawColumn.after ?? rawColumn.min ?? rawColumn.dayAfter;

  if (Number.isFinite(Number(from)) && Number.isFinite(Number(to))) {
    return { kind: 'between', name, from: Number(from), to: Number(to), raw: rawColumn };
  }

  if (Number.isFinite(Number(before))) {
    return { kind: 'before', name, before: Number(before), raw: rawColumn };
  }

  if (Number.isFinite(Number(after))) {
    return { kind: 'after', name, after: Number(after), raw: rawColumn };
  }

  if (typeHint.includes('overdue')) {
    return { kind: 'before', name, before: 0, raw: rawColumn };
  }

  if (typeHint.includes('tomorrow')) {
    return { kind: 'between', name, from: 1, to: 1, raw: rawColumn };
  }

  if (typeHint.includes('today')) {
    return { kind: 'between', name, from: 0, to: 0, raw: rawColumn };
  }

  return { kind: 'unknown', name, raw: rawColumn };
}

function differenceInDays(todayIso, targetIso) {
  const today = new Date(`${todayIso}T00:00:00`);
  const target = new Date(`${targetIso}T00:00:00`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(target.getTime())) {
    return null;
  }

  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function taskMatchesCardBoardColumn(task, column, explicitTagColumns = []) {
  const tags = Array.isArray(task.tags) ? task.tags.map((entry) => entry.toLowerCase()) : [];
  const due = String(task.due || '').trim();

  if (column.kind === 'tag') {
    const target = String(column.tag || '').replace(/^#/, '').toLowerCase();
    if (!target) {
      return false;
    }

    if (target.endsWith('/')) {
      return tags.some((tag) => tag === target.slice(0, -1) || tag.startsWith(target));
    }

    return tags.includes(target);
  }

  if (column.kind === 'untagged') {
    return tags.length === 0;
  }

  if (column.kind === 'other-tags') {
    if (tags.length === 0) {
      return false;
    }

    const explicit = explicitTagColumns.map((entry) => String(entry.tag || '').replace(/^#/, '').toLowerCase());
    return tags.some((tag) => !explicit.some((target) => target && (tag === target || tag.startsWith(`${target}/`))));
  }

  if (column.kind === 'undated') {
    return !due;
  }

  if (!due) {
    return false;
  }

  const todayIso = formatLocalIsoDate(new Date());
  const daysDelta = differenceInDays(todayIso, due);
  if (daysDelta == null) {
    return false;
  }

  if (column.kind === 'between') {
    return daysDelta >= column.from && daysDelta <= column.to;
  }

  if (column.kind === 'before') {
    return daysDelta < column.before;
  }

  if (column.kind === 'after') {
    return daysDelta > column.after;
  }

  return false;
}

function sortCardBoardTasks(tasks, completed = false) {
  const sorted = [...tasks];
  sorted.sort((left, right) => {
    if (completed) {
      const leftCompleted = String(left.completedInfo?.raw || '').trim();
      const rightCompleted = String(right.completedInfo?.raw || '').trim();
      const completedDelta = rightCompleted.localeCompare(leftCompleted);
      if (completedDelta !== 0) {
        return completedDelta;
      }
    }

    const dueDelta = String(left.due || '').localeCompare(String(right.due || ''));
    if (dueDelta !== 0) {
      return dueDelta;
    }

    const titleDelta = String(left.cleanedTitle || '').localeCompare(String(right.cleanedTitle || ''));
    if (titleDelta !== 0) {
      return titleDelta;
    }

    const fileDelta = String(left.filePath || '').localeCompare(String(right.filePath || ''));
    if (fileDelta !== 0) {
      return fileDelta;
    }

    return (left.lineNumber || 0) - (right.lineNumber || 0);
  });

  return sorted;
}

function buildTaskMetadataSection(task, metadata = {}) {
  return buildObsidianMetadataSection({
    ...metadata,
    'Source file': task.filePath,
    'Source line': task.lineNumber != null ? String(task.lineNumber) : '',
    'Original task line': task.rawLine,
    'Completed in source': task.checked ? 'Yes' : '',
    'Original due expression': task.dueInfo?.raw || '',
  });
}

async function importCardBoardVault(context, source, shouldPrefix) {
  let config;
  try {
    config = JSON.parse(await readTextFile(source.configPath));
  } catch (error) {
    addWarning(context, `Unable to parse CardBoard settings at ${source.configPath}: ${error?.message || error}`);
    return;
  }

  const boardCandidates = extractCardBoardBoardsFromValue(config)
    .filter((board) => Array.isArray(board?.columns) && board.columns.length > 0);
  if (boardCandidates.length === 0) {
    addWarning(context, `No CardBoard boards were found in ${source.configPath}.`);
    return;
  }

  const markdownFiles = (await walkMarkdownFiles(source.rootPath)).filter((filePath) => !source.kanbanFiles.has(filePath));
  const allTasks = [];
  for (const filePath of markdownFiles) {
    const raw = await readTextFile(filePath);
    allTasks.push(...parseMarkdownTaskBlocks(raw, filePath));
  }

  for (const board of boardCandidates) {
    const normalizedColumns = board.columns.map((column, index) => normalizeCardBoardColumn(column, index));
    const explicitTagColumns = normalizedColumns.filter((column) => column.kind === 'tag');
    const completedColumn = normalizedColumns.find((column) => column.kind === 'completed') || null;
    const buckets = new Map();

    for (const column of normalizedColumns) {
      if (column.kind !== 'completed') {
        buckets.set(column.name, []);
      }
    }
    if (completedColumn) {
      buckets.set(completedColumn.name, []);
    }
    buckets.set('Unmapped', []);

    for (const task of allTasks) {
      const matches = normalizedColumns
        .filter((column) => column.kind !== 'completed')
        .filter((column) => taskMatchesCardBoardColumn(task, column, explicitTagColumns));

      if (task.checked && completedColumn && matches.length > 0) {
        buckets.get(completedColumn.name).push(task);
        continue;
      }

      if (matches.length > 0) {
        buckets.get(matches[0].name).push(task);
        continue;
      }

      buckets.get('Unmapped').push(task);
    }

    const sourceName = String(board.name || source.sourceName || 'CardBoard').trim() || 'CardBoard';
    const createdLists = new Map();

    for (const [columnName, tasks] of buckets.entries()) {
      if (tasks.length === 0) {
        continue;
      }

      const listEntry = await createList(context, prefixListName(sourceName, columnName, shouldPrefix));
      createdLists.set(columnName, listEntry);
    }

    for (const [columnName, tasks] of buckets.entries()) {
      const listEntry = createdLists.get(columnName);
      if (!listEntry) {
        continue;
      }

      const isCompletedColumn = completedColumn && columnName === completedColumn.name;
      const sortedTasks = sortCardBoardTasks(tasks, isCompletedColumn);

      for (const task of sortedTasks) {
        const labelIds = await ensureLabelsForTags(context, task.tags);
        const body = createTaskBody(task, buildTaskMetadataSection(task, {
          Source: 'Obsidian CardBoard',
          'Source board': sourceName,
          'Source column': columnName,
          'Config file': source.configPath,
        }));

        await createCard(context, listEntry, {
          title: task.cleanedTitle || 'Untitled',
          due: task.due,
          labels: labelIds,
          body,
        });
      }
    }
  }
}

async function importGenericTaskScope(context, scope, shouldPrefix) {
  const markdownFiles = Array.isArray(scope.filePaths)
    ? scope.filePaths
    : await walkMarkdownFiles(scope.rootPath || scope.filePath || '');
  const tasks = [];

  for (const filePath of markdownFiles) {
    if (scope.skipFiles && scope.skipFiles.has(filePath)) {
      continue;
    }

    const raw = await readTextFile(filePath);
    if (isObsidianKanbanContent(raw)) {
      continue;
    }

    tasks.push(...parseMarkdownTaskBlocks(raw, filePath));
  }

  if (tasks.length === 0) {
    addWarning(context, `No importable markdown tasks were found in ${scope.rootPath || scope.filePath || scope.sourceName}.`);
    return;
  }

  const columnOrder = [];
  const columnTasks = new Map();

  function getOrCreateBucket(name) {
    if (!columnTasks.has(name)) {
      columnTasks.set(name, []);
      columnOrder.push(name);
    }
    return columnTasks.get(name);
  }

  for (const task of tasks) {
    if (task.checked) {
      getOrCreateBucket('Done').push(task);
      continue;
    }

    if (task.columnTags.length > 0) {
      getOrCreateBucket(task.columnTags[0]).push(task);
      continue;
    }

    const hasExplicitTaskListKanbanColumns = tasks.some((entry) => entry.columnTags.length > 0);
    getOrCreateBucket(hasExplicitTaskListKanbanColumns ? 'Uncategorised' : 'Tasks').push(task);
  }

  const createdLists = new Map();
  for (const columnName of columnOrder) {
    const listEntry = await createList(context, prefixListName(scope.sourceName, columnName, shouldPrefix));
    createdLists.set(columnName, listEntry);
  }

  for (const columnName of columnOrder) {
    const listEntry = createdLists.get(columnName);
    const bucket = columnTasks.get(columnName) || [];
    bucket.sort((left, right) => {
      const fileDelta = String(left.filePath || '').localeCompare(String(right.filePath || ''));
      if (fileDelta !== 0) {
        return fileDelta;
      }
      return (left.lineNumber || 0) - (right.lineNumber || 0);
    });

    for (const task of bucket) {
      const taskLabels = task.tags.filter((tag) => !task.columnTags.some((columnTag) => columnTag.toLowerCase() === tag.toLowerCase()));
      const labelIds = await ensureLabelsForTags(context, taskLabels);
      const body = createTaskBody(task, buildTaskMetadataSection(task, {
        Source: scope.importerName || 'Obsidian tasks',
        'Source board': scope.sourceName,
        'Source column': columnName,
      }));

      await createCard(context, listEntry, {
        title: task.cleanedTitle || 'Untitled',
        due: task.due,
        labels: labelIds,
        body,
      });
    }
  }
}

async function discoverSources(sourcePaths = []) {
  const normalizedPaths = dedupeStrings(sourcePaths.map((entry) => normalizeAbsolutePath(entry)).filter(Boolean));
  const kanbanBoards = [];
  const cardBoardSources = [];
  const taskScopes = [];

  for (const sourcePath of normalizedPaths) {
    const stats = await fs.stat(sourcePath);
    if (stats.isFile()) {
      const raw = await readTextFile(sourcePath);
      if (isObsidianKanbanContent(raw)) {
        kanbanBoards.push({
          filePath: sourcePath,
          rawContent: raw,
          sourceName: getFileStem(sourcePath),
        });
      } else {
        taskScopes.push({
          filePaths: [sourcePath],
          sourceName: getFileStem(sourcePath),
          importerName: 'Obsidian tasks',
        });
      }
      continue;
    }

    const cardBoardConfigPath = path.join(sourcePath, '.obsidian', 'plugins', 'card-board', 'data.json');
    const markdownFiles = await walkMarkdownFiles(sourcePath);
    const kanbanFiles = new Set();
    const nonKanbanFiles = [];

    for (const filePath of markdownFiles) {
      const raw = await readTextFile(filePath);
      if (isObsidianKanbanContent(raw)) {
        kanbanBoards.push({
          filePath,
          rawContent: raw,
          sourceName: getFileStem(filePath),
        });
        kanbanFiles.add(filePath);
      } else {
        nonKanbanFiles.push(filePath);
      }
    }

    if (await fs.stat(cardBoardConfigPath).then(() => true).catch(() => false)) {
      cardBoardSources.push({
        rootPath: sourcePath,
        configPath: cardBoardConfigPath,
        sourceName: getFileStem(sourcePath),
        kanbanFiles,
      });
      continue;
    }

    if (nonKanbanFiles.length > 0) {
      taskScopes.push({
        rootPath: sourcePath,
        filePaths: nonKanbanFiles,
        sourceName: getFileStem(sourcePath),
        importerName: 'Obsidian tasks',
      });
    }
  }

  return {
    kanbanBoards,
    cardBoardSources,
    taskScopes,
  };
}

async function importObsidian(options = {}) {
  const sourcePaths = Array.isArray(options.sourcePaths) ? options.sourcePaths.filter(Boolean) : [];
  if (sourcePaths.length === 0) {
    throw new Error('At least one Obsidian source path is required.');
  }

  const context = await createImportContext(options.boardRoot, 'obsidian', sourcePaths);
  const discovered = await discoverSources(sourcePaths);
  const totalRecognizedSources =
    discovered.kanbanBoards.length +
    discovered.cardBoardSources.length +
    discovered.taskScopes.length;
  const shouldPrefix = totalRecognizedSources > 1;

  for (const board of discovered.kanbanBoards) {
    await importObsidianKanbanBoard(context, board, shouldPrefix);
  }

  for (const source of discovered.cardBoardSources) {
    await importCardBoardVault(context, source, shouldPrefix);
  }

  for (const scope of discovered.taskScopes) {
    await importGenericTaskScope(context, scope, shouldPrefix);
  }

  await persistLabels(context);
  if (totalRecognizedSources === 0) {
    addWarning(context, 'No supported Obsidian board or task sources were recognized.');
  }

  return context.summary;
}

module.exports = {
  importObsidian,
  isObsidianKanbanContent,
  parseMarkdownTaskBlocks,
  parseObsidianKanbanColumns,
};
