const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const electronBinary = require('electron');
const { test: base, expect, _electron: electron } = require('@playwright/test');
const { createFixtureBoard } = require('./helpers/fixtureBoard');

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

function getColorCycleShortcut() {
  return usesMetaModifier ? 'Meta+Control+Shift+C' : 'Control+Alt+Shift+C';
}

function getArchiveCardShortcut() {
  return getShortcut('Alt+Shift+Backspace');
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
  const normalizedBoardRoot = normalizeBoardRoot(boardRoot);

  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#board');
  await page.evaluate((nextBoardRoot) => {
    localStorage.setItem('activeBoardPath', nextBoardRoot);
    localStorage.setItem('boardPath', nextBoardRoot);
    localStorage.setItem('openBoardPaths', JSON.stringify([nextBoardRoot]));
  }, normalizedBoardRoot);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#boardName')).toHaveText('Playwright Board');
  await expect(page.locator('.list')).toHaveCount(3);
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

  const gap = await getVerticalGap(page.locator('#userInput'), page.locator('#btnAddCard'));
  expect(gap).toBeGreaterThanOrEqual(6);
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

test('opens the add-list modal from the keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('Shift+N'));

  await expect(page.locator('#modalAddList')).toBeVisible();
  await expect(page.locator('#userInputListName')).toBeFocused();
});

test('opens the keyboard shortcuts helper from the keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('/'));

  await expect(page.locator('#modalKeyboardShortcuts')).toBeVisible();
  await expect(page.locator('#modalKeyboardShortcuts')).toContainText('Keyboard Shortcuts');

  await page.keyboard.press('Escape');
  await expect(page.locator('#modalKeyboardShortcuts')).toBeHidden();
});

test('opens board settings from the renderer keyboard shortcut', async ({ page }) => {
  await page.keyboard.press(getShortcut('Comma'));

  await expect(page.locator('#modalBoardSettings')).toBeVisible();
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

test('persists the board tooltip toggle and suppresses tooltips when disabled', async ({ page }) => {
  const supportButton = page.locator('#openCommercialLicenseModal');
  const tooltip = page.locator('#sbTooltip');

  await openBoardMenu(page);
  await supportButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/Support Signboard/i);

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
      const settings = await window.board.readBoardSettings(window.boardRoot);
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
      const settings = await window.board.readBoardSettings(window.boardRoot);
      return settings.tooltipsEnabled;
    });
  }).toBe(false);
});

test('persists a label color change committed from the board settings picker', async ({ page }) => {
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

test('shows import controls and renders an import summary from the Board Settings import panel', async ({ page }) => {
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
