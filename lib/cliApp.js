const fs = require('fs').promises;
const path = require('path');
const boardLabels = require('./boardLabels');
const {
  importTrello,
  importObsidian,
} = require('./importers');
const {
  listLists,
  createList,
  renameList,
  listCards,
  resolveCard,
  createCard,
  editCard,
  summarizeDue,
  getEarliestDueDate,
} = require('./cliBoard');
const {
  getCurrentBoard,
  setCurrentBoard,
} = require('./cliState');

const CLI_GROUPS = new Set(['use', 'lists', 'cards', 'settings', 'import']);
const CLI_NEAR_MISSES = new Set(['list', 'card']);
const CARD_SUBCOMMANDS = new Set(['list', 'read', 'create', 'edit']);
const IMPORT_SUBCOMMANDS = new Set(['trello', 'obsidian']);
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
    `  ${commandName} lists [--include-archive] [--json]`,
    `  ${commandName} lists create <name> [--json]`,
    `  ${commandName} lists rename <list-ref> <new-name> [--json]`,
    '',
    `  ${commandName} cards [list-ref] [options]`,
    `  ${commandName} cards read --card <card-ref> [--list <list-ref>] [--json]`,
    `  ${commandName} cards create --list <list-ref> --title <title> [options]`,
    `  ${commandName} cards edit --card <card-ref> [--list <list-ref>] [options]`,
    '',
    `  ${commandName} settings [--json]`,
    `  ${commandName} settings edit [--tooltips on|off] [--json]`,
    '',
    `  ${commandName} import trello --file <export.json> [--json]`,
    `  ${commandName} import obsidian --source <path> [--source <path> ...] [--json]`,
    '',
    'Board selection:',
    '  `signboard use /path/to/board` stores the current board for later commands',
    '  Use `--board <path>` to override the stored board for a single command',
    '',
    'Card list options:',
    '  --list <ref>          Limit to one or more lists (repeatable)',
    '  --label <ref>         Filter by one or more labels (repeatable)',
    '  --label-mode any|all  Label matching mode (default: any)',
    '  --search <query>      Search card title and body',
    '  --due <filter>        today | tomorrow | overdue | upcoming | this-week | next:7 | next:14 | next:30 | YYYY-MM-DD | none',
    '  --due-source any|card|task',
    '  --sort list|due|title|updated',
    '  --limit <n>',
    '  --include-archive',
    '  --json',
    '',
    'Card create/edit options:',
    '  --body <text>',
    '  --body-file <path>',
    '  --append-body <text>  edit only',
    '  --due <YYYY-MM-DD|none>',
    '  --label <ref>         create only',
    '  --set-label <ref>     edit only, replaces labels',
    '  --add-label <ref>     edit only',
    '  --remove-label <ref>  edit only',
    '  --move-to <list-ref>  edit only',
    '',
    'Import options:',
    '  trello: --file <export.json>',
    '  obsidian: --source <path> (repeatable, files and directories allowed)',
    '',
    'Reference matching:',
    '  list refs: directory name or display name, exact or unique partial match',
    '  card refs: filename, 5-char card id, or title, exact or unique partial match',
    '',
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
    taskSummary: card.taskSummary,
    taskDueDates: card.taskDueDates,
    body: card.body,
  };
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
      ['list', 'label', 'label-mode', 'search', 'due', 'due-source', 'sort', 'limit', 'include-archive', 'json', 'board'],
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
    assertAllowedOptions(options, ['list', 'title', 'body', 'body-file', 'due', 'label', 'json', 'board'], 'Usage: signboard cards create --list <list-ref> --title <title> [options]');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard cards create --list <list-ref> --title <title> [options]');
    const listRef = getOption(options, 'list');
    const title = getOption(options, 'title');
    if (!listRef) {
      throw new Error('--list is required.');
    }
    if (!title) {
      throw new Error('--title is required.');
    }

    const created = await createCard(boardRoot, {
      listRef,
      title,
      body: await readBodyOption(options),
      due: getOption(options, 'due'),
      labelRefs: getOptionList(options, 'label'),
    });

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cardForJson(created), null, 2)}\n`);
      return 0;
    }

    context.stdout.write(`Created card "${created.title}" in ${created.listDisplayName} as ${created.fileName}\n`);
    return 0;
  }

  if (action === 'edit') {
    assertAllowedOptions(
      options,
      ['card', 'list', 'title', 'body', 'body-file', 'append-body', 'due', 'set-label', 'add-label', 'remove-label', 'move-to', 'json', 'board'],
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
      moveToListRef: getOption(options, 'move-to'),
    };

    if (Object.prototype.hasOwnProperty.call(options, 'title')) {
      editOptions.title = getOption(options, 'title');
    }

    const body = await readBodyOption(options);
    if (body !== undefined) {
      editOptions.body = body;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'append-body')) {
      editOptions.appendBody = getOption(options, 'append-body');
    }

    if (Object.prototype.hasOwnProperty.call(options, 'due')) {
      editOptions.due = getOption(options, 'due');
    }

    const edited = await editCard(boardRoot, editOptions);

    if (getOption(options, 'json') === true) {
      context.stdout.write(`${JSON.stringify(cardForJson(edited), null, 2)}\n`);
      return 0;
    }

    context.stdout.write(`Updated card "${edited.title}" in ${edited.listDisplayName}\n`);
    return 0;
  }

  throw new Error(`Unknown cards command: ${action}`);
}

function normalizeBooleanOption(value, fieldName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`${fieldName} must be one of: on, off, true, false, yes, no, 1, 0.`);
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

  if (action === 'edit') {
    assertAllowedOptions(options, ['tooltips', 'json', 'board'], 'Usage: signboard settings edit [--tooltips on|off] [--json]');
    assertNoExtraPositionals(positionals, 0, 'Usage: signboard settings edit [--tooltips on|off] [--json]');

    const partialSettings = {};
    if (Object.prototype.hasOwnProperty.call(options, 'tooltips')) {
      partialSettings.tooltipsEnabled = normalizeBooleanOption(getOption(options, 'tooltips'), '--tooltips');
    }

    if (Object.keys(partialSettings).length === 0) {
      throw new Error('No settings provided. Use --tooltips on|off.');
    }

    const settings = await boardLabels.updateBoardSettings(boardRoot, partialSettings);
    context.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown settings command: ${action}`);
}

async function runImportCommand(action, positionals, options, context) {
  const boardRoot = await resolveBoardRoot(options, context);

  if (!action || !IMPORT_SUBCOMMANDS.has(action)) {
    throw new Error('Usage: signboard import trello --file <export.json> [--json]\n       signboard import obsidian --source <path> [--source <path> ...] [--json]');
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
    if (resource === 'cards') {
      return runCardsCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'settings') {
      return runSettingsCommand(undefined, [], options, { stdout, stderr, commandName, stateOptions });
    }
    if (resource === 'import') {
      throw new Error('Usage: signboard import trello --file <export.json> [--json]\n       signboard import obsidian --source <path> [--source <path> ...] [--json]');
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

  if (resource === 'lists') {
    return runListsCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
  }

  if (resource === 'cards') {
    return runCardsCommand(action, rest, options, { stdout, stderr, commandName, stateOptions });
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
