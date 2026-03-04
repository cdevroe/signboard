const { spawn } = require('child_process');
const path = require('path');

function encodeMessage(payload) {
  const json = JSON.stringify(payload);
  const length = Buffer.byteLength(json, 'utf8');
  return Buffer.from(`Content-Length: ${length}\r\n\r\n${json}`, 'utf8');
}

function readFrames(buffer, onFrame) {
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

async function run() {
  const child = spawn(process.execPath, ['-e', "const { startSignboardMcpServer } = require('./lib/mcpServer'); startSignboardMcpServer({ appVersion: 'test' });"], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = Buffer.alloc(0);
  const responsesById = new Map();
  let streamError = null;
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

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  const send = (payload) => {
    child.stdin.write(encodeMessage(payload));
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
        reject(new Error(`Timed out waiting for MCP response id=${id}. stderr=${stderr.trim()}`));
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
    params: { protocolVersion: '2024-11-05' },
  });

  const initializeResponse = await waitForResponse(1);
  if (initializeResponse.error) {
    throw new Error(`Initialize failed: ${JSON.stringify(initializeResponse.error)}`);
  }

  if (initializeResponse.result?.serverInfo?.name !== 'signboard-mcp') {
    throw new Error(`Unexpected server name: ${JSON.stringify(initializeResponse.result)}`);
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
    throw new Error(`tools/list failed: ${JSON.stringify(toolsResponse.error)}`);
  }

  const tools = Array.isArray(toolsResponse.result?.tools) ? toolsResponse.result.tools : [];
  const toolNames = new Set(tools.map((tool) => tool && tool.name).filter(Boolean));

  const requiredToolNames = [
    'signboard.get_config',
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
      throw new Error(`Missing MCP tool: ${toolName}`);
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
    throw new Error(`tools/call signboard.get_config failed: ${JSON.stringify(configResponse.error)}`);
  }

  if (!configResponse.result || configResponse.result.isError) {
    throw new Error(`Unexpected signboard.get_config result: ${JSON.stringify(configResponse.result)}`);
  }

  child.stdin.end();
  await waitForExit;

  console.log('MCP server smoke test passed.');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
