const { spawn } = require('child_process');
const path = require('path');

const HEADER_TRANSPORT = 'header';
const NDJSON_TRANSPORT = 'ndjson';

function encodeMessage(payload, transportMode) {
  const json = JSON.stringify(payload);

  if (transportMode === HEADER_TRANSPORT) {
    const length = Buffer.byteLength(json, 'utf8');
    return Buffer.from(`Content-Length: ${length}\r\n\r\n${json}`, 'utf8');
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
    const lengthLine = lines.find((line) => line.toLowerCase().startsWith('content-length:'));
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

async function runForTransport(transportMode) {
  const child = spawn(
    process.execPath,
    ['-e', "const { startSignboardMcpServer } = require('./lib/mcpServer'); startSignboardMcpServer({ appVersion: 'test' });"],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        SIGNBOARD_MCP_ALLOWED_ROOTS: path.resolve(__dirname, '..', '..'),
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
      const readFrames = transportMode === HEADER_TRANSPORT ? readHeaderFrames : readNdjsonFrames;
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

  const waitForResponse = (id, timeoutMs = 2000) => new Promise((resolve, reject) => {
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

  if (initializeResponse.result?.serverInfo?.name !== 'signboard-mcp') {
    throw new Error(`Unexpected server name (${transportMode}): ${JSON.stringify(initializeResponse.result)}`);
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
      name: 'signboard.get_config',
      arguments: {},
    },
  });

  const configResponse = await waitForResponse(3);
  if (configResponse.error) {
    throw new Error(`tools/call signboard.get_config failed (${transportMode}): ${JSON.stringify(configResponse.error)}`);
  }

  if (!configResponse.result || configResponse.result.isError) {
    throw new Error(`Unexpected signboard.get_config result (${transportMode}): ${JSON.stringify(configResponse.result)}`);
  }

  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'signboard.resolve_board_by_name',
      arguments: {
        boardName: 'signboard',
        exact: true,
        maxDepth: 3,
        limit: 5,
      },
    },
  });

  const resolveResponse = await waitForResponse(4);
  if (resolveResponse.error) {
    throw new Error(`tools/call signboard.resolve_board_by_name failed (${transportMode}): ${JSON.stringify(resolveResponse.error)}`);
  }

  if (!resolveResponse.result || resolveResponse.result.isError) {
    throw new Error(`Unexpected resolver result (${transportMode}): ${JSON.stringify(resolveResponse.result)}`);
  }

  const resolverOutput = resolveResponse.result.structuredContent || {};
  if (!Array.isArray(resolverOutput.matches) || resolverOutput.matches.length === 0) {
    throw new Error(`Resolver returned no matches (${transportMode}): ${JSON.stringify(resolverOutput)}`);
  }

  child.stdin.end();
  await waitForExit;
}

async function run() {
  await runForTransport(HEADER_TRANSPORT);
  await runForTransport(NDJSON_TRANSPORT);
  console.log('MCP server smoke test passed (header + ndjson).');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
