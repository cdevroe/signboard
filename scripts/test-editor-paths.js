const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app/modals/toggleEditCardModal.js'), 'utf8');
const lists = ['000-Inbox-stock', '001-Doing-stock', '002-Done-stock'];

function fixture(root, nativePath) {
  const card = { value: '' };
  const select = {
    value: '', disabled: false, options: [],
    set innerHTML(value) { this.options = []; this.value = ''; },
    appendChild(option) {
      this.options.push(option);
      if (option.selected || this.options.length === 1) this.value = option.value;
    },
  };
  const arrow = { dataset: {}, setAttribute() {} };
  const moves = [];
  const context = vm.createContext({
    console,
    window: { boardRoot: root, board: {
      listLists: async () => lists,
      moveCardToTop: async (from, to) => {
        moves.push({ from, to });
        return { cardPath: nativePath(`${to}/000-example-stock.md`) };
      },
    } },
    document: {
      getElementById: (id) => ({ cardEditorCardPath: card, cardEditorListSelect: select, cardEditorMoveListLink: arrow })[id] || null,
      createElement: () => ({}),
    },
  });
  vm.runInContext(source, context);
  context.isCardEditorActive = () => true;
  context.flushEditorSaveIfNeeded = async () => {};
  context.showCardEditorListMoveFeedback = () => {};
  context.refreshCardEditorAfterMove = async (nextPath) => {
    card.value = nextPath;
    await context.updateCardEditorListDropdown(nextPath);
    await context.updateCardEditorMoveLink(nextPath);
  };
  const cardIn = (index) => nativePath(`${root}${lists[index]}/000-example-stock.md`);
  const reset = async (index) => {
    card.value = cardIn(index);
    moves.length = 0;
    await context.updateCardEditorListDropdown(card.value);
  };
  return { context, card, select, arrow, moves, cardIn, reset };
}

async function testMoves(root, nativePath) {
  const { context, card, select, arrow, moves, cardIn, reset } = fixture(root, nativePath);
  const event = { currentTarget: select, stopPropagation() {}, preventDefault() {} };

  // Opening a card outside Inbox must select its actual list, without a move.
  await reset(1);
  assert.equal(select.value, root + lists[1]);
  await context.handleChangeCardListSelect(event);
  assert.equal(moves.length, 0, 'Selecting the current list must not move the card');

  select.value = root + lists[2];
  await context.handleChangeCardListSelect(event);
  assert.deepEqual(moves, [{ from: cardIn(1), to: root + lists[2] }]);
  assert.equal(card.value, cardIn(2), 'Keep the native path returned by the main process');
  assert.equal(select.value, root + lists[2]);
  assert.equal(select.disabled, false);
  assert.equal(arrow.dataset.direction, 'left');

  // A second move uses the native path returned by the first one.
  await context.handleClickMoveCard(event);
  assert.equal(moves.length, 2);
  assert.deepEqual(moves[1], { from: cardIn(2), to: root + lists[1] });
  assert.equal(select.value, root + lists[1]);
  assert.equal(arrow.dataset.direction, 'right');
  await context.handleClickMoveCard(event);
  assert.equal(card.value, cardIn(2));

  await reset(0);
  assert.equal(await context.moveActiveEditorCardToAdjacentList('left'), false);
  assert.equal(moves.length, 0);
  assert.equal(await context.moveActiveEditorCardToAdjacentList('right'), true);
  assert.equal(card.value, cardIn(1));
  assert.equal(await context.moveActiveEditorCardToAdjacentList('left'), true);
  assert.equal(card.value, cardIn(0));
  await reset(2);
  assert.equal(await context.moveActiveEditorCardToAdjacentList('right'), false);
  assert.equal(moves.length, 0);

  // A failed write keeps the source selection and restores the control.
  await reset(1);
  select.value = root + lists[2];
  context.window.board.moveCardToTop = async () => { throw new Error('Move failed'); };
  await assert.rejects(context.handleChangeCardListSelect(event), /Move failed/);
  assert.equal(card.value, cardIn(1));
  assert.equal(select.value, root + lists[1]);
  assert.equal(select.disabled, false);
}

async function testArchiveLifecycle() {
  const { context, card, reset } = fixture('C:/Board/', (p) => p.replace(/\//g, '\\'));
  await reset(0);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let archives = 0;
  let closes = 0;
  context.window.board.archiveCard = async () => { archives += 1; await gate; };
  context.clearQueuedEditorSave = () => {};
  context.createCloseAllModalsRequest = () => ({ key: 'Escape' });
  context.closeAllModals = async (_event, options) => {
    assert.equal(options.skipEditorArchiveWait, true, 'Archive cleanup must not await itself');
    closes += 1;
  };
  const first = context.archiveActiveEditorCard();
  assert.equal(context.archiveActiveEditorCard(), first, 'Repeated archive requests share one operation');
  assert.equal(context.waitForEditorArchiveIfNeeded(), first);
  release();
  assert.equal(await first, true);
  assert.equal(archives, 1);
  assert.equal(closes, 1);
  assert.equal(card.value, '');
  assert.equal(context.waitForEditorArchiveIfNeeded(), null);

  await reset(0);
  context.window.board.archiveCard = async () => { throw new Error('Archive locked'); };
  await assert.rejects(context.archiveActiveEditorCard(), /Archive locked/);
  assert.equal(context.waitForEditorArchiveIfNeeded(), null, 'Failure releases the modal transition guard');
  assert.notEqual(card.value, '', 'Failure keeps the editor card available');
  context.window.board.archiveCard = async () => {};
  assert.equal(await context.archiveActiveEditorCard(), true, 'Retry succeeds after failure');
}

async function main() {
  await testArchiveLifecycle();
  for (const [root, nativePath] of [
    ['/tmp/Board with spaces/', (p) => p],
    ['C:/Users/Test/Board with spaces/', (p) => p.replace(/\//g, '\\')],
    ['C:/Users/Test/Board with spaces/', (p) => p.replace('/000-example', '\\000-example')],
    ['//server/share/Board with spaces/', (p) => p.replace(/\//g, '\\')],
  ]) await testMoves(root, nativePath);

  const context = vm.createContext({ console, window: {} });
  vm.runInContext(source, context);
  for (const [input, expected] of [
    ['C:\\note.md', 'C:/'],
    ['C:/note.md', 'C:/'],
    ['C:\\Users\\Test\\note.md', 'C:/Users/Test'],
    ['\\\\server\\share\\notes\\note.md', '//server/share/notes'],
    ['\\\\server\\share\\note.md', '//server/share'],
    ['//server/share/notes/note.md', '//server/share/notes'],
    ['/notes/note.md', '/notes'],
    ['/note.md', '/'],
    ['notes/note.md', 'notes'],
    ['note.md', ''],
    ['', ''],
  ]) {
    assert.equal(context.getLinkedObjectDefaultPickerPath({ path: input }), expected, input);
  }
  console.log('Editor path regressions passed (POSIX, Windows, mixed separators, UNC, picker roots).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
