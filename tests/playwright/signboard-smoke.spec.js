const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const electronBinary = require('electron');
const { test: base, expect, _electron: electron } = require('@playwright/test');
const { createFixtureBoard, createFixtureBoardAt } = require('./helpers/fixtureBoard');
const cardFrontmatter = require('../../lib/cardFrontmatter');

const repoRoot = path.resolve(__dirname, '../..');
const usesMetaModifier = process.platform === 'darwin';

function normalizeBoardRoot(boardRoot) {
  const normalized = String(boardRoot || '').replace(/\\/g, '/').trim();
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function getShortcut(shortcut) {
  const modifier = usesMetaModifier ? 'Meta' : 'Control';
  return `${modifier}+${shortcut}`;
}

function getCurrentBoardPlannerShortcut(shortcut) {
  return getShortcut(`Alt+${shortcut}`);
}

function getColorCycleShortcut() {
  return usesMetaModifier ? 'Meta+Control+Shift+C' : 'Control+Alt+Shift+C';
}

function getArchiveCardShortcut() {
  return getShortcut('Alt+Shift+Backspace');
}

function formatLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

async function seedBoardState(page, boardRoot) {
  await seedOpenBoardState(page, [boardRoot], boardRoot);
}

async function seedOpenBoardState(page, boardRoots, activeBoardRoot) {
  const normalizedBoardRoots = boardRoots.map(normalizeBoardRoot);
  const normalizedActiveBoardRoot = normalizeBoardRoot(activeBoardRoot || boardRoots[0]);

  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#board');
  await page.evaluate(({ openBoards, activeBoard }) => {
    localStorage.setItem('activeBoardPath', activeBoard);
    localStorage.setItem('boardPath', activeBoard);
    localStorage.setItem('openBoardPaths', JSON.stringify(openBoards));
  }, { openBoards: normalizedBoardRoots, activeBoard: normalizedActiveBoardRoot });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#boardName')).toHaveText(path.basename(normalizedActiveBoardRoot.replace(/\/+$/, '')));
  await expect(page.locator('.list')).toHaveCount(3);
}

async function prepareOpenBoardsPage(electronApp, boardRoot, boardNames = ['Roadmap Board']) {
  const root = path.dirname(boardRoot);
  const additionalBoardRoots = [];

  for (const boardName of boardNames) {
    additionalBoardRoots.push(await createFixtureBoardAt(root, boardName));
  }

  const page = await electronApp.firstWindow();
  await page.bringToFront();
  await seedOpenBoardState(page, [boardRoot, ...additionalBoardRoots], boardRoot);

  return {
    page,
    boardRoots: [boardRoot, ...additionalBoardRoots],
  };
}

async function getVerticalGap(upperLocator, lowerLocator) {
  const upperBox = await upperLocator.boundingBox();
  const lowerBox = await lowerLocator.boundingBox();

  if (!upperBox || !lowerBox) {
    throw new Error('Unable to read element bounding boxes.');
  }

  return lowerBox.y - (upperBox.y + upperBox.height);
}

async function openBoardMenu(page) {
  const popover = page.locator('#boardMenuPopover');
  if (await popover.isVisible()) {
    return;
  }

  await page.locator('#boardMenuButton').click();
  await expect(page.locator('#boardMenuPopover')).toBeVisible();
}

async function openFirstCardInEditor(page) {
  await openCardInEditor(page, 0, 0);
}

async function openCardInEditor(page, listIndex, cardIndex = 0) {
  await page.locator('.list').nth(listIndex).locator('.card').nth(cardIndex).click();
  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorOverType .overtype-input')).toBeVisible();
}

async function setEditorBody(page, body) {
  await page.locator('#cardEditorOverType .overtype-input').evaluate((element, nextBody) => {
    element.value = String(nextBody || '');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, body);
}

async function waitForBoardWatch(page) {
  await expect.poll(async () => {
    return await page.evaluate(async () => {
      if (!window.board || typeof window.board.getBoardWatchToken !== 'function') {
        return 0;
      }

      return Number(await window.board.getBoardWatchToken()) || 0;
    });
  }, { timeout: 5000 }).toBeGreaterThan(0);
}

const test = base.extend({
  boardRoot: async ({}, use) => {
    const fixture = await createFixtureBoard();

    try {
      await use(fixture.boardRoot);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  },

  userDataDir: async ({}, use) => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-playwright-profile-'));

    try {
      await use(userDataDir);
    } finally {
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  },

  electronApp: async ({ userDataDir }, use) => {
    const app = await electron.launch({
      executablePath: electronBinary,
      args: ['.'],
      cwd: repoRoot,
      env: {
        ...process.env,
        SIGNBOARD_USER_DATA_DIR: userDataDir,
      },
    });

    try {
      await use(app);
    } finally {
      await app.close();
    }
  },

  page: async ({ electronApp, boardRoot }, use) => {
    const page = await electronApp.firstWindow();
    await page.bringToFront();
    await seedBoardState(page, boardRoot);
    await use(page);
  },
});

test('keeps add modals hidden on startup', async ({ page }) => {
  await expect(page.locator('#modalAddCard')).toBeHidden();
  await expect(page.locator('#modalAddCardToList')).toBeHidden();
  await expect(page.locator('#modalAddList')).toBeHidden();
  await expect(page.locator('#boardMenuPopover')).toBeHidden();
});

test('keeps the first board tab clear of the Planner rail', async ({ page }) => {
  const railBox = await page.locator('#plannerRailButton').boundingBox();
  const firstTabBox = await page.locator('.board-tab').first().boundingBox();

  if (!railBox || !firstTabBox) {
    throw new Error('Unable to measure Planner rail or first board tab.');
  }

  expect(firstTabBox.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);
});

test('refreshes board card previews after external markdown edits', async ({ page, boardRoot }) => {
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');
  const card = await cardFrontmatter.readCard(cardPath);

  await waitForBoardWatch(page);
  await cardFrontmatter.writeCard(cardPath, {
    frontmatter: card.frontmatter,
    body: 'Clean MCP notes.',
  });

  await expect(page.locator('.list').first().locator('.card').first().locator('.card-body p')).toHaveText('Clean MCP notes.');
});

test('refreshes an unchanged open card editor after external markdown edits', async ({ page, boardRoot }) => {
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');
  const card = await cardFrontmatter.readCard(cardPath);

  await waitForBoardWatch(page);
  await openFirstCardInEditor(page);
  await cardFrontmatter.writeCard(cardPath, {
    frontmatter: card.frontmatter,
    body: 'Cleaned while the editor stayed open.',
  });

  await expect(page.locator('#cardEditorOverType .overtype-input')).toHaveValue('Cleaned while the editor stayed open.');
});

test('does not throw when formatting invalid due date values', async ({ page }) => {
  const values = await page.evaluate(async () => {
    return {
      empty: await window.board.formatDueDate(''),
      invalid: await window.board.formatDueDate('not-a-date'),
      impossible: await window.board.formatDueDate('2026-02-31'),
      valid: await window.board.formatDueDate('2026-03-14'),
    };
  });

  expect(values).toEqual({
    empty: '',
    invalid: 'not-a-date',
    impossible: '2026-02-31',
    valid: 'Mar 14',
  });
});

test('renders card drag ghost as an empty drop slot', async ({ page }) => {
  const card = page.locator('.list').first().locator('.card').first();
  const frame = card.locator('.card-drag-frame');

  await expect(card.locator('h3')).toHaveText('Plan release notes');

  await card.evaluate((element) => {
    element.classList.add('card-sortable--ghost');
  });

  await expect(card).toHaveCSS('opacity', '1');
  await expect(frame).toHaveCSS('border-top-style', 'dashed');
  await expect(card.locator('h3')).toHaveCSS('visibility', 'hidden');
  await expect(card.locator('.card-body')).toHaveCSS('visibility', 'hidden');
});

test('does not leave duplicate card nodes after rapid cross-list dragging', async ({ page }) => {
  const card = page.locator('.list').first().locator('.card').first();
  const firstList = page.locator('.list').first();
  const secondList = page.locator('.list').nth(1);

  const cardBox = await card.boundingBox();
  const firstListBox = await firstList.boundingBox();
  const secondListBox = await secondList.boundingBox();

  if (!cardBox || !firstListBox || !secondListBox) {
    throw new Error('Unable to measure card/list positions.');
  }

  const start = {
    x: cardBox.x + (cardBox.width / 2),
    y: cardBox.y + (cardBox.height / 2),
  };
  const firstListBottom = {
    x: firstListBox.x + (firstListBox.width / 2),
    y: firstListBox.y + firstListBox.height - 24,
  };
  const secondListBottom = {
    x: secondListBox.x + (secondListBox.width / 2),
    y: secondListBox.y + secondListBox.height - 24,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 0; index < 10; index += 1) {
    await page.mouse.move(secondListBottom.x, secondListBottom.y, { steps: 3 });
    await page.mouse.move(firstListBottom.x, firstListBottom.y, { steps: 3 });
  }

  const duringDrag = await page.evaluate(() => ({
    fallbackCount: document.querySelectorAll('.card-sortable--fallback').length,
    ghostCount: document.querySelectorAll('.card-sortable--ghost').length,
    fallbackInCardListCount: Array.from(document.querySelectorAll('.card-sortable--fallback')).filter((element) => element.closest('.cards')).length,
    fallbackOpacity: (() => {
      const fallback = document.querySelector('.card-sortable--fallback');
      return fallback ? window.getComputedStyle(fallback).opacity : '';
    })(),
    cardsByPath: Array.from(document.querySelectorAll('.card[data-path]')).reduce((counts, element) => {
      const path = String(element.dataset.path || '');
      counts[path] = (counts[path] || 0) + 1;
      return counts;
    }, {}),
  }));

  expect(duringDrag.fallbackCount).toBe(1);
  expect(duringDrag.ghostCount).toBe(1);
  expect(duringDrag.fallbackInCardListCount).toBe(0);
  expect(duringDrag.fallbackOpacity).toBe('1');

  await page.mouse.up();
  await page.waitForTimeout(500);

  const afterDrop = await page.evaluate(() => ({
    fallbackCount: document.querySelectorAll('.card-sortable--fallback').length,
    ghostCount: document.querySelectorAll('.card-sortable--ghost').length,
    cardsByPath: Array.from(document.querySelectorAll('.card[data-path]')).reduce((counts, element) => {
      const path = String(element.dataset.path || '');
      counts[path] = (counts[path] || 0) + 1;
      return counts;
    }, {}),
  }));

  expect(afterDrop.fallbackCount).toBe(0);
  expect(afterDrop.ghostCount).toBe(0);

  for (const count of Object.values(afterDrop.cardsByPath)) {
    expect(count).toBe(1);
  }
});

test('opens the list actions popover and routes Add new card through the existing modal', async ({ page }) => {
  await page.locator('.list-actions-button').first().click();

  await expect(page.locator('#listActionsPopover')).toBeVisible();
  await expect(page.locator('#listActionsPopover')).toContainText('Add new card');
  await expect(page.locator('#listActionsPopover')).toContainText('Add new list');
  await expect(page.locator('#listActionsPopover')).toContainText('Archive cards in this list');
  await expect(page.locator('#listActionsPopover')).toContainText('Archive this list');

  await page.locator('#listActionsPopover').getByRole('button', { name: 'Add new card' }).click();

  await expect(page.locator('#listActionsPopover')).toBeHidden();
  await expect(page.locator('#modalAddCard')).toBeVisible();
  await expect(page.locator('#hiddenListPath')).toHaveValue(/000-To-do-stock\/$/);
  await expect(page.locator('#modalAddCard .new-card-modal-helper')).toContainText('Shift');

  const gap = await getVerticalGap(page.locator('#userInput'), page.locator('#btnAddCard'));
  expect(gap).toBeGreaterThanOrEqual(6);
});

test('creates and opens a list-specific new card with Shift+Enter', async ({ page }) => {
  await page.locator('.list-actions-button').first().click();
  await page.locator('#listActionsPopover').getByRole('button', { name: 'Add new card' }).click();

  await page.locator('#userInput').fill('Draft launch checklist');
  await page.keyboard.press('Shift+Enter');

  await expect(page.locator('#modalAddCard')).toBeHidden();
  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorTitle')).toHaveText('Draft launch checklist');
  await expect(page.locator('#cardEditorOverType .overtype-input')).toBeFocused();
  await expect(page.locator('.list').first().locator('.card').filter({ hasText: 'Draft launch checklist' })).toBeVisible();
});

test('adds a new list to the right of the invoking list from the list actions popover', async ({ page, boardRoot }) => {
  await page.locator('.list-actions-button').first().click();
  await page.locator('#listActionsPopover').getByRole('button', { name: 'Add new list' }).click();

  await expect(page.locator('#modalAddList')).toBeVisible();
  await page.locator('#userInputListName').fill('Review');
  await page.locator('#btnAddList').click();

  await expect(page.locator('.list')).toHaveCount(4);
  await expect(page.locator('.list .list-header span[contenteditable="true"]').nth(1)).toHaveText('Review');

  await expect.poll(async () => {
    const entries = await fs.readdir(boardRoot);
    return entries
      .filter((entry) => !entry.startsWith('XXX-Archive'))
      .sort((left, right) => left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base',
        ignorePunctuation: true,
      }));
  }).toEqual(expect.arrayContaining([
    '000-To-do-stock',
    '002-Doing-stock',
    '003-Done-stock',
  ]));

  await expect.poll(async () => {
    const entries = await fs.readdir(boardRoot);
    return entries.find((entry) => /^001-Review-[A-Za-z0-9]{5}$/.test(entry)) || '';
  }).toMatch(/^001-Review-[A-Za-z0-9]{5}$/);
});

test('archives all cards in a list from the list actions popover', async ({ page, boardRoot }) => {
  await page.evaluate(() => {
    window.__lastArchiveConfirmMessage = '';
    window.confirm = (message) => {
      window.__lastArchiveConfirmMessage = String(message || '');
      return true;
    };
  });

  await page.locator('.list-actions-button').first().click();
  await page.locator('#listActionsPopover').getByRole('button', { name: 'Archive cards in this list' }).click();

  await expect.poll(async () => {
    return await page.evaluate(() => window.__lastArchiveConfirmMessage);
  }).toContain('Archive all cards in "To-do"?');

  await expect(page.locator('#listActionsPopover')).toBeHidden();
  await expect(page.locator('.list').first().locator('.card')).toHaveCount(0);

  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoot, '000-To-do-stock'));
    return entries.filter((entry) => entry.endsWith('.md')).length;
  }).toBe(0);

  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, 'XXX-Archive', '000-plan-release-stock.md'));
  }).toBe(true);
});

