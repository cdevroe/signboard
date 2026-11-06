const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');
const cards = require('../lib/cardFrontmatter');
const root = path.resolve(__dirname, '..');

function mcpClient(env, readOnly = false) {
  const child = spawn(process.execPath, [path.join(root, 'bin/signboard-mcp.js')], {
    env: { ...env, SIGNBOARD_MCP_READ_ONLY: String(readOnly) }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let id = 0;
  let stderr = '';
  child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-4000); });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line);
    const request = pending.get(response.id);
    if (request) { pending.delete(response.id); clearTimeout(request.timer); request.resolve(response); }
  });
  child.on('exit', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(stderr)); }
    pending.clear();
  });
  return {
    async request(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`MCP timeout: ${method}\n${stderr}`)); }, 15000);
        pending.set(requestId, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
      });
    },
    async call(name, args, failure = false) {
      const response = await this.request('tools/call', { name: `signboard_${name}`, arguments: args });
      if (failure) {
        assert.ok(response.error || response.result?.isError, `Expected rejection: ${name}`);
        return response;
      }
      assert.ok(!response.error && !response.result?.isError, JSON.stringify(response));
      return response.result.structuredContent;
    },
    async close() {
      if (child.exitCode !== null) return;
      const stopped = new Promise((resolve) => child.once('exit', resolve));
      child.stdin.end();
      await stopped;
    },
  };
}

async function digest(directory) {
  const result = {};
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [file, hash] of Object.entries(await digest(target))) result[`${entry.name}/${file}`] = hash;
    } else if (entry.isFile()) result[entry.name] = crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
    else result[entry.name] = await fs.readlink(target);
  }
  return result;
}

