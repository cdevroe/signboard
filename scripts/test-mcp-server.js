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

async function createFixtureBoard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-mcp-test-'));
  const boardName = 'Good-Migrations';
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
    'signboard.get_config',
    'signboard.list_board_views',
    'signboard.resolve_board_by_name',
    'signboard.create_board',
    'signboard.list_lists',
    'signboard.list_cards',
    'signboard.read_card',
    'signboard.create_card',
    'signboard.update_card',
    'signboard.duplicate_card',
    'signboard.archive_card',
    'signboard.move_card',
    'signboard.create_list',
    'signboard.rename_board',
    'signboard.move_board',
    'signboard.read_board_settings',
    'signboard.update_board_settings',
    'signboard.import_trello',
    'signboard.import_obsidian',
  ];

  for (const toolName of requiredToolNames) {
    if (!toolNames.has(toolName)) {
      throw new Error(`Missing MCP tool (${transportMode}): ${toolName}`);
    }
  }

  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'signboard.resolve_board_by_name',
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
      name: 'signboard.create_board',
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
      name: 'signboard.read_card',
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

  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'signboard.duplicate_card',
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
      name: 'signboard.archive_card',
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
      name: 'signboard.list_cards',
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
    id: 7,
    method: 'tools/call',
    params: {
      name: 'signboard.list_board_views',
      arguments: {},
    },
  });

  const viewsResponse = await waitForResponse(7);
  if (viewsResponse.error) {
    throw new Error(`list_board_views failed (${transportMode}): ${JSON.stringify(viewsResponse.error)}`);
  }

  const boardViews = viewsResponse.result?.structuredContent?.views || [];
  const viewIds = new Set(boardViews.map((view) => view && view.id).filter(Boolean));
  if (!viewIds.has('calendar') || !viewIds.has('this-week')) {
    throw new Error(`list_board_views missing calendar/this-week (${transportMode}): ${JSON.stringify(boardViews)}`);
  }
  const calendarView = boardViews.find((view) => view && view.id === 'calendar');
  const thisWeekView = boardViews.find((view) => view && view.id === 'this-week');
  if (!calendarView || !/task due-date markers/i.test(String(calendarView.description || ''))) {
    throw new Error(`calendar view description missing task due markers (${transportMode}): ${JSON.stringify(calendarView)}`);
  }
  if (!thisWeekView || !/task due-date markers/i.test(String(thisWeekView.description || ''))) {
    throw new Error(`this-week view description missing task due markers (${transportMode}): ${JSON.stringify(thisWeekView)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 71,
    method: 'tools/call',
    params: {
      name: 'signboard.import_trello',
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
      name: 'signboard.import_obsidian',
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
    id: 8,
    method: 'tools/call',
    params: {
      name: 'signboard.update_board_settings',
      arguments: {
        boardRoot: fixture.boardRoot,
        notifications: {
          enabled: true,
          time: '08:30',
        },
        tooltipsEnabled: false,
      },
    },
  });

  const settingsResponse = await waitForResponse(8);
  if (settingsResponse.error) {
    throw new Error(`update_board_settings failed (${transportMode}): ${JSON.stringify(settingsResponse.error)}`);
  }

  const updatedNotifications = settingsResponse.result?.structuredContent?.settings?.notifications || {};
  if (updatedNotifications.enabled !== true || updatedNotifications.time !== '08:30') {
    throw new Error(`update_board_settings did not persist notifications (${transportMode}): ${JSON.stringify(updatedNotifications)}`);
  }
  const updatedTooltipsEnabled = settingsResponse.result?.structuredContent?.settings?.tooltipsEnabled;
  if (updatedTooltipsEnabled !== false) {
    throw new Error(`update_board_settings did not persist tooltipsEnabled (${transportMode}): ${JSON.stringify(settingsResponse.result?.structuredContent)}`);
  }

  const boardToRename = path.join(fixture.allowedRoot, `RenameMove-${transportMode}`);
  await fs.mkdir(path.join(boardToRename, '000-To-do-stock'), { recursive: true });

  send({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'signboard.rename_board',
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
      name: 'signboard.move_board',
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
      name: 'signboard.list_lists',
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
      name: 'signboard.read_card',
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
      name: 'signboard.update_card',
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
      name: 'signboard.create_card',
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
      name: 'signboard.move_card',
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
      name: 'signboard.list_cards',
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

  console.log('MCP server smoke test passed (header + header-bom + ndjson).');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