test('archives a whole list from the list actions popover', async ({ page, boardRoot }) => {
  await page.locator('.list-actions-button').nth(1).click();
  await page.locator('#listActionsPopover').getByRole('button', { name: 'Archive this list' }).click();

  await expect(page.locator('#listActionsPopover')).toBeHidden();
  await expect(page.locator('.list')).toHaveCount(2);
  await expect(page.locator('.list').filter({ hasText: 'Doing' })).toHaveCount(0);

  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, '001-Doing-stock'));
  }).toBe(false);

  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, 'XXX-Archive', '001-Doing-stock'));
  }).toBe(true);

  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, 'XXX-Archive', '001-Doing-stock', '000-polish-copy-stock.md'));
  }).toBe(true);
});

test('opens the add-card-to-list modal from the keyboard shortcut with a styled dropdown', async ({ page }) => {
  await page.keyboard.press(getShortcut('N'));

  await expect(page.locator('#modalAddCardToList')).toBeVisible();
  await expect(page.locator('#userInputListPath')).toBeVisible();
  await expect(page.locator('#modalAddCardToList .new-card-modal-helper')).toContainText('Shift');

  const selectStyle = await page.locator('#userInputListPath').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      appearance: style.getPropertyValue('appearance') || style.getPropertyValue('-webkit-appearance'),
    };
  });

  expect(selectStyle.backgroundImage).toContain('data:image/svg+xml');
  expect(selectStyle.appearance).toBe('none');

  const selectToInputGap = await getVerticalGap(page.locator('#userInputListPath'), page.locator('#userInputCardName'));
  const inputToButtonGap = await getVerticalGap(page.locator('#userInputCardName'), page.locator('#btnAddCardToList'));
  expect(selectToInputGap).toBeGreaterThanOrEqual(8);
  expect(inputToButtonGap).toBeGreaterThanOrEqual(6);
});

