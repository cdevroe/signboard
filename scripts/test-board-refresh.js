const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  let token = 1;
  let scheduled = 0;
  let renders = 0;
  let bulkMenu = false;
  const context = vm.createContext({
    console,
    window: {
      boardRoot: '/board/', cardOrderInProgress: 0,
      board: { startBoardWatch: async () => ({ ok: true }), getBoardWatchToken: async () => token },
      setTimeout: () => ++scheduled,
    },
    document: { getElementById: () => null, querySelector: () => bulkMenu ? {} : null },
    renderBoard: async () => { renders++; },
  });
  // Load the real lifecycle functions without booting the application.
  const source = fs.readFileSync(path.join(__dirname, '../app/init.js'), 'utf8');
  assert.match(source, /\ninit\(\);\s*$/);
  vm.runInContext(source.replace(/\ninit\(\);\s*$/, ''), context);
  vm.runInContext("externalBoardWatchRoot = '/board/'; externalBoardWatchToken = 1;", context);
  return {
    context,
    setToken: (value) => { token = value; },
    setBulkMenu: (value) => { bulkMenu = value; },
    scheduled: () => scheduled,
    renders: () => renders,
  };
}

async function main() {
  {
    const f = fixture();
    f.context.window.cardOrderInProgress = 1;
    f.setToken(2);
    await f.context.externalBoardSyncTick();
    assert.equal(f.scheduled(), 0, 'Do not schedule a redraw for a drop still writing');
    vm.runInContext('externalBoardWatchToken = 2;', f.context); // Drop acknowledges its completed writes.
    f.context.window.cardOrderInProgress = 0;
    await f.context.externalBoardSyncTick();
    assert.equal(f.scheduled(), 0);

    f.setToken(3); // A later external edit must still refresh.
    await f.context.externalBoardSyncTick();
    assert.equal(f.scheduled(), 1);
    await f.context.runExternalBoardRefresh();
    assert.equal(f.renders(), 1);
  }
  {
    const f = fixture();
    let resolveToken;
    f.context.window.board.getBoardWatchToken = () => new Promise((resolve) => { resolveToken = resolve; });
    const tick = f.context.externalBoardSyncTick();
    f.context.window.cardOrderInProgress = 1;
    resolveToken(2);
    await tick;
    assert.equal(f.scheduled(), 0, 'A drop starting during the token IPC must also defer refresh');
    assert.equal(vm.runInContext('externalBoardWatchToken', f.context), 1);
  }
  for (const blocker of ['drop', 'bulk menu']) {
    const f = fixture();
    if (blocker === 'drop') f.context.window.cardOrderInProgress = 1;
    else f.setBulkMenu(true);
    await f.context.runExternalBoardRefresh();
    assert.equal(f.renders(), 0);
    assert.equal(vm.runInContext('externalBoardRefreshPending', f.context), true);
    f.context.window.cardOrderInProgress = 0;
    f.setBulkMenu(false);
    await f.context.externalBoardSyncTick();
    assert.equal(f.scheduled(), 1, `Preserve refreshes already pending before the ${blocker}`);
    await f.context.runExternalBoardRefresh();
    assert.equal(f.renders(), 1);
    assert.equal(vm.runInContext('externalBoardRefreshPending', f.context), false);
  }
  {
    const f = fixture();
    const writes = [];
    let drop;
    f.context.document.createElement = () => ({
      dataset: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, querySelectorAll: () => [],
    });
    f.context.Sortable = function (element, options) { drop = options.onEnd; };
    f.context.createBoardCardSortableOptions = (options) => options;
    f.context.acknowledgeLocalBoardFilesystemChanges = async () => {};
    f.context.console = { error() {} };
    f.context.window.board.reorderCardsInList = () => new Promise((resolve, reject) => writes.push({ resolve, reject }));
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/lists/createListElement.js'), 'utf8'), f.context);
    await f.context.createListElement('Inbox', '/board/inbox', []);
    const event = { to: { dataset: { path: '/board/inbox' }, querySelectorAll: () => [] } };
    const first = drop(event);
    const second = drop(event);
    assert.equal(f.context.window.cardOrderInProgress, 2);
    writes[0].resolve({ cards: [] });
    await first;
    assert.equal(f.context.window.cardOrderInProgress, 1, 'Finishing one drop must not unlock another');
    writes[1].reject(new Error('Injected reorder failure'));
    await second;
    assert.equal(f.context.window.cardOrderInProgress, 0, 'Failed drops must release the refresh guard');
    assert.equal(f.renders(), 1, 'Failed drops still render recovery state');
  }
  console.log('Board refresh regressions passed (drop/token races, pending refreshes, bulk menus, later external edits).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
