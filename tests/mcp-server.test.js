import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      '- [ ] Initial outreach',
      '- [x ] (due: 2026-03-20) Send proposal',
      '- [ X] Confirm timeline',
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

describe.each([
  [HEADER_TRANSPORT],
  [HEADER_BOM_TRANSPORT],
  [NDJSON_TRANSPORT],
])('MCP server (%s transport)', (transportMode) => {
  let send;
  let waitForResponse;
  let child;
  let fixture;
  let waitForExit;

  // Shared state across sequential tests
  let duplicateCardFile;
  let archivedCardFile;
  let renamedBoardRoot;
  let movedBoardRoot;

  beforeAll(async () => {
    fixture = await createFixtureBoard();

    child = spawn(
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

    waitForExit = new Promise((resolve, reject) => {
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

    send = (payload) => {
      child.stdin.write(encodeMessage(payload, transportMode));
    };

    waitForResponse = (id, timeoutMs = 5000) => new Promise((resolve, reject) => {
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
  }, 20000);

  afterAll(async () => {
    try {
      if (child && !child.killed) {
        child.stdin.end();
        child.kill('SIGTERM');
      }
    } finally {
      if (fixture) {
        await fs.rm(fixture.cleanupRoot, { recursive: true, force: true });
      }
    }
  }, 10000);

  it('initializes', async () => {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25' },
    });

    const initializeResponse = await waitForResponse(1);
    expect(initializeResponse.error).toBeFalsy();

    send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }, 20000);

  it('lists tools with all required tool names', async () => {
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const toolsResponse = await waitForResponse(2);
    expect(toolsResponse.error).toBeFalsy();

    const tools = Array.isArray(toolsResponse.result?.tools) ? toolsResponse.result.tools : [];
    const toolNames = new Set(tools.map((tool) => tool && tool.name).filter(Boolean));

    const requiredToolNames = [
      'signboard.get_config',
      'signboard.list_board_views',
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
      'signboard.rename_board',
      'signboard.move_board',
      'signboard.read_board_settings',
      'signboard.update_board_settings',
    ];

    for (const toolName of requiredToolNames) {
      expect(toolNames.has(toolName)).toBe(true);
    }
  }, 20000);

  it('resolves board by name', async () => {
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
    expect(resolveResponse.error).toBeFalsy();

    const resolveOutput = resolveResponse.result?.structuredContent || {};
    expect(Array.isArray(resolveOutput.matches)).toBe(true);
    expect(resolveOutput.matches).toContain(path.resolve(fixture.boardRoot));
  }, 20000);

  it('duplicates a card and removes labels', async () => {
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
    expect(duplicateResponse.error).toBeFalsy();

    const duplicateOutput = duplicateResponse.result?.structuredContent || {};
    expect(duplicateOutput.cardFile).toBeTruthy();
    expect(duplicateOutput.cardFile).not.toBe(fixture.templateCardFile);

    const duplicatedLabels = Array.isArray(duplicateOutput.card?.frontmatter?.labels)
      ? duplicateOutput.card.frontmatter.labels
      : [];
    expect(duplicatedLabels).not.toContain('template');

    expect(duplicateOutput.taskSummary).toBeTruthy();
    expect(duplicateOutput.taskSummary.total).toBe(3);
    expect(duplicateOutput.taskSummary.completed).toBe(2);

    expect(Array.isArray(duplicateOutput.taskDueDates)).toBe(true);
    expect(duplicateOutput.taskDueDates).toContain('2026-03-20');

    // Save for archive test
    duplicateCardFile = duplicateOutput.cardFile;
  }, 20000);

  it('archives a card', async () => {
    send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'signboard.archive_card',
        arguments: {
          boardRoot: fixture.boardRoot,
          listName: fixture.leadsList,
          cardFile: duplicateCardFile,
        },
      },
    });

    const archiveResponse = await waitForResponse(5);
    expect(archiveResponse.error).toBeFalsy();

    const archiveOutput = archiveResponse.result?.structuredContent || {};
    expect(archiveOutput.archivedCardFile).toBeTruthy();

    // Save for list_cards verification
    archivedCardFile = archiveOutput.archivedCardFile;
  }, 20000);

  it('lists cards in archive', async () => {
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
    expect(archiveListResponse.error).toBeFalsy();

    const archiveCards = archiveListResponse.result?.structuredContent?.cardFiles || [];
    expect(archiveCards).toContain(archivedCardFile);
  }, 20000);

  it('lists board views with calendar and this-week', async () => {
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
    expect(viewsResponse.error).toBeFalsy();

    const boardViews = viewsResponse.result?.structuredContent?.views || [];
    const viewIds = new Set(boardViews.map((view) => view && view.id).filter(Boolean));
    expect(viewIds.has('calendar')).toBe(true);
    expect(viewIds.has('this-week')).toBe(true);

    const calendarView = boardViews.find((view) => view && view.id === 'calendar');
    const thisWeekView = boardViews.find((view) => view && view.id === 'this-week');
    expect(calendarView).toBeTruthy();
    expect(String(calendarView.description || '')).toMatch(/task due-date markers/i);
    expect(thisWeekView).toBeTruthy();
    expect(String(thisWeekView.description || '')).toMatch(/task due-date markers/i);
  }, 20000);

  it('updates board settings', async () => {
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
        },
      },
    });

    const settingsResponse = await waitForResponse(8);
    expect(settingsResponse.error).toBeFalsy();

    const updatedNotifications = settingsResponse.result?.structuredContent?.settings?.notifications || {};
    expect(updatedNotifications.enabled).toBe(true);
    expect(updatedNotifications.time).toBe('08:30');
  }, 20000);

  it('renames a board', async () => {
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
    expect(renameResponse.error).toBeFalsy();

    renamedBoardRoot = renameResponse.result?.structuredContent?.newBoardRoot;
    expect(renamedBoardRoot).toBeTruthy();
    expect(renamedBoardRoot).not.toBe(boardToRename);
  }, 20000);

  it('moves a board', async () => {
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
    expect(moveResponse.error).toBeFalsy();

    movedBoardRoot = moveResponse.result?.structuredContent?.newBoardRoot;
    const expectedMovedBoardRoot = path.resolve(path.join(moveTargetParent, path.basename(renamedBoardRoot)));
    expect(movedBoardRoot).toBe(expectedMovedBoardRoot);
  }, 20000);

  it('lists lists on moved board', async () => {
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
    expect(movedBoardListsResponse.error).toBeFalsy();
  }, 20000);

  it('reads a card with task metadata', async () => {
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
    expect(readCardResponse.error).toBeFalsy();

    const readCardOutput = readCardResponse.result?.structuredContent || {};
    expect(readCardOutput.taskSummary).toBeTruthy();
    expect(readCardOutput.taskSummary.total).toBe(3);
    expect(readCardOutput.taskSummary.completed).toBe(2);
    expect(Array.isArray(readCardOutput.taskDueDates)).toBe(true);
    expect(readCardOutput.taskDueDates).toContain('2026-03-20');
  }, 20000);

  it('updates a card with task metadata', async () => {
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
          body: [
            'Customer details go here.',
            '- [x ] Initial outreach',
            '- [x ] (due: 2026-03-20) Send proposal',
            '- [ X] Confirm timeline',
            '',
          ].join('\n'),
        },
      },
    });

    const updateCardResponse = await waitForResponse(13);
    expect(updateCardResponse.error).toBeFalsy();

    const updateCardOutput = updateCardResponse.result?.structuredContent || {};
    expect(updateCardOutput.taskSummary).toBeTruthy();
    expect(updateCardOutput.taskSummary.total).toBe(3);
    expect(updateCardOutput.taskSummary.completed).toBe(3);
    expect(Array.isArray(updateCardOutput.taskDueDates)).toBe(true);
    expect(updateCardOutput.taskDueDates).toContain('2026-03-20');
  }, 20000);

  it('creates a card with task metadata', async () => {
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
          body: [
            'Created by MCP test.',
            '- [x ] (due: 2026-03-21) Complete prep',
            '- [ X] (due: 2026-03-22) Confirm review',
            '- [ x] Share recap',
            '- [ ] Follow up',
            '',
          ].join('\n'),
        },
      },
    });

    const createCardResponse = await waitForResponse(14);
    expect(createCardResponse.error).toBeFalsy();

    const createCardOutput = createCardResponse.result?.structuredContent || {};
    expect(createCardOutput.taskSummary).toBeTruthy();
    expect(createCardOutput.taskSummary.total).toBe(4);
    expect(createCardOutput.taskSummary.completed).toBe(3);

    const expectedDueDates = ['2026-03-21', '2026-03-22'];
    expect(Array.isArray(createCardOutput.taskDueDates)).toBe(true);
    expect(createCardOutput.taskDueDates).toHaveLength(expectedDueDates.length);
    for (const dateValue of expectedDueDates) {
      expect(createCardOutput.taskDueDates).toContain(dateValue);
    }
  }, 20000);

  it('shuts down cleanly', async () => {
    child.stdin.end();
    await waitForExit;
  }, 20000);
});