test('creates and opens a new card from the keyboard modal with Shift+Enter', async ({ page }) => {
  await page.keyboard.press(getShortcut('N'));
  await page.locator('#userInputCardName').fill('Write beta announcement');
  await page.keyboard.press('Shift+Enter');

  await expect(page.locator('#modalAddCardToList')).toBeHidden();
  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorTitle')).toHaveText('Write beta announcement');
  await expect(page.locator('#cardEditorOverType .overtype-input')).toBeFocused();
  await expect(page.locator('.list').first().locator('.card').filter({ hasText: 'Write beta announcement' })).toBeVisible();
});

test('opens the add-list modal from the keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('Shift+N'));

  await expect(page.locator('#modalAddList')).toBeVisible();
  await expect(page.locator('#userInputListName')).toBeFocused();
});

test('opens the keyboard shortcuts helper from the keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('/'));

  await expect(page.locator('#modalKeyboardShortcuts')).toBeVisible();
  await expect(page.locator('#modalKeyboardShortcuts')).toContainText('Keyboard Shortcuts');
  await expect(page.locator('#modalKeyboardShortcuts')).toContainText('Switch board');
  await expect(page.locator('#modalKeyboardShortcuts [data-shortcut-action="switchBoard"]')).toHaveText(
    usesMetaModifier ? '⌘ + K' : 'Ctrl + K',
  );

  await page.keyboard.press('Escape');
  await expect(page.locator('#modalKeyboardShortcuts')).toBeHidden();
});

