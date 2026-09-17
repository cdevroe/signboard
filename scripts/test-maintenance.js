const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { atomicWriteFile } = require('../lib/atomicFile');
const { readBoardSnapshot } = require('../lib/boardSnapshot');
const cli = require('../lib/cliBoard');
const cards = require('../lib/cardFrontmatter');
const labels = require('../lib/boardLabels');
const archive = require('../lib/archive');
const { renameManagedDirectory } = require('../lib/directoryRename');
const { assertAllowedPath, assertAllowedTree } = require('../lib/allowedPaths');

async function run() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-maintenance-'));
  const board = path.join(temp, 'Board');
  const list = '000-Todo-stock';
  const done = '001-Done-stock';
  const originalRead = fs.readFile;
  const originalRename = fs.rename;
  let child;
  try {
    await fs.mkdir(path.join(board, list), { recursive: true });
    await fs.mkdir(path.join(board, done));
    const privateFile = path.join(temp, 'private.md');
    await fs.writeFile(privateFile, 'before', { mode: 0o600 });
    await atomicWriteFile(privateFile, 'after');
    if (process.platform !== 'win32') assert.equal((await fs.stat(privateFile)).mode & 0o777, 0o600);
    fs.rename = async (from, to) => {
      if (to === privateFile) throw new Error('injected atomic failure');
      return originalRename(from, to);
    };
    await assert.rejects(atomicWriteFile(privateFile, 'lost'), /injected/);
    fs.rename = originalRename;
    assert.equal(await fs.readFile(privateFile, 'utf8'), 'after');
    assert(!(await fs.readdir(temp)).some((name) => name.endsWith('.tmp')));
    const newFile = path.join(temp, 'new.md');
    await atomicWriteFile(newFile, 'new');
    if (process.platform !== 'win32') assert.equal((await fs.stat(newFile)).mode & 0o777, 0o666 & ~process.umask());

    for (let i = 0; i < 1000; i++) {
      await fs.writeFile(path.join(board, list, `${String(i).padStart(3, '0')}-fixture-${i}.md`),
        `---\ntitle: Fixture ${i}\n---\n- [ ] (start: 2026-09-16) (due: 2026-09-18) Open\n- [x] (due: 2026-09-17) Done\n`);
    }
    let reads = 0; let active = 0; let peak = 0;
    fs.readFile = async (...args) => {
      if (!String(args[0]).startsWith(board)) return originalRead(...args);
      reads++; active++; peak = Math.max(peak, active);
      try { return await originalRead(...args); } finally { active--; }
    };
    const snapshots = await Promise.all([readBoardSnapshot(board), readBoardSnapshot(board)]);
    assert(snapshots.every((snapshot) => snapshot.ok && snapshot.lists.flatMap((item) => item.cards).length === 1000));
    assert(peak < 64, `unbounded reads: ${peak}`);
    reads = 0;
    const exact = await cli.resolveCard(board, { listRef: list, cardRef: '000-FIXTURE-0.MD' });
    assert.equal(exact.title, 'Fixture 0');
    assert(reads <= 3, `exact lookup read ${reads} files`);
    assert.deepEqual(exact.taskSummary, { total: 2, completed: 1, remaining: 1 });
    assert.deepEqual(exact.incompleteTaskDueDates, ['2026-09-18']);
    fs.readFile = async (...args) => {
      if (String(args[0]).endsWith('000-fixture-0.md')) throw Object.assign(new Error('unreadable fixture'), { code: 'EACCES' });
      return originalRead(...args);
    };
    const partial = await readBoardSnapshot(board);
    assert.equal(partial.ok, false);
    assert.equal(partial.errors.length, 1);
    assert.equal(partial.lists.flatMap((item) => item.cards).length, 999);
    fs.readFile = originalRead;

    const first = await cli.createCard(board, { listRef: list, title: 'After 999' });
    const second = await cli.createCard(board, { listRef: list, title: 'After 1000' });
    assert.match(first.fileName, /^1000-/);
    assert.match(second.fileName, /^1001-/);
    const archived = await archive.archiveCard(board, first.filePath);
    const restored = await archive.restoreArchivedCard(board, archived.archivedCardPath, path.join(board, done));
    assert.match(restored.restoredCardFile, /^000-after-999-/);

    // A failed metadata rewrite restores both the directory and original bytes.
    const renameBoard = path.join(temp, 'Rename');
    await fs.mkdir(path.join(renameBoard, list), { recursive: true });
    const one = await cli.createCard(renameBoard, { listRef: list, title: 'Keep one' });
    const two = await cli.createCard(renameBoard, { listRef: list, title: 'Keep two' });
    await cards.writeCard(one.filePath, { frontmatter: { ...one.frontmatter, custom: { preserved: ['one', 'two'] } }, body: 'Keep this body.' });
    const before = await Promise.all([one.filePath, two.filePath].map((file) => fs.readFile(file, 'utf8')));
    const renamedList = '000-Doing-stock';
    fs.rename = async (from, to) => {
      if (from.endsWith('.tmp') && to === path.join(renameBoard, renamedList, two.fileName)) throw new Error('injected rename failure');
      return originalRename(from, to);
    };
    await assert.rejects(cli.renameList(renameBoard, list, 'Doing'), /injected/);
    fs.rename = originalRename;
    assert.deepEqual(await Promise.all([one.filePath, two.filePath].map((file) => fs.readFile(file, 'utf8'))), before);
    await assert.rejects(fs.access(path.join(renameBoard, renamedList)));
    await labels.writeBoardSettings(renameBoard, { workflow: { completedListNames: [list] } });
    await cli.renameList(renameBoard, list, 'Doing');
    const renamedCard = await cards.readCard(path.join(renameBoard, renamedList, one.fileName));
    assert.equal(renamedCard.frontmatter.status, 'Doing');
    assert.deepEqual(renamedCard.frontmatter.custom, { preserved: ['one', 'two'] });
    assert.equal(renamedCard.body, 'Keep this body.');
    assert.equal(renamedCard.frontmatter.signboard_list, 'Doing');
    assert.equal(renamedCard.frontmatter.signboard_id, one.frontmatter.signboard_id);
    assert.deepEqual((await labels.readBoardSettings(renameBoard)).workflow.completedListNames, [renamedList]);
    const movedBoard = path.join(temp, 'Renamed board');
    await renameManagedDirectory(renameBoard, renameBoard, movedBoard);
    assert.equal((await cards.readCard(path.join(movedBoard, renamedList, one.fileName))).frontmatter.signboard_board, 'Renamed board');

    const outside = path.join(temp, 'Outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'outside.md'), '---\ntitle: Outside\n---\n');
    await fs.symlink(outside, path.join(board, '999-Linked'), 'dir');
    await fs.symlink(path.join(outside, 'missing'), path.join(board, 'dangling'));
    await assert.rejects(assertAllowedPath([board], path.join(board, '999-Linked/new.md')), /outside/);
    await assert.rejects(assertAllowedPath([board], path.join(board, 'dangling')), /symbolic link/);
    await assert.rejects(assertAllowedTree([board], board), /outside|symbolic link/);
    const alias = path.join(temp, 'Alias');
    await fs.symlink(board, alias, 'dir');
    await assertAllowedPath([alias], path.join(board, list, second.fileName));

    let buffer = ''; let sequence = 0; const pending = new Map();
    child = spawn(process.execPath, [path.join(__dirname, '../bin/signboard-mcp.js')], {
      env: { ...process.env, SIGNBOARD_MCP_ALLOWED_ROOTS: board, SIGNBOARD_MCP_READ_ONLY: 'false', SIGNBOARD_DESKTOP_USER_DATA_DIR: path.join(temp, 'profile') },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        pending.get(message.id)?.(message.result); pending.delete(message.id);
      }
    });
    const call = (name, args) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => reject(new Error(`MCP timeout: ${name}`)), 10000);
      pending.set(id, (result) => { clearTimeout(timer); resolve(result); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: `signboard_${name}`, arguments: args } }) + '\n');
    });
    const escaped = await call('read_card', { boardRoot: board, listName: '999-Linked', cardFile: 'outside.md' });
    assert.equal(escaped.isError, true);
    const escapedWrite = await call('create_card', { boardRoot: board, listName: '999-Linked', title: 'Must not escape' });
    assert.equal(escapedWrite.isError, true);
    assert.deepEqual(await fs.readdir(outside), ['outside.md']);
    const fileLink = path.join(board, list, '998-linked.md');
    await fs.symlink(path.join(outside, 'outside.md'), fileLink);
    const escapedUpdate = await call('update_card', { boardRoot: board, listName: list, cardFile: '998-linked.md', body: 'Must not overwrite' });
    assert.equal(escapedUpdate.isError, true);
    await fs.unlink(fileLink);
    const aliasRead = await call('read_card', { boardRoot: alias, listName: list, cardFile: second.fileName });
    assert(!aliasRead.isError, JSON.stringify(aliasRead));
    const legacySettingsLink = path.join(board, 'labels.md');
    await fs.symlink(path.join(outside, 'outside.md'), legacySettingsLink);
    const escapedSettings = await call('read_card', { boardRoot: board, listName: list, cardFile: second.fileName });
    assert.equal(escapedSettings.isError, true);
    await fs.unlink(legacySettingsLink);
    const archiveLink = path.join(board, 'XXX-Archive', 'outside.md');
    await fs.symlink(path.join(outside, 'outside.md'), archiveLink);
    assert.equal((await call('list_archive_entries', { boardRoot: board })).isError, true);
    await fs.unlink(archiveLink);
    // A directory source may itself be authorized but contain an escaping file.
    const importRoot = path.join(board, 'import-source');
    await fs.mkdir(importRoot);
    await fs.symlink(path.join(outside, 'outside.md'), path.join(importRoot, 'note.md'));
    assert.equal((await call('import_obsidian', { boardRoot: board, sourcePaths: [importRoot], dryRun: true })).isError, true);
    await fs.rm(importRoot, { recursive: true });
    assert.equal(await fs.readFile(path.join(outside, 'outside.md'), 'utf8'), '---\ntitle: Outside\n---\n');
    const invalid = await call('create_card', { boardRoot: board, listName: list, title: 'Bad date', due: '2026-02-31', dryRun: true });
    assert.equal(invalid.isError, true);
    const created = await call('create_card', { boardRoot: board, listName: list, title: 'MCP normalized', due: '2026-09-18' });
    assert(!created.isError, JSON.stringify(created));
    const original = created.structuredContent;
    assert.equal(original.card.frontmatter.signboard_list, 'Todo');
    const duplicate = await call('duplicate_card', { boardRoot: board, listName: list, cardFile: original.cardFile, targetListName: done });
    assert(!duplicate.isError, JSON.stringify(duplicate));
    const copy = duplicate.structuredContent;
    assert.notEqual(copy.card.frontmatter.signboard_id, original.card.frontmatter.signboard_id);
    assert.equal(copy.card.frontmatter.status, 'Done');
    assert.equal(copy.card.frontmatter.signboard_uri, `signboard://open-card?id=${copy.card.frontmatter.signboard_id}`);
    const invalidUpdate = await call('update_card', { boardRoot: board, listName: list, cardFile: original.cardFile, start: '2026-13-01' });
    assert.equal(invalidUpdate.isError, true);
    const moved = await call('move_card', { boardRoot: board, fromListName: list, toListName: done, cardFile: original.cardFile });
    assert(!moved.isError, JSON.stringify(moved));
    assert.equal((await cards.readCard(path.join(board, done, moved.structuredContent.newCardFile))).frontmatter.signboard_list, 'Done');
    const movedPath = path.join(board, done, moved.structuredContent.newCardFile);
    const activity = (await cards.readCard(movedPath)).frontmatter.activity;
    const toArchive = await call('move_card', { boardRoot: board, fromListName: done, toListName: 'XXX-Archive', cardFile: path.basename(movedPath), newCardFile: path.basename(movedPath) });
    assert(!toArchive.isError, JSON.stringify(toArchive));
    assert.deepEqual((await cards.readCard(path.join(board, 'XXX-Archive', path.basename(movedPath)))).frontmatter.activity, activity);
    console.log('Maintenance regressions passed (bounded reads, exact lookup, modes, numbering, rename recovery, MCP roots/metadata/dates).');
  } finally {
    fs.readFile = originalRead; fs.rename = originalRename;
    if (child) { child.kill(); await new Promise((resolve) => child.once('exit', resolve)); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
