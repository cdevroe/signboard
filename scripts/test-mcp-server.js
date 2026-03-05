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
  const archiveList = 'XXX-Archive';
  const templateCardFile = '001-template-card-ab123.md';

  await fs.mkdir(path.join(boardRoot, leadsList), { recursive: true });
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
    archiveList,
    templateCardFile,
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
    'signboard.resolve_board_by_name',
    'signboard.list_lists',
    'signboard.list_cards',
    'signboard.read_card',
    'signboard.create_card',
    'signboard.update_card',
    'signboard.duplicate_card',
    'signboard.archive_card',
    'signboard.move_card',
    'signboard.create_list',
    'signboard.read_board_settings',
    'signboard.update_board_settings',
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

  child.stdin.end();
  await waitForExit;
}

async function run() {
  const fixture = await createFixtureBoard();

  try {
    await runForTransport(HEADER_TRANSPORT, fixture);
    await runForTransport(HEADER_BOM_TRANSPORT, fixture);
    await runForTransport(NDJSON_TRANSPORT, fixture);
    console.log('MCP server smoke test passed (header + header-bom + ndjson).');
  } finally {
    await fs.rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