test('opens the board switcher from the keyboard shortcut and focuses search', async ({ page }) => {
  await page.keyboard.press(getShortcut('K'));

  await expect(page.locator('#modalBoardSwitcher')).toBeVisible();
  await expect(page.locator('#boardSwitcherInput')).toBeFocused();
  await expect(page.locator('#boardSwitcherInput')).toHaveAttribute('placeholder', 'Switch to board');
  await expect(page.locator('#boardSwitcherResults')).toContainText('Playwright Board');
  await expect(page.locator('#boardSwitcherResults')).toContainText('Current');
});

test('filters the board switcher to currently open boards', async ({ electronApp, boardRoot }) => {
  const { page } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board', 'Roadmap Archive', 'Ideas Board']);

  await page.keyboard.press(getShortcut('K'));
  await page.keyboard.type('road');

  await expect(page.locator('.board-switcher-option')).toHaveCount(2);
  await expect(page.locator('.board-switcher-option').nth(0)).toContainText('Roadmap Board');
  await expect(page.locator('.board-switcher-option').nth(1)).toContainText('Roadmap Archive');
  await expect(page.locator('.board-switcher-option-title')).toHaveText(['Roadmap Board', 'Roadmap Archive']);

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.board-switcher-option.is-active')).toContainText('Roadmap Archive');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.board-switcher-option.is-active')).toContainText('Roadmap Board');

  await page.locator('#boardSwitcherInput').fill(path.basename(path.dirname(boardRoot)));
  await expect(page.locator('.board-switcher-option')).toHaveCount(0);
  await expect(page.locator('#boardSwitcherResults')).toContainText('No matching boards');
});

