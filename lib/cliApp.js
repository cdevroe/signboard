const fs = require('fs').promises;
const path = require('path');
const boardLabels = require('./boardLabels');
const {
  importTrello,
  importObsidian,
  importTasksMd,
} = require('./importers');
const {
  listArchiveEntries,
  readArchiveEntry,
  restoreArchivedCard,
  restoreArchivedList,
} = require('./archive');
const {
  listLists,
  resolveList,
  createList,
  renameList,
  listCards,
  resolveCard,
  createCard,
  duplicateCard,
  editCard,
  addCardNote,
  summarizeDue,
  getEarliestDueDate,
} = require('./cliBoard');
const {
  getCurrentBoard,
  setCurrentBoard,
} = require('./cliState');
const { createBoard: createBoardOnDisk } = require('./boardCreation');

const CLI_GROUPS = new Set(['use', 'boards', 'lists', 'cards', 'archive', 'settings', 'import']);
const CLI_NEAR_MISSES = new Set(['board', 'list', 'card']);
const CARD_SUBCOMMANDS = new Set(['list', 'read', 'create', 'edit', 'duplicate', 'notes']);
const IMPORT_SUBCOMMANDS = new Set(['trello', 'obsidian', 'tasksmd']);
const APP_PASSTHROUGH_PREFIXES = ['-psn_'];

function parseArgv(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');
      let key = arg.slice(2);
      let value = null;

      if (equalIndex >= 0) {
        key = arg.slice(2, equalIndex);
        value = arg.slice(equalIndex + 1);
      } else {
        const nextArg = argv[index + 1];
        if (nextArg != null && !nextArg.startsWith('--')) {
          value = nextArg;
          index += 1;
        } else {
          value = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(options, key)) {
        if (!Array.isArray(options[key])) {
          options[key] = [options[key]];
        }
        options[key].push(value);
      } else {
        options[key] = value;
      }
      continue;
    }

    positionals.push(arg);
  }

  return { positionals, options };
}

function getOption(options, key, fallback = undefined) {
  const value = options[key];
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  if (value === undefined) {
    return fallback;
  }
  return value;
}

