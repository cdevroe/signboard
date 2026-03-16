const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const cardFrontmatter = require('../../../lib/cardFrontmatter');
const boardLabels = require('../../../lib/boardLabels');

async function createFixtureBoard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-playwright-'));
  const boardRoot = path.join(root, 'Playwright Board');
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
    notifications: { enabled: false, time: '09:00' },
    tooltipsEnabled: true,
  });

  await Promise.all([
    cardFrontmatter.writeCard(path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md'), {
      frontmatter: {
        title: 'Plan release notes',
        labels: ['launch'],
      },
      body: 'Outline the next release notes draft.',
    }),
    cardFrontmatter.writeCard(path.join(boardRoot, '001-Doing-stock', '000-polish-copy-stock.md'), {
      frontmatter: {
        title: 'Polish homepage copy',
        labels: ['content'],
      },
      body: 'Tighten the copy before launch.',
    }),
    cardFrontmatter.writeCard(path.join(boardRoot, '002-Done-stock', '000-ship-beta-stock.md'), {
      frontmatter: {
        title: 'Ship beta',
      },
      body: 'Shipped the beta build to testers.',
    }),
  ]);

  return { root, boardRoot };
}

module.exports = {
  createFixtureBoard,
};