test('opens Planner across currently open boards', async ({ electronApp, boardRoot }) => {
  const { page, boardRoots } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board']);
  const todayIso = formatLocalIsoDate();
  const targetPlannerDate = new Date();
  targetPlannerDate.setDate(targetPlannerDate.getDate() + (targetPlannerDate.getDay() === 0 ? -1 : 1));
  const targetPlannerIso = formatLocalIsoDate(targetPlannerDate);

  await page.evaluate(async (boardRoot) => {
    await window.board.updateBoardSettings(boardRoot, { colorScheme: 'harvest' });
  }, normalizeBoardRoot(boardRoots[1]));

  await Promise.all([
    cardFrontmatter.updateFrontmatter(path.join(boardRoots[0], '000-To-do-stock', '000-plan-release-stock.md'), {
      due: todayIso,
    }),
    cardFrontmatter.updateFrontmatter(path.join(boardRoots[1], '001-Doing-stock', '000-polish-copy-stock.md'), {
      due: todayIso,
    }),
    cardFrontmatter.updateFrontmatter(path.join(boardRoots[0], '002-Done-stock', '000-ship-beta-stock.md'), {
      due: todayIso,
    }),
  ]);

  await page.keyboard.press(getShortcut('Shift+P'));

  await expect(page.locator('#plannerOverlay')).toBeVisible();
  await expect(page.locator('#plannerScopeLabel')).toHaveText('2 boards');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Plan release notes' })).toContainText('Playwright Board');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Polish homepage copy' })).toContainText('Roadmap Board');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Ship beta' })).toHaveCount(0);

  const roadmapSourcePill = page
    .locator('.planner-calendar-card')
    .filter({ hasText: 'Polish homepage copy' })
    .locator('.board-temporal-card-source');
  await expect(roadmapSourcePill).toHaveAttribute('data-board-color-scheme', 'harvest');

  const sourcePillTheme = await roadmapSourcePill.evaluate((element) => ({
    background: element.style.getPropertyValue('--board-source-pill-bg').trim(),
    border: element.style.getPropertyValue('--board-source-pill-border').trim(),
    text: element.style.getPropertyValue('--board-source-pill-text').trim(),
    darkBackground: element.style.getPropertyValue('--board-source-pill-bg-dark').trim(),
  }));
  const expectedSourcePillTheme = await page.evaluate(() => getBoardTemporalSourceTheme({ colorScheme: 'harvest' }));
  expect(sourcePillTheme.background).toBe(expectedSourcePillTheme.light.background);
  expect(sourcePillTheme.border).toBe(expectedSourcePillTheme.light.border);
  expect(sourcePillTheme.text).toBe(expectedSourcePillTheme.light.color);
  expect(sourcePillTheme.darkBackground).toBe(expectedSourcePillTheme.dark.background);

  await page.locator('#plannerFilterButton').click();
  await page.locator('#plannerFilterPopover').getByRole('button', { name: 'Show completed cards' }).click();
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Ship beta' })).toBeVisible();
  await page.locator('#plannerFilterPopover').getByRole('button', { name: 'Hide completed cards' }).click();
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Ship beta' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#plannerFilterPopover')).toBeHidden();

  await page.locator('.planner-scope-option[data-scope="current"]').click();
  await expect(page.locator('#plannerScopeLabel')).toHaveText('Playwright Board');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Plan release notes' })).toBeVisible();
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Polish homepage copy' })).toHaveCount(0);

  await page.locator('#plannerFilterButton').click();
  await expect(page.locator('#plannerFilterPopover')).toBeVisible();
  await expect(page.locator('#plannerFilterPopover')).toContainText('Labels');
  await expect(page.locator('#plannerFilterPopover')).toContainText('Launch');
  await expect.poll(async () => {
    return page.evaluate(() => {
      const popover = document.getElementById('plannerFilterPopover');
      if (!popover) {
        return false;
      }
      const bounds = popover.getBoundingClientRect();
      const target = document.elementFromPoint(bounds.left + (bounds.width / 2), bounds.bottom - 12);
      return Boolean(target && popover.contains(target));
    });
  }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#plannerFilterPopover')).toBeHidden();
  await expect(page.locator('#plannerOverlay')).toBeVisible();

  await page.locator('.planner-scope-option[data-scope="all"]').click();
  await expect(page.locator('#plannerScopeLabel')).toHaveText('2 boards');

  await page.keyboard.press(getCurrentBoardPlannerShortcut('2'));
  await expect(page.locator('.planner-calendar')).toBeVisible();
  await expect(page.locator('#plannerScopeLabel')).toHaveText('Playwright Board');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Plan release notes' })).toBeVisible();
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Polish homepage copy' })).toHaveCount(0);

  await page.keyboard.press(getShortcut('2'));
  await expect(page.locator('#plannerScopeLabel')).toHaveText('2 boards');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Polish homepage copy' })).toBeVisible();

  await page.keyboard.press(getShortcut('4'));
  await expect(page.locator('.planner-day')).toBeVisible();
  await expect(page.locator('.planner-list-card').filter({ hasText: 'Plan release notes' })).toBeVisible();

  await page.keyboard.press(getShortcut('1'));
  await expect(page.locator('#plannerOverlay')).toBeHidden();

  await page.keyboard.press(getCurrentBoardPlannerShortcut('4'));
  await expect(page.locator('#plannerOverlay')).toBeVisible();
  await expect(page.locator('.planner-day')).toBeVisible();
  await expect(page.locator('#plannerScopeLabel')).toHaveText('Playwright Board');

  await page.keyboard.press(getShortcut('2'));
  await expect(page.locator('#plannerOverlay')).toBeVisible();
  await expect(page.locator('.planner-calendar')).toBeVisible();
  await expect(page.locator('#plannerScopeLabel')).toHaveText('2 boards');
  await page.keyboard.press(getShortcut('3'));
  await expect(page.locator('.planner-this-week')).toBeVisible();
  await expect(page.locator('.planner-this-week .board-this-week-day-header').first()).toHaveCSS('padding-left', '10px');

  const crossBoardCard = page.locator('.planner-this-week-card').filter({ hasText: 'Polish homepage copy' });
  const targetDayCards = page.locator(`.planner-this-week .board-this-week-day-cards[data-date="${targetPlannerIso}"]`);
  await expect(crossBoardCard).toBeVisible();
  await expect(targetDayCards).toBeVisible();

  await page.evaluate(async ({ cardPath, sourceDate, targetDate }) => {
    const item = document.createElement('button');
    item.dataset.path = cardPath;
    const from = document.createElement('div');
    from.dataset.date = sourceDate;
    const to = document.createElement('div');
    to.dataset.date = targetDate;
    await handlePlannerCardDrop({ item, from, to }, () => true);
  }, {
    cardPath: path.join(boardRoots[1], '001-Doing-stock', '000-polish-copy-stock.md'),
    sourceDate: todayIso,
    targetDate: targetPlannerIso,
  });

  await expect.poll(async () => {
    const card = await cardFrontmatter.readCard(path.join(boardRoots[1], '001-Doing-stock', '000-polish-copy-stock.md'));
    return card.frontmatter.due;
  }).toBe(targetPlannerIso);

  await page.locator('#plannerCloseRail').click();
  await expect(page.locator('#plannerOverlay')).toBeHidden();
});

