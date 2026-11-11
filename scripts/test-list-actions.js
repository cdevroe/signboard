const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const vm = require('vm');
const { reorderListDirectories } = require('../lib/cardOrdering');

const recoveryFile = '.signboard-list-order.json';
const names = ['000-Inbox-stock', '001-To Do-stock', '002-This Week-stock', '003-Done-stock'];
const settings = '---\nworkflow:\n  completedListNames: [003-Done-stock]\n---\nKeep these notes.\n';
const content = (name) => `---\ntitle: ${name}\nsignboard_list: ${name}\nstatus: original\ncustom: preserve\n---\n- [ ] Keep my card\n`;

async function fixture(action) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-list-actions-'));
  const originalRename = fs.rename;
  try {
    for (const name of names) {
      await fs.mkdir(path.join(root, name));
      await fs.writeFile(path.join(root, name, '000-card-abcde.md'), content(name));
    }
    await fs.mkdir(path.join(root, 'XXX-Archive'));
    await fs.writeFile(path.join(root, 'board-settings.md'), settings);
    const alerts = [], announcements = [];
    let renders = 0;
    const lists = async () => (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== 'XXX-Archive').map((e) => e.name).sort();
    const context = vm.createContext({
      window: { boardRoot: root, alert: (text) => alerts.push(text), board: {
        listLists: lists,
        createList: (target) => fs.mkdir(target),
        reorderLists: (paths) => reorderListDirectories(root, paths),
        moveList: () => { throw new Error('Renderer must never stage list renames'); },
      } },
      console: { error() {} }, rand5: async () => 'abcde',
      closeAllModals: async () => { renders++; }, createCloseAllModalsRequest: () => ({}),
      renderBoard: async () => { renders++; },
      announceSignboardStatus: (text) => announcements.push(text),
    });
    for (const file of ['app/utilities/santizeFileName.js', 'app/cards/processAddNewList.js', 'app/lists/listActionsPopover.js']) {
      vm.runInContext(await fs.readFile(path.join(__dirname, '..', file), 'utf8'), context);
    }
    context.rand5 = async () => 'abcde';
    context.closeListActionsPopover = () => {};
    const invoke = (operation) => operation === 'add'
      ? context.processAddNewList('Today', { afterListPath: path.join(root, names[0]) })
      : context.handleMoveListByOffset(path.join(root, names[1]), operation === 'left' ? -1 : 1);
    await action({ root, lists, context, invoke, alerts, announcements, originalRename, renders: () => renders });
  } finally {
    fs.rename = originalRename;
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function assertOriginalCards(root) {
  for (const name of names) assert.equal(await fs.readFile(path.join(root, name, '000-card-abcde.md'), 'utf8'), content(name));
  assert.equal(await fs.readFile(path.join(root, 'board-settings.md'), 'utf8'), settings);
}

async function run() {
  for (const [input, expected] of [
    ['Release 1.7: QA', 'Release 1.7 QA'],
    ['Phase.2/3', 'Phase.23'],
    ['Notes.2?*<>|', 'Notes.2'],
    ['Café.2: revisión', 'Café.2 revisión'],
  ]) {
    await fixture(async ({ context, lists, alerts }) => {
      await context.processAddNewList(input);
      assert.deepEqual(await lists(), [...names, `004-${expected}-abcde`]);
      assert.equal(alerts.length, 0);
    });
  }
  for (const operation of ['add', 'left', 'right']) {
    await fixture(async ({ root, lists, invoke, alerts, announcements }) => {
      await invoke(operation);
      const expected = operation === 'add' ? ['Inbox', 'Today', 'To Do', 'This Week', 'Done']
        : operation === 'left' ? ['To Do', 'Inbox', 'This Week', 'Done'] : ['Inbox', 'This Week', 'To Do', 'Done'];
      assert.deepEqual((await lists()).map((name) => name.replace(/^\d+-/, '').replace(/-(stock|abcde)$/, '')), expected);
      for (const name of await lists()) {
        if (name.includes('Today')) continue;
        const original = names.find((n) => n.slice(4) === name.slice(4));
        assert.equal(await fs.readFile(path.join(root, name, '000-card-abcde.md'), 'utf8'), content(original), 'Ordering must not rewrite card metadata');
      }
      assert.equal(alerts.length, 0);
      assert.equal(announcements.length, 1);
      assert(!(await fs.readdir(root)).includes(recoveryFile));
    });
    // Fail during staging and at the first/later final rename. Rollback must
    // restore all old lists, cards and workflow settings; new lists stay appended.
    for (const phase of ['first-stage', 'later-stage', 'first-final', 'later-final']) {
      await fixture(async ({ root, lists, invoke, alerts, announcements, originalRename, renders, context }) => {
        let stages = 0, finals = 0, injected = false;
        fs.rename = async (from, to) => {
          const staging = path.basename(to).startsWith('__sbtmp-');
          const finalizing = path.basename(from).startsWith('__sbtmp-');
          if (staging) stages++;
          if (finalizing) finals++;
          const fail = phase === 'first-stage' ? stages === 1 && staging
            : phase === 'later-stage' ? stages === 2 && staging
            : phase === 'first-final' ? finals === 1 && finalizing : finals === 2 && finalizing;
          if (!injected && fail) { injected = true; throw Object.assign(new Error(`Injected ${phase} failure`), { code: 'EIO' }); }
          return originalRename(from, to);
        };
        await invoke(operation);
        assert(injected);
        assert.deepEqual(await lists(), operation === 'add' ? [...names, '004-Today-abcde'] : names);
        await assertOriginalCards(root);
        assert.equal(alerts.length, 1);
        assert.match(alerts[0], /Injected/);
        assert(!announcements.some((text) => /^Moved list|^Created list "Today"\.$/.test(text)));
        assert.equal(renders(), 1);
        assert.equal(context.window.listOrderInProgress, false);
        assert(!(await fs.readdir(root)).includes(recoveryFile));
      });
    }
  }
  await fixture(async ({ root, originalRename }) => {
    let renames = 0;
    fs.rename = async (...args) => { renames++; return originalRename(...args); };
    await reorderListDirectories(root, names.map((name) => path.join(root, name)));
    assert.equal(renames, 0, 'An unchanged order must not rename folders');
    assert(!(await fs.readdir(root)).includes(recoveryFile));
    await assertOriginalCards(root);
  });
  await fixture(async ({ root, invoke, alerts }) => {
    const originalOpen = fs.open;
    try {
      fs.open = async (file, ...args) => {
        if (path.basename(file) === recoveryFile) throw new Error('Cannot write recovery record');
        return originalOpen(file, ...args);
      };
      await invoke('add');
      assert.match(alerts[0], /Cannot write recovery record/);
      await assertOriginalCards(root);
    } finally { fs.open = originalOpen; }
  });
  for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
    await fixture(async ({ invoke, alerts, originalRename }) => {
      let failures = 0;
      fs.rename = async (from, to) => {
        if (path.basename(from).startsWith('__sbtmp-') && failures++ < 2) throw Object.assign(new Error('Temporary lock'), { code });
        return originalRename(from, to);
      };
      await invoke('add');
      assert.equal(alerts.length, 0, `${code} should retry and succeed`);
    });
  }
  await fixture(async ({ root, lists, invoke, alerts, originalRename }) => {
    let attempts = 0;
    fs.rename = async (from, to) => {
      if (path.basename(to) === '001-Today-abcde') { attempts++; throw Object.assign(new Error('Persistent lock'), { code: 'EPERM' }); }
      return originalRename(from, to);
    };
    await invoke('add');
    assert.equal(attempts, 4, 'Retries must be bounded');
    await assertOriginalCards(root);
    assert.equal(alerts.length, 1);
    assert.deepEqual(await lists(), [...names, '004-Today-abcde']);
  });
  await fixture(async ({ root, lists, invoke, alerts, originalRename }) => {
    fs.rename = async (from, to) => {
      if (path.basename(from).startsWith('__sbtmp-')) throw Object.assign(new Error('Cannot finish or restore'), { code: 'EIO' });
      return originalRename(from, to);
    };
    await invoke('add');
    assert.match(alerts[0], /recovery is incomplete/);
    const record = await fs.readFile(path.join(root, recoveryFile), 'utf8');
    const entries = JSON.parse(record).entries;
    assert.equal(entries.length, 5);
    for (const name of names) {
      const entry = entries.find((e) => e.original === name);
      assert(entry);
      assert.equal(await fs.readFile(path.join(root, entry.temporary || entry.original, '000-card-abcde.md'), 'utf8'), content(name));
    }
    fs.rename = originalRename;
    await assert.rejects(reorderListDirectories(root, (await lists()).map((n) => path.join(root, n))), /recovery is required/);
    assert.equal(await fs.readFile(path.join(root, recoveryFile), 'utf8'), record);
  });
  await fixture(async ({ root, invoke, alerts, originalRename }) => {
    let injected = false;
    fs.rename = async (from, to) => {
      if (!injected && path.basename(to) === '000-To Do-stock') {
        injected = true;
        await fs.mkdir(path.join(root, names[1]));
        await fs.writeFile(path.join(root, names[1], 'external.md'), 'Concurrent writer');
        throw new Error('Final rename failed');
      }
      return originalRename(from, to);
    };
    await invoke('left');
    assert.match(alerts[0], /recovery is incomplete/);
    assert.equal(await fs.readFile(path.join(root, names[1], 'external.md'), 'utf8'), 'Concurrent writer');
    const record = JSON.parse(await fs.readFile(path.join(root, recoveryFile), 'utf8'));
    const entry = record.entries.find((entry) => entry.original === names[1]);
    assert.equal(await fs.readFile(path.join(root, entry.temporary, '000-card-abcde.md'), 'utf8'), content(names[1]));
  });
  await fixture(async ({ root, originalRename }) => {
    await originalRename(path.join(root, names[0]), path.join(root, '__sbtmp-000-oldxx'));
    await assert.rejects(reorderListDirectories(root, []), /Unfinished list renames/);
  });
  console.log('List action regressions passed (success, staging/final failures, retries, recovery records and legacy leftovers).');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
