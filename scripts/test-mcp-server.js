const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const HEADER_TRANSPORT = 'header';
const HEADER_BOM_TRANSPORT = 'header-bom';
const NDJSON_TRANSPORT = 'ndjson';

function encodeMessage(payload, transportMode) {
  const json = JSON.stringify(payload);

  if (transportMode === HEADER_TRANSPORT || transportMode === HEADER_BOM_TRANSPORT) {
    const length = Buffer.byteLength(json, 'utf8');
    const headerPrefix = transportMode === HEADER_BOM_TRANSPORT ? '\uFEFF' : '';
    return Buffer.from(`${headerPrefix}Content-Length: ${length}\r\n\r\n${json}`, 'utf8');
  }

  return Buffer.from(`${json}\n`, 'utf8');
}

function readHeaderFrames(buffer, onFrame) {
  let working = buffer;

  while (true) {
    const headerBoundary = working.indexOf('\r\n\r\n');
    if (headerBoundary < 0) {
      return working;
    }

    const header = working.slice(0, headerBoundary).toString('utf8');
    const lines = header.split(/\r?\n/);
    const lengthLine = lines.find((line) => line.toLowerCase().replace(/^\uFEFF/, '').startsWith('content-length:'));
    if (!lengthLine) {
      throw new Error('Missing Content-Length header in MCP response frame.');
    }

    const contentLength = Number(lengthLine.split(':')[1].trim());
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      throw new Error(`Invalid Content-Length header in MCP response frame: ${lengthLine}`);
    }

    const bodyStart = headerBoundary + 4;
    const bodyEnd = bodyStart + contentLength;

    if (working.length < bodyEnd) {
      return working;
    }

    const body = working.slice(bodyStart, bodyEnd).toString('utf8');
    onFrame(JSON.parse(body));
    working = working.slice(bodyEnd);
  }
}

function readNdjsonFrames(buffer, onFrame) {
  let working = buffer;

  while (true) {
    const newlineIndex = working.indexOf('\n');
    if (newlineIndex < 0) {
      return working;
    }

    const line = working.slice(0, newlineIndex).toString('utf8').trim();
    working = working.slice(newlineIndex + 1);

    if (!line) {
      continue;
    }

    onFrame(JSON.parse(line));
  }
}

function assertCardTimestamps(card, contextLabel) {
  const timestamps = card && card.timestamps;
  if (!timestamps || typeof timestamps !== 'object') {
    throw new Error(`${contextLabel} did not include card.timestamps.`);
  }

  if (!timestamps.createdAt || Number.isNaN(Date.parse(timestamps.createdAt))) {
    throw new Error(`${contextLabel} included invalid createdAt: ${JSON.stringify(timestamps)}`);
  }

  if (Object.prototype.hasOwnProperty.call(timestamps, 'updatedAt') && timestamps.updatedAt) {
    if (Number.isNaN(Date.parse(timestamps.updatedAt))) {
      throw new Error(`${contextLabel} included invalid updatedAt: ${JSON.stringify(timestamps)}`);
    }
  }
}

async function createFixtureBoard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-mcp-test-'));
  const boardName = 'Good Migrations';
  const boardRoot = path.join(root, boardName);
  const leadsList = '000-Leads-stock';
  const workingList = '001-Working-stock';
  const archiveList = 'XXX-Archive';
  const templateCardFile = '001-template-card-ab123.md';
  const workingCardFile = '001-existing-work-xy987.md';

  await fs.mkdir(path.join(boardRoot, leadsList), { recursive: true });
  await fs.mkdir(path.join(boardRoot, workingList), { recursive: true });
  await fs.mkdir(path.join(boardRoot, archiveList), { recursive: true });

  await fs.writeFile(
    path.join(boardRoot, leadsList, templateCardFile),
    [
      '---',
      'title: Template Card',
      'labels:',
      '  - template',
      '---',
      'Customer details go here.',
      '- [ ] Initial outreach',
      '- [x ] (due: 2026-03-20) Send proposal',
      '- [ X] Confirm timeline',
      '',
    ].join('\n'),
    'utf8',
  );

  await fs.writeFile(
    path.join(boardRoot, workingList, workingCardFile),
    [
      '---',
      'title: Existing Work',
      '---',
      'Already in progress.',
      '',
    ].join('\n'),
    'utf8',
  );

  const trelloImportPath = path.join(root, 'mcp-trello-import.json');
  await fs.writeFile(
    trelloImportPath,
    JSON.stringify({
      name: 'MCP Trello Import',
      lists: [
        { id: 'mcp-trello-list-1', name: 'Trello MCP', closed: false, pos: 1 },
      ],
      labels: [],
      members: [],
      checklists: [],
      actions: [],
      cards: [
        {
          id: 'mcp-trello-card-1',
          idList: 'mcp-trello-list-1',
          name: 'Imported via MCP',
          desc: 'Created through signboard.import_trello.',
          due: '2026-03-30',
          closed: false,
          pos: 1,
          idLabels: [],
        },
      ],
    }, null, 2),
    'utf8',
  );

  const obsidianImportPath = path.join(root, 'mcp-obsidian-import.md');
  await fs.writeFile(
    obsidianImportPath,
    [
      '---',
      'kanban-plugin: board',
      '---',
      '',
      '## Inbox',
      '- [ ] MCP draft @{2026-03-29} #MCP',
      '',
      '## Review',
      '- [ ] MCP review',
      '',
      '%% kanban:settings',
      '{"kanban-plugin":"board"}',
      '%%',
      '',
    ].join('\n'),
    'utf8',
  );

  const tasksWorkspaceRoot = path.join(root, 'mcp-tasksmd-workspace');
  const tasksRoot = path.join(tasksWorkspaceRoot, 'tasks');
  const configRoot = path.join(tasksWorkspaceRoot, 'config');
  const tasksProjectPath = path.join(tasksRoot, 'MCP Tasks');
  await fs.mkdir(path.join(tasksProjectPath, 'Tasks Inbox'), { recursive: true });
  await fs.mkdir(configRoot, { recursive: true });

  await fs.writeFile(
    path.join(tasksProjectPath, 'Tasks Inbox', 'MCP Tasks Card.md'),
    [
      '[due:2026-03-28]',
      '',
      '[tag:MCP Tasks]',
      '',
      'Imported through signboard.import_tasksmd.',
      '',
    ].join('\n'),
    'utf8',
  );

  await fs.writeFile(
    path.join(configRoot, 'tags.json'),
    JSON.stringify({
      '/MCP Tasks': {
        'MCP Tasks': 'var(--color-alt-2)',
      },
    }, null, 2),
    'utf8',
  );

  return {
    cleanupRoot: root,
    allowedRoot: root,
    boardName,
    boardRoot,
    leadsList,
    workingList,
    archiveList,
    templateCardFile,
    workingCardFile,
    trelloImportPath,
    obsidianImportPath,
    tasksProjectPath,
  };
}