test('switches to the highlighted board from the switcher with arrows and Enter', async ({ electronApp, boardRoot }) => {
  const { page } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board', 'Ideas Board']);

  await page.keyboard.press(getShortcut('K'));
  await expect(page.locator('.board-switcher-option')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page.locator('#modalBoardSwitcher')).toBeHidden();
  await expect(page.locator('#boardName')).toHaveText('Ideas Board');
  await expect(page.locator('#boardTabs .board-tab.is-active .board-tab-label')).toHaveText('Ideas Board');
});

test('closes the board switcher with Escape without changing boards', async ({ electronApp, boardRoot }) => {
  const { page } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board']);

  await page.keyboard.press(getShortcut('K'));
  await page.locator('#boardSwitcherInput').fill('road');
  await page.keyboard.press('Escape');

  await expect(page.locator('#modalBoardSwitcher')).toBeHidden();
  await expect(page.locator('#boardName')).toHaveText('Playwright Board');
});

test('switching boards from an open editor flushes the pending edit and closes the editor', async ({ electronApp, boardRoot }) => {
  const { page } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board']);
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');

  await openFirstCardInEditor(page);
  await setEditorBody(page, 'Pending switch save.');

  await page.keyboard.press(getShortcut('K'));
  await expect(page.locator('#modalBoardSwitcher')).toBeVisible();
  await page.locator('#boardSwitcherInput').fill('road');
  await page.keyboard.press('Enter');

  await expect(page.locator('#modalBoardSwitcher')).toBeHidden();
  await expect(page.locator('#modalEditCard')).toBeHidden();
  await expect(page.locator('#boardName')).toHaveText('Roadmap Board');
  await expect.poll(async () => {
    return await fs.readFile(cardPath, 'utf8');
  }).toContain('Pending switch save.');
});

test('opens the new-card modal from an active editor shortcut after closing the editor', async ({ page, boardRoot }) => {
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');

  await openFirstCardInEditor(page);
  await setEditorBody(page, 'Pending new-card shortcut save.');

  await page.keyboard.press(getShortcut('N'));

  await expect(page.locator('#modalEditCard')).toBeHidden();
  await expect(page.locator('#modalAddCardToList')).toBeVisible();
  await expect(page.locator('#userInputCardName')).toBeFocused();
  await expect.poll(async () => {
    return await fs.readFile(cardPath, 'utf8');
  }).toContain('Pending new-card shortcut save.');
});

test('opens settings from the renderer keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('Comma'));

  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await expect(page.locator('#modalBoardSettings h2')).toHaveText('Settings');
  await expect(page.locator('#boardSettingsPanelApp')).toBeVisible();
});

test('opens Planner from an active editor view shortcut after closing the editor', async ({ page }) => {
  await openFirstCardInEditor(page);

  await page.keyboard.press(getShortcut('2'));

  await expect(page.locator('#modalEditCard')).toBeHidden();
  await expect(page.locator('#plannerOverlay')).toBeVisible();
  await expect(page.locator('.planner-calendar')).toBeVisible();
});

test('cycles board color schemes without closing an active editor', async ({ page }) => {
  await openFirstCardInEditor(page);

  await page.keyboard.press(getColorCycleShortcut());

  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorOverType .overtype-input')).toBeVisible();
  await expect.poll(async () => {
    return await page.evaluate(() => document.documentElement.dataset.boardColorScheme || '');
  }).toBe('lavender');
  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.board.readBoardSettings(window.boardRoot);
      return settings.colorScheme;
    });
  }).toBe('lavender');
});

test('moves the active card to the top of the next list from the editor arrow', async ({ page, boardRoot }) => {
  await openFirstCardInEditor(page);

  await page.locator('#cardEditorMoveListLink').click();

  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoot, '001-Doing-stock'));
    return entries.filter((entry) => entry.endsWith('.md')).sort();
  }).toEqual([
    '000-plan-release-stock.md',
    '001-polish-copy-stock.md',
  ]);
  await expect(page.locator('.list').nth(1).locator('.card').first()).toContainText('Plan release notes');
});

test('moves the active card to the top of the previous list from the keyboard shortcut', async ({ page, boardRoot }) => {
  await openCardInEditor(page, 1, 0);

  await page.keyboard.press(getShortcut('Shift+['));

  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoot, '000-To-do-stock'));
    return entries.filter((entry) => entry.endsWith('.md')).sort();
  }).toEqual([
    '000-polish-copy-stock.md',
    '001-plan-release-stock.md',
  ]);
  await expect(page.locator('.list').first().locator('.card').first()).toContainText('Polish homepage copy');
});

