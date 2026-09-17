// Linux lab only: node scripts/soak-maintenance.js PACKAGED_EXECUTABLE NEW_OUTPUT_DIR [minutes=120]
// All profiles and boards are disposable. Never target a normal user profile.
const fs = require('fs').promises;
const path = require('path');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { _electron } = require('@playwright/test');
const { readBoardSnapshot } = require('../lib/boardSnapshot');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const [executable, output, minutesInput = '120'] = process.argv.slice(2);
  const minutes = Number(minutesInput);
  if (process.platform !== 'linux' || !path.isAbsolute(executable || '') || !path.isAbsolute(output || '') || !Number.isFinite(minutes) || minutes <= 0 || minutes > 360) {
    throw new Error('Pass an absolute Linux packaged executable, a new output directory, and 1–360 minutes.');
  }
  await fs.mkdir(output);
  const board = path.join(output, 'Soak board');
  const other = path.join(output, 'Switch board');
  const profile = path.join(output, 'profile');
  await fs.mkdir(profile);
  for (const root of [board, other]) {
    for (let i = 0; i < 5; i++) {
      const list = path.join(root, `${String(i).padStart(3, '0')}-List${i}-stock`);
      await fs.mkdir(list, { recursive: true });
      for (let j = 0; j < 20; j++) await fs.writeFile(path.join(list, `${String(j).padStart(3, '0')}-seed-${i}${String(j).padStart(4, '0')}.md`),
        `---\ntitle: Seed ${i}-${j}\n---\n- [ ] Check integrity\n`);
    }
  }
  await fs.writeFile(path.join(profile, 'trusted-board-roots.json'), JSON.stringify([board, other]));
  const env = { ...process.env, SIGNBOARD_USER_DATA_DIR: profile, SIGNBOARD_DESKTOP_USER_DATA_DIR: profile,
    SIGNBOARD_CLI_CONFIG_DIR: path.join(output, 'cli-profile'), SIGNBOARD_TEST_DISABLE_FAVICON_FETCH: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const cliPath = path.join(path.dirname(executable), 'resources/app.asar/bin/signboard.js');
  const cli = (...args) => JSON.parse(execFileSync(executable, [cliPath, ...args, '--board', board, '--json'],
    { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }));
  let app; const started = Date.now(); const observations = []; let cycles = 0;
  const log = async (record) => fs.appendFile(path.join(output, 'observations.jsonl'), JSON.stringify(record) + '\n');
  try {
    app = await _electron.launch({ executablePath: executable, env, timeout: 60000 });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(({ board, other }) => {
      const roots = [board + '/', other + '/'];
      localStorage.setItem('openBoardPaths', JSON.stringify(roots));
      localStorage.setItem('activeBoardPath', roots[0]); localStorage.setItem('boardPath', roots[0]);
    }, { board, other });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 100, null, { timeout: 60000 });
    const pid = await app.evaluate(() => process.pid);
    while (Date.now() - started < minutes * 60000) {
      const title = `Soak card ${cycles}`;
      const created = cli('cards', 'create', '--list', '000-List0-stock', '--title', title, '--body', `Integrity ${cycles}`);
      await page.waitForFunction((text) => [...document.querySelectorAll('.card-title-button')].some((element) => element.textContent === text), title);
      await page.evaluate((file) => toggleEditCardModal(file), created.filePath);
      cli('cards', 'edit', '--list', '000-List0-stock', '--card', created.fileName, '--title', title + ' edited');
      await page.waitForFunction((text) => document.getElementById('cardEditorTitle').textContent === text, title + ' edited');
      await page.locator('#cardEditorClose').click();
      const moved = cli('cards', 'edit', '--list', '000-List0-stock', '--card', created.fileName, '--move-to', '001-List1-stock');
      assert.equal(moved.body, `Integrity ${cycles}`);
      await page.evaluate((file) => window.board.archiveCard(file), moved.filePath);
      await page.evaluate(async ({ board, other }) => { await switchToBoardPath(other + '/'); await switchToBoardPath(board + '/'); }, { board, other });
      const snapshot = await readBoardSnapshot(board, { includeArchive: true });
      assert(snapshot.ok, JSON.stringify(snapshot.errors));
      assert.equal(snapshot.lists.flatMap((list) => list.cards).length, 101 + cycles);
      const archived = snapshot.lists.find((list) => list.listName === 'XXX-Archive').cards;
      assert(archived.some((card) => card.body === `Integrity ${cycles}` && card.frontmatter.title === title + ' edited'));
      const table = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,pcpu='], { encoding: 'utf8' }).trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
      const pids = new Set([pid]); let changed = true;
      while (changed) { changed = false; for (const [id, parent] of table) if (pids.has(parent) && !pids.has(id)) { pids.add(id); changed = true; } }
      const rows = table.filter(([id]) => pids.has(id));
      const rssKb = rows.reduce((sum, row) => sum + row[2], 0);
      let descriptors = 0;
      for (const id of pids) descriptors += (await fs.readdir(`/proc/${id}/fd`).catch(() => [])).length;
      const sample = { at: new Date().toISOString(), elapsedSeconds: (Date.now() - started) / 1000, cycle: cycles + 1, processCount: pids.size, summedRssKb: rssKb,
        summedLifetimeCpuPercent: rows.reduce((sum, row) => sum + row[3], 0), descriptors, systemFileTable: (await fs.readFile('/proc/sys/fs/file-nr', 'utf8')).trim() };
      observations.push(sample); await log(sample); console.log(JSON.stringify(sample));
      if (rssKb > 2 * 1024 * 1024 || descriptors > 5000) throw new Error('Soak resource stop threshold exceeded.');
      cycles++;
      await delay(Math.min(60000, Math.max(0, started + minutes * 60000 - Date.now())));
    }
    const result = { ok: true, startedAt: new Date(started).toISOString(), durationSeconds: (Date.now() - started) / 1000,
      cycles, operations: { cliCreates: cycles, cliEdits: cycles, cliMoves: cycles, desktopArchives: cycles, boardSwitches: 2 * cycles, cleanEditorRefreshes: cycles },
      first: observations[0], last: observations.at(-1), maxRssKb: Math.max(...observations.map((item) => item.summedRssKb)),
      maxDescriptors: Math.max(...observations.map((item) => item.descriptors)), note: 'Summed RSS may double-count shared pages; CPU is ps lifetime average. TUI unavailable in 1.7.x.' };
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: false, durationSeconds: (Date.now() - started) / 1000, cycles, error: error.stack }, null, 2));
    throw error;
  } finally { if (app) await app.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
