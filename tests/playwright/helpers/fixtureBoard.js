const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const cardFrontmatter = require('../../../lib/cardFrontmatter');
const boardLabels = require('../../../lib/boardLabels');

async function createFixtureBoardAt(root, boardName = 'Playwright Board') {
  const boardRoot = path.join(root, boardName);
  const lists = [
    '000-To-do-stock',
    '001-Doing-stock',
    '002-Done-stock',
    'XXX-Archive',
  ];

  await Promise.all(
    lists.map((listName) => fs.mkdir(path.join(boardRoot, listName), { recursive: true }))
  );

  await boardLabels.writeBoardSettings(boardRoot, {
    labels: [
      { id: 'launch', name: 'Launch', colorLight: '#fb923c', colorDark: '#f97316' },
      { id: 'content', name: 'Content', colorLight: '#22c55e', colorDark: '#16a34a' },
    ],
  });

  const planReleasePath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');
  const polishCopyPath = path.join(boardRoot, '001-Doing-stock', '000-polish-copy-stock.md');
  const shipBetaPath = path.join(boardRoot, '002-Done-stock', '000-ship-beta-stock.md');

  await Promise.all([
    cardFrontmatter.writeCard(planReleasePath, {
      frontmatter: {
        title: 'Plan release notes',
        createdAt: '2026-01-05T12:00:00.000Z',
        labels: ['launch'],
      },
      body: 'Outline the next release notes draft.',
    }),
    cardFrontmatter.writeCard(polishCopyPath, {
      frontmatter: {
        title: 'Polish homepage copy',
        createdAt: '2026-02-01T12:00:00.000Z',
        labels: ['content'],
      },
      body: 'Tighten the copy before launch.',
    }),
    cardFrontmatter.writeCard(shipBetaPath, {
      frontmatter: {
        title: 'Ship beta',
        createdAt: '2026-01-01T12:00:00.000Z',
      },
      body: 'Shipped the beta build to testers.',
    }),
  ]);

  await Promise.all([
    fs.utimes(planReleasePath, new Date('2026-01-15T12:00:00.000Z'), new Date('2026-01-15T12:00:00.000Z')),
    fs.utimes(polishCopyPath, new Date('2026-03-01T12:00:00.000Z'), new Date('2026-03-01T12:00:00.000Z')),
    fs.utimes(shipBetaPath, new Date('2026-01-20T12:00:00.000Z'), new Date('2026-01-20T12:00:00.000Z')),
  ]);

  return boardRoot;
}

async function createFixtureBoard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-playwright-'));
  const boardRoot = await createFixtureBoardAt(root, 'Playwright Board');

  return { root, boardRoot };
}

module.exports = {
  createFixtureBoard,
  createFixtureBoardAt,
};