async function runForTransport(transportMode, fixture) {
  const child = spawn(
    process.execPath,
    ['-e', "const { startSignboardMcpServer } = require('./lib/mcpServer'); startSignboardMcpServer({ appVersion: 'test' });"],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        SIGNBOARD_MCP_ALLOWED_ROOTS: fixture.allowedRoot,
        SIGNBOARD_MCP_READ_ONLY: 'false',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let stderr = '';
  let stdoutBuffer = Buffer.alloc(0);
  let streamError = null;
  const responsesById = new Map();

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  const waitForExit = new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`MCP child exited with code=${code}. stderr=${stderr.trim()}`));
    });

    child.once('error', reject);
  });

  child.stdout.on('data', (chunk) => {
    try {
      const readFrames = transportMode.startsWith('header') ? readHeaderFrames : readNdjsonFrames;
      stdoutBuffer = readFrames(Buffer.concat([stdoutBuffer, chunk]), (frame) => {
        if (Object.prototype.hasOwnProperty.call(frame, 'id')) {
          responsesById.set(frame.id, frame);
        }
      });
    } catch (error) {
      streamError = error;
      child.kill('SIGTERM');
    }
  });

  const send = (payload) => {
    child.stdin.write(encodeMessage(payload, transportMode));
  };

  const waitForResponse = (id, timeoutMs = 3000) => new Promise((resolve, reject) => {
    const start = Date.now();

    const poll = () => {
      if (streamError) {
        reject(streamError);
        return;
      }

      if (responsesById.has(id)) {
        const response = responsesById.get(id);
        responsesById.delete(id);
        resolve(response);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for MCP response id=${id}. transport=${transportMode}. stderr=${stderr.trim()}`));
        return;
      }

      setTimeout(poll, 10);
    };

    poll();
  });

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25' },
  });

  const initializeResponse = await waitForResponse(1);
  if (initializeResponse.error) {
    throw new Error(`Initialize failed (${transportMode}): ${JSON.stringify(initializeResponse.error)}`);
  }

  send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });

  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const toolsResponse = await waitForResponse(2);
  if (toolsResponse.error) {
    throw new Error(`tools/list failed (${transportMode}): ${JSON.stringify(toolsResponse.error)}`);
  }

  const tools = Array.isArray(toolsResponse.result?.tools) ? toolsResponse.result.tools : [];
  const toolNames = new Set(tools.map((tool) => tool && tool.name).filter(Boolean));

  const requiredToolNames = [
    'signboard_get_config',
    'signboard_list_board_views',
    'signboard_resolve_board_by_name',
    'signboard_create_board',
    'signboard_list_lists',
    'signboard_list_cards',
    'signboard_read_card',
    'signboard_create_card',
    'signboard_update_card',
    'signboard_duplicate_card',
    'signboard_archive_card',
    'signboard_archive_list',
    'signboard_list_archive_entries',
    'signboard_read_archive_entry',
    'signboard_restore_archived_card',
    'signboard_restore_archived_list',
    'signboard_move_card',
    'signboard_create_list',
    'signboard_rename_board',
    'signboard_move_board',
    'signboard_read_board_settings',
    'signboard_update_board_settings',
    'signboard_import_trello',
    'signboard_import_obsidian',
    'signboard_import_tasksmd',
  ];

  for (const toolName of requiredToolNames) {
    if (!toolNames.has(toolName)) {
      throw new Error(`Missing MCP tool (${transportMode}): ${toolName}`);
    }
  }

  send({
    jsonrpc: '2.0',
    id: 250,
    method: 'tools/call',
    params: {
      name: 'signboard.get_config',
      arguments: {},
    },
  });

  const legacyAliasResponse = await waitForResponse(250);
  if (legacyAliasResponse.error) {
    throw new Error(`Legacy tool alias failed (${transportMode}): ${JSON.stringify(legacyAliasResponse.error)}`);
  }

  if (legacyAliasResponse.result?.structuredContent?.ok !== true) {
    throw new Error(`Legacy tool alias returned unexpected payload (${transportMode}): ${JSON.stringify(legacyAliasResponse.result)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'signboard_resolve_board_by_name',
      arguments: {
        boardName: fixture.boardName,
        exact: true,
        maxDepth: 3,
        limit: 5,
      },
    },
  });

  const resolveResponse = await waitForResponse(3);
  if (resolveResponse.error) {
    throw new Error(`resolve_board_by_name failed (${transportMode}): ${JSON.stringify(resolveResponse.error)}`);
  }

  const resolveOutput = resolveResponse.result?.structuredContent || {};
  if (!Array.isArray(resolveOutput.matches) || !resolveOutput.matches.includes(path.resolve(fixture.boardRoot))) {
    throw new Error(`Resolver did not return fixture board (${transportMode}): ${JSON.stringify(resolveOutput)}`);
  }

  const createdBoardName = `Created-${transportMode}`;
  send({
    jsonrpc: '2.0',
    id: 301,
    method: 'tools/call',
    params: {
      name: 'signboard_create_board',
      arguments: {
        parentRoot: fixture.allowedRoot,
        boardName: createdBoardName,
      },
    },
  });

  const createBoardResponse = await waitForResponse(301);
  if (createBoardResponse.error) {
    throw new Error(`create_board failed (${transportMode}): ${JSON.stringify(createBoardResponse.error)}`);
  }

  const createBoardOutput = createBoardResponse.result?.structuredContent || {};
  const createdBoardRoot = path.resolve(path.join(fixture.allowedRoot, createdBoardName));
  if (createBoardOutput.boardRoot !== createdBoardRoot) {
    throw new Error(`create_board returned unexpected boardRoot (${transportMode}): ${JSON.stringify(createBoardOutput)}`);
  }
  const expectedCreatedLists = ['000-To-do-stock', '001-Doing-stock', '002-Done-stock', 'XXX-Archive'];
  if (
    !Array.isArray(createBoardOutput.listNames) ||
    expectedCreatedLists.some((listName) => !createBoardOutput.listNames.includes(listName))
  ) {
    throw new Error(`create_board listNames mismatch (${transportMode}): ${JSON.stringify(createBoardOutput)}`);
  }
  if (createBoardOutput.cardFile !== '000-hello-stock.md') {
    throw new Error(`create_board did not seed starter card (${transportMode}): ${JSON.stringify(createBoardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 302,
    method: 'tools/call',
    params: {
      name: 'signboard_read_card',
      arguments: {
        boardRoot: createdBoardRoot,
        listName: '000-To-do-stock',
        cardFile: '000-hello-stock.md',
      },
    },
  });

  const createdBoardCardResponse = await waitForResponse(302);
  if (createdBoardCardResponse.error) {
    throw new Error(`read_card starter card failed (${transportMode}): ${JSON.stringify(createdBoardCardResponse.error)}`);
  }

  const createdBoardCard = createdBoardCardResponse.result?.structuredContent?.card || {};
  if (createdBoardCard.frontmatter?.title !== '👋 Start Here') {
    throw new Error(`create_board starter card title mismatch (${transportMode}): ${JSON.stringify(createdBoardCard)}`);
  }
  assertCardTimestamps(createdBoardCard, `read_card starter card (${transportMode})`);
  const starterBody = String(createdBoardCard.body || '');
  if (!starterBody.includes('Quick Add') || !starterBody.includes('Cmd/Ctrl + K')) {
    throw new Error(`create_board starter card copy missing current workflow hints (${transportMode}): ${starterBody}`);
  }
  if (starterBody.includes('with the + button') || starterBody.includes('2026-03-11')) {
    throw new Error(`create_board starter card copy still contains stale guidance (${transportMode}): ${starterBody}`);
  }

  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'signboard_duplicate_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.leadsList,
        cardFile: fixture.templateCardFile,
        removeLabelIds: ['template'],
      },
    },
  });

  const duplicateResponse = await waitForResponse(4);
  if (duplicateResponse.error) {
    throw new Error(`duplicate_card failed (${transportMode}): ${JSON.stringify(duplicateResponse.error)}`);
  }

  const duplicateOutput = duplicateResponse.result?.structuredContent || {};
  if (!duplicateOutput.cardFile || duplicateOutput.cardFile === fixture.templateCardFile) {
    throw new Error(`duplicate_card returned invalid cardFile (${transportMode}): ${JSON.stringify(duplicateOutput)}`);
  }
  assertCardTimestamps(duplicateOutput.card, `duplicate_card (${transportMode})`);

  const duplicatedLabels = Array.isArray(duplicateOutput.card?.frontmatter?.labels)
    ? duplicateOutput.card.frontmatter.labels
    : [];
  if (duplicatedLabels.includes('template')) {
    throw new Error(`duplicate_card did not remove template label (${transportMode}).`);
  }

  if (
    !duplicateOutput.taskSummary ||
    duplicateOutput.taskSummary.total !== 3 ||
    duplicateOutput.taskSummary.completed !== 2
  ) {
    throw new Error(`duplicate_card taskSummary mismatch (${transportMode}): ${JSON.stringify(duplicateOutput)}`);
  }

  if (!Array.isArray(duplicateOutput.taskDueDates) || !duplicateOutput.taskDueDates.includes('2026-03-20')) {
    throw new Error(`duplicate_card taskDueDates mismatch (${transportMode}): ${JSON.stringify(duplicateOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'signboard_archive_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.leadsList,
        cardFile: duplicateOutput.cardFile,
      },
    },
  });

  const archiveResponse = await waitForResponse(5);
  if (archiveResponse.error) {
    throw new Error(`archive_card failed (${transportMode}): ${JSON.stringify(archiveResponse.error)}`);
  }

  const archiveOutput = archiveResponse.result?.structuredContent || {};
  if (!archiveOutput.archivedCardFile) {
    throw new Error(`archive_card missing archivedCardFile (${transportMode}): ${JSON.stringify(archiveOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'signboard_list_cards',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.archiveList,
      },
    },
  });

  const archiveListResponse = await waitForResponse(6);
  if (archiveListResponse.error) {
    throw new Error(`list_cards archive failed (${transportMode}): ${JSON.stringify(archiveListResponse.error)}`);
  }

  const archiveCards = archiveListResponse.result?.structuredContent?.cardFiles || [];
  if (!archiveCards.includes(archiveOutput.archivedCardFile)) {
    throw new Error(`Archived card missing from archive list (${transportMode}).`);
  }

  send({
    jsonrpc: '2.0',
    id: 61,
    method: 'tools/call',
    params: {
      name: 'signboard_list_archive_entries',
      arguments: {
        boardRoot: fixture.boardRoot,
      },
    },
  });

  const archiveEntriesResponse = await waitForResponse(61);
  if (archiveEntriesResponse.error) {
    throw new Error(`list_archive_entries failed (${transportMode}): ${JSON.stringify(archiveEntriesResponse.error)}`);
  }

  const archiveEntriesOutput = archiveEntriesResponse.result?.structuredContent || {};
  const archivedCardEntry = Array.isArray(archiveEntriesOutput.cards)
    ? archiveEntriesOutput.cards.find((entry) => entry && entry.archivedCardFile === archiveOutput.archivedCardFile)
    : null;
  if (!archivedCardEntry || !archivedCardEntry.entryPath) {
    throw new Error(`list_archive_entries missing archived card (${transportMode}): ${JSON.stringify(archiveEntriesOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 62,
    method: 'tools/call',
    params: {
      name: 'signboard_read_archive_entry',
      arguments: {
        boardRoot: fixture.boardRoot,
        entryPath: archivedCardEntry.entryPath,
      },
    },
  });

  const readArchiveCardResponse = await waitForResponse(62);
  if (readArchiveCardResponse.error) {
    throw new Error(`read_archive_entry card failed (${transportMode}): ${JSON.stringify(readArchiveCardResponse.error)}`);
  }

  const readArchiveCardOutput = readArchiveCardResponse.result?.structuredContent || {};
  if (readArchiveCardOutput.kind !== 'card' || readArchiveCardOutput.entry?.archivedCardFile !== archiveOutput.archivedCardFile) {
    throw new Error(`read_archive_entry card payload mismatch (${transportMode}): ${JSON.stringify(readArchiveCardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 63,
    method: 'tools/call',
    params: {
      name: 'signboard_restore_archived_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        archivedCardPath: archivedCardEntry.entryPath,
        targetListName: fixture.workingList,
      },
    },
  });

  const restoreArchiveCardResponse = await waitForResponse(63);
  if (restoreArchiveCardResponse.error) {
    throw new Error(`restore_archived_card failed (${transportMode}): ${JSON.stringify(restoreArchiveCardResponse.error)}`);
  }

  const restoreArchiveCardOutput = restoreArchiveCardResponse.result?.structuredContent || {};
  if (!String(restoreArchiveCardOutput.restoredCardFile || '').startsWith('000-')) {
    throw new Error(`restore_archived_card did not restore card to top (${transportMode}): ${JSON.stringify(restoreArchiveCardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 64,
    method: 'tools/call',
    params: {
      name: 'signboard_archive_list',
      arguments: {
        boardRoot: createdBoardRoot,
        listName: '002-Done-stock',
      },
    },
  });

  const archiveListToolResponse = await waitForResponse(64);
  if (archiveListToolResponse.error) {
    throw new Error(`archive_list failed (${transportMode}): ${JSON.stringify(archiveListToolResponse.error)}`);
  }

  const archiveListToolOutput = archiveListToolResponse.result?.structuredContent || {};
  if (!archiveListToolOutput.archivedListPath) {
    throw new Error(`archive_list missing archivedListPath (${transportMode}): ${JSON.stringify(archiveListToolOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 65,
    method: 'tools/call',
    params: {
      name: 'signboard_read_archive_entry',
      arguments: {
        boardRoot: createdBoardRoot,
        entryPath: archiveListToolOutput.archivedListPath,
      },
    },
  });

  const readArchiveListResponse = await waitForResponse(65);
  if (readArchiveListResponse.error) {
    throw new Error(`read_archive_entry list failed (${transportMode}): ${JSON.stringify(readArchiveListResponse.error)}`);
  }

  const readArchiveListOutput = readArchiveListResponse.result?.structuredContent || {};
  if (readArchiveListOutput.kind !== 'list' || readArchiveListOutput.entry?.listDirectoryName !== archiveListToolOutput.archivedDirectoryName) {
    throw new Error(`read_archive_entry list payload mismatch (${transportMode}): ${JSON.stringify(readArchiveListOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 66,
    method: 'tools/call',
    params: {
      name: 'signboard_restore_archived_list',
      arguments: {
        boardRoot: createdBoardRoot,
        archivedListPath: archiveListToolOutput.archivedListPath,
        restoredDirectoryName: '002-Done Restored-stock',
      },
    },
  });

  const restoreArchiveListResponse = await waitForResponse(66);
  if (restoreArchiveListResponse.error) {
    throw new Error(`restore_archived_list failed (${transportMode}): ${JSON.stringify(restoreArchiveListResponse.error)}`);
  }

  const restoreArchiveListOutput = restoreArchiveListResponse.result?.structuredContent || {};
  if (restoreArchiveListOutput.restoredDirectoryName !== '002-Done Restored-stock') {
    throw new Error(`restore_archived_list returned unexpected directory (${transportMode}): ${JSON.stringify(restoreArchiveListOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'signboard_list_board_views',
      arguments: {},
    },
  });

  const viewsResponse = await waitForResponse(7);
  if (viewsResponse.error) {
    throw new Error(`list_board_views failed (${transportMode}): ${JSON.stringify(viewsResponse.error)}`);
  }

  const boardViews = viewsResponse.result?.structuredContent?.views || [];
  const viewIds = new Set(boardViews.map((view) => view && view.id).filter(Boolean));
  if (!viewIds.has('kanban') || !viewIds.has('table') || viewIds.has('calendar') || viewIds.has('this-week')) {
    throw new Error(`list_board_views should expose board-scoped Kanban and Table only (${transportMode}): ${JSON.stringify(boardViews)}`);
  }
  const kanbanView = boardViews.find((view) => view && view.id === 'kanban');
  if (!kanbanView || !/list-based board view/i.test(String(kanbanView.description || ''))) {
    throw new Error(`kanban view description missing list-based copy (${transportMode}): ${JSON.stringify(kanbanView)}`);
  }
  const tableView = boardViews.find((view) => view && view.id === 'table');
  if (!tableView || !/table view/i.test(String(tableView.description || ''))) {
    throw new Error(`table view description missing table copy (${transportMode}): ${JSON.stringify(tableView)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 71,
    method: 'tools/call',
    params: {
      name: 'signboard_import_trello',
      arguments: {
        boardRoot: fixture.boardRoot,
        sourcePath: fixture.trelloImportPath,
      },
    },
  });

  const trelloImportResponse = await waitForResponse(71);
  if (trelloImportResponse.error) {
    throw new Error(`import_trello failed (${transportMode}): ${JSON.stringify(trelloImportResponse.error)}`);
  }

  const trelloImportOutput = trelloImportResponse.result?.structuredContent || {};
  if (trelloImportOutput.importer !== 'trello' || trelloImportOutput.listsCreated !== 1 || trelloImportOutput.cardsCreated !== 1) {
    throw new Error(`import_trello summary mismatch (${transportMode}): ${JSON.stringify(trelloImportOutput)}`);
  }

  const boardEntriesAfterTrello = await fs.readdir(fixture.boardRoot, { withFileTypes: true });
  const trelloImportedList = boardEntriesAfterTrello.find((entry) => entry.isDirectory() && /-Trello MCP-/.test(entry.name));
  if (!trelloImportedList) {
    throw new Error(`import_trello did not create the expected list (${transportMode}).`);
  }

  const trelloImportedCards = await fs.readdir(path.join(fixture.boardRoot, trelloImportedList.name));
  if (trelloImportedCards.length !== 1) {
    throw new Error(`import_trello created an unexpected card count (${transportMode}): ${JSON.stringify(trelloImportedCards)}`);
  }

  const trelloImportedCardBody = await fs.readFile(
    path.join(fixture.boardRoot, trelloImportedList.name, trelloImportedCards[0]),
    'utf8',
  );
  if (!trelloImportedCardBody.includes('title: Imported via MCP') || !trelloImportedCardBody.includes('due: 2026-03-30')) {
    throw new Error(`import_trello card content mismatch (${transportMode}): ${trelloImportedCardBody}`);
  }

  send({
    jsonrpc: '2.0',
    id: 72,
    method: 'tools/call',
    params: {
      name: 'signboard_import_obsidian',
      arguments: {
        boardRoot: fixture.boardRoot,
        sourcePaths: [fixture.obsidianImportPath],
      },
    },
  });

  const obsidianImportResponse = await waitForResponse(72);
  if (obsidianImportResponse.error) {
    throw new Error(`import_obsidian failed (${transportMode}): ${JSON.stringify(obsidianImportResponse.error)}`);
  }

  const obsidianImportOutput = obsidianImportResponse.result?.structuredContent || {};
  if (obsidianImportOutput.importer !== 'obsidian' || obsidianImportOutput.listsCreated !== 2 || obsidianImportOutput.cardsCreated !== 2) {
    throw new Error(`import_obsidian summary mismatch (${transportMode}): ${JSON.stringify(obsidianImportOutput)}`);
  }

  const boardEntriesAfterObsidian = await fs.readdir(fixture.boardRoot, { withFileTypes: true });
  const obsidianImportedList = boardEntriesAfterObsidian.find((entry) => entry.isDirectory() && /-Inbox-/.test(entry.name));
  if (!obsidianImportedList) {
    throw new Error(`import_obsidian did not create the expected Inbox list (${transportMode}).`);
  }

  const obsidianImportedCards = await fs.readdir(path.join(fixture.boardRoot, obsidianImportedList.name));
  if (obsidianImportedCards.length !== 1) {
    throw new Error(`import_obsidian created an unexpected Inbox card count (${transportMode}): ${JSON.stringify(obsidianImportedCards)}`);
  }

  const obsidianImportedCardBody = await fs.readFile(
    path.join(fixture.boardRoot, obsidianImportedList.name, obsidianImportedCards[0]),
    'utf8',
  );
  if (!obsidianImportedCardBody.includes('title: MCP draft') || !obsidianImportedCardBody.includes('due: 2026-03-29')) {
    throw new Error(`import_obsidian card content mismatch (${transportMode}): ${obsidianImportedCardBody}`);
  }

  send({
    jsonrpc: '2.0',
    id: 73,
    method: 'tools/call',
    params: {
      name: 'signboard_import_tasksmd',
      arguments: {
        boardRoot: fixture.boardRoot,
        sourcePath: fixture.tasksProjectPath,
      },
    },
  });

  const tasksMdImportResponse = await waitForResponse(73);
  if (tasksMdImportResponse.error) {
    throw new Error(`import_tasksmd failed (${transportMode}): ${JSON.stringify(tasksMdImportResponse.error)}`);
  }

  const tasksMdImportOutput = tasksMdImportResponse.result?.structuredContent || {};
  if (tasksMdImportOutput.importer !== 'tasksmd' || tasksMdImportOutput.listsCreated !== 1 || tasksMdImportOutput.cardsCreated !== 1) {
    throw new Error(`import_tasksmd summary mismatch (${transportMode}): ${JSON.stringify(tasksMdImportOutput)}`);
  }

  const boardEntriesAfterTasksMd = await fs.readdir(fixture.boardRoot, { withFileTypes: true });
  const tasksMdImportedList = boardEntriesAfterTasksMd.find((entry) => entry.isDirectory() && /-Tasks Inbox-/.test(entry.name));
  if (!tasksMdImportedList) {
    throw new Error(`import_tasksmd did not create the expected Tasks Inbox list (${transportMode}).`);
  }

  const tasksMdImportedCards = await fs.readdir(path.join(fixture.boardRoot, tasksMdImportedList.name));
  const tasksMdImportedCardBody = await fs.readFile(
    path.join(fixture.boardRoot, tasksMdImportedList.name, tasksMdImportedCards[0]),
    'utf8',
  );
  if (!tasksMdImportedCardBody.includes('title: MCP Tasks Card') || !tasksMdImportedCardBody.includes('due: 2026-03-28')) {
    throw new Error(`import_tasksmd card content mismatch (${transportMode}): ${tasksMdImportedCardBody}`);
  }

  send({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'signboard_update_board_settings',
      arguments: {
        boardRoot: fixture.boardRoot,
        themeOverrides: {
          light: { boardBackground: '#dfe4f2' },
        },
      },
    },
  });

  const settingsResponse = await waitForResponse(8);
  if (settingsResponse.error) {
    throw new Error(`update_board_settings failed (${transportMode}): ${JSON.stringify(settingsResponse.error)}`);
  }

  const updatedTheme = settingsResponse.result?.structuredContent?.settings?.themeOverrides || {};
  if (!updatedTheme.light || updatedTheme.light.boardBackground !== '#dfe4f2') {
    throw new Error(`update_board_settings did not persist theme overrides (${transportMode}): ${JSON.stringify(updatedTheme)}`);
  }

  const boardToRename = path.join(fixture.allowedRoot, `RenameMove-${transportMode}`);
  await fs.mkdir(path.join(boardToRename, '000-To-do-stock'), { recursive: true });

  send({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'signboard_rename_board',
      arguments: {
        boardRoot: boardToRename,
        newBoardName: `Renamed-${transportMode}`,
      },
    },
  });

  const renameResponse = await waitForResponse(9);
  if (renameResponse.error) {
    throw new Error(`rename_board failed (${transportMode}): ${JSON.stringify(renameResponse.error)}`);
  }

  const renamedBoardRoot = renameResponse.result?.structuredContent?.newBoardRoot;
  if (!renamedBoardRoot || renamedBoardRoot === boardToRename) {
    throw new Error(`rename_board returned invalid newBoardRoot (${transportMode}): ${JSON.stringify(renameResponse.result?.structuredContent)}`);
  }

  const moveTargetParent = path.join(fixture.allowedRoot, `MovedBoards-${transportMode}`);
  await fs.mkdir(moveTargetParent, { recursive: true });

  send({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'signboard_move_board',
      arguments: {
        boardRoot: renamedBoardRoot,
        targetParentRoot: moveTargetParent,
      },
    },
  });

  const moveResponse = await waitForResponse(10);
  if (moveResponse.error) {
    throw new Error(`move_board failed (${transportMode}): ${JSON.stringify(moveResponse.error)}`);
  }

  const movedBoardRoot = moveResponse.result?.structuredContent?.newBoardRoot;
  const expectedMovedBoardRoot = path.resolve(path.join(moveTargetParent, path.basename(renamedBoardRoot)));
  if (movedBoardRoot !== expectedMovedBoardRoot) {
    throw new Error(`move_board returned unexpected newBoardRoot (${transportMode}): ${JSON.stringify(moveResponse.result?.structuredContent)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'signboard_list_lists',
      arguments: {
        boardRoot: movedBoardRoot,
      },
    },
  });

  const movedBoardListsResponse = await waitForResponse(11);
  if (movedBoardListsResponse.error) {
    throw new Error(`list_lists after move_board failed (${transportMode}): ${JSON.stringify(movedBoardListsResponse.error)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'signboard_read_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.leadsList,
        cardFile: fixture.templateCardFile,
      },
    },
  });

  const readCardResponse = await waitForResponse(12);
  if (readCardResponse.error) {
    throw new Error(`read_card failed (${transportMode}): ${JSON.stringify(readCardResponse.error)}`);
  }

  const readCardOutput = readCardResponse.result?.structuredContent || {};
  assertCardTimestamps(readCardOutput.card, `read_card (${transportMode})`);
  if (!readCardOutput.taskSummary || readCardOutput.taskSummary.total !== 3 || readCardOutput.taskSummary.completed !== 2) {
    throw new Error(`read_card taskSummary mismatch (${transportMode}): ${JSON.stringify(readCardOutput)}`);
  }
  if (!Array.isArray(readCardOutput.taskDueDates) || !readCardOutput.taskDueDates.includes('2026-03-20')) {
    throw new Error(`read_card taskDueDates mismatch (${transportMode}): ${JSON.stringify(readCardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'signboard_update_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.leadsList,
        cardFile: fixture.templateCardFile,
        body: 'Customer details go here.\\n- [x ] Initial outreach\\n- [x ] (due: 2026-03-20) Send proposal\\n- [ X] Confirm timeline\\n',
      },
    },
  });

  const updateCardResponse = await waitForResponse(13);
  if (updateCardResponse.error) {
    throw new Error(`update_card failed (${transportMode}): ${JSON.stringify(updateCardResponse.error)}`);
  }

  const updateCardOutput = updateCardResponse.result?.structuredContent || {};
  assertCardTimestamps(updateCardOutput.card, `update_card (${transportMode})`);
  if (!updateCardOutput.taskSummary || updateCardOutput.taskSummary.total !== 3 || updateCardOutput.taskSummary.completed !== 3) {
    throw new Error(`update_card taskSummary mismatch (${transportMode}): ${JSON.stringify(updateCardOutput)}`);
  }
  if (!Array.isArray(updateCardOutput.taskDueDates) || !updateCardOutput.taskDueDates.includes('2026-03-20')) {
    throw new Error(`update_card taskDueDates mismatch (${transportMode}): ${JSON.stringify(updateCardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'signboard_create_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.leadsList,
        title: 'Task metadata coverage',
        body: 'Created by MCP test.\\n- [x ] (due: 2026-03-21) Complete prep\\n- [ X] (due: 2026-03-22) Confirm review\\n- [ x] Share recap\\n- [ ] Follow up\\n',
      },
    },
  });

  const createCardResponse = await waitForResponse(14);
  if (createCardResponse.error) {
    throw new Error(`create_card failed (${transportMode}): ${JSON.stringify(createCardResponse.error)}`);
  }

  const createCardOutput = createCardResponse.result?.structuredContent || {};
  assertCardTimestamps(createCardOutput.card, `create_card (${transportMode})`);
  if (!createCardOutput.taskSummary || createCardOutput.taskSummary.total !== 4 || createCardOutput.taskSummary.completed !== 3) {
    throw new Error(`create_card taskSummary mismatch (${transportMode}): ${JSON.stringify(createCardOutput)}`);
  }
  const expectedDueDates = ['2026-03-21', '2026-03-22'];
  if (
    !Array.isArray(createCardOutput.taskDueDates) ||
    createCardOutput.taskDueDates.length !== expectedDueDates.length ||
    expectedDueDates.some((dateValue) => !createCardOutput.taskDueDates.includes(dateValue))
  ) {
    throw new Error(`create_card taskDueDates mismatch (${transportMode}): ${JSON.stringify(createCardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: {
      name: 'signboard_move_card',
      arguments: {
        boardRoot: fixture.boardRoot,
        fromListName: fixture.leadsList,
        toListName: fixture.workingList,
        cardFile: createCardOutput.cardFile,
      },
    },
  });

  const moveCardResponse = await waitForResponse(15);
  if (moveCardResponse.error) {
    throw new Error(`move_card failed (${transportMode}): ${JSON.stringify(moveCardResponse.error)}`);
  }

  const moveCardOutput = moveCardResponse.result?.structuredContent || {};
  if (!String(moveCardOutput.newCardFile || '').startsWith('000-')) {
    throw new Error(`move_card did not place card at top (${transportMode}): ${JSON.stringify(moveCardOutput)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'signboard_list_cards',
      arguments: {
        boardRoot: fixture.boardRoot,
        listName: fixture.workingList,
      },
    },
  });

  const movedListResponse = await waitForResponse(16);
  if (movedListResponse.error) {
    throw new Error(`list_cards after move_card failed (${transportMode}): ${JSON.stringify(movedListResponse.error)}`);
  }

  const movedListCards = movedListResponse.result?.structuredContent?.cardFiles || [];
  if (movedListCards[0] !== moveCardOutput.newCardFile) {
    throw new Error(`move_card did not sort moved card first (${transportMode}): ${JSON.stringify(movedListCards)}`);
  }

  child.stdin.end();
  await waitForExit;
}

async function runRequiresAllowedRootsSmoke() {
  const child = spawn(
    process.execPath,
    ['-e', "const { startSignboardMcpServer } = require('./lib/mcpServer'); startSignboardMcpServer({ appVersion: 'test' });"],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        SIGNBOARD_MCP_ALLOWED_ROOTS: '',
        SIGNBOARD_MCP_READ_ONLY: 'true',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let stderr = '';
  let stdoutBuffer = Buffer.alloc(0);
  let streamError = null;
  const responsesById = new Map();

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  const waitForExit = new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`MCP allowed-roots child exited with code=${code}. stderr=${stderr.trim()}`));
    });

    child.once('error', reject);
  });

  child.stdout.on('data', (chunk) => {
    try {
      stdoutBuffer = readNdjsonFrames(Buffer.concat([stdoutBuffer, chunk]), (frame) => {
        if (Object.prototype.hasOwnProperty.call(frame, 'id')) {
          responsesById.set(frame.id, frame);
        }
      });
    } catch (error) {
      streamError = error;
      child.kill('SIGTERM');
    }
  });

  const send = (payload) => {
    child.stdin.write(encodeMessage(payload, NDJSON_TRANSPORT));
  };

  const waitForResponse = (id, timeoutMs = 3000) => new Promise((resolve, reject) => {
    const start = Date.now();

    const poll = () => {
      if (streamError) {
        reject(streamError);
        return;
      }

      if (responsesById.has(id)) {
        const response = responsesById.get(id);
        responsesById.delete(id);
        resolve(response);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for MCP allowed-roots response id=${id}. stderr=${stderr.trim()}`));
        return;
      }

      setTimeout(poll, 10);
    };

    poll();
  });

  try {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'signboard-test', version: '0.0.0' },
      },
    });

    const initializeResponse = await waitForResponse(1);
    if (initializeResponse.error) {
      throw new Error(`Initialize without allowed roots failed: ${JSON.stringify(initializeResponse.error)}`);
    }

    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'signboard_list_lists',
        arguments: {
          boardRoot: os.tmpdir(),
        },
      },
    });

    const listResponse = await waitForResponse(2);
    const payload = listResponse.result?.structuredContent || {};
    if (!listResponse.result?.isError || !String(payload.error || '').includes('SIGNBOARD_MCP_ALLOWED_ROOTS')) {
      throw new Error(`MCP without allowed roots did not reject board access: ${JSON.stringify(listResponse)}`);
    }
  } finally {
    child.stdin.end();
    await waitForExit;
  }
}

async function runTrustedRootsSmoke() {
  const fixture = await createFixtureBoard();
  const child = spawn(
    process.execPath,
    [
      '-e',
      [
        "const { startSignboardMcpServer } = require('./lib/mcpServer');",
        "const trustedBoardRoots = JSON.parse(process.env.SIGNBOARD_TEST_TRUSTED_ROOTS || '[]');",
        "startSignboardMcpServer({ appVersion: 'test', trustedBoardRoots });",
      ].join(' '),
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        SIGNBOARD_MCP_ALLOWED_ROOTS: path.join(fixture.cleanupRoot, 'unrelated-root'),
        SIGNBOARD_MCP_READ_ONLY: 'true',
        SIGNBOARD_TEST_TRUSTED_ROOTS: JSON.stringify([fixture.boardRoot]),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let stderr = '';
  let stdoutBuffer = Buffer.alloc(0);
  let streamError = null;
  const responsesById = new Map();

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  const waitForExit = new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`MCP trusted-roots child exited with code=${code}. stderr=${stderr.trim()}`));
    });

    child.once('error', reject);
  });

  child.stdout.on('data', (chunk) => {
    try {
      stdoutBuffer = readNdjsonFrames(Buffer.concat([stdoutBuffer, chunk]), (frame) => {
        if (Object.prototype.hasOwnProperty.call(frame, 'id')) {
          responsesById.set(frame.id, frame);
        }
      });
    } catch (error) {
      streamError = error;
      child.kill('SIGTERM');
    }
  });

  const send = (payload) => {
    child.stdin.write(encodeMessage(payload, NDJSON_TRANSPORT));
  };

  const waitForResponse = (id, timeoutMs = 3000) => new Promise((resolve, reject) => {
    const start = Date.now();

    const poll = () => {
      if (streamError) {
        reject(streamError);
        return;
      }

      if (responsesById.has(id)) {
        const response = responsesById.get(id);
        responsesById.delete(id);
        resolve(response);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for MCP trusted-roots response id=${id}. stderr=${stderr.trim()}`));
        return;
      }

      setTimeout(poll, 10);
    };

    poll();
  });

  try {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'signboard-test', version: '0.0.0' },
      },
    });

    const initializeResponse = await waitForResponse(1);
    if (initializeResponse.error) {
      throw new Error(`Initialize with trusted roots failed: ${JSON.stringify(initializeResponse.error)}`);
    }

    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'signboard_get_config',
        arguments: {},
      },
    });

    const configResponse = await waitForResponse(2);
    const config = configResponse.result?.structuredContent || {};
    if (!Array.isArray(config.allowedRoots) || !config.allowedRoots.includes(path.resolve(fixture.boardRoot))) {
      throw new Error(`Trusted board root missing from get_config: ${JSON.stringify(config)}`);
    }

    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'signboard_resolve_board_by_name',
        arguments: {
          boardName: 'Good Migrations',
          exact: true,
        },
      },
    });

    const resolveResponse = await waitForResponse(3);
    if (resolveResponse.error) {
      throw new Error(`resolve_board_by_name with trusted root failed: ${JSON.stringify(resolveResponse.error)}`);
    }

    const resolveOutput = resolveResponse.result?.structuredContent || {};
    if (!Array.isArray(resolveOutput.matches) || !resolveOutput.matches.includes(path.resolve(fixture.boardRoot))) {
      throw new Error(`Resolver did not match trusted root itself: ${JSON.stringify(resolveOutput)}`);
    }

    send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'signboard_list_lists',
        arguments: {
          boardRoot: fixture.boardRoot,
        },
      },
    });

    const listResponse = await waitForResponse(4);
    if (listResponse.result?.isError) {
      throw new Error(`Trusted root board access failed: ${JSON.stringify(listResponse.result?.structuredContent)}`);
    }
  } finally {
    child.stdin.end();
    await waitForExit;
    await fs.rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
}

async function run() {
  const transportModes = [HEADER_TRANSPORT, HEADER_BOM_TRANSPORT, NDJSON_TRANSPORT];

  for (const transportMode of transportModes) {
    const fixture = await createFixtureBoard();
    try {
      await runForTransport(transportMode, fixture);
    } finally {
      await fs.rm(fixture.cleanupRoot, { recursive: true, force: true });
    }
  }

  await runRequiresAllowedRootsSmoke();
  await runTrustedRootsSmoke();

  console.log('MCP server smoke test passed (header + header-bom + ndjson).');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
