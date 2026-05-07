const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const boardLabels = require('../lib/boardLabels');
const cardFrontmatter = require('../lib/cardFrontmatter');
const { importTasksMd } = require('../lib/importers');
const { getListDisplayName } = require('../lib/cliBoard');

async function listDirectories(boardRoot) {
  const entries = await fs.readdir(boardRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function listMarkdownFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name).sort();
}

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-import-tasksmd-'));
  const boardRoot = path.join(tmpDir, 'Imported Board');
  const tasksRoot = path.join(tmpDir, 'Workspace', 'tasks');
  const configRoot = path.join(tmpDir, 'Workspace', 'config');
  const projectRoot = path.join(tasksRoot, 'Product Roadmap');
  const backlogLane = path.join(projectRoot, 'Backlog');
  const doingLane = path.join(projectRoot, 'In Progress');
  await fs.mkdir(boardRoot, { recursive: true });
  await fs.mkdir(backlogLane, { recursive: true });
  await fs.mkdir(doingLane, { recursive: true });
  await fs.mkdir(configRoot, { recursive: true });

  try {
    await boardLabels.writeBoardSettings(boardRoot, {
      labels: [],
    });

    await fs.writeFile(path.join(backlogLane, 'Write docs.md'), [
      '[due:2026-04-15]',
      '',
      '[tag:Launch] [tag:Docs]',
      '',
      'Document the release flow.',
    ].join('\n'), 'utf8');

    await fs.writeFile(path.join(doingLane, 'Ship beta.md'), [
      '[tag:Launch]',
      '',
      'Beta rollout checklist.',
    ].join('\n'), 'utf8');

    await fs.writeFile(path.join(doingLane, 'Review copy.md'), [
      '[tag:Docs]',
      '',
      'Review the landing page copy.',
    ].join('\n'), 'utf8');

    await fs.writeFile(path.join(configRoot, 'tags.json'), JSON.stringify({
      '/Product Roadmap': {
        Launch: 'var(--color-alt-5)',
        Docs: 'var(--color-alt-7)',
      },
    }, null, 2), 'utf8');

    await fs.writeFile(path.join(configRoot, 'sort.json'), JSON.stringify({
      '/Product Roadmap': {
        'In Progress': ['Review copy', 'Ship beta'],
        Backlog: ['Write docs'],
      },
    }, null, 2), 'utf8');

    const summary = await importTasksMd({
      boardRoot,
      sourcePaths: [projectRoot],
    });

    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.importer, 'tasksmd');
    assert.strictEqual(summary.listsCreated, 2);
    assert.strictEqual(summary.cardsCreated, 3);
    assert.strictEqual(summary.labelsCreated, 2);
    assert.deepStrictEqual(summary.warnings, []);

    const settings = await boardLabels.readBoardSettings(boardRoot, { ensureFile: false });
    const launchLabel = settings.labels.find((label) => label.name === 'Launch');
    const docsLabel = settings.labels.find((label) => label.name === 'Docs');
    assert(launchLabel, 'expected Launch label to be created');
    assert(docsLabel, 'expected Docs label to be created');
    assert.strictEqual(launchLabel.colorLight, '#57e389');
    assert.strictEqual(launchLabel.colorDark, '#26a269');
    assert.strictEqual(docsLabel.colorLight, '#62a0ea');
    assert.strictEqual(docsLabel.colorDark, '#1a5fb4');

    const directoryNames = await listDirectories(boardRoot);
    const displayNames = directoryNames.map((name) => getListDisplayName(name));
    assert.deepStrictEqual(displayNames, ['In Progress', 'Backlog']);

    const doingDirectory = directoryNames.find((name) => getListDisplayName(name) === 'In Progress');
    const doingFiles = await listMarkdownFiles(path.join(boardRoot, doingDirectory));
    const firstDoingCard = await cardFrontmatter.readCard(path.join(boardRoot, doingDirectory, doingFiles[0]));
    const secondDoingCard = await cardFrontmatter.readCard(path.join(boardRoot, doingDirectory, doingFiles[1]));
    assert.strictEqual(firstDoingCard.frontmatter.title, 'Review copy');
    assert.strictEqual(secondDoingCard.frontmatter.title, 'Ship beta');

    const backlogDirectory = directoryNames.find((name) => getListDisplayName(name) === 'Backlog');
    const backlogFiles = await listMarkdownFiles(path.join(boardRoot, backlogDirectory));
    const backlogCard = await cardFrontmatter.readCard(path.join(boardRoot, backlogDirectory, backlogFiles[0]));
    assert.strictEqual(backlogCard.frontmatter.title, 'Write docs');
    assert.strictEqual(backlogCard.frontmatter.due, '2026-04-15');
    assert.deepStrictEqual(backlogCard.frontmatter.labels.sort(), [docsLabel.id, launchLabel.id].sort());
    assert(backlogCard.body.includes('Document the release flow.'));
    assert(!backlogCard.body.includes('[tag:Launch]'));
    assert(!backlogCard.body.includes('[due:2026-04-15]'));
    assert(backlogCard.body.includes('Tasks.md path'));

    console.log('Tasks.md importer tests passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('Tasks.md importer tests failed.');
  console.error(error);
  process.exitCode = 1;
});
