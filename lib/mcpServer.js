const fs = require('fs').promises;
const path = require('path');
const cardFrontmatter = require('./cardFrontmatter');
const boardLabels = require('./boardLabels');
const { insertCardFileAtTop } = require('./cardOrdering');
const {
  importTrello,
  importObsidian,
} = require('./importers');

const JSON_RPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2025-11-25';
const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const DEFAULT_READ_ONLY = true;
const FILENAME_SAFE_REGEX = /^[^\\/]+$/;
const TOOL_CALL_OUTPUT_LIMIT = 8000;
const HEADER_TRANSPORT = 'header';
const NDJSON_TRANSPORT = 'ndjson';
const DEFAULT_TRANSPORT = NDJSON_TRANSPORT;
const MAX_RESOLVER_DEPTH = 8;
const MAX_RESOLVER_LIMIT = 100;
const DEFAULT_RESOLVER_DEPTH = 3;
const DEFAULT_RESOLVER_LIMIT = 20;
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.svn', '.hg', 'node_modules']);
const listSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});
const MCP_BOARD_VIEW_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'kanban',
    label: 'Kanban',
    description: 'Default list-based board view.',
  }),
  Object.freeze({
    id: 'calendar',
    label: 'Calendar',
    description: 'Month view grouped by card due date and task due-date markers.',
  }),
  Object.freeze({
    id: 'this-week',
    label: 'This Week',
    description: 'Current-week view grouped by card due date and task due-date markers.',
  }),
]);

const TOOL_DEFINITIONS = [
  {
    name: 'signboard.get_config',
    description: 'Returns active MCP server configuration for Signboard.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'signboard.list_board_views',
    description: 'List board view options supported by Signboard.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'signboard.resolve_board_by_name',
    description: 'Resolve board root paths by board directory name under configured allowed roots.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardName'],
      properties: {
        boardName: { type: 'string', description: 'Board directory name to resolve.' },
        exact: { type: 'boolean', description: 'Exact directory name match. Defaults to true.' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive comparison. Defaults to false.' },
        maxDepth: { type: 'integer', description: `Directory traversal depth, 0-${MAX_RESOLVER_DEPTH}. Defaults to ${DEFAULT_RESOLVER_DEPTH}.` },
        limit: { type: 'integer', description: `Maximum matches to return, 1-${MAX_RESOLVER_LIMIT}. Defaults to ${DEFAULT_RESOLVER_LIMIT}.` },
      },
    },
  },
  {
    name: 'signboard.create_board',
    description: 'Create a new board directory with default numbered lists and an optional starter card.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['parentRoot', 'boardName'],
      properties: {
        parentRoot: { type: 'string', description: 'Absolute parent directory path inside allowed roots.' },
        boardName: { type: 'string', description: 'New board directory name.' },
        seedWelcomeCard: {
          type: 'boolean',
          description: 'Create the default welcome card in the To-do list. Defaults to true.',
        },
      },
    },
  },
  {
    name: 'signboard.list_lists',
    description: 'List list directories inside a Signboard board root.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot'],
      properties: {
        boardRoot: { type: 'string', description: 'Absolute board root path on disk.' },
        includeArchive: { type: 'boolean', description: `Include ${ARCHIVE_DIRECTORY_NAME} in output.` },
      },
    },
  },
  {
    name: 'signboard.list_cards',
    description: 'List markdown card files for a specific list directory in a board.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName'],
      properties: {
        boardRoot: { type: 'string', description: 'Absolute board root path on disk.' },
        listName: { type: 'string', description: 'List directory name inside board root.' },
      },
    },
  },
  {
    name: 'signboard.read_card',
    description: 'Read a card markdown file and return normalized frontmatter/body plus task summary metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName', 'cardFile'],
      properties: {
        boardRoot: { type: 'string' },
        listName: { type: 'string' },
        cardFile: { type: 'string', description: 'Markdown file name, e.g. 001-task-abc12.md' },
      },
    },
  },
  {
    name: 'signboard.create_card',
    description: 'Create a new card in a list. Returns created file name, parsed card content, and task summary metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName', 'title'],
      properties: {
        boardRoot: { type: 'string' },
        listName: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        due: { type: ['string', 'null'], description: 'Optional due date. Use YYYY-MM-DD when possible.' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of board label ids to assign to the card.',
        },
      },
    },
  },
  {
    name: 'signboard.update_card',
    description: 'Update card frontmatter and/or body for an existing card. Returns updated task summary metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName', 'cardFile'],
      properties: {
        boardRoot: { type: 'string' },
        listName: { type: 'string' },
        cardFile: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        due: { type: ['string', 'null'] },
        labels: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'signboard.duplicate_card',
    description: 'Duplicate a card into the same list or a target list, including task summary metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName', 'cardFile'],
      properties: {
        boardRoot: { type: 'string' },
        listName: { type: 'string' },
        cardFile: { type: 'string' },
        targetListName: { type: 'string', description: 'Optional destination list. Defaults to source list.' },
        titlePrefix: { type: 'string', description: 'Prefix for duplicated card title. Defaults to "Copy of ".' },
        removeLabelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional label ids to remove from the duplicate.',
        },
      },
    },
  },
  {
    name: 'signboard.archive_card',
    description: 'Move a card into XXX-Archive (creates archive list when missing).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName', 'cardFile'],
      properties: {
        boardRoot: { type: 'string' },
        listName: { type: 'string' },
        cardFile: { type: 'string' },
      },
    },
  },
  {
    name: 'signboard.move_card',
    description: 'Move a card file from one list directory to another in the same board.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'fromListName', 'toListName', 'cardFile'],
      properties: {
        boardRoot: { type: 'string' },
        fromListName: { type: 'string' },
        toListName: { type: 'string' },
        cardFile: { type: 'string' },
        newCardFile: { type: 'string', description: 'Optional destination file name. Defaults to original.' },
      },
    },
  },
  {
    name: 'signboard.create_list',
    description: 'Create a new list directory in the board root.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'listName'],
      properties: {
        boardRoot: { type: 'string' },
        listName: { type: 'string' },
      },
    },
  },
  {
    name: 'signboard.rename_board',
    description: 'Rename a board directory (same parent directory).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'newBoardName'],
      properties: {
        boardRoot: { type: 'string', description: 'Absolute board root path on disk.' },
        newBoardName: { type: 'string', description: 'New board directory name.' },
      },
    },
  },
  {
    name: 'signboard.move_board',
    description: 'Move a board directory to a different parent directory (keeps board directory name).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'targetParentRoot'],
      properties: {
        boardRoot: { type: 'string', description: 'Absolute board root path on disk.' },
        targetParentRoot: { type: 'string', description: 'Absolute destination parent directory path.' },
      },
    },
  },
  {
    name: 'signboard.read_board_settings',
    description: 'Read board label, theme, and notification settings from board-settings.md.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot'],
      properties: {
        boardRoot: { type: 'string' },
      },
    },
  },
  {
    name: 'signboard.update_board_settings',
    description: 'Update board settings (labels, themeOverrides, and/or notifications).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot'],
      properties: {
        boardRoot: { type: 'string' },
        labels: { type: 'array', items: { type: 'object' } },
        themeOverrides: { type: 'object' },
        notifications: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean' },
            time: { type: 'string', description: 'Notification time in HH:MM format.' },
          },
        },
        tooltipsEnabled: { type: 'boolean', description: 'Whether UI tooltips are enabled for the board.' },
      },
    },
  },
  {
    name: 'signboard.import_trello',
    description: 'Import a Trello board JSON export into an existing Signboard board.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'sourcePath'],
      properties: {
        boardRoot: { type: 'string', description: 'Absolute board root path on disk.' },
        sourcePath: { type: 'string', description: 'Absolute path to a Trello JSON export file.' },
      },
    },
  },
  {
    name: 'signboard.import_obsidian',
    description: 'Import Obsidian markdown files and/or directories into an existing Signboard board.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot', 'sourcePaths'],
      properties: {
        boardRoot: { type: 'string', description: 'Absolute board root path on disk.' },
        sourcePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Absolute paths to markdown files and/or directories to import.',
        },
      },
    },
  },
];

class JsonRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const TASK_LIST_ITEM_PATTERN = /^(\s*[-*+]\s*\[([\sxX✓✔]*)\]\s*)(.*)$/;
const TASK_DUE_MARKER_PATTERN = /^\(due:\s*(\d{4}-\d{2}-\d{2})\)\s*/i;

function parseIsoDateStringToLocalDate(dateValue) {
  const normalized = String(dateValue || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function normalizeTaskDueDateValue(dateValue) {
  const normalized = String(dateValue || '').trim();
  if (!normalized) {
    return '';
  }

  return parseIsoDateStringToLocalDate(normalized) ? normalized : '';
}

function summarizeTaskList(bodyValue) {
  const body = String(bodyValue || '');
  const lines = body.split(/\r?\n/);

  let total = 0;
  let completed = 0;
  const dueSet = new Set();

  for (const lineValue of lines) {
    const line = String(lineValue || '');
    const match = line.match(TASK_LIST_ITEM_PATTERN);
    if (!match) {
      continue;
    }

    total += 1;

    const checkboxState = String(match[2] || '').replace(/\s+/g, '').toLowerCase();
    if (checkboxState === 'x' || checkboxState === '✓' || checkboxState === '✔') {
      completed += 1;
    }

    const content = String(match[3] || '').replace(/^\s+/, '');
    const dueMatch = content.match(TASK_DUE_MARKER_PATTERN);
    if (!dueMatch) {
      continue;
    }

    const dueDate = normalizeTaskDueDateValue(dueMatch[1]);
    if (dueDate) {
      dueSet.add(dueDate);
    }
  }

  return {
    taskSummary: {
      total,
      completed,
      remaining: Math.max(0, total - completed),
    },
    taskDueDates: [...dueSet].sort(),
  };
}

function parseBoolean(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseAllowedRoots() {
  const raw = process.env.SIGNBOARD_MCP_ALLOWED_ROOTS;
  if (!raw) {
    return [];
  }

  const seen = new Set();
  const roots = [];

  for (const value of raw.split(path.delimiter)) {
    const candidate = String(value || '').trim();
    if (!candidate) {
      continue;
    }

    const resolved = path.resolve(candidate);
    if (!path.isAbsolute(resolved)) {
      continue;
    }

    if (seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);
    roots.push(resolved);
  }

  roots.sort((left, right) => left.localeCompare(right));

  return roots;
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function validateNameSegment(value, fieldName) {
  const input = String(value || '').trim();
  if (!input) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!FILENAME_SAFE_REGEX.test(input) || input === '.' || input === '..') {
    throw new Error(`${fieldName} must be a single path segment.`);
  }

  return input;
}

function assertWriteAllowed(config, operationName) {
  if (config.readOnly) {
    throw new Error(`${operationName} is disabled because SIGNBOARD_MCP_READ_ONLY is enabled.`);
  }
}

async function ensureExistingDirectory(directoryPath, message) {
  let stats;

  try {
    stats = await fs.stat(directoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(message || `Directory does not exist: ${directoryPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(message || `Path is not a directory: ${directoryPath}`);
  }
}

async function ensureExistingFile(filePath, message) {
  let stats;

  try {
    stats = await fs.stat(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(message || `File does not exist: ${filePath}`);
    }
    throw error;
  }

  if (!stats.isFile()) {
    throw new Error(message || `Path is not a file: ${filePath}`);
  }
}

async function ensureExistingFileOrDirectory(targetPath, message) {
  let stats;

  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(message || `Path does not exist: ${targetPath}`);
    }
    throw error;
  }

  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error(message || `Path must be a file or directory: ${targetPath}`);
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function isInsideAllowedRoots(config, candidatePath) {
  if (!Array.isArray(config.allowedRoots) || config.allowedRoots.length === 0) {
    return true;
  }

  return config.allowedRoots.some((allowedRoot) => isPathInside(allowedRoot, candidatePath));
}

function assertInsideAllowedRoots(config, candidatePath, fieldName) {
  if (!isInsideAllowedRoots(config, candidatePath)) {
    throw new Error(`${fieldName} is outside SIGNBOARD_MCP_ALLOWED_ROOTS.`);
  }
}

function resolveAbsolutePathInput(pathInput, fieldName) {
  const candidatePath = String(pathInput || '').trim();
  if (!candidatePath) {
    throw new Error(`${fieldName} is required.`);
  }

  const resolvedPath = path.resolve(candidatePath);
  if (!path.isAbsolute(resolvedPath)) {
    throw new Error(`${fieldName} must be an absolute path.`);
  }

  return resolvedPath;
}

async function resolveBoardRoot(config, boardRootInput) {
  const resolvedBoardRoot = resolveAbsolutePathInput(boardRootInput, 'boardRoot');

  await ensureExistingDirectory(resolvedBoardRoot, `Board root does not exist: ${resolvedBoardRoot}`);
  assertInsideAllowedRoots(config, resolvedBoardRoot, 'boardRoot');

  return resolvedBoardRoot;
}

async function resolveExistingDirectoryPath(config, directoryPathInput, fieldName) {
  const resolvedDirectoryPath = resolveAbsolutePathInput(directoryPathInput, fieldName);
  await ensureExistingDirectory(resolvedDirectoryPath, `${fieldName} does not exist: ${resolvedDirectoryPath}`);
  assertInsideAllowedRoots(config, resolvedDirectoryPath, fieldName);
  return resolvedDirectoryPath;
}

async function resolveExistingFilePath(config, filePathInput, fieldName) {
  const resolvedFilePath = resolveAbsolutePathInput(filePathInput, fieldName);
  await ensureExistingFile(resolvedFilePath, `${fieldName} does not exist: ${resolvedFilePath}`);
  assertInsideAllowedRoots(config, resolvedFilePath, fieldName);
  return resolvedFilePath;
}

async function resolveExistingImportSourcePath(config, sourcePathInput, fieldName) {
  const resolvedSourcePath = resolveAbsolutePathInput(sourcePathInput, fieldName);
  await ensureExistingFileOrDirectory(resolvedSourcePath, `${fieldName} does not exist: ${resolvedSourcePath}`);
  assertInsideAllowedRoots(config, resolvedSourcePath, fieldName);
  return resolvedSourcePath;
}

function normalizeCardBodyInput(value) {
  const body = String(value || '');
  if (!body || !/(\\r\\n|\\n|\\N|\\r)/.test(body)) {
    return body;
  }

  return body
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\r/g, '\n');
}

function buildStarterCardBody() {
  return [
    'Welcome to Signboard.',
    '',
    'This board lives in a folder on your computer. Lists are folders. Cards are Markdown files. That means your work stays portable, readable, and very easy to make your own.',
    '',
    '## Try these first',
    '',
    '- Edit this card title or body.',
    '- Drag this card to another list, then drag it back.',
    '- Create a new card with the + button.',
    '- Add a label or due date to this card.',
    '- Archive this card when you are done exploring.',
    '',
    '## A tiny pretend plan',
    '',
    'Here are a few example tasks so you can see how checklists and task due dates work:',
    '',
    '- [ ] (due: 2026-03-11) Rename this board to something you actually care about',
    '- [ ] (due: 2026-03-12) Add a card for one real task you need to finish this week',
    '- [ ] (due: 2026-03-13) Create a new list for ideas, errands, or "waiting on"',
    '- [x] Opened Signboard and kicked the tires',
    '',
    '## Things worth trying',
    '',
    '- Add a due date to the whole card and then switch to Calendar view.',
    '- Create a few cards and drag them between To do, Doing, and Done.',
    '- Open Board Settings and customize labels for your own system.',
    '- Change the board colors and make the space feel like yours.',
    '',
    '## Keyboard shortcuts',
    '',
    'On macOS use Cmd. On Windows and Linux use Ctrl.',
    '',
    '- Cmd/Ctrl + / opens the keyboard shortcuts helper',
    '- Cmd/Ctrl + N creates a new card',
    '- Cmd/Ctrl + Shift + N creates a new list',
    '- Cmd/Ctrl + 1 opens Kanban view',
    '- Cmd/Ctrl + 2 opens Calendar view',
    '- Cmd/Ctrl + 3 opens This Week view',
    '- Esc closes open modals',
    '',
    '## One last thing',
    '',
    'If you want, leave this card here as a little orientation guide. Or archive it immediately and start fresh. Both are valid productivity philosophies.',
  ].join('\n');
}

async function validateDestinationBoardRoot(config, boardRoot, destinationBoardRoot, fieldName) {
  if (boardRoot === destinationBoardRoot) {
    return;
  }

  if (isPathInside(boardRoot, destinationBoardRoot)) {
    throw new Error(`${fieldName} cannot be inside the source board directory.`);
  }

  assertInsideAllowedRoots(config, destinationBoardRoot, fieldName);

  const destinationParent = path.dirname(destinationBoardRoot);
  await ensureExistingDirectory(destinationParent, `Destination parent directory does not exist: ${destinationParent}`);
  assertInsideAllowedRoots(config, destinationParent, 'destination parent directory');

  if (await pathExists(destinationBoardRoot)) {
    throw new Error(`${fieldName} already exists: ${destinationBoardRoot}`);
  }
}

async function resolveListPath(config, boardRootInput, listNameInput) {
  const boardRoot = await resolveBoardRoot(config, boardRootInput);
  const listName = validateNameSegment(listNameInput, 'listName');
  const listPath = path.resolve(path.join(boardRoot, listName));

  if (!isPathInside(boardRoot, listPath)) {
    throw new Error('listName resolved outside boardRoot.');
  }

  return { boardRoot, listName, listPath };
}

async function resolveCardPath(config, boardRootInput, listNameInput, cardFileInput) {
  const { boardRoot, listName, listPath } = await resolveListPath(config, boardRootInput, listNameInput);
  await ensureExistingDirectory(listPath, `List does not exist: ${listName}`);

  const cardFile = validateNameSegment(cardFileInput, 'cardFile');
  if (!cardFile.endsWith('.md')) {
    throw new Error('cardFile must end with .md.');
  }

  const cardPath = path.resolve(path.join(listPath, cardFile));
  if (!isPathInside(listPath, cardPath)) {
    throw new Error('cardFile resolved outside list directory.');
  }

  return { boardRoot, listName, listPath, cardFile, cardPath };
}

function slugifyTitle(title) {
  const cleaned = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'untitled';
}

function randomSuffix(length = 5) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return output;
}

function toNumberedPrefix(value) {
  return String(value).padStart(3, '0');
}

function normalizeInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (parsed < minimum) {
    return minimum;
  }

  if (parsed > maximum) {
    return maximum;
  }

  return parsed;
}

function normalizeBoardNameSearchOptions(args = {}) {
  return {
    exact: Object.prototype.hasOwnProperty.call(args, 'exact') ? Boolean(args.exact) : true,
    caseSensitive: Boolean(args.caseSensitive),
    maxDepth: normalizeInteger(args.maxDepth, DEFAULT_RESOLVER_DEPTH, 0, MAX_RESOLVER_DEPTH),
    limit: normalizeInteger(args.limit, DEFAULT_RESOLVER_LIMIT, 1, MAX_RESOLVER_LIMIT),
  };
}

function boardNameMatches(candidateName, boardName, options) {
  const left = options.caseSensitive ? String(candidateName || '') : String(candidateName || '').toLowerCase();
  const right = options.caseSensitive ? String(boardName || '') : String(boardName || '').toLowerCase();

  if (options.exact) {
    return left === right;
  }

  return left.includes(right);
}

function compareBoardPaths(leftPath, rightPath) {
  const leftBaseName = path.basename(leftPath);
  const rightBaseName = path.basename(rightPath);
  const byBaseName = listSortCollator.compare(leftBaseName, rightBaseName);

  if (byBaseName !== 0) {
    return byBaseName;
  }

  return leftPath.localeCompare(rightPath);
}

async function resolveBoardPathsByName(config, boardName, options) {
  if (!Array.isArray(config.allowedRoots) || config.allowedRoots.length === 0) {
    throw new Error('Board name resolution requires SIGNBOARD_MCP_ALLOWED_ROOTS to be configured.');
  }

  const seen = new Set();
  const matches = [];
  const queue = config.allowedRoots.map((rootPath) => ({ directoryPath: rootPath, depth: 0 }));

  while (queue.length > 0 && matches.length < options.limit) {
    const current = queue.shift();

    let entries = [];
    try {
      entries = await fs.readdir(current.directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const candidatePath = path.resolve(path.join(current.directoryPath, entry.name));
      if (!isPathInside(current.directoryPath, candidatePath) || seen.has(candidatePath)) {
        continue;
      }

      seen.add(candidatePath);

      if (boardNameMatches(entry.name, boardName, options)) {
        matches.push(candidatePath);
        if (matches.length >= options.limit) {
          break;
        }
      }

      if (current.depth < options.maxDepth) {
        queue.push({
          directoryPath: candidatePath,
          depth: current.depth + 1,
        });
      }
    }
  }

  return matches.sort(compareBoardPaths);
}

async function nextCardPrefix(listPath) {
  const directoryEntries = await fs.readdir(listPath, { withFileTypes: true });
  let maxPrefix = 0;

  for (const entry of directoryEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const match = entry.name.match(/^(\d{3})-/);
    if (!match) {
      continue;
    }

    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxPrefix) {
      maxPrefix = value;
    }
  }

  return toNumberedPrefix(maxPrefix + 1);
}

function compactText(text) {
  const value = String(text || '');
  if (value.length <= TOOL_CALL_OUTPUT_LIMIT) {
    return value;
  }

  return `${value.slice(0, TOOL_CALL_OUTPUT_LIMIT)}\n\n...[truncated]`;
}

function buildToolResult(payload, fallbackMessage) {
  const text = payload && typeof payload === 'object'
    ? compactText(JSON.stringify(payload, null, 2))
    : String(fallbackMessage || 'Done.');

  return {
    content: [{ type: 'text', text }],
    structuredContent: payload,
  };
}

function buildToolError(message, details) {
  const payload = {
    ok: false,
    error: String(message || 'Unknown error'),
  };

  if (details && typeof details === 'object') {
    payload.details = details;
  }

  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function buildServerConfig(appVersion) {
  return {
    appVersion: String(appVersion || '0.0.0'),
    readOnly: parseBoolean(process.env.SIGNBOARD_MCP_READ_ONLY, DEFAULT_READ_ONLY),
    allowedRoots: parseAllowedRoots(),
  };
}

async function handleToolCall(config, name, args = {}) {
  switch (name) {
    case 'signboard.get_config': {
      return {
        ok: true,
        readOnly: config.readOnly,
        allowedRoots: config.allowedRoots,
        protocolVersion: MCP_PROTOCOL_VERSION,
        appVersion: config.appVersion,
      };
    }

    case 'signboard.list_board_views': {
      return {
        ok: true,
        defaultViewId: 'kanban',
        views: MCP_BOARD_VIEW_OPTIONS,
      };
    }

    case 'signboard.resolve_board_by_name': {
      const boardName = String(args.boardName || '').trim();
      if (!boardName) {
        throw new Error('boardName is required.');
      }

      const searchOptions = normalizeBoardNameSearchOptions(args);
      const matches = await resolveBoardPathsByName(config, boardName, searchOptions);

      return {
        ok: true,
        boardName,
        matches,
        matchCount: matches.length,
        ...searchOptions,
      };
    }

    case 'signboard.create_board': {
      assertWriteAllowed(config, 'signboard.create_board');

      const parentRoot = await resolveExistingDirectoryPath(config, args.parentRoot, 'parentRoot');
      const boardName = validateNameSegment(args.boardName, 'boardName');
      const boardRoot = path.resolve(path.join(parentRoot, boardName));

      if (!isPathInside(parentRoot, boardRoot)) {
        throw new Error('boardRoot resolved outside parentRoot.');
      }

      if (await pathExists(boardRoot)) {
        throw new Error(`boardRoot already exists: ${boardRoot}`);
      }

      const listNames = [
        '000-To-do-stock',
        '001-Doing-stock',
        '002-Done-stock',
        ARCHIVE_DIRECTORY_NAME,
      ];
      const shouldSeedWelcomeCard = !Object.prototype.hasOwnProperty.call(args, 'seedWelcomeCard')
        || Boolean(args.seedWelcomeCard);
      let cardFile = '';

      await fs.mkdir(boardRoot, { recursive: false });

      try {
        for (const listName of listNames) {
          await fs.mkdir(path.join(boardRoot, listName), { recursive: false });
        }

        if (shouldSeedWelcomeCard) {
          cardFile = '000-hello-stock.md';
          await cardFrontmatter.writeCard(path.join(boardRoot, listNames[0], cardFile), {
            frontmatter: {
              title: '👋 Start Here',
            },
            body: buildStarterCardBody(),
          });
        }
      } catch (error) {
        await fs.rm(boardRoot, { recursive: true, force: true });
        throw error;
      }

      return {
        ok: true,
        parentRoot,
        boardName,
        boardRoot,
        listNames,
        cardFile,
        seededWelcomeCard: shouldSeedWelcomeCard,
      };
    }

    case 'signboard.list_lists': {
      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      const includeArchive = Boolean(args.includeArchive);
      const entries = await fs.readdir(boardRoot, { withFileTypes: true });

      const listNames = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => includeArchive || name !== ARCHIVE_DIRECTORY_NAME)
        .sort((left, right) => listSortCollator.compare(left, right));

      return {
        ok: true,
        boardRoot,
        listNames,
      };
    }

    case 'signboard.list_cards': {
      const { boardRoot, listName, listPath } = await resolveListPath(config, args.boardRoot, args.listName);
      await ensureExistingDirectory(listPath, `List does not exist: ${listName}`);

      const entries = await fs.readdir(listPath, { withFileTypes: true });
      const cardFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort((left, right) => listSortCollator.compare(left, right));

      return {
        ok: true,
        boardRoot,
        listName,
        cardFiles,
      };
    }

    case 'signboard.read_card': {
      const { boardRoot, listName, cardFile, cardPath } = await resolveCardPath(
        config,
        args.boardRoot,
        args.listName,
        args.cardFile,
      );

      const card = await cardFrontmatter.readCard(cardPath);
      const taskListMetadata = summarizeTaskList(card.body);

      return {
        ok: true,
        boardRoot,
        listName,
        cardFile,
        card,
        ...taskListMetadata,
      };
    }

    case 'signboard.create_card': {
      assertWriteAllowed(config, 'signboard.create_card');

      const title = String(args.title || '').trim();
      if (!title) {
        throw new Error('title is required.');
      }

      const { boardRoot, listName, listPath } = await resolveListPath(config, args.boardRoot, args.listName);
      await ensureExistingDirectory(listPath, `List does not exist: ${listName}`);

      const prefix = await nextCardPrefix(listPath);
      const slug = slugifyTitle(title).slice(0, 24);
      const cardFile = `${prefix}-${slug}-${randomSuffix()}.md`;
      const cardPath = path.join(listPath, cardFile);

      const frontmatter = {
        title,
      };

      if (Object.prototype.hasOwnProperty.call(args, 'due')) {
        if (args.due == null || String(args.due).trim() === '') {
          frontmatter.due = undefined;
        } else {
          frontmatter.due = String(args.due).trim();
        }
      }

      if (Array.isArray(args.labels)) {
        frontmatter.labels = args.labels.map((value) => String(value));
      }

      await cardFrontmatter.writeCard(cardPath, {
        frontmatter,
        body: normalizeCardBodyInput(args.body),
      });

      const card = await cardFrontmatter.readCard(cardPath);
      const taskListMetadata = summarizeTaskList(card.body);

      return {
        ok: true,
        boardRoot,
        listName,
        cardFile,
        card,
        ...taskListMetadata,
      };
    }

    case 'signboard.update_card': {
      assertWriteAllowed(config, 'signboard.update_card');

      const { boardRoot, listName, cardFile, cardPath } = await resolveCardPath(
        config,
        args.boardRoot,
        args.listName,
        args.cardFile,
      );

      const current = await cardFrontmatter.readCard(cardPath);
      const nextFrontmatter = {
        ...current.frontmatter,
      };
      let nextBody = current.body;

      if (Object.prototype.hasOwnProperty.call(args, 'title')) {
        nextFrontmatter.title = String(args.title || '').trim();
      }

      if (Object.prototype.hasOwnProperty.call(args, 'due')) {
        if (args.due == null || String(args.due).trim() === '') {
          delete nextFrontmatter.due;
        } else {
          nextFrontmatter.due = String(args.due).trim();
        }
      }

      if (Object.prototype.hasOwnProperty.call(args, 'labels')) {
        if (!Array.isArray(args.labels)) {
          throw new Error('labels must be an array of strings when provided.');
        }

        nextFrontmatter.labels = args.labels.map((value) => String(value));
      }

      if (Object.prototype.hasOwnProperty.call(args, 'body')) {
        nextBody = normalizeCardBodyInput(args.body);
      }

      await cardFrontmatter.writeCard(cardPath, {
        frontmatter: nextFrontmatter,
        body: nextBody,
      });

      const card = await cardFrontmatter.readCard(cardPath);
      const taskListMetadata = summarizeTaskList(card.body);

      return {
        ok: true,
        boardRoot,
        listName,
        cardFile,
        card,
        ...taskListMetadata,
      };
    }

    case 'signboard.duplicate_card': {
      assertWriteAllowed(config, 'signboard.duplicate_card');

      const source = await resolveCardPath(
        config,
        args.boardRoot,
        args.listName,
        args.cardFile,
      );

      const targetListName = args.targetListName
        ? validateNameSegment(args.targetListName, 'targetListName')
        : source.listName;
      const targetListPath = path.resolve(path.join(source.boardRoot, targetListName));

      if (!isPathInside(source.boardRoot, targetListPath)) {
        throw new Error('targetListName resolved outside boardRoot.');
      }

      await ensureExistingDirectory(targetListPath, `List does not exist: ${targetListName}`);

      const sourceCard = await cardFrontmatter.readCard(source.cardPath);
      const sourceTitle = String(sourceCard?.frontmatter?.title || 'Untitled').trim() || 'Untitled';
      const titlePrefix = Object.prototype.hasOwnProperty.call(args, 'titlePrefix')
        ? String(args.titlePrefix || '')
        : 'Copy of ';
      const nextTitle = `${titlePrefix}${sourceTitle}`.trim() || sourceTitle;
      const removeLabelIds = Array.isArray(args.removeLabelIds) ? new Set(args.removeLabelIds.map((value) => String(value))) : new Set();
      const labels = Array.isArray(sourceCard.frontmatter?.labels)
        ? sourceCard.frontmatter.labels.map((value) => String(value)).filter((labelId) => !removeLabelIds.has(labelId))
        : [];
      const prefix = await nextCardPrefix(targetListPath);
      const duplicatedCardFile = `${prefix}-${slugifyTitle(nextTitle).slice(0, 24)}-${randomSuffix()}.md`;
      const duplicatedCardPath = path.join(targetListPath, duplicatedCardFile);

      await cardFrontmatter.writeCard(duplicatedCardPath, {
        frontmatter: {
          ...sourceCard.frontmatter,
          title: nextTitle,
          labels,
        },
        body: sourceCard.body,
      });

      const duplicatedCard = await cardFrontmatter.readCard(duplicatedCardPath);
      const taskListMetadata = summarizeTaskList(duplicatedCard.body);

      return {
        ok: true,
        boardRoot: source.boardRoot,
        sourceListName: source.listName,
        sourceCardFile: source.cardFile,
        listName: targetListName,
        cardFile: duplicatedCardFile,
        card: duplicatedCard,
        ...taskListMetadata,
      };
    }

    case 'signboard.archive_card': {
      assertWriteAllowed(config, 'signboard.archive_card');

      const source = await resolveCardPath(
        config,
        args.boardRoot,
        args.listName,
        args.cardFile,
      );

      if (source.listName === ARCHIVE_DIRECTORY_NAME) {
        return {
          ok: true,
          boardRoot: source.boardRoot,
          fromListName: source.listName,
          toListName: ARCHIVE_DIRECTORY_NAME,
          cardFile: source.cardFile,
          alreadyArchived: true,
        };
      }

      const archiveListPath = path.resolve(path.join(source.boardRoot, ARCHIVE_DIRECTORY_NAME));
      if (!isPathInside(source.boardRoot, archiveListPath)) {
        throw new Error('Archive list path resolved outside boardRoot.');
      }

      if (!(await pathExists(archiveListPath))) {
        await fs.mkdir(archiveListPath, { recursive: true });
      } else {
        await ensureExistingDirectory(archiveListPath, `Archive list is not a directory: ${ARCHIVE_DIRECTORY_NAME}`);
      }

      let archivedCardFile = source.cardFile;
      let archivedCardPath = path.resolve(path.join(archiveListPath, archivedCardFile));

      if (!isPathInside(archiveListPath, archivedCardPath)) {
        throw new Error('Archive card path resolved outside archive directory.');
      }

      if (await pathExists(archivedCardPath)) {
        const sourceSuffix = source.cardFile.replace(/^\d{3}/, '');
        const nextPrefix = await nextCardPrefix(archiveListPath);
        archivedCardFile = `${nextPrefix}${sourceSuffix}`;
        archivedCardPath = path.resolve(path.join(archiveListPath, archivedCardFile));

        if (!isPathInside(archiveListPath, archivedCardPath)) {
          throw new Error('Archive card path resolved outside archive directory.');
        }
      }

      await fs.rename(source.cardPath, archivedCardPath);

      return {
        ok: true,
        boardRoot: source.boardRoot,
        fromListName: source.listName,
        toListName: ARCHIVE_DIRECTORY_NAME,
        cardFile: source.cardFile,
        archivedCardFile,
      };
    }

    case 'signboard.move_card': {
      assertWriteAllowed(config, 'signboard.move_card');

      const fromListName = validateNameSegment(args.fromListName, 'fromListName');
      const toListName = validateNameSegment(args.toListName, 'toListName');
      const boardRoot = await resolveBoardRoot(config, args.boardRoot);

      const fromListPath = path.resolve(path.join(boardRoot, fromListName));
      const toListPath = path.resolve(path.join(boardRoot, toListName));

      if (!isPathInside(boardRoot, fromListPath) || !isPathInside(boardRoot, toListPath)) {
        throw new Error('List path resolved outside boardRoot.');
      }

      await ensureExistingDirectory(fromListPath, `List does not exist: ${fromListName}`);
      await ensureExistingDirectory(toListPath, `List does not exist: ${toListName}`);

      const sourceFile = validateNameSegment(args.cardFile, 'cardFile');
      const destinationFile = args.newCardFile ? validateNameSegment(args.newCardFile, 'newCardFile') : sourceFile;

      if (!sourceFile.endsWith('.md') || !destinationFile.endsWith('.md')) {
        throw new Error('cardFile and newCardFile must end with .md.');
      }

      const sourcePath = path.resolve(path.join(fromListPath, sourceFile));
      const destinationPath = path.resolve(path.join(toListPath, destinationFile));

      if (!isPathInside(fromListPath, sourcePath) || !isPathInside(toListPath, destinationPath)) {
        throw new Error('Card file path resolved outside list directory.');
      }

      let finalDestinationFile = destinationFile;
      if (Object.prototype.hasOwnProperty.call(args, 'newCardFile')) {
        if (sourcePath !== destinationPath && await pathExists(destinationPath)) {
          throw new Error(`Destination card already exists: ${toListName}/${destinationFile}`);
        }
        if (sourcePath !== destinationPath) {
          await fs.rename(sourcePath, destinationPath);
        }
      } else {
        finalDestinationFile = await insertCardFileAtTop(toListPath, sourcePath, sourceFile);
      }

      return {
        ok: true,
        boardRoot,
        fromListName,
        toListName,
        cardFile: sourceFile,
        newCardFile: finalDestinationFile,
      };
    }

    case 'signboard.create_list': {
      assertWriteAllowed(config, 'signboard.create_list');

      const { boardRoot, listName, listPath } = await resolveListPath(config, args.boardRoot, args.listName);

      await fs.mkdir(listPath, { recursive: false });

      return {
        ok: true,
        boardRoot,
        listName,
      };
    }

    case 'signboard.rename_board': {
      assertWriteAllowed(config, 'signboard.rename_board');

      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      const currentBoardName = path.basename(boardRoot);
      const newBoardName = validateNameSegment(args.newBoardName, 'newBoardName');
      const newBoardRoot = path.resolve(path.join(path.dirname(boardRoot), newBoardName));

      if (!isPathInside(path.dirname(boardRoot), newBoardRoot)) {
        throw new Error('newBoardName resolved outside source parent directory.');
      }

      if (newBoardRoot !== boardRoot) {
        await validateDestinationBoardRoot(config, boardRoot, newBoardRoot, 'newBoardRoot');
        await fs.rename(boardRoot, newBoardRoot);
      }

      return {
        ok: true,
        boardRoot,
        previousBoardName: currentBoardName,
        newBoardName,
        newBoardRoot,
        renamed: newBoardRoot !== boardRoot,
      };
    }

    case 'signboard.move_board': {
      assertWriteAllowed(config, 'signboard.move_board');

      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      const boardName = path.basename(boardRoot);
      const targetParentRoot = await resolveExistingDirectoryPath(config, args.targetParentRoot, 'targetParentRoot');
      const newBoardRoot = path.resolve(path.join(targetParentRoot, boardName));

      if (!isPathInside(targetParentRoot, newBoardRoot)) {
        throw new Error('newBoardRoot resolved outside targetParentRoot.');
      }

      if (newBoardRoot !== boardRoot) {
        await validateDestinationBoardRoot(config, boardRoot, newBoardRoot, 'newBoardRoot');
        await fs.rename(boardRoot, newBoardRoot);
      }

      return {
        ok: true,
        boardRoot,
        boardName,
        targetParentRoot,
        newBoardRoot,
        moved: newBoardRoot !== boardRoot,
      };
    }

    case 'signboard.read_board_settings': {
      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });

      return {
        ok: true,
        boardRoot,
        settings,
      };
    }

    case 'signboard.update_board_settings': {
      assertWriteAllowed(config, 'signboard.update_board_settings');

      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      const nextSettings = {};

      if (Object.prototype.hasOwnProperty.call(args, 'labels')) {
        nextSettings.labels = args.labels;
      }

      if (Object.prototype.hasOwnProperty.call(args, 'themeOverrides')) {
        nextSettings.themeOverrides = args.themeOverrides;
      }

      if (Object.prototype.hasOwnProperty.call(args, 'notifications')) {
        nextSettings.notifications = args.notifications;
      }

      if (Object.prototype.hasOwnProperty.call(args, 'tooltipsEnabled')) {
        nextSettings.tooltipsEnabled = args.tooltipsEnabled;
      }

      const settings = await boardLabels.updateBoardSettings(boardRoot, nextSettings);

      return {
        ok: true,
        boardRoot,
        settings,
      };
    }

    case 'signboard.import_trello': {
      assertWriteAllowed(config, 'signboard.import_trello');

      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      const sourcePath = await resolveExistingFilePath(config, args.sourcePath, 'sourcePath');
      const summary = await importTrello({
        boardRoot,
        sourcePath,
      });

      return {
        boardRoot,
        ...summary,
      };
    }

    case 'signboard.import_obsidian': {
      assertWriteAllowed(config, 'signboard.import_obsidian');

      const boardRoot = await resolveBoardRoot(config, args.boardRoot);
      if (!Array.isArray(args.sourcePaths) || args.sourcePaths.length === 0) {
        throw new Error('sourcePaths must be a non-empty array of absolute paths.');
      }

      const sourcePaths = [];
      for (let index = 0; index < args.sourcePaths.length; index += 1) {
        sourcePaths.push(await resolveExistingImportSourcePath(config, args.sourcePaths[index], `sourcePaths[${index}]`));
      }

      const summary = await importObsidian({
        boardRoot,
        sourcePaths,
      });

      return {
        boardRoot,
        ...summary,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function logError(message, error) {
  const text = error && error.stack ? error.stack : String(error || 'Unknown error');
  process.stderr.write(`[signboard-mcp] ${message}\n${text}\n`);
}

function serializeMessage(payload, transportMode = DEFAULT_TRANSPORT) {
  const json = JSON.stringify(payload);

  if (transportMode === HEADER_TRANSPORT) {
    const contentLength = Buffer.byteLength(json, 'utf8');
    return `Content-Length: ${contentLength}\r\n\r\n${json}`;
  }

  return `${json}\n`;
}

function findHeaderBoundary(buffer) {
  const crlfBoundary = buffer.indexOf('\r\n\r\n');
  if (crlfBoundary >= 0) {
    return { index: crlfBoundary, separatorLength: 4 };
  }

  const lfBoundary = buffer.indexOf('\n\n');
  if (lfBoundary >= 0) {
    return { index: lfBoundary, separatorLength: 2 };
  }

  return null;
}

function startsWithHeaderPrefix(buffer) {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  const preview = buffer.slice(0, 64).toString('utf8').trimStart().toLowerCase();
  return preview.startsWith('content-length:');
}

function parseContentLength(headerText) {
  const headerLines = headerText.split(/\r?\n/);

  for (const line of headerLines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase().replace(/^\ufeff/, '');
    if (key !== 'content-length') {
      continue;
    }

    const value = Number(line.slice(separatorIndex + 1).trim());
    if (Number.isInteger(value) && value >= 0) {
      return value;
    }

    return null;
  }

  return null;
}

function isRequest(payload) {
  return payload && typeof payload === 'object' && typeof payload.method === 'string' && Object.prototype.hasOwnProperty.call(payload, 'id');
}

function isNotification(payload) {
  return payload && typeof payload === 'object' && typeof payload.method === 'string' && !Object.prototype.hasOwnProperty.call(payload, 'id');
}

function createRpcEnvelope(id, result) {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  };
}

function createRpcErrorEnvelope(id, code, message, data) {
  const payload = {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };

  if (data !== undefined) {
    payload.error.data = data;
  }

  return payload;
}

function validateObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value;
}

async function startSignboardMcpServer(options = {}) {
  const config = buildServerConfig(options.appVersion);
  let inputBuffer = Buffer.alloc(0);
  let consumeChain = Promise.resolve();
  let transportMode = DEFAULT_TRANSPORT;

  const write = (payload) => {
    process.stdout.write(serializeMessage(payload, transportMode));
  };

  const handleRequest = async (request) => {
    const method = request.method;

    if (method === 'initialize') {
      const params = request.params && typeof request.params === 'object' ? request.params : {};
      const protocolVersion = typeof params.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION;

      return {
        protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'signboard-mcp',
          version: config.appVersion,
        },
      };
    }

    if (method === 'ping') {
      return {};
    }

    if (method === 'initialized') {
      return {};
    }

    if (method === 'tools/list') {
      return {
        tools: TOOL_DEFINITIONS,
      };
    }

    if (method === 'tools/call') {
      const params = validateObject(request.params, 'params');
      const name = String(params.name || '').trim();

      if (!name) {
        throw new JsonRpcError(-32602, 'params.name is required.');
      }

      const args = params.arguments == null ? {} : validateObject(params.arguments, 'params.arguments');

      try {
        const result = await handleToolCall(config, name, args);
        return buildToolResult(result, 'Done.');
      } catch (error) {
        return buildToolError(error && error.message ? error.message : String(error || 'Unknown error'));
      }
    }

    throw new JsonRpcError(-32601, `Method not found: ${method}`);
  };

  const handleNotification = async (notification) => {
    if (notification.method === 'notifications/initialized') {
      return;
    }

    if (notification.method === 'notifications/cancelled') {
      return;
    }
  };

  const processPayload = async (payload) => {
    if (!payload || payload.jsonrpc !== JSON_RPC_VERSION) {
      if (isRequest(payload)) {
        write(createRpcErrorEnvelope(payload.id, -32600, 'Invalid Request'));
      }
      return;
    }

    try {
      if (isRequest(payload)) {
        const result = await handleRequest(payload);
        write(createRpcEnvelope(payload.id, result));
        return;
      }

      if (isNotification(payload)) {
        await handleNotification(payload);
        return;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'id')) {
        return;
      }

      write(createRpcErrorEnvelope(null, -32600, 'Invalid Request'));
    } catch (error) {
      if (!isRequest(payload)) {
        logError('Unhandled notification error', error);
        return;
      }

      if (error instanceof JsonRpcError) {
        write(createRpcErrorEnvelope(payload.id, error.code, error.message, error.data));
        return;
      }

      write(createRpcErrorEnvelope(payload.id, -32603, 'Internal error'));
      logError('Unhandled request error', error);
    }
  };

  const consumeInputBuffer = async () => {
    while (true) {
      const boundary = findHeaderBoundary(inputBuffer);
      if (boundary) {
        const headerRaw = inputBuffer.slice(0, boundary.index).toString('utf8');
        const contentLength = parseContentLength(headerRaw);

        if (contentLength != null) {
          const messageStart = boundary.index + boundary.separatorLength;
          const messageEnd = messageStart + contentLength;

          if (inputBuffer.length < messageEnd) {
            return;
          }

          transportMode = HEADER_TRANSPORT;
          const jsonPayload = inputBuffer.slice(messageStart, messageEnd).toString('utf8');
          inputBuffer = inputBuffer.slice(messageEnd);

          let parsed;
          try {
            parsed = JSON.parse(jsonPayload);
          } catch (error) {
            logError('Failed to parse JSON payload.', error);
            continue;
          }

          await processPayload(parsed);
          continue;
        }

        if (startsWithHeaderPrefix(inputBuffer)) {
          inputBuffer = Buffer.alloc(0);
          logError('Received payload with missing/invalid Content-Length header.');
          return;
        }
      }

      const newlineIndex = inputBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }

      const jsonLine = inputBuffer.slice(0, newlineIndex).toString('utf8').trim();
      inputBuffer = inputBuffer.slice(newlineIndex + 1);
      if (!jsonLine) {
        continue;
      }

      transportMode = NDJSON_TRANSPORT;

      let parsedLine;
      try {
        parsedLine = JSON.parse(jsonLine);
      } catch (error) {
        logError('Failed to parse NDJSON payload.', error);
        continue;
      }

      await processPayload(parsedLine);
    }
  };

  process.stdin.on('data', (chunk) => {
    const incomingChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    inputBuffer = Buffer.concat([inputBuffer, incomingChunk]);
    consumeChain = consumeChain.then(consumeInputBuffer).catch((error) => {
      logError('MCP input processing failed.', error);
    });
  });

  process.stdin.on('error', (error) => {
    logError('stdin stream error', error);
  });

  process.stdin.on('end', () => {
    if (typeof options.onStop === 'function') {
      options.onStop();
      return;
    }

    process.exit(0);
  });

  process.on('SIGINT', () => {
    if (typeof options.onStop === 'function') {
      options.onStop();
      return;
    }

    process.exit(0);
  });

  process.on('SIGTERM', () => {
    if (typeof options.onStop === 'function') {
      options.onStop();
      return;
    }

    process.exit(0);
  });

  process.stderr.write(
    `[signboard-mcp] Server started (version=${config.appVersion}, readOnly=${config.readOnly}, allowedRoots=${config.allowedRoots.length})\n`,
  );
}

module.exports = {
  startSignboardMcpServer,
};