function getOptionList(options, key) {
  const value = options[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function assertAllowedOptions(options, allowedKeys, usage) {
  const allowed = new Set([...allowedKeys, 'help']);
  const unknownKeys = Object.keys(options).filter((key) => !allowed.has(key));

  if (unknownKeys.length > 0) {
    const formatted = unknownKeys.map((key) => `--${key}`).join(', ');
    throw new Error(`Unknown option(s): ${formatted}\n\n${usage}`);
  }
}

function assertNoExtraPositionals(positionals, expected, usage) {
  if (positionals.length > expected) {
    throw new Error(`Unexpected arguments: ${positionals.slice(expected).join(' ')}\n\n${usage}`);
  }
}

function pad(value, width) {
  return String(value || '').padEnd(width, ' ');
}

function renderHelpText(commandName = 'signboard') {
  return [
    'Signboard CLI',
    '',
    'Usage:',
    `  ${commandName} use <board-root>`,
    '',
    `  ${commandName} boards create <board-root> [--no-welcome] [--use] [--json]`,
    `  ${commandName} boards create --parent <parent-root> --name <board-name> [--no-welcome] [--use] [--json]`,
    '',
    `  ${commandName} lists [--include-archive] [--json]`,
    `  ${commandName} lists create <name> [--json]`,
    `  ${commandName} lists rename <list-ref> <new-name> [--json]`,
    '',
    `  ${commandName} cards [list-ref] [options]`,
    `  ${commandName} cards read --card <card-ref> [--list <list-ref>] [--json]`,
    `  ${commandName} cards create --list <list-ref> --title <title> [options]`,
    `  ${commandName} cards create --from-card <card-ref> --list <list-ref> [options]`,
    `  ${commandName} cards duplicate --card <card-ref> [--list <target-list-ref>] [options]`,
    `  ${commandName} cards edit --card <card-ref> [--list <list-ref>] [options]`,
    `  ${commandName} cards notes add --card <card-ref> --text <text> [--timestamp] [options]`,
    '',
    `  ${commandName} archive cards [--search <query>] [--json]`,
    `  ${commandName} archive lists [--search <query>] [--json]`,
    `  ${commandName} archive read --kind card|list --entry <ref> [--json]`,
    `  ${commandName} archive restore-card --card <ref> --to-list <list-ref> [--json]`,
    `  ${commandName} archive restore-list --list <ref> [--as <directory-name>] [--json]`,
    '',
    `  ${commandName} settings [--json]`,
    '',
    `  ${commandName} import trello --file <export.json> [--json]`,
    `  ${commandName} import obsidian --source <path> [--source <path> ...] [--json]`,
    `  ${commandName} import tasksmd --source <path> [--json]`,
    '',
    'Board selection:',
    '  `signboard use /path/to/board` stores the current board for later commands',
    '  Use `--board <path>` to override the stored board for a single command',
    '  Use `--use` with `boards create` to store the newly created board',
    '',
    'Board create options:',
    '  --parent <path>      Parent directory for a new board',
    '  --name <name>        Board directory name when using --parent',
    '  --no-welcome         Create default lists without the starter card',
    '  --use                Store the created board as the current board',
    '  --json',
    '',
    'Card list options:',
    '  --list <ref>          Limit to one or more lists (repeatable)',
    '  --label <ref>         Filter by one or more labels (repeatable)',
    '  --label-mode any|all  Label matching mode (default: any)',
    '  --search <query>      Search card title and body',
    '  --due <filter>        today | tomorrow | overdue | upcoming | this-week | next:7 | next:14 | next:30 | YYYY-MM-DD | none',
    '  --due-source any|card|task',
    '  --task-status open|any  Task due filtering (default: open for overdue, any otherwise)',
    '  --sort list|due|title|updated|updated-oldest|updated-newest|created-oldest|created-newest',
    '  --limit <n>',
    '  --include-archive',
    '  --json',
    '',
    'Card create/edit options:',
    '  --body <text>',
    '  --body-file <path>',
    '  --from-card <ref>    create only, copy card structure from this source card',
    '  --from-list <ref>    disambiguate --from-card/duplicate source list',
    '  --text <text>        insert-after-heading and notes only',
    '  --text-file <path>   insert-after-heading and notes only',
    '  --append-body <text>  edit only',
    '  --replace-section <heading>  edit only, replace body under a Markdown heading',
    '  --insert-after-heading <heading>  edit only, insert text below a Markdown heading',
    '  --due <YYYY-MM-DD|none>',
    '  --label <ref>         create only',
    '  --set-label <ref>     edit only, replaces labels',
    '  --add-label <ref>     edit only',
    '  --remove-label <ref>  edit only',
    '  --clear-labels        edit/create-from-card/duplicate only',
    '  --move-to <list-ref>  edit only',
    '  --dry-run             preview card writes without changing files',
    '',
    'Archive options:',
    '  --search <query>      Search archived titles, ids, labels, and original list names',
    '  --kind card|list      Required for `archive read`',
    '  --entry <ref>         Archive path, file name, card id, or title/name',
    '  --to-list <ref>       Restore an archived card into this list',
    '  --as <directory-name> Optional directory name when restoring a list',
    '',
    'Import options:',
    '  trello: --file <export.json>',
    '  obsidian: --source <path> (repeatable, files and directories allowed)',
    '  tasksmd: --source <path> (project directory)',
    '',
    'Reference matching:',
    '  list refs: directory name or display name, exact or unique partial match',
    '  card refs: filename, 5-char card id, or title, exact or unique partial match',
    '',
  ].join('\n');
}

function getArchiveUsage(commandName = 'signboard') {
  return [
    `Usage: ${commandName} archive cards [--search <query>] [--json]`,
    `       ${commandName} archive lists [--search <query>] [--json]`,
    `       ${commandName} archive read --kind card|list --entry <ref> [--json]`,
    `       ${commandName} archive restore-card --card <ref> --to-list <list-ref> [--json]`,
    `       ${commandName} archive restore-list --list <ref> [--as <directory-name>] [--json]`,
  ].join('\n');
}

async function readBodyOption(options) {
  const bodyValue = getOption(options, 'body');
  const bodyFile = getOption(options, 'body-file');

  if (bodyValue != null && bodyFile != null) {
    throw new Error('Use either --body or --body-file, not both.');
  }

  if (bodyValue != null) {
    return String(bodyValue);
  }

  if (bodyFile != null) {
    const bodyPath = path.resolve(String(bodyFile));
    return fs.readFile(bodyPath, 'utf8');
  }

  return undefined;
}

async function readTextOption(options) {
  const textValue = getOption(options, 'text');
  const textFile = getOption(options, 'text-file');

  if (textValue != null && textFile != null) {
    throw new Error('Use either --text or --text-file, not both.');
  }

  if (textValue != null) {
    return String(textValue);
  }

  if (textFile != null) {
    const textPath = path.resolve(String(textFile));
    return fs.readFile(textPath, 'utf8');
  }

  return undefined;
}

function normalizeImportPath(value, fieldName) {
  if (value === true || value == null) {
    throw new Error(`${fieldName} is required.`);
  }

  const input = String(value || '').trim();
  if (!input) {
    throw new Error(`${fieldName} is required.`);
  }

  return path.resolve(input);
}

function renderImportSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return 'Import completed.\n';
  }

  const sourceCount = Array.isArray(summary.sources) ? summary.sources.length : 0;
  const lines = [
    `Imported ${sourceCount === 1 ? '1 source' : `${sourceCount} sources`} from ${summary.importer || 'external source'}.`,
    `${summary.listsCreated || 0} list${summary.listsCreated === 1 ? '' : 's'} created.`,
    `${summary.cardsCreated || 0} card${summary.cardsCreated === 1 ? '' : 's'} created.`,
    `${summary.labelsCreated || 0} label${summary.labelsCreated === 1 ? '' : 's'} created.`,
    `${summary.archivedCards || 0} archived.`,
  ];

  const warningMessages = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
  if (warningMessages.length > 0) {
    lines.push('', 'Warnings:');
    for (const warningMessage of warningMessages) {
      lines.push(`- ${warningMessage}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderListsTable(lists) {
  if (!lists.length) {
    return 'No lists found.\n';
  }

  const nameWidth = Math.max(...lists.map((item) => item.displayName.length), 'List'.length);
  const dirWidth = Math.max(...lists.map((item) => item.directoryName.length), 'Directory'.length);
  const lines = [`${pad('List', nameWidth)}  ${pad('Cards', 5)}  ${pad('Directory', dirWidth)}`];

  for (const item of lists) {
    lines.push(
      `${pad(item.displayName, nameWidth)}  ${pad(item.cardCount ?? '', 5)}  ${pad(item.directoryName, dirWidth)}`
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderCardsTable(cards, dueSource) {
  if (!cards.length) {
    return 'No cards found.\n';
  }

  const rows = cards.map((card) => ({
    id: card.cardId || '',
    due: summarizeDue(card) || '-',
    list: card.listDisplayName,
    labels: card.labelNames.length > 0 ? card.labelNames.join(', ') : '-',
    title: card.title,
    tasks: card.taskSummary.total > 0 ? `${card.taskSummary.completed}/${card.taskSummary.total}` : '-',
    earliest: getEarliestDueDate(card, dueSource),
  }));

  const idWidth = Math.max(...rows.map((row) => row.id.length), 'ID'.length);
  const dueWidth = Math.max(...rows.map((row) => row.due.length), 'Due'.length);
  const listWidth = Math.max(...rows.map((row) => row.list.length), 'List'.length);
  const tasksWidth = Math.max(...rows.map((row) => row.tasks.length), 'Tasks'.length);
  const lines = [
    `${pad('ID', idWidth)}  ${pad('Due', dueWidth)}  ${pad('List', listWidth)}  ${pad('Tasks', tasksWidth)}  Title`,
  ];

  for (const row of rows) {
    lines.push(
      `${pad(row.id, idWidth)}  ${pad(row.due, dueWidth)}  ${pad(row.list, listWidth)}  ${pad(row.tasks, tasksWidth)}  ${row.title}`
    );
    lines.push(
      `${pad('', idWidth)}  ${pad('', dueWidth)}  ${pad('', listWidth)}  ${pad('', tasksWidth)}  labels: ${row.labels}`
    );
  }

  return `${lines.join('\n')}\n`;
}

function cardForJson(card) {
  return {
    id: card.cardId,
    fileName: card.fileName,
    filePath: card.filePath,
    listDirectoryName: card.listDirectoryName,
    listDisplayName: card.listDisplayName,
    title: card.title,
    due: card.due || null,
    labels: card.labels,
    labelNames: card.labelNames || [],
    timestamps: card.timestamps || {
      createdAt: card.createdAt || '',
      updatedAt: card.updatedAt || '',
    },
    taskSummary: card.taskSummary,
    taskDueDates: card.taskDueDates,
    body: card.body,
  };
}

function cardWriteResultForJson(card) {
  const payload = cardForJson(card);

  if (card && card.dryRun === true) {
    return {
      ...payload,
      dryRun: true,
      operation: card.operation || 'card-write',
      sourceListDirectoryName: card.sourceListDirectoryName,
      sourceListDisplayName: card.sourceListDisplayName,
      sourceFileName: card.sourceFileName,
      sourceFilePath: card.sourceFilePath,
      wouldMove: card.wouldMove,
      frontmatter: card.frontmatter,
    };
  }

  return payload;
}

function normalizeArchiveMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function buildArchiveCardSearchText(entry) {
  return [
    entry && entry.title,
    entry && entry.cardId,
    entry && entry.archivedCardFile,
    entry && entry.originalListDisplayName,
    entry && entry.originalListDirectoryName,
    entry && entry.archivedListDirectoryName,
    ...(Array.isArray(entry && entry.labelNames) ? entry.labelNames : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildArchiveListSearchText(entry) {
  return [
    entry && entry.listDisplayName,
    entry && entry.listDirectoryName,
    entry && entry.originalListDisplayName,
    entry && entry.originalListDirectoryName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function filterArchiveEntries(entries, searchQuery, kind) {
  const normalizedSearch = normalizeArchiveMatchValue(searchQuery);
  const items = Array.isArray(entries) ? entries : [];
  if (!normalizedSearch) {
    return items;
  }

  const buildSearchText = kind === 'list'
    ? buildArchiveListSearchText
    : buildArchiveCardSearchText;

  return items.filter((entry) => buildSearchText(entry).includes(normalizedSearch));
}

function resolveArchiveMatch(items, ref, matchers, label) {
  const normalizedRef = normalizeArchiveMatchValue(ref);
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

function renderArchiveCardsTable(cards) {
  if (!cards.length) {
    return 'No archived cards found.\n';
  }

  const rows = cards.map((entry) => ({
    id: entry.cardId || '',
    archived: String(entry.archivedAt || 'Unknown date'),
    originalList: entry.originalListDisplayName || 'Unknown original list',
    storedIn: entry.insideArchivedList ? (entry.archivedListDirectoryName || 'Archived list') : '-',
    title: entry.title || 'Untitled',
  }));

  const idWidth = Math.max(...rows.map((row) => row.id.length), 'ID'.length);
  const archivedWidth = Math.max(...rows.map((row) => row.archived.length), 'Archived'.length);
  const listWidth = Math.max(...rows.map((row) => row.originalList.length), 'Original List'.length);
  const storedWidth = Math.max(...rows.map((row) => row.storedIn.length), 'Stored In'.length);
  const lines = [
    `${pad('ID', idWidth)}  ${pad('Archived', archivedWidth)}  ${pad('Original List', listWidth)}  ${pad('Stored In', storedWidth)}  Title`,
  ];

  for (const row of rows) {
    lines.push(
      `${pad(row.id, idWidth)}  ${pad(row.archived, archivedWidth)}  ${pad(row.originalList, listWidth)}  ${pad(row.storedIn, storedWidth)}  ${row.title}`
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderArchiveListsTable(lists) {
  if (!lists.length) {
    return 'No archived lists found.\n';
  }

  const rows = lists.map((entry) => ({
    list: entry.listDisplayName || entry.listDirectoryName || 'Untitled list',
    cardCount: String(entry.cardCount ?? 0),
    archived: String(entry.archivedAt || 'Unknown date'),
    originalList: entry.originalListDisplayName || 'Unknown original list',
    directory: entry.listDirectoryName || '',
  }));

  const listWidth = Math.max(...rows.map((row) => row.list.length), 'List'.length);
  const countWidth = Math.max(...rows.map((row) => row.cardCount.length), 'Cards'.length);
  const archivedWidth = Math.max(...rows.map((row) => row.archived.length), 'Archived'.length);
  const originalWidth = Math.max(...rows.map((row) => row.originalList.length), 'Original List'.length);
  const directoryWidth = Math.max(...rows.map((row) => row.directory.length), 'Directory'.length);
  const lines = [
    `${pad('List', listWidth)}  ${pad('Cards', countWidth)}  ${pad('Archived', archivedWidth)}  ${pad('Original List', originalWidth)}  ${pad('Directory', directoryWidth)}`,
  ];

  for (const row of rows) {
    lines.push(
      `${pad(row.list, listWidth)}  ${pad(row.cardCount, countWidth)}  ${pad(row.archived, archivedWidth)}  ${pad(row.originalList, originalWidth)}  ${pad(row.directory, directoryWidth)}`
    );
  }

  return `${lines.join('\n')}\n`;
}

function normalizeArchiveKind(value) {
  const normalized = normalizeArchiveMatchValue(value);
  if (normalized === 'card' || normalized === 'list') {
    return normalized;
  }

  throw new Error('Unsupported archive kind. Use card or list.');
}

async function getArchiveEntries(boardRoot) {
  return listArchiveEntries(boardRoot);
}

async function resolveArchivedCardEntry(boardRoot, cardRef) {
  const archiveEntries = await getArchiveEntries(boardRoot);
  return resolveArchiveMatch(
    archiveEntries.cards,
    cardRef,
    [
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.entryPath);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.archivedCardFile);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.cardId);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.title);
        return exact ? value === ref : value.includes(ref);
      },
    ],
    'archived card',
  );
}

async function resolveArchivedListEntry(boardRoot, listRef) {
  const archiveEntries = await getArchiveEntries(boardRoot);
  return resolveArchiveMatch(
    archiveEntries.lists,
    listRef,
    [
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.entryPath);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.listDirectoryName);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.listDisplayName);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.originalListDirectoryName);
        return exact ? value === ref : value.includes(ref);
      },
      (item, ref, exact) => {
        const value = normalizeArchiveMatchValue(item.originalListDisplayName);
        return exact ? value === ref : value.includes(ref);
      },
    ],
    'archived list',
  );
}

async function resolveBoardRoot(options, context) {
  const explicitBoard = getOption(options, 'board');
  if (explicitBoard) {
    return String(explicitBoard);
  }

  const currentBoard = await getCurrentBoard(context.stateOptions);
  if (currentBoard) {
    return currentBoard;
  }

  throw new Error('No board selected. Run `signboard use /path/to/board` first.');
}

async function runUseCommand(positionals, context) {
  assertAllowedOptions(context.options, [], 'Usage: signboard use <board-root>');
  if (positionals.length === 0) {
    const currentBoard = await getCurrentBoard(context.stateOptions);
    if (!currentBoard) {
      throw new Error('No board selected. Run `signboard use /path/to/board` first.');
    }

    context.stdout.write(`${currentBoard}\n`);
    return 0;
  }

  assertNoExtraPositionals(positionals, 1, 'Usage: signboard use <board-root>');
  if (!positionals[0]) {
    throw new Error('Usage: signboard use <board-root>');
  }
  const result = await setCurrentBoard(positionals[0], context.stateOptions);
  context.stdout.write(`Now using board: ${result.currentBoard}\n`);
  return 0;
}

function validateBoardNameSegment(value) {
  const boardName = String(value || '').trim();
  if (!boardName) {
    throw new Error('--name is required.');
  }

  if (boardName === '.' || boardName === '..' || boardName !== path.basename(boardName)) {
    throw new Error('--name must be a single directory name.');
  }

  return boardName;
}

function resolveBoardCreateRoot(positionals, options, usage) {
  const positionalBoardRoot = positionals[0] ? String(positionals[0]) : '';
  const parentRoot = getOption(options, 'parent') || getOption(options, 'parent-root');
  const boardName = getOption(options, 'name') || getOption(options, 'board-name');

  if (positionalBoardRoot && (parentRoot || boardName)) {
    throw new Error(`Use either <board-root> or --parent with --name, not both.\n\n${usage}`);
  }

  if (positionalBoardRoot) {
    return path.resolve(positionalBoardRoot);
  }

  if (!parentRoot || !boardName) {
    throw new Error(usage);
  }

  return path.resolve(String(parentRoot), validateBoardNameSegment(boardName));
}

async function runBoardsCommand(action, positionals, options, context) {
  const usage = [
    `Usage: ${context.commandName || 'signboard'} boards create <board-root> [--no-welcome] [--use] [--json]`,
    `       ${context.commandName || 'signboard'} boards create --parent <parent-root> --name <board-name> [--no-welcome] [--use] [--json]`,
  ].join('\n');

  if (action !== 'create') {
    throw new Error(usage);
  }

  assertAllowedOptions(options, ['json', 'use', 'no-welcome', 'parent', 'parent-root', 'name', 'board-name'], usage);
  assertNoExtraPositionals(positionals, 1, usage);

  const boardRoot = resolveBoardCreateRoot(positionals, options, usage);
  const created = await createBoardOnDisk(boardRoot, {
    seedWelcomeCard: getOption(options, 'no-welcome') !== true,
  });

  if (getOption(options, 'use') === true) {
    await setCurrentBoard(created.boardRoot, context.stateOptions);
  }

  const payload = {
    ...created,
    currentBoardUpdated: getOption(options, 'use') === true,
  };

  if (getOption(options, 'json') === true) {
    context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }

  context.stdout.write(`Created board "${created.boardName}" at ${created.boardRoot}\n`);
  if (payload.currentBoardUpdated) {
    context.stdout.write(`Now using board: ${created.boardRoot}\n`);
  }
  return 0;
}

async function runListsCommand(action, positionals, options, context) {
  const boardRoot = await resolveBoardRoot(options, context);

  if (!action || action === 'list') {
    assertAllowedOptions(options, ['include-archive', 'json', 'board'], 'Usage: signboard lists');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard lists');
    const lists = await listLists(boardRoot, {
      includeArchive: getOption(options, 'include-archive') === true,
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(lists, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(renderListsTable(lists));
    return 0;
  }

  if (action === 'create') {
    assertAllowedOptions(options, ['json', 'board'], 'Usage: signboard lists create <name>');
    assertNoExtraPositionals(positionals, 1, 'Usage: signboard lists create <name>');
    if (!positionals[0]) {
      throw new Error('Usage: signboard lists create <name>');
    }
    const created = await createList(boardRoot, positionals[0]);

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(created, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(`Created list "${created.displayName}" as ${created.directoryName}\n`);
    return 0;
  }

  if (action === 'rename') {
    assertAllowedOptions(options, ['json', 'board'], 'Usage: signboard lists rename <list-ref> <new-name>');
    assertNoExtraPositionals(positionals, 2, 'Usage: signboard lists rename <list-ref> <new-name>');
    if (!positionals[0] || !positionals[1]) {
      throw new Error('Usage: signboard lists rename <list-ref> <new-name>');
    }
    const result = await renameList(boardRoot, positionals[0], positionals[1]);

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (!result.changed) {
      context.stdout.write(`List unchanged: ${result.after.directoryName}\n`);
      return 0;
    }

    context.stdout.write(`Renamed list to ${result.after.directoryName}\n`);
    return 0;
  }

  throw new Error(`Unknown lists command: ${action}`);
}

async function runCardsCommand(action, positionals, options, context) {
  const boardRoot = await resolveBoardRoot(options, context);

  if (!action || action === 'list' || !CARD_SUBCOMMANDS.has(action)) {
    assertAllowedOptions(
      options,
      ['list', 'label', 'label-mode', 'search', 'due', 'due-source', 'task-status', 'sort', 'limit', 'include-archive', 'json', 'board'],
      'Usage: signboard cards [list-ref] [options]'
    );
    const positionalListRef = (!action || action === 'list') ? positionals[0] : action;
    const remainingPositionals = (!action || action === 'list') ? positionals.slice(1) : positionals;
    assertNoExtraPositionals(remainingPositionals, 0, 'Usage: signboard cards [list-ref] [options]');
    const dueSource = String(getOption(options, 'due-source', 'any')).toLowerCase();
    const listRefs = getOptionList(options, 'list');
    if (positionalListRef) {
      listRefs.unshift(positionalListRef);
    }
    const cards = await listCards(boardRoot, {
      listRefs,
      labelRefs: getOptionList(options, 'label'),
      labelMode: getOption(options, 'label-mode', 'any'),
      search: getOption(options, 'search', ''),
      due: getOption(options, 'due'),
      dueSource,
      taskStatus: getOption(options, 'task-status'),
      sort: getOption(options, 'sort', 'list'),
      limit: getOption(options, 'limit'),
      includeArchive: getOption(options, 'include-archive') === true,
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cards.map(cardForJson), null, 2)}\n`);
      return 0;
    }

    context.stdout.write(renderCardsTable(cards, dueSource));
    return 0;
  }

  if (action === 'read') {
    assertAllowedOptions(options, ['card', 'list', 'include-archive', 'json', 'board'], 'Usage: signboard cards read --card <card-ref> [--list <list-ref>]');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard cards read --card <card-ref> [--list <list-ref>]');
    const cardRef = getOption(options, 'card');
    if (!cardRef) {
      throw new Error('--card is required.');
    }

    const card = await resolveCard(boardRoot, {
      cardRef,
      listRef: getOption(options, 'list'),
      includeArchive: getOption(options, 'include-archive') === true,
    });

    context.stdout.write(`${JSON.stringify(cardForJson(card), null, 2)}\n`);
    return 0;
  }

  if (action === 'create') {
    assertAllowedOptions(
      options,
      ['list', 'title', 'from-card', 'from-list', 'body', 'body-file', 'due', 'label', 'remove-label', 'clear-labels', 'dry-run', 'json', 'board'],
      'Usage: signboard cards create --list <list-ref> --title <title> [options]'
    );
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard cards create --list <list-ref> --title <title> [options]');
    const listRef = getOption(options, 'list');
    const title = getOption(options, 'title');
    if (!listRef) {
      throw new Error('--list is required.');
    }
    if (!title && !getOption(options, 'from-card')) {
      throw new Error('--title is required.');
    }

    const body = await readBodyOption(options);
    const fromCard = getOption(options, 'from-card');
    const created = fromCard
      ? await duplicateCard(boardRoot, {
          operation: 'create-card-from-template',
          cardRef: fromCard,
          fromListRef: getOption(options, 'from-list'),
          targetListRef: listRef,
          ...(title ? { title } : { titlePrefix: '' }),
          ...(body !== undefined ? { body } : {}),
          ...(Object.prototype.hasOwnProperty.call(options, 'due') ? { due: getOption(options, 'due') } : {}),
          addLabelRefs: getOptionList(options, 'label'),
          removeLabelRefs: getOptionList(options, 'remove-label'),
          clearLabels: getOption(options, 'clear-labels') === true,
          dryRun: getOption(options, 'dry-run') === true,
        })
      : await createCard(boardRoot, {
          listRef,
          title,
          body,
          due: getOption(options, 'due'),
          labelRefs: getOptionList(options, 'label'),
          dryRun: getOption(options, 'dry-run') === true,
        });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cardWriteResultForJson(created), null, 2)}\n`);
      return 0;
    }

    if (created.dryRun === true) {
      context.stdout.write(`Dry run: would create card "${created.title}" in ${created.listDisplayName} as ${created.fileName}\n`);
      return 0;
    }

    context.stdout.write(`Created card "${created.title}" in ${created.listDisplayName} as ${created.fileName}\n`);
    return 0;
  }

  if (action === 'duplicate') {
    assertAllowedOptions(
      options,
      ['card', 'from-list', 'list', 'title', 'body', 'body-file', 'label', 'remove-label', 'clear-labels', 'dry-run', 'json', 'board'],
      'Usage: signboard cards duplicate --card <card-ref> [--list <target-list-ref>] [options]'
    );
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard cards duplicate --card <card-ref> [--list <target-list-ref>] [options]');
    const cardRef = getOption(options, 'card');
    if (!cardRef) {
      throw new Error('--card is required.');
    }

    const body = await readBodyOption(options);
    const duplicated = await duplicateCard(boardRoot, {
      cardRef,
      fromListRef: getOption(options, 'from-list'),
      targetListRef: getOption(options, 'list'),
      ...(Object.prototype.hasOwnProperty.call(options, 'title') ? { title: getOption(options, 'title') } : {}),
      ...(body !== undefined ? { body } : {}),
      addLabelRefs: getOptionList(options, 'label'),
      removeLabelRefs: getOptionList(options, 'remove-label'),
      clearLabels: getOption(options, 'clear-labels') === true,
      dryRun: getOption(options, 'dry-run') === true,
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cardWriteResultForJson(duplicated), null, 2)}\n`);
      return 0;
    }

    if (duplicated.dryRun === true) {
      context.stdout.write(`Dry run: would duplicate card "${duplicated.title}" in ${duplicated.listDisplayName} as ${duplicated.fileName}\n`);
      return 0;
    }

    context.stdout.write(`Duplicated card "${duplicated.title}" in ${duplicated.listDisplayName} as ${duplicated.fileName}\n`);
    return 0;
  }

  if (action === 'notes') {
    const notesAction = positionals[0];
    const usage = 'Usage: signboard cards notes add --card <card-ref> --text <text> [--timestamp]';
    if (notesAction !== 'add') {
      throw new Error(usage);
    }

    assertAllowedOptions(options, ['card', 'list', 'text', 'text-file', 'timestamp', 'section', 'dry-run', 'json', 'board'], usage);
    assertNoExtraPositionals(positionals, 1, usage);
    const cardRef = getOption(options, 'card');
    if (!cardRef) {
      throw new Error('--card is required.');
    }

    const text = await readTextOption(options);
    if (text == null || !String(text).trim()) {
      throw new Error('--text is required.');
    }

    const edited = await addCardNote(boardRoot, {
      cardRef,
      listRef: getOption(options, 'list'),
      text,
      section: getOption(options, 'section', 'Notes'),
      timestamp: getOption(options, 'timestamp') === true,
      dryRun: getOption(options, 'dry-run') === true,
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cardWriteResultForJson(edited), null, 2)}\n`);
      return 0;
    }

    if (edited.dryRun === true) {
      context.stdout.write(`Dry run: would add note to "${edited.title}"\n`);
      return 0;
    }

    context.stdout.write(`Added note to "${edited.title}"\n`);
    return 0;
  }

  if (action === 'edit') {
    assertAllowedOptions(
      options,
      ['card', 'list', 'title', 'body', 'body-file', 'append-body', 'replace-section', 'insert-after-heading', 'text', 'text-file', 'due', 'set-label', 'add-label', 'remove-label', 'clear-labels', 'move-to', 'dry-run', 'json', 'board'],
      'Usage: signboard cards edit --card <card-ref> [--list <list-ref>] [options]'
    );
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard cards edit --card <card-ref> [--list <list-ref>] [options]');
    const cardRef = getOption(options, 'card');
    if (!cardRef) {
      throw new Error('--card is required.');
    }

    const editOptions = {
      cardRef,
      listRef: getOption(options, 'list'),
      setLabelRefs: getOptionList(options, 'set-label'),
      addLabelRefs: getOptionList(options, 'add-label'),
      removeLabelRefs: getOptionList(options, 'remove-label'),
      clearLabels: getOption(options, 'clear-labels') === true,
      moveToListRef: getOption(options, 'move-to'),
      dryRun: getOption(options, 'dry-run') === true,
    };

    if (Object.prototype.hasOwnProperty.call(options, 'title')) {
      editOptions.title = getOption(options, 'title');
    }

    const body = await readBodyOption(options);
    if (body !== undefined && !Object.prototype.hasOwnProperty.call(options, 'replace-section')) {
      editOptions.body = body;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'append-body')) {
      editOptions.appendBody = getOption(options, 'append-body');
    }

    if (Object.prototype.hasOwnProperty.call(options, 'replace-section')) {
      if (body === undefined) {
        throw new Error('--replace-section requires --body or --body-file.');
      }

      editOptions.replaceSection = {
        heading: getOption(options, 'replace-section'),
        body,
      };
    }

    if (Object.prototype.hasOwnProperty.call(options, 'insert-after-heading')) {
      const text = await readTextOption(options);
      if (text === undefined) {
        throw new Error('--insert-after-heading requires --text or --text-file.');
      }

      editOptions.insertAfterHeading = {
        heading: getOption(options, 'insert-after-heading'),
        text,
      };
    }

    if (Object.prototype.hasOwnProperty.call(options, 'due')) {
      editOptions.due = getOption(options, 'due');
    }

    const edited = await editCard(boardRoot, editOptions);

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cardWriteResultForJson(edited), null, 2)}\n`);
      return 0;
    }

    if (edited.dryRun === true) {
      context.stdout.write(`Dry run: would update card "${edited.title}" in ${edited.listDisplayName}\n`);
      return 0;
    }

    context.stdout.write(`Updated card "${edited.title}" in ${edited.listDisplayName}\n`);
    return 0;
  }

  throw new Error(`Unknown cards command: ${action}`);
}