async function run() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-parity-'));
  const allowed = path.join(temporary, 'allowed');
  const outside = path.join(temporary, 'outside');
  await fs.mkdir(allowed);
  await fs.mkdir(outside);
  const env = { ...process.env, SIGNBOARD_CLI_CONFIG_DIR: path.join(temporary, 'cli'),
    SIGNBOARD_DESKTOP_USER_DATA_DIR: path.join(temporary, 'desktop'), SIGNBOARD_MCP_ALLOWED_ROOTS: allowed };
  const client = mcpClient(env);
  const readOnly = mcpClient(env, true);
  function cli(args, failure = false) {
    const result = spawnSync(process.execPath, [path.join(root, 'bin/signboard.js'), ...args], { env, encoding: 'utf8' });
    if (failure) { assert.notEqual(result.status, 0, `Expected CLI failure: ${args}`); return result; }
    assert.equal(result.status, 0, `${args}\n${result.stderr}`);
    return args.includes('--json') ? JSON.parse(result.stdout) : result.stdout.trim();
  }
  try {
    const inventory = await client.request('tools/list');
    const names = inventory.result.tools.map((tool) => tool.name);
    for (const name of ['search_cards', 'rename_list', 'duplicate_board', 'reorder_cards', 'reorder_lists']) {
      assert.ok(names.includes(`signboard_${name}`));
      for (const doc of ['MCP_README.md', 'skills/signboard-mcp/SKILL.md']) {
        assert.ok((await fs.readFile(path.join(root, doc), 'utf8')).includes(`\`signboard_${name}\``));
      }
    }
    for (const mode of ['cli', 'mcp']) {
      let boardRoot = path.join(allowed, mode);
      cli(['boards', 'create', boardRoot, '--no-welcome', '--use', '--json']);
      const originalLists = cli(['lists', '--board', boardRoot, '--json']);
      const todo = originalLists[0].directoryName;
      const doing = originalLists[1].directoryName;
      const done = originalLists[2].directoryName;
      const patch = { labels: [{ id: 'urgent', name: 'Urgent', color: '#ff0000' }], workflow: { autoDetectCompletedLists: false, completedListNames: [done] } };
      const patchFile = path.join(temporary, `${mode}.json`);
      await fs.writeFile(patchFile, JSON.stringify(patch));
      if (mode === 'cli') cli(['settings', 'update', '--file', patchFile, '--json']);
      else await client.call('update_board_settings', { boardRoot, ...patch });
      const first = cli(['cards', 'create', '--list', todo, '--title', 'Alpha', '--body', 'Unique launch text', '--due', '2000-01-02', '--label', 'Urgent', '--json']);
      const second = cli(['cards', 'create', '--list', todo, '--title', 'Beta', '--body', `- [x] (due: 2000-01-01) Finished\n- [ ] (due: 2000-01-03) Open\nSee signboard://open-card?id=${first.id}`, '--json']);
      const third = cli(['cards', 'create', '--list', todo, '--title', 'Gamma', '--body', 'No dates', '--json']);
      // Search semantics and timestamps are shared with the CLI; legacy list_cards is unchanged.
      for (const [options, flags] of [
        [{ search: 'Unique launch', labels: ['Urgent'] }, ['--search', 'Unique launch', '--label', 'Urgent']],
        [{ due: 'overdue', dueSource: 'task' }, ['--due', 'overdue', '--due-source', 'task']],
        [{ due: 'overdue', taskStatus: 'any', sort: 'due' }, ['--due', 'overdue', '--task-status', 'any', '--sort', 'due']],
        [{ listNames: [todo], sort: 'created-newest' }, ['--list', todo, '--sort', 'created-newest']],
      ]) {
        const queried = await readOnly.call('search_cards', { boardRoot, ...options });
        const expected = cli(['cards', '--json', ...flags]);
        assert.deepEqual(queried.cards.map((card) => card.cardId), expected.map((card) => card.id));
        if (queried.cards.length) assert.deepEqual(queried.cards[0].timestamps, expected[0].timestamps);
      }
      const page = await client.call('search_cards', { boardRoot, limit: 1 });
      assert.equal(page.total, 3); assert.equal(page.nextOffset, 1);
      const next = await client.call('search_cards', { boardRoot, offset: page.nextOffset, limit: 1 });
      assert.notEqual(next.cards[0].cardId, page.cards[0].cardId);
      assert.deepEqual((await client.call('list_cards', { boardRoot, listName: todo })).cardFiles, [first.fileName, second.fileName, third.fileName]);
      await client.call('search_cards', { boardRoot, limit: 0 }, true);
      await client.call('search_cards', { boardRoot, listNames: ['../outside'] }, true);
      await client.call('search_cards', { boardRoot, taskStatus: 'typo' }, true);
      const untouched = await digest(boardRoot);
      for (const invalid of [{ unknown: true }, { labels: [null] }, { workflow: [] }, []]) {
        await fs.writeFile(patchFile, JSON.stringify(invalid));
        cli(['settings', 'update', '--file', patchFile, '--json'], true);
      }
      cli(['cards', 'archive', '--card', 'a'], true);
      cli(['lists', 'archive', 'XXX-Archive'], true);
      cli(['boards', 'rename', 'outside', '--board', outside], true);
      for (const [name, args] of [
        ['rename_list', { listName: todo, newName: 'Next' }],
        ['duplicate_board', { targetParentRoot: allowed, newBoardName: 'Forbidden' }],
        ['reorder_cards', { listName: todo, orderBy: 'due' }],
        ['reorder_lists', { listNames: [done, doing, todo] }],
      ]) await readOnly.call(name, { boardRoot, ...args }, true);
      await client.call('reorder_cards', { boardRoot, listName: todo, cardFiles: [first.fileName, first.fileName, third.fileName] }, true);
      await client.call('reorder_cards', { boardRoot, listName: todo, cardFiles: [first.fileName] }, true);
      await client.call('reorder_lists', { boardRoot, listNames: [todo, done] }, true);
      cli(['cards', 'reorder', '--list', todo, '--card', first.id], true);
      cli(['boards', 'rename', '..'], true);
      cli(['boards', 'duplicate', '--parent', boardRoot, '--name', 'Nested'], true);
      await client.call('duplicate_board', { boardRoot, targetParentRoot: outside, newBoardName: 'Escape' }, true);
      assert.deepEqual(await digest(boardRoot), untouched);
      // Both surfaces must persist order and return usable new paths.
      let ordered = mode === 'cli'
        ? cli(['cards', 'reorder', '--list', todo, '--card', third.id, '--card', second.id, '--card', first.id, '--json'])
        : await client.call('reorder_cards', { boardRoot, listName: todo, cardFiles: [third.fileName, second.fileName, first.fileName] });
      assert.deepEqual((await Promise.all(ordered.cards.map((entry) => cards.readCard(entry.cardPath)))).map((card) => card.frontmatter.title), ['Gamma', 'Beta', 'Alpha']);
      ordered = mode === 'cli' ? cli(['cards', 'reorder', '--list', todo, '--by', 'due', '--json'])
        : await client.call('reorder_cards', { boardRoot, listName: todo, orderBy: 'due' });
      assert.deepEqual((await Promise.all(ordered.cards.map((entry) => cards.readCard(entry.cardPath)))).map((card) => card.frontmatter.title), ['Alpha', 'Beta', 'Gamma']);
      const firstNow = cli(['cards', 'read', '--card', first.id, '--json']);
      const archived = mode === 'cli' ? cli(['cards', 'archive', '--card', first.id, '--json'])
        : await client.call('archive_card', { boardRoot, listName: todo, cardFile: firstNow.fileName });
      assert.ok(archived.archivedCardPath);
      assert.equal(cli(['archive', 'cards', '--json']).length, 1);
      cli(['archive', 'restore-card', '--card', first.id, '--to-list', todo, '--json']);
      assert.equal(cli(['cards', 'read', '--card', first.id, '--json']).body, first.body);
      const listOrder = mode === 'cli' ? cli(['lists', 'reorder', '--list', done, '--list', doing, '--list', todo, '--json'])
        : await client.call('reorder_lists', { boardRoot, listNames: [done, doing, todo] });
      const newDone = listOrder.lists[0].listDirectoryName;
      assert.deepEqual(cli(['settings', '--json']).workflow.completedListNames, [newDone]);
      const renamed = mode === 'cli' ? cli(['lists', 'rename', newDone, 'Finished work', '--json'])
        : await client.call('rename_list', { boardRoot, listName: newDone, newName: 'Finished work' });
      assert.deepEqual(cli(['settings', '--json']).workflow.completedListNames, [renamed.after.directoryName]);
      const listArchived = mode === 'cli' ? cli(['lists', 'archive', renamed.after.directoryName, '--json'])
        : await client.call('archive_list', { boardRoot, listName: renamed.after.directoryName });
      assert.ok(listArchived.archivedListPath);
      cli(['archive', 'restore-list', '--list', 'Finished work', '--json']);
      const sourceHash = await digest(boardRoot);
      const copied = mode === 'cli' ? cli(['boards', 'duplicate', '--parent', allowed, '--name', `${mode}-copy`, '--json'])
        : await client.call('duplicate_board', { boardRoot, targetParentRoot: allowed, newBoardName: `${mode}-copy` });
      assert.equal(copied.cardsDuplicated, 3);
      assert.deepEqual(await digest(boardRoot), sourceHash);
      const copiedCards = cli(['cards', '--board', copied.boardRoot, '--json']);
      assert.ok(copiedCards.every((card) => ![first.id, second.id, third.id].includes(card.id)));
      const copiedAlpha = copiedCards.find((card) => card.title === 'Alpha');
      assert.ok(copiedCards.find((card) => card.title === 'Beta').body.includes(`signboard://open-card?id=${copiedAlpha.id}`));
      cli(['boards', 'duplicate', '--parent', allowed, '--name', `${mode}-copy`], true);
      assert.deepEqual(await digest(boardRoot), sourceHash);
      const renamedBoard = mode === 'cli' ? cli(['boards', 'rename', `${mode}-renamed`, '--json'])
        : await client.call('rename_board', { boardRoot, newBoardName: `${mode}-renamed` });
      boardRoot = renamedBoard.newBoardRoot;
      if (mode === 'cli') assert.equal(cli(['use']), boardRoot);
      else cli(['use', boardRoot]);
      const parent = path.join(allowed, `${mode}-parent`);
      await fs.mkdir(parent);
      const moved = mode === 'cli' ? cli(['boards', 'move', '--parent', parent, '--json'])
        : await client.call('move_board', { boardRoot, targetParentRoot: parent });
      boardRoot = moved.newBoardRoot;
      if (mode === 'cli') assert.equal(cli(['use']), boardRoot);
      assert.equal(cli(['cards', '--board', boardRoot, '--json']).length, 3);
      await client.call('rename_list', { boardRoot, listName: 'XXX-Archive', newName: 'Archive renamed' }, true);
      // New bulk readers/writers reject symlink escapes without touching either tree.
      await fs.symlink(outside, path.join(boardRoot, '003-linked-abcde'), 'dir');
      const linkedHash = await digest(boardRoot);
      await client.call('search_cards', { boardRoot }, true);
      await client.call('duplicate_board', { boardRoot, targetParentRoot: allowed, newBoardName: 'Escaped copy' }, true);
      assert.deepEqual(await digest(boardRoot), linkedHash);
    }
    console.log('CLI/MCP parity workflows passed (archive/restore, search/paging, settings, rename/move, ordering, duplication, read-only and path boundaries).');
  } finally {
    await client.close(); await readOnly.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
