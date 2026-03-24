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
});

test('opens the list add-card modal from the inline plus button with visible spacing', async ({ page }) => {
  await page.locator('.btnOpenAddCardModal').first().click();

  await expect(page.locator('#modalAddCard')).toBeVisible();
  await expect(page.locator('#hiddenListPath')).toHaveValue(/000-To-do-stock\/$/);

  const gap = await getVerticalGap(page.locator('#userInput'), page.locator('#btnAddCard'));
  expect(gap).toBeGreaterThanOrEqual(6);
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

test('persists the board tooltip toggle and suppresses tooltips when disabled', async ({ page }) => {
  const supportButton = page.locator('#openCommercialLicenseModal');
  const tooltip = page.locator('#sbTooltip');

  await supportButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/Support Signboard/i);

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

  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await page.locator('#boardSettingsNavImport').click();

  await expect(page.locator('#boardSettingsPanelImport')).toBeVisible();
  await expect(page.locator('#btnImportBoardFromTrello')).toBeVisible();
  await expect(page.locator('#btnImportBoardFromObsidian')).toBeVisible();

  await page.locator('#btnImportBoardFromTrello').click();

  await expect(page.locator('#boardSettingsImportStatus')).toContainText('Imported 1 source.');
  await expect(page.locator('#boardSettingsImportStatus')).toContainText('2 lists created.');
  await expect(page.locator('#boardSettingsImportWarnings')).toContainText('Imported comments may be incomplete.');
});