test('moves the active card to the top of the selected list from the editor dropdown', async ({ page, boardRoot }) => {
  await openFirstCardInEditor(page);

  await page.locator('#cardEditorListSelect').selectOption({ label: 'Doing' });

  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoot, '001-Doing-stock'));
    return entries.filter((entry) => entry.endsWith('.md')).sort();
  }).toEqual([
    '000-plan-release-stock.md',
    '001-polish-copy-stock.md',
  ]);
  await expect(page.locator('.list').nth(1).locator('.card').first()).toContainText('Plan release notes');
});

test('rejects top-of-list card moves outside the active board', async ({ page, boardRoot }) => {
  const outsideBoardPath = path.dirname(boardRoot);

  const result = await page.evaluate(async (targetListPath) => {
    const cardPath = `${window.boardRoot}000-To-do-stock/000-plan-release-stock.md`;
    try {
      await window.board.moveCardToTop(cardPath, targetListPath);
      return { ok: true, message: '' };
    } catch (error) {
      return { ok: false, message: String(error && error.message ? error.message : error) };
    }
  }, outsideBoardPath);

  expect(result.ok).toBe(false);
  expect(result.message).toContain('UNAUTHORIZED_PATH');
});

test('keeps card move shortcuts inert at the outermost lists', async ({ page, boardRoot }) => {
  await openCardInEditor(page, 0, 0);
  const leftmostPath = await page.locator('#cardEditorCardPath').inputValue();

  await page.keyboard.press(getShortcut('Shift+['));

  await expect(page.locator('#cardEditorCardPath')).toHaveValue(leftmostPath);
  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoot, '000-To-do-stock'));
    return entries.filter((entry) => entry.endsWith('.md')).sort();
  }).toEqual(['000-plan-release-stock.md']);

  await page.locator('#cardEditorClose').click();
  await expect(page.locator('#modalEditCard')).toBeHidden();

  await openCardInEditor(page, 2, 0);
  const rightmostPath = await page.locator('#cardEditorCardPath').inputValue();

  await page.keyboard.press(getShortcut('Shift+]'));

  await expect(page.locator('#cardEditorCardPath')).toHaveValue(rightmostPath);
  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoot, '002-Done-stock'));
    return entries.filter((entry) => entry.endsWith('.md')).sort();
  }).toEqual(['000-ship-beta-stock.md']);
});

test('archives the active card from the hard-to-press shortcut', async ({ page, boardRoot }) => {
  await openFirstCardInEditor(page);

  await page.keyboard.press(getArchiveCardShortcut());

  await expect(page.locator('#modalEditCard')).toBeHidden();
  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, 'XXX-Archive', '000-plan-release-stock.md'));
  }).toBe(true);
  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md'));
  }).toBe(false);
});

test('opens the archive browser from the keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('Shift+A'));

  await expect(page.locator('#modalArchiveBrowser')).toBeVisible();
  await expect(page.locator('#archiveBrowserSearchInput')).toBeFocused();
});

test('keeps the editor scroll position when toggling a task checkbox control', async ({ page }) => {
  await openFirstCardInEditor(page);

  const taskLines = Array.from({ length: 40 }, (_, index) => `- [ ] Task ${index + 1}`).join('\n');
  await setEditorBody(page, taskLines);

  const textarea = page.locator('#cardEditorOverType .overtype-input');
  const visibleCheckboxes = page.locator('#cardEditorOverType .task-line-checkbox-control');
  await expect(visibleCheckboxes.first()).toBeVisible();

  const initialScrollTop = await textarea.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
    return element.scrollTop;
  });

  expect(initialScrollTop).toBeGreaterThan(0);

  await expect(visibleCheckboxes.last()).toBeVisible();
  await visibleCheckboxes.last().click();
  await page.waitForTimeout(150);

  const finalScrollTop = await textarea.evaluate((element) => element.scrollTop);
  expect(finalScrollTop).toBeGreaterThan(initialScrollTop - 10);
});

test('closes the task due date picker when clearing a task due date', async ({ page }) => {
  await openFirstCardInEditor(page);

  await setEditorBody(page, '- [ ] (due: 2026-04-20) Follow up with beta testers');
  await expect(page.locator('#cardEditorOverType .task-line-due-control.has-due')).toHaveCount(1);

  await page.locator('#cardEditorOverType .task-line-due-control.has-due').click();
  const datepickerPopup = page.locator('.sb-themed-fdatepicker');
  await expect(datepickerPopup).toBeVisible();

  await datepickerPopup.getByRole('button', { name: 'Clear' }).click();

  await expect(datepickerPopup).toBeHidden();
  await expect(page.locator('#cardEditorOverType .task-line-due-control.has-due')).toHaveCount(0);
  await expect(page.locator('#cardEditorOverType .overtype-input')).toHaveValue(/^- \[ \] Follow up with beta testers$/);

  await page.locator('#cardEditorOverType .task-line-due-control').click();
  await expect(datepickerPopup).toBeVisible();
});