async function runArchiveCommand(action, positionals, options, context) {
  const boardRoot = await resolveBoardRoot(options, context);
  const usage = getArchiveUsage(context.commandName || 'signboard');

  if (!action) {
    throw new Error(usage);
  }

  if (action === 'cards') {
    assertAllowedOptions(options, ['search', 'json', 'board'], usage);
    assertNoExtraPositionals(positionals, 0, usage);
    const archiveEntries = await getArchiveEntries(boardRoot);
    const cards = filterArchiveEntries(archiveEntries.cards, getOption(options, 'search', ''), 'card');

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cards, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(renderArchiveCardsTable(cards));
    return 0;
  }

  if (action === 'lists') {
    assertAllowedOptions(options, ['search', 'json', 'board'], usage);
    assertNoExtraPositionals(positionals, 0, usage);
    const archiveEntries = await getArchiveEntries(boardRoot);
    const lists = filterArchiveEntries(archiveEntries.lists, getOption(options, 'search', ''), 'list');

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(lists, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(renderArchiveListsTable(lists));
    return 0;
  }

  if (action === 'read') {
    assertAllowedOptions(options, ['entry', 'kind', 'json', 'board'], usage);
    assertNoExtraPositionals(positionals, 0, usage);
    const entryRef = getOption(options, 'entry');
    const kindValue = getOption(options, 'kind');
    if (!entryRef) {
      throw new Error('--entry is required.');
    }
    if (!kindValue) {
      throw new Error('--kind is required.');
    }

    const kind = normalizeArchiveKind(kindValue);
    const entry = kind === 'list'
      ? await resolveArchivedListEntry(boardRoot, entryRef)
      : await resolveArchivedCardEntry(boardRoot, entryRef);
    const detail = await readArchiveEntry(boardRoot, entry.entryPath);
    context.stdout.write(`${JSON.stringify(detail, null, 2)}\n`);
    return 0;
  }

  if (action === 'restore-card') {
    assertAllowedOptions(options, ['card', 'to-list', 'json', 'board'], usage);
    assertNoExtraPositionals(positionals, 0, usage);
    const cardRef = getOption(options, 'card');
    const toListRef = getOption(options, 'to-list');
    if (!cardRef) {
      throw new Error('--card is required.');
    }
    if (!toListRef) {
      throw new Error('--to-list is required.');
    }

    const archivedCard = await resolveArchivedCardEntry(boardRoot, cardRef);
    const targetList = await resolveList(boardRoot, toListRef, { includeArchive: false });
    const restored = await restoreArchivedCard(boardRoot, archivedCard.entryPath, targetList.path);
    const payload = {
      ...restored,
      title: archivedCard.title,
      cardId: archivedCard.cardId,
    };

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(`Restored card "${archivedCard.title}" to ${restored.targetListDisplayName} as ${restored.restoredCardFile}\n`);
    return 0;
  }

  if (action === 'restore-list') {
    assertAllowedOptions(options, ['list', 'as', 'json', 'board'], usage);
    assertNoExtraPositionals(positionals, 0, usage);
    const listRef = getOption(options, 'list');
    if (!listRef) {
      throw new Error('--list is required.');
    }

    const archivedList = await resolveArchivedListEntry(boardRoot, listRef);
    const restoredDirectoryName = Object.prototype.hasOwnProperty.call(options, 'as')
      ? String(getOption(options, 'as') || '').trim()
      : '';
    const restored = await restoreArchivedList(boardRoot, archivedList.entryPath, restoredDirectoryName);
    const payload = {
      ...restored,
      listDisplayName: archivedList.listDisplayName,
      originalListDisplayName: archivedList.originalListDisplayName,
    };

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(`Restored list "${archivedList.listDisplayName}" as ${restored.restoredDirectoryName}\n`);
    return 0;
  }

  throw new Error(`Unknown archive command: ${action}\n\n${usage}`);
}

async function runSettingsCommand(action, positionals, options, context) {
  const boardRoot = await resolveBoardRoot(options, context);

  if (!action || action === 'read') {
    assertAllowedOptions(options, ['json', 'board'], 'Usage: signboard settings [--json]');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard settings [--json]');
    const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: true });
    context.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown settings command: ${action}`);
}

async function runImportCommand(action, positionals, options, context) {
  const boardRoot = await resolveBoardRoot(options, context);

  if (!action || !IMPORT_SUBCOMMANDS.has(action)) {
    throw new Error('Usage: signboard import trello --file <export.json> [--json]\n       signboard import obsidian --source <path> [--source <path> ...] [--json]\n       signboard import tasksmd --source <path> [--json]');
  }

  if (action === 'trello') {
    assertAllowedOptions(options, ['file', 'json', 'board'], 'Usage: signboard import trello --file <export.json> [--json]');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard import trello --file <export.json> [--json]');
    const sourcePath = normalizeImportPath(getOption(options, 'file'), '--file');
    const summary = await importTrello({
      boardRoot,
      sourcePath,
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(renderImportSummary(summary));
    return 0;
  }

  if (action === 'tasksmd') {
    assertAllowedOptions(options, ['source', 'json', 'board'], 'Usage: signboard import tasksmd --source <path> [--json]');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard import tasksmd --source <path> [--json]');
    const sourcePath = normalizeImportPath(getOption(options, 'source'), '--source');
    const summary = await importTasksMd({
      boardRoot,
      sourcePaths: [sourcePath],
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return 0;
    }

    context.stdout.write(renderImportSummary(summary));
    return 0;
  }

  assertAllowedOptions(options, ['source', 'json', 'board'], 'Usage: signboard import obsidian --source <path> [--source <path> ...] [--json]');
  assertNoExtraPositionals(positionals, 0, 'Usage: signboard import obsidian --source <path> [--source <path> ...] [--json]');
  const sourcePaths = getOptionList(options, 'source').map((value) => normalizeImportPath(value, '--source'));
  if (sourcePaths.length === 0) {
    throw new Error('At least one --source path is required.');
  }

  const summary = await importObsidian({
    boardRoot,
    sourcePaths,
  });

  if (getOption(options, 'json') === true) {
    context.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }

  context.stdout.write(renderImportSummary(summary));
  return 0;
}

function normalizeCliArgs(argv) {
  return Array.isArray(argv) ? argv.map((value) => String(value)) : [];
}

function isCliInvocation(argv) {
  const args = normalizeCliArgs(argv);
  if (args.length === 0) {
    return false;
  }

  const firstArg = args[0];

  if (args[0] === 'help') {
    return true;
  }

  if (args[0] === '--help' || args[0] === '-h') {
    return true;
  }

  if (CLI_GROUPS.has(firstArg) || CLI_NEAR_MISSES.has(firstArg)) {
    return true;
  }

  if (APP_PASSTHROUGH_PREFIXES.some((prefix) => firstArg.startsWith(prefix))) {
    return false;
  }

  return !firstArg.startsWith('-');
}

function getCommandGroupSuggestion(resource) {
  if (resource === 'board') {
    return 'Did you mean `boards`?';
  }

  if (resource === 'card') {
    return 'Did you mean `cards`?';
  }

  if (resource === 'list') {
    return 'Did you mean `lists`?';
  }

  return '';
}

async function runCli(argv, context = {}) {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const commandName = context.commandName || 'signboard';
  const stateOptions = {
    env: context.env || process.env,
    platform: context.platform || process.platform,
    homeDir: context.homeDir,
  };
  const { positionals, options } = parseArgv(normalizeCliArgs(argv));

  if (options.help || positionals.length === 0 || positionals[0] === 'help') {
    stdout.write(`${renderHelpText(commandName)}\n`);
    return 0;
  }

  const [resource, action, ...rest] = positionals;
  if (resource === 'use' && !action) {
    return runUseCommand([], { stdout, stderr, commandName, stateOptions, options });
  }
  if (!resource) {
    stdout.write(`${renderHelpText(commandName)}\n`);
    return 1;
  }

  if (!action) {
    if (resource === 'lists') {
      return runListsCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'boards') {
      return runBoardsCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'cards') {
      return runCardsCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'archive') {
      return runArchiveCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'settings') {
      return runSettingsCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'import') {
      throw new Error('Usage: signboard import trello --file <export.json> [--json]\n       signboard import obsidian --source <path> [--source <path> ...] [--json]\n       signboard import tasksmd --source <path> [--json]');
    }
    const suggestion = getCommandGroupSuggestion(resource);
    throw new Error(
      suggestion
        ? `Unknown command group: ${resource}\n${suggestion}`
        : `Unknown command group: ${resource}`
    );
  }

  if (resource === 'use') {
    return runUseCommand([action, ...rest], { stdout, stderr, commandName, stateOptions, options });
  }

  if (resource === 'boards') {
    return runBoardsCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  if (resource === 'lists') {
    return runListsCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  if (resource === 'cards') {
    return runCardsCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  if (resource === 'archive') {
    return runArchiveCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  if (resource === 'settings') {
    return runSettingsCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  if (resource === 'import') {
    return runImportCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  const suggestion = getCommandGroupSuggestion(resource);
  throw new Error(
    suggestion
      ? `Unknown command group: ${resource}\n${suggestion}`
      : `Unknown command group: ${resource}`
  );
}

module.exports = {
  renderHelpText,
  parseArgv,
  isCliInvocation,
  runCli,
};
