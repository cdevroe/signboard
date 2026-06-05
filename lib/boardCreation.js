const fs = require('fs').promises;
const path = require('path');
const cardFrontmatter = require('./cardFrontmatter');
const { prepareNewCardFrontmatter } = require('./cardLifecycle');

const DEFAULT_BOARD_LIST_NAMES = Object.freeze([
  '000-To-do-stock',
  '001-Doing-stock',
  '002-Done-stock',
  'XXX-Archive',
]);
const DEFAULT_WELCOME_CARD_FILE = '000-hello-stock.md';

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function ensureDirectory(directoryPath, label) {
  let stats;

  try {
    stats = await fs.stat(directoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${directoryPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directoryPath}`);
  }
}

function formatStarterCardDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays || 0));

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildStarterCardBody() {
  const firstDueDate = formatStarterCardDueDate(1);
  const secondDueDate = formatStarterCardDueDate(2);
  const thirdDueDate = formatStarterCardDueDate(3);

  return [
    'Welcome to Signboard.',
    '',
    'This board lives in a folder on your computer. Lists are folders. Cards are Markdown files. That means your work stays portable, readable, and easy to automate.',
    '',
    '## Try these first',
    '',
    '- Edit this card title or body.',
    '- Create a real card from a list actions menu, or press Cmd/Ctrl + N to use Quick Add.',
    '- Drag a card between To do, Doing, and Done.',
    '- Add a label or due date to this card.',
    '- Search from the header, then press Enter to move into matching cards.',
    '- Archive this card when you are done exploring.',
    '',
    '## A tiny pretend plan',
    '',
    'Here are a few example tasks so you can see how checklists and task due dates work:',
    '',
    `- [ ] (due: ${firstDueDate}) Rename this board to something you actually care about`,
    `- [ ] (due: ${secondDueDate}) Add one real card you need to finish this week`,
    `- [ ] (due: ${thirdDueDate}) Open Planner and look for these dated checklist items`,
    '- [x] Opened Signboard and kicked the tires',
    '',
    '## Things worth trying',
    '',
    '- Open Planner Calendar or This Week to see dated work across open boards.',
    '- Switch Board menu > View to Table and scan cards across lists.',
    '- Open the filter menu and try the Today, Overdue, and label filters.',
    '- Open Settings and customize labels, completed-list behavior, and board colors.',
    '- Open Archive from the Board menu after archiving a card or list.',
    '',
    '## Keyboard shortcuts',
    '',
    'On macOS use Cmd. On Windows and Linux use Ctrl.',
    '',
    '- Cmd/Ctrl + / opens the keyboard shortcuts helper',
    '- Cmd/Ctrl + F focuses search; Enter or Arrow Down moves into matching cards',
    '- Cmd/Ctrl + K switches between open boards',
    '- Cmd/Ctrl + N opens Quick Add for any open board',
    '- Cmd/Ctrl + Shift + N creates a new list',
    '- Cmd/Ctrl + 1 returns to Kanban',
    '- Cmd/Ctrl + Option/Alt + 1 opens Table',
    '- Cmd/Ctrl + 2 opens Planner Calendar for all open boards',
    '- Cmd/Ctrl + 3 opens Planner This Week for all open boards',
    '- Cmd/Ctrl + Shift + P opens or closes Planner',
    '- Cmd/Ctrl + , opens Settings',
    '- Cmd/Ctrl + Shift + A opens Archive',
    '- Esc closes open modals and popovers',
    '',
    '## One last thing',
    '',
    'Keep this card as a reference, or archive it and start fresh.',
  ].join('\n');
}

async function createBoard(boardRootInput, options = {}) {
  const boardRoot = path.resolve(String(boardRootInput || '').trim());
  const boardName = path.basename(boardRoot);

  if (!String(boardRootInput || '').trim() || !boardName || boardRoot === path.dirname(boardRoot)) {
    throw new Error('Board root must include a directory name.');
  }

  const parentRoot = path.dirname(boardRoot);
  await ensureDirectory(parentRoot, 'Board parent');

  if (await pathExists(boardRoot)) {
    throw new Error(`Board root already exists: ${boardRoot}`);
  }

  const seedWelcomeCard = options.seedWelcomeCard !== false;
  let cardFile = '';

  await fs.mkdir(boardRoot, { recursive: false });

  try {
    for (const listName of DEFAULT_BOARD_LIST_NAMES) {
      await fs.mkdir(path.join(boardRoot, listName), { recursive: false });
    }

    if (seedWelcomeCard) {
      cardFile = DEFAULT_WELCOME_CARD_FILE;
      await cardFrontmatter.writeCard(path.join(boardRoot, DEFAULT_BOARD_LIST_NAMES[0], cardFile), {
        frontmatter: prepareNewCardFrontmatter({
          title: '👋 Start Here',
        }),
        body: buildStarterCardBody(),
      });
    }
  } catch (error) {
    await fs.rm(boardRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    ok: true,
    parentRoot,
    boardName,
    boardRoot,
    listNames: [...DEFAULT_BOARD_LIST_NAMES],
    cardFile,
    seededWelcomeCard: seedWelcomeCard,
  };
}

module.exports = {
  DEFAULT_BOARD_LIST_NAMES,
  DEFAULT_WELCOME_CARD_FILE,
  buildStarterCardBody,
  createBoard,
};