test('persists the app tooltip toggle and suppresses tooltips when disabled', async ({ page }) => {
  const supportButton = page.locator('#openCommercialLicenseModal');
  const tooltip = page.locator('#sbTooltip');

  await openBoardMenu(page);
  await supportButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/Sponsor Signboard/i);

  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();

  const tooltipsToggle = page.locator('#boardSettingsTooltipsToggle');
  await expect(tooltipsToggle).toBeChecked();
  await page.locator('label[for="boardSettingsTooltipsToggle"]').click();
  await expect(tooltipsToggle).not.toBeChecked();
  await page.locator('#boardSettingsClose').click();
  await expect(page.locator('#modalBoardSettings')).toBeHidden();

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.electronAPI.readAppSettings();
      return settings.tooltipsEnabled;
    });
  }).toBe(false);

  await openBoardMenu(page);
  await supportButton.hover();
  await expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  await expect(tooltip).not.toHaveClass(/is-visible/);

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.electronAPI.readAppSettings();
      return settings.tooltipsEnabled;
    });
  }).toBe(false);
});

test('opens the sponsorship modal from the fixed pill button', async ({ page }) => {
  const sponsorButton = page.locator('#openSponsorPillButton');

  await expect(sponsorButton).toBeVisible();
  await expect(sponsorButton).toHaveText(/Sponsor/);

  await sponsorButton.click();

  await expect(page.locator('#modalCommercialLicense')).toBeVisible();
  await expect(page.locator('#commercialLicenseTitle')).toHaveText(/Sponsor Signboard/);
});

test('hides the fixed sponsor pill on compact windows', async ({ page }) => {
  const sponsorButton = page.locator('#openSponsorPillButton');

  await expect(sponsorButton).toBeVisible();
  await page.setViewportSize({ width: 970, height: 720 });

  await expect(sponsorButton).toBeHidden();
});

test('persists a label color change committed from the settings picker', async ({ page }) => {
  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await page.locator('#boardSettingsNavLabels').click();

  const labelColorInput = page.locator('#boardSettingsLabels input[type="color"]').first();
  await expect(labelColorInput).toHaveValue('#fb923c');
  const expectedDarkColor = await page.evaluate(() => {
    return createReadableLabelColors('#0ea5e9', '#fb923c').colorDark;
  });

  await labelColorInput.evaluate((element) => {
    element.value = '#0ea5e9';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.locator('#boardSettingsClose').click();
  await expect(page.locator('#modalBoardSettings')).toBeHidden();

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.board.readBoardSettings(window.boardRoot);
      return settings.labels[0].colorLight;
    });
  }).toBe('#0ea5e9');

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.board.readBoardSettings(window.boardRoot);
      return settings.labels[0].colorDark;
    });
  }).toBe(expectedDarkColor);
});

test('persists board workflow completed-list settings', async ({ page }) => {
  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await page.locator('#boardSettingsNavWorkflow').click();
  await expect(page.locator('#boardSettingsPanelWorkflow')).toBeVisible();

  const autoDetectToggle = page.locator('#boardSettingsAutoDetectCompletedListsToggle');
  const doneCheckbox = page
    .locator('#boardSettingsWorkflowLists .board-workflow-list-row')
    .filter({ hasText: 'Done' })
    .locator('input');

  await expect(autoDetectToggle).toBeChecked();
  await expect(doneCheckbox).toBeChecked();

  await page.locator('label[for="boardSettingsAutoDetectCompletedListsToggle"]').click();
  await expect(autoDetectToggle).not.toBeChecked();
  await expect(doneCheckbox).not.toBeChecked();

  await doneCheckbox.check();
  await page.locator('#boardSettingsClose').click();
  await expect(page.locator('#modalBoardSettings')).toBeHidden();

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.board.readBoardSettings(window.boardRoot);
      return settings.workflow;
    });
  }).toEqual({
    autoDetectCompletedLists: false,
    completedListNames: ['002-Done-stock'],
    ignoredCompletedListNames: [],
  });
});

test('shows import controls and renders an import summary from the Settings import panel', async ({ page }) => {
  await page.evaluate(() => {
    window.__signboardImportOverrides = {
      pickImportSources: async () => ([
        { token: 'trello-token', path: '/tmp/example.json', kind: 'file' },
      ]),
      importTrello: async () => ({
        ok: true,
        importer: 'trello',
        sources: ['/tmp/example.json'],
        listsCreated: 2,
        cardsCreated: 3,
        labelsCreated: 1,
        archivedCards: 1,
        warnings: ['Imported comments may be incomplete.'],
      }),
    };
  });

  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await page.locator('#boardSettingsNavImport').click();

  await expect(page.locator('#boardSettingsPanelImport')).toBeVisible();
  await expect(page.locator('#btnImportBoardFromTrello')).toBeVisible();
  await expect(page.locator('#btnImportBoardFromObsidian')).toBeVisible();
  await expect(page.locator('#btnImportBoardFromTasksMd')).toBeVisible();

  await page.locator('#btnImportBoardFromTrello').click();

  await expect(page.locator('#boardSettingsImportStatus')).toContainText('Imported 1 source.');
  await expect(page.locator('#boardSettingsImportStatus')).toContainText('2 lists created.');
  await expect(page.locator('#boardSettingsImportWarnings')).toContainText('Imported comments may be incomplete.');
});
