const fs = require('fs').promises;
const path = require('path');
const cardFrontmatter = require('./cardFrontmatter');
const boardLabels = require('./boardLabels');

const JSON_RPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const ARCHIVE_DIRECTORY_NAME = 'XXX-Archive';
const DEFAULT_READ_ONLY = true;
const FILENAME_SAFE_REGEX = /^[^\\/]+$/;
const TOOL_CALL_OUTPUT_LIMIT = 8000;
const listSortCollator = new Intl.Collator(undefined, {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
  localeMatcher: 'lookup',
});

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
    description: 'Read a card markdown file and return normalized frontmatter plus body.',
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
    description: 'Create a new card in a list. Returns created file name and parsed card content.',
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
    description: 'Update card frontmatter and/or body for an existing card.',
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
    name: 'signboard.read_board_settings',
    description: 'Read board label and theme settings from board-settings.md.',
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
    description: 'Update board settings (labels and/or themeOverrides).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['boardRoot'],
      properties: {
        boardRoot: { type: 'string' },
        labels: { type: 'array', items: { type: 'object' } },
        themeOverrides: { type: 'object' },
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

async function resolveBoardRoot(config, boardRootInput) {
  const boardRoot = String(boardRootInput || '').trim();
  if (!boardRoot) {
    throw new Error('boardRoot is required.');
  }

  const resolvedBoardRoot = path.resolve(boardRoot);
  if (!path.isAbsolute(resolvedBoardRoot)) {
    throw new Error('boardRoot must be an absolute path.');
  }

  await ensureExistingDirectory(resolvedBoardRoot, `Board root does not exist: ${resolvedBoardRoot}`);

  if (config.allowedRoots.length > 0) {
    const allowed = config.allowedRoots.some((allowedRoot) => isPathInside(allowedRoot, resolvedBoardRoot));
    if (!allowed) {
      throw new Error('boardRoot is outside SIGNBOARD_MCP_ALLOWED_ROOTS.');
    }
  }

  return resolvedBoardRoot;
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

      return {
        ok: true,
        boardRoot,
        listName,
        cardFile,
        card,
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
        body: String(args.body || ''),
      });

      const card = await cardFrontmatter.readCard(cardPath);

      return {
        ok: true,
        boardRoot,
        listName,
        cardFile,
        card,
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
        nextBody = String(args.body || '');
      }

      await cardFrontmatter.writeCard(cardPath, {
        frontmatter: nextFrontmatter,
        body: nextBody,
      });

      const card = await cardFrontmatter.readCard(cardPath);

      return {
        ok: true,
        boardRoot,
        listName,
        cardFile,
        card,
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

      await fs.rename(sourcePath, destinationPath);

      return {
        ok: true,
        boardRoot,
        fromListName,
        toListName,
        cardFile: sourceFile,
        newCardFile: destinationFile,
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

      const settings = await boardLabels.updateBoardSettings(boardRoot, nextSettings);

      return {
        ok: true,
        boardRoot,
        settings,
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

function serializeMessage(payload) {
  const json = JSON.stringify(payload);
  const contentLength = Buffer.byteLength(json, 'utf8');
  return `Content-Length: ${contentLength}\r\n\r\n${json}`;
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

function parseContentLength(headerText) {
  const headerLines = headerText.split(/\r?\n/);

  for (const line of headerLines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
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

  const write = (payload) => {
    process.stdout.write(serializeMessage(payload));
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
      if (!boundary) {
        return;
      }

      const headerRaw = inputBuffer.slice(0, boundary.index).toString('utf8');
      const contentLength = parseContentLength(headerRaw);

      if (contentLength == null) {
        inputBuffer = Buffer.alloc(0);
        logError('Received payload with missing/invalid Content-Length header.');
        return;
      }

      const messageStart = boundary.index + boundary.separatorLength;
      const messageEnd = messageStart + contentLength;

      if (inputBuffer.length < messageEnd) {
        return;
      }

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
