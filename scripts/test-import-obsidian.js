const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const boardLabels = require('../lib/boardLabels');
const cardFrontmatter = require('../lib/cardFrontmatter');
const { importObsidian } = require('../lib/importers');
const { ARCHIVE_DIRECTORY_NAME, getListDisplayName } = require('../lib/cliBoard');

async function listDirectories(boardRoot) {
  const entries = await fs.readdir(boardRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function listMarkdownFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name).sort();
}

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-import-obsidian-'));
  const boardRoot = path.join(tmpDir, 'Imported Board');
  const kanbanFile = path.join(tmpDir, 'Roadmap.md');
  const taskScopeDir = path.join(tmpDir, 'TaskScope');
  const cardBoardVault = path.join(tmpDir, 'Vault');
  const todayIso = new Date().toISOString().slice(0, 10);
  await fs.mkdir(boardRoot, { recursive: true });
  await fs.mkdir(taskScopeDir, { recursive: true });
  await fs.mkdir(path.join(cardBoardVault, '.obsidian', 'plugins', 'card-board'), { recursive: true });

  try {
    await boardLabels.writeBoardSettings(boardRoot, {
      labels: [
        { id: 'launch-existing', name: 'launch', colorLight: '#fb923c', colorDark: '#f97316' },
      ],
      notifications: { enabled: false, time: '09:00' },
      tooltipsEnabled: true,
    });

    await fs.writeFile(kanbanFile, [
      '---',
      'kanban-plugin: board',
      '---',
      '',
      '## To Do',
      '',
      `- [ ] Launch prep #launch @{2026-05-03}`,
      '',
      '## Doing',
      '',
      '- [ ] Shipping copy #content',
      '',
      '%% kanban:settings',
      '```',
      '{"kanban-plugin":"board"}',
      '```',
      '%%',
    ].join('\n'), 'utf8');

    await fs.writeFile(path.join(taskScopeDir, 'tasks.md'), [
      '- [ ] Capture screenshots #[Backlog] #launch',
      '- [ ] Polish headline #[Doing] #content',
      '- [x] Archive notes #[Done] #content',
    ].join('\n'), 'utf8');

    await fs.writeFile(path.join(cardBoardVault, '.obsidian', 'plugins', 'card-board', 'data.json'), JSON.stringify({
      boards: [
        {
          name: 'Daily Board',
          columns: [
            { name: 'Today', type: 'between', from: 0, to: 0 },
            { name: 'Undated', type: 'undated' },
            { name: 'Completed', type: 'completed' },
          ],
        },
      ],
    }, null, 2), 'utf8');

    await fs.writeFile(path.join(cardBoardVault, 'daily.md'), [
      `- [ ] Ship to beta @due(${todayIso}) #launch`,
      '- [ ] Write changelog',
      `- [x] Sent announcement @due(${todayIso}) #launch @completed(${todayIso}T09:00:00)`,
    ].join('\n'), 'utf8');

    const summary = await importObsidian({
      boardRoot,
      sourcePaths: [kanbanFile, taskScopeDir, cardBoardVault],
    });

    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.importer, 'obsidian');
    assert.strictEqual(summary.cardsCreated, 8);
    assert.strictEqual(summary.listsCreated, 8);

    const directoryNames = await listDirectories(boardRoot);
    assert(!directoryNames.includes(ARCHIVE_DIRECTORY_NAME), 'obsidian import should not create archive by default');
    const displayNames = directoryNames.map((name) => getListDisplayName(name)).sort();
    assert(displayNames.includes('Roadmap - To Do'));
    assert(displayNames.includes('Roadmap - Doing'));
    assert(displayNames.includes('TaskScope - Backlog'));
    assert(displayNames.includes('TaskScope - Doing'));
    assert(displayNames.includes('TaskScope - Done'));
    assert(displayNames.includes('Daily Board - Today'));
    assert(displayNames.includes('Daily Board - Undated'));
    assert(displayNames.includes('Daily Board - Completed'));

    const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });
    const labelNames = settings.labels.map((label) => label.name).sort();
    assert.deepStrictEqual(labelNames, ['content', 'launch']);

    const roadmapTodoDir = directoryNames.find((name) => getListDisplayName(name) === 'Roadmap - To Do');
    const roadmapTodoFiles = await listMarkdownFiles(path.join(boardRoot, roadmapTodoDir));
    const roadmapCard = await cardFrontmatter.readCard(path.join(boardRoot, roadmapTodoDir, roadmapTodoFiles[0]));
    assert.strictEqual(roadmapCard.frontmatter.title, 'Launch prep');
    assert.strictEqual(roadmapCard.frontmatter.due, '2026-05-03');
    assert.deepStrictEqual(roadmapCard.frontmatter.labels, ['launch-existing']);
    assert(roadmapCard.body.includes('Source board'));

    const taskDoingDir = directoryNames.find((name) => getListDisplayName(name) === 'TaskScope - Doing');
    const taskDoingFiles = await listMarkdownFiles(path.join(boardRoot, taskDoingDir));
    const taskDoingCard = await cardFrontmatter.readCard(path.join(boardRoot, taskDoingDir, taskDoingFiles[0]));
    assert.strictEqual(taskDoingCard.frontmatter.title, 'Polish headline');
    assert(taskDoingCard.body.includes('Source column'));

    const cardBoardTodayDir = directoryNames.find((name) => getListDisplayName(name) === 'Daily Board - Today');
    const todayFiles = await listMarkdownFiles(path.join(boardRoot, cardBoardTodayDir));
    const todayCard = await cardFrontmatter.readCard(path.join(boardRoot, cardBoardTodayDir, todayFiles[0]));
    assert.strictEqual(todayCard.frontmatter.title, 'Ship to beta');
    assert.strictEqual(todayCard.frontmatter.due, todayIso);

    const cardBoardCompletedDir = directoryNames.find((name) => getListDisplayName(name) === 'Daily Board - Completed');
    const completedFiles = await listMarkdownFiles(path.join(boardRoot, cardBoardCompletedDir));
    const completedCard = await cardFrontmatter.readCard(path.join(boardRoot, cardBoardCompletedDir, completedFiles[0]));
    assert.strictEqual(completedCard.frontmatter.title, 'Sent announcement');
    assert(completedCard.body.includes('Obsidian CardBoard'));

    console.log('Obsidian importer tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('Obsidian importer tests failed.');
  console.error(error);
  process.exitCode = 1;
});
