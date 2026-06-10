const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const electronBinary = require('electron');
const { test: base, expect, _electron: electron } = require('@playwright/test');
const { createFixtureBoard, createFixtureBoardAt } = require('./helpers/fixtureBoard');
const cardFrontmatter = require('../../lib/cardFrontmatter');

const repoRoot = path.resolve(__dirname, '../..');
const usesMetaModifier = process.platform === 'darwin';
const shouldBringPlaywrightAppToFront = process.env.SIGNBOARD_PLAYWRIGHT_FOREGROUND === '1';

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

function getCurrentMonthDate(dayOfMonth) {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
}

function getCurrentWeekDate(dayOffset) {
  const today = new Date();
  const mondayFirstOffset = (today.getDay() + 6) % 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayFirstOffset + dayOffset);
}

async function openCurrentBoardPlannerView(page, shortcut, viewSelector) {
  await page.keyboard.press(getShortcut(shortcut));
  await expect(page.locator('#plannerOverlay')).toBeVisible();
  await expect(page.locator(viewSelector)).toBeVisible();
}

async function getPlannerTemporalSortableEndTarget(sourceLocator, targetIso) {
  return await sourceLocator.evaluate((item, targetDate) => {
    if (!(item instanceof HTMLElement)) {
      throw new Error('Planner temporal card was not an HTMLElement.');
    }

    const from = item.closest('.board-calendar-day-cards, .board-this-week-day-cards');
    const targetSelector = from && from.classList.contains('board-this-week-day-cards')
      ? `.planner-this-week .board-this-week-day-cards[data-date="${targetDate}"]`
      : `.planner-calendar .board-calendar-day-cards[data-date="${targetDate}"]`;
    const to = document.querySelector(targetSelector);

    if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) {
      throw new Error('Unable to resolve Planner temporal drop containers.');
    }
    if (typeof createBoardCardSortableOptions !== 'function') {
      throw new Error('Sortable options helper is unavailable.');
    }

    const rect = item.getBoundingClientRect();
    const pointer = {
      clientX: rect.left + (rect.width / 2),
      clientY: rect.top + (rect.height / 2),
    };
    const options = createBoardCardSortableOptions();
    const evt = {
      item,
      from,
      to,
      originalEvent: pointer,
    };

    options.onStart(evt);
    options.onEnd(evt);

    return {
      toClass: evt.to instanceof HTMLElement ? evt.to.className : '',
      toDate: evt.to instanceof HTMLElement ? String(evt.to.dataset.date || '') : '',
      parentClass: item.parentElement instanceof HTMLElement ? item.parentElement.className : '',
      parentDate: item.parentElement instanceof HTMLElement ? String(item.parentElement.dataset.date || '') : '',
    };
  }, targetIso);
}

async function dropPlannerTemporalCardOnDate(sourceLocator, targetIso) {
  await sourceLocator.evaluate(async (item, targetDate) => {
    if (!(item instanceof HTMLElement)) {
      throw new Error('Planner temporal card was not an HTMLElement.');
    }

    const from = item.closest('.board-calendar-day-cards, .board-this-week-day-cards');
    const targetSelector = from && from.classList.contains('board-this-week-day-cards')
      ? `.planner-this-week .board-this-week-day-cards[data-date="${targetDate}"]`
      : `.planner-calendar .board-calendar-day-cards[data-date="${targetDate}"]`;
    const to = document.querySelector(targetSelector);

    if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) {
      throw new Error('Unable to resolve Planner temporal drop containers.');
    }
    if (typeof handlePlannerCardDrop !== 'function') {
      throw new Error('Planner drop handler is unavailable.');
    }

    await handlePlannerCardDrop({ item, from, to }, () => true);
    if (typeof renderPlannerView === 'function') {
      await renderPlannerView();
    }
  }, targetIso);
}

async function writeCardWithSingleTaskDue(cardPath, sourceIso, taskText) {
  const card = await cardFrontmatter.readCard(cardPath);
  const frontmatter = { ...card.frontmatter };
  delete frontmatter.due;

  await cardFrontmatter.writeCard(cardPath, {
    frontmatter,
    body: `- [ ] (due: ${sourceIso}) ${taskText}\n\nContext for the task due drag regression.`,
  });
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
  if (shouldBringPlaywrightAppToFront) {
    await page.bringToFront();
  }
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

async function getBoardCardDragState(page, pointer = null) {
  return await page.evaluate((currentPointer) => {
    const fallback = document.querySelector('.card-sortable--fallback');
    const fallbackRect = fallback instanceof HTMLElement
      ? fallback.getBoundingClientRect()
      : null;
    const pointerDistance = (() => {
      if (!currentPointer || !fallbackRect) {
        return null;
      }

      const closestX = Math.max(fallbackRect.left, Math.min(currentPointer.x, fallbackRect.right));
      const closestY = Math.max(fallbackRect.top, Math.min(currentPointer.y, fallbackRect.bottom));
      return Math.hypot(currentPointer.x - closestX, currentPointer.y - closestY);
    })();

    return {
      activeDrag: document.body.classList.contains('board-card-drag-active'),
      fallbackCount: document.querySelectorAll('.card-sortable--fallback').length,
      ghostCount: document.querySelectorAll('.card-sortable--ghost').length,
      draggingCount: document.querySelectorAll('.card-sortable--dragging').length,
      fallbackInCardListCount: Array.from(document.querySelectorAll('.card-sortable--fallback')).filter((element) => element.closest('.cards')).length,
      fallbackRect: fallbackRect
        ? {
            left: Math.round(fallbackRect.left),
            top: Math.round(fallbackRect.top),
            right: Math.round(fallbackRect.right),
            bottom: Math.round(fallbackRect.bottom),
            width: Math.round(fallbackRect.width),
            height: Math.round(fallbackRect.height),
          }
        : null,
      pointerDistance: pointerDistance === null ? null : Math.round(pointerDistance),
      cardsByPath: Array.from(document.querySelectorAll('.card[data-path]')).reduce((counts, element) => {
        const cardPath = String(element.dataset.path || '');
        counts[cardPath] = (counts[cardPath] || 0) + 1;
        return counts;
      }, {}),
    };
  }, pointer);
}

async function moveMouseSlowlyAndSampleDrag(page, from, to, options = {}) {
  const steps = options.steps || 20;
  const label = options.label || 'move';
  const pauseMs = options.pauseMs || 10;
  const samples = [];

  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: from.x + ((to.x - from.x) * ratio),
      y: from.y + ((to.y - from.y) * ratio),
    };

    await page.mouse.move(point.x, point.y);
    if (pauseMs > 0) {
      await page.waitForTimeout(pauseMs);
    }

    const state = await getBoardCardDragState(page, point);
    samples.push({
      label,
      step: index,
      point: {
        x: Math.round(point.x),
        y: Math.round(point.y),
      },
      ...state,
    });
  }

  return samples;
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
        SIGNBOARD_TEST_DISABLE_EXTERNAL_OPEN: '1',
        SIGNBOARD_TEST_DISABLE_FAVICON_FETCH: '1',
        SIGNBOARD_TEST_ALLOW_DIRECT_LINKED_OBJECT_PATHS: '1',
        SIGNBOARD_TEST_AUTO_CONFIRM_OPEN_BOARD_PROTOCOL: '1',
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
    if (shouldBringPlaywrightAppToFront) {
      await page.bringToFront();
    }
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

test('explains Obsidian-only actions outside an Obsidian vault', async ({ page, boardRoot }) => {
  await openFirstCardInEditor(page);
  await page.locator('#cardEditorOpenWithLink').click();

  const popover = page.locator('#cardEditorOpenWithPopover');
  await expect(popover).toBeVisible();
  await expect(popover.getByRole('button', { name: 'Open in Obsidian' })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Create Linked Note' })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Send to Inbox' })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Copy Obsidian URI' })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Open in Default App' })).toBeVisible();
  await expect(popover.getByRole('button', { name: 'Reveal File' })).toBeVisible();
  await expect(popover.getByRole('button', { name: 'Copy Signboard Link' })).toBeVisible();
  await page.locator('#cardEditorLinkedObjectsLink').click();
  await expect(page.locator('#cardEditorLinkedObjectsPopover')).toBeVisible();
  const createLinkedNoteButton = page.locator('#cardEditorLinkedObjectsPopover').getByRole('button', { name: 'Create Linked Obsidian Note' });
  await expect(createLinkedNoteButton).toBeEnabled();
  await createLinkedNoteButton.click();
  await expect(page.locator('#modalObsidianVaultRequired')).toBeVisible();
  await expect(page.locator('#modalObsidianVaultRequired')).toContainText('Creating a linked Obsidian note only works when the current board folder is stored inside an Obsidian vault.');
  await page.locator('#modalObsidianVaultRequired').getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('#modalObsidianVaultRequired')).toBeHidden();
  await expect(page.locator('#modalEditCard')).toBeVisible();
  await page.locator('#cardEditorClose').click();
  await expect(page.locator('#modalEditCard')).toBeHidden();

  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await page.locator('#boardSettingsNavObsidian').click();
  await page.locator('#btnGenerateObsidianBase').click();
  await expect(page.locator('#modalObsidianVaultRequired')).toBeVisible();
  await expect(page.locator('#modalObsidianVaultRequired')).toContainText('Generating an Obsidian Base only works when the current board folder is stored inside an Obsidian vault.');
  await page.locator('#modalObsidianVaultRequired').getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  expect(await pathExists(path.join(boardRoot, 'Signboard Board.base'))).toBe(false);
});

test('opens Obsidian-created boards through the Signboard board protocol', async ({ page, boardRoot }) => {
  const vaultRoot = path.dirname(boardRoot);
  const protocolBoardRoot = path.join(vaultRoot, 'Protocol Created Board');
  const listRoot = path.join(protocolBoardRoot, '000-To-do-stock');

  await fs.mkdir(path.join(vaultRoot, '.obsidian'), { recursive: true });
  await fs.mkdir(listRoot, { recursive: true });
  await fs.mkdir(path.join(protocolBoardRoot, 'XXX-Archive'), { recursive: true });
  await fs.writeFile(path.join(protocolBoardRoot, 'board-settings.md'), [
    '---',
    'labels: []',
    '---',
    '',
  ].join('\n'), 'utf8');
  await cardFrontmatter.writeCard(path.join(listRoot, '000-from-obsidian-ab123.md'), {
    frontmatter: {
      title: 'From Obsidian',
      signboard_id: 'ab123',
    },
    body: 'Created by the Obsidian companion plugin.',
  });

  await page.evaluate(async (openBoardUri) => {
    await window.electronAPI.openExternal(openBoardUri);
  }, `signboard://open-board?path=${encodeURIComponent(protocolBoardRoot)}`);

  await expect(page.locator('#boardName')).toHaveText('Protocol Created Board');
  await expect(page.locator('.card').filter({ hasText: 'From Obsidian' })).toBeVisible();
});

test('exposes Obsidian actions and generates a board Base', async ({ page, boardRoot }) => {
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');
  const basePath = path.join(boardRoot, 'Signboard Board.base');
  const linkedNotePath = path.join(boardRoot, 'Linked Signboard Note.md');
  const renamedLinkedNotePath = path.join(boardRoot, 'Renamed Project Brief.md');
  const externalLinkedFilePath = path.join(path.dirname(boardRoot), 'linked-reference.pdf');

  await fs.mkdir(path.join(path.dirname(boardRoot), '.obsidian'), { recursive: true });
  await page.evaluate(async () => {
    await window.board.setActiveBoardRoot(window.boardRoot);
  });
  await expect.poll(async () => {
    try {
      await fs.access(basePath);
      return true;
    } catch {
      return false;
    }
  }).toBe(true);

  await openFirstCardInEditor(page);
  await page.locator('#cardEditorOpenWithLink').click();
  await expect(page.locator('#cardEditorOpenWithPopover')).toBeVisible();
  await expect(page.locator('#cardEditorOpenWithPopover')).toContainText('Open in Obsidian');
  await expect(page.locator('#cardEditorOpenWithPopover')).not.toContainText('Create Linked Note');
  await expect(page.locator('#cardEditorOpenWithPopover')).not.toContainText('Send to Inbox');
  await expect(page.locator('#cardEditorOpenWithPopover')).toContainText('Copy Signboard Link');

  const triggerBox = await page.locator('#cardEditorOpenWithLink').boundingBox();
  const popoverBox = await page.locator('#cardEditorOpenWithPopover').boundingBox();
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  if (!triggerBox || !popoverBox || !viewport) {
    throw new Error('Unable to measure Open With popover placement.');
  }
  expect(popoverBox.x).toBeGreaterThanOrEqual(0);
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(viewport.width);
  expect(popoverBox.y).toBeLessThanOrEqual(triggerBox.y + triggerBox.height + 16);
  expect(popoverBox.x).toBeLessThanOrEqual(triggerBox.x + triggerBox.width + 8);

  const popoverLayerState = await page.evaluate(() => {
    const modal = document.getElementById('modalEditCard');
    const popover = document.getElementById('cardEditorOpenWithPopover');
    if (modal && typeof window.setAccessibleModalVisible === 'function') {
      window.setAccessibleModalVisible(modal, true, {
        display: 'flex',
        restoreFocus: false,
      });
    }

    return {
      inert: Boolean(popover && popover.inert),
      inertMarker: Boolean(popover && popover.hasAttribute('data-sb-modal-inert')),
    };
  });
  expect(popoverLayerState).toEqual({
    inert: false,
    inertMarker: false,
  });

  const titleBoxBeforeLink = await page.locator('#cardEditorTitle').boundingBox();
  if (!titleBoxBeforeLink) {
    throw new Error('Unable to measure card title before linking.');
  }

  await page.evaluate(() => {
    window.boardRoot = '';
  });
  await page.locator('#cardEditorOpenWithLink').click();
  await expect(page.locator('#cardEditorOpenWithPopover')).toBeHidden();
  await page.locator('#cardEditorLinkedObjectsLink').click();
  await expect(page.locator('#cardEditorLinkedObjectsPopover')).toBeVisible();
  await page.locator('#cardEditorLinkedObjectsPopover').getByRole('button', { name: 'Create Linked Obsidian Note' }).click();
  await fs.access(linkedNotePath);
  const linkedNoteRaw = await fs.readFile(linkedNotePath, 'utf8');
  expect(linkedNoteRaw).toContain('signboard_card_id: stock');
  expect(linkedNoteRaw).not.toContain('# Plan release notes');
  expect(linkedNoteRaw).not.toContain('## Notes');
  await expect.poll(async () => {
    const updatedCard = await cardFrontmatter.readCard(cardPath);
    return updatedCard.frontmatter.related || [];
  }).toContain('[[Playwright Board/Linked Signboard Note]]');
  await expect.poll(async () => {
    const updatedCard = await cardFrontmatter.readCard(cardPath);
    return updatedCard.frontmatter.linked_objects || [];
  }).toContainEqual(expect.objectContaining({
    type: 'obsidian-note',
    path: linkedNotePath,
  }));
  const titleBoxAfterLink = await page.locator('#cardEditorTitle').boundingBox();
  if (!titleBoxAfterLink) {
    throw new Error('Unable to measure card title after linking.');
  }
  expect(titleBoxAfterLink.y).toBeCloseTo(titleBoxBeforeLink.y, 0);
  const relatedNoteButton = page
    .locator('#cardEditorRelatedNotes')
    .getByRole('button', { name: 'Open Linked Signboard Note' });
  await expect(relatedNoteButton).toBeVisible();
  await expect(page.locator('#cardEditorLinkedObjectsCount')).toHaveText('1');
  await relatedNoteButton.click();
  await expect(page.locator('#signboardStatusRegion'))
    .toHaveText('Opened Linked Signboard Note.');

  await fs.rename(linkedNotePath, renamedLinkedNotePath);
  const cardAfterLinkedNoteRename = await cardFrontmatter.readCard(cardPath);
  await cardFrontmatter.writeCard(cardPath, {
    frontmatter: {
      ...cardAfterLinkedNoteRename.frontmatter,
      related: ['[[Playwright Board/Renamed Project Brief]]'],
    },
    body: cardAfterLinkedNoteRename.body,
  });

  await page.evaluate((nextBoardRoot) => {
    window.boardRoot = nextBoardRoot;
  }, normalizeBoardRoot(boardRoot));
  await page.locator('#cardEditorClose').click();
  await expect(page.locator('#modalEditCard')).toBeHidden();
  await openFirstCardInEditor(page);

  const renamedRelatedNoteButton = page
    .locator('#cardEditorRelatedNotes')
    .getByRole('button', { name: 'Open Renamed Project Brief' });
  await expect(renamedRelatedNoteButton).toBeVisible();
  await expect(page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Open Linked Signboard Note' })).toHaveCount(0);
  await expect(page.locator('#cardEditorRelatedNotes .card-editor-related-note')).toHaveCount(1);
  await expect(page.locator('#cardEditorLinkedObjectsCount')).toHaveText('1');
  await renamedRelatedNoteButton.click();
  await expect(page.locator('#signboardStatusRegion'))
    .toHaveText('Opened Renamed Project Brief.');
  await fs.unlink(renamedLinkedNotePath);
  await page.locator('#cardEditorClose').click();
  await expect(page.locator('#modalEditCard')).toBeHidden();
  await openFirstCardInEditor(page);

  const missingRelatedNoteButton = page
    .locator('#cardEditorRelatedNotes')
    .getByRole('button', { name: 'Open missing Renamed Project Brief' });
  await expect(missingRelatedNoteButton).toBeVisible();
  await expect(page.locator('#cardEditorRelatedNotes .card-editor-related-note.is-missing')).toContainText('Missing: Renamed Project Brief');
  await expect(page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Recreate Renamed Project Brief' })).toBeVisible();
  await expect(page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Relink Renamed Project Brief' })).toBeVisible();
  await missingRelatedNoteButton.click();
  await expect(page.locator('#signboardStatusRegion'))
    .toHaveText('Linked note not found.');
  await page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Recreate Renamed Project Brief' }).click();
  await fs.access(renamedLinkedNotePath);
  await expect(page.locator('#cardEditorRelatedNotes .card-editor-related-note.is-missing')).toHaveCount(0);
  await expect(page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Open Renamed Project Brief' })).toBeVisible();
  await page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Remove Renamed Project Brief' }).click();
  await expect(page.locator('#cardEditorRelatedNotes')).toBeHidden();
  await expect(page.locator('#cardEditorLinkedObjectsCount')).toBeHidden();
  await expect.poll(async () => {
    const updatedCard = await cardFrontmatter.readCard(cardPath);
    return updatedCard.frontmatter.related || [];
  }).toEqual([]);
  await expect.poll(async () => {
    const updatedCard = await cardFrontmatter.readCard(cardPath);
    return updatedCard.frontmatter.linked_objects || [];
  }).toEqual([]);

  await page.locator('#cardEditorLinkedObjectsLink').click();
  await expect(page.locator('#cardEditorLinkedObjectsPopover')).toBeVisible();
  await page.locator('#cardEditorLinkedObjectsPopover').getByRole('button', { name: 'Link URL...' }).click();
  await expect(page.locator('#cardEditorLinkedObjectUrlForm')).toBeVisible();
  await expect(page.locator('#cardEditorLinkedObjectUrlInput')).toBeFocused();
  await page.locator('#cardEditorLinkedObjectUrlInput').fill('example.com/docs');
  await page.locator('#cardEditorLinkedObjectUrlForm').getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Open example.com' })).toBeVisible();
  await expect(page.locator('#cardEditorLinkedObjectsCount')).toHaveText('1');
  await expect.poll(async () => {
    const updatedCard = await cardFrontmatter.readCard(cardPath);
    return updatedCard.frontmatter.linked_objects || [];
  }).toContainEqual(expect.objectContaining({
    type: 'url',
    url: 'https://example.com/docs',
  }));

  await fs.writeFile(externalLinkedFilePath, 'PDF placeholder', 'utf8');
  await page.evaluate(({ cardPath: activeCardPath, filePath }) => {
    window.__signboardTestLinkDroppedObjects = async (_cardPath, files) => {
      window.__linkedObjectDropFilesAreArray = Array.isArray(files);
      window.__linkedObjectDropFileCount = files ? files.length : 0;
      const result = await window.board.addLinkedObject(activeCardPath, {
        type: 'file',
        path: filePath,
      });
      return {
        ok: true,
        linkedObjects: [{
          type: 'file',
          title: 'linked-reference.pdf',
          path: filePath,
        }],
        frontmatter: result.frontmatter,
      };
    };
  }, { cardPath, filePath: externalLinkedFilePath });
  await page.evaluate(() => {
    const existingInput = document.getElementById('linkedObjectDropTestInput');
    if (existingInput) {
      existingInput.remove();
    }
    const input = document.createElement('input');
    input.id = 'linkedObjectDropTestInput';
    input.type = 'file';
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    document.body.appendChild(input);
  });
  await page.locator('#linkedObjectDropTestInput').setInputFiles(externalLinkedFilePath);
  await page.evaluate(async () => {
    const input = document.getElementById('linkedObjectDropTestInput');
    const dropTarget = document.querySelector('#cardEditorOverType .overtype-input');
    if (!input || !dropTarget || !input.files || input.files.length === 0) {
      throw new Error('Unable to prepare dropped linked-object file.');
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);
    dropTarget.dispatchEvent(new DragEvent('dragenter', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
    dropTarget.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  });
  await expect(page.locator('#modalEditCard')).toHaveClass(/card-editor-drop-active/);
  await page.evaluate(async () => {
    const input = document.getElementById('linkedObjectDropTestInput');
    const dropTarget = document.querySelector('#cardEditorOverType .overtype-input');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);
    dropTarget.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  });
  await expect(page.locator('#modalEditCard')).not.toHaveClass(/card-editor-drop-active/);
  await expect.poll(async () => page.evaluate(() => window.__linkedObjectDropFileCount || 0)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__linkedObjectDropFilesAreArray === true)).toBe(true);
  await expect(page.locator('#cardEditorRelatedNotes').getByRole('button', { name: 'Open linked-reference.pdf' })).toBeVisible();
  await expect(page.locator('#cardEditorLinkedObjectsCount')).toHaveText('2');
  await page.evaluate(() => {
    delete window.__signboardTestLinkDroppedObjects;
  });

  await page.locator('#cardEditorOpenWithLink').click();
  await expect(page.locator('#cardEditorOpenWithPopover')).toBeVisible();
  await page.locator('#cardEditorOpenWithPopover').getByRole('button', { name: 'Copy Signboard Link' }).click();
  await expect(page.locator('#signboardStatusRegion')).toHaveText('Copied Signboard link.');
  await page.locator('#cardEditorOpenWithLink').click();
  await expect(page.locator('#cardEditorOpenWithPopover')).toBeVisible();

  await page.evaluate((nextBoardRoot) => {
    window.boardRoot = nextBoardRoot;
  }, normalizeBoardRoot(boardRoot));
  await page.locator('#cardEditorClose').click();
  await expect(page.locator('#modalEditCard')).toBeHidden();

  const planCard = page.locator('.list').first().locator('.card').filter({ hasText: 'Plan release notes' });
  await expect(planCard.locator('.linked-objects-badge-inline')).toHaveText('2');
  await page.keyboard.press(getCurrentBoardPlannerShortcut('1'));
  await expect(page.locator('main#board')).toHaveClass(/board-view-table/);
  await expect(page.locator('.board-table-heading-links')).toHaveText('Links');
  const planRow = page.locator('.board-table-row').filter({ hasText: 'Plan release notes' });
  await expect(planRow.locator('.board-table-linked-objects-badge')).toHaveText('2');
  await page.keyboard.press(getShortcut('1'));
  await expect(page.locator('main#board')).not.toHaveClass(/board-view-table/);

  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await page.locator('#boardSettingsNavObsidian').click();
  await expect(page.locator('#boardSettingsPanelObsidian')).toBeVisible();
  await page.locator('#btnGenerateObsidianBase').click();
  await expect(page.locator('#boardSettingsObsidianStatus')).toContainText('Generated Signboard Board.base');

  await fs.access(basePath);
  const baseRaw = await fs.readFile(basePath, 'utf8');
  expect(baseRaw).toContain('title:');
  expect(baseRaw).toContain('- title');
  expect(baseRaw).toContain('linked_objects:');
  expect(baseRaw).toContain('- linked_objects');
  const card = await cardFrontmatter.readCard(cardPath);
  expect(card.frontmatter.signboard_board).toBe(path.basename(boardRoot));
  expect(card.frontmatter.signboard_list).toBe('To-do');
  expect(card.frontmatter.status).toBe('To-do');
  expect(card.frontmatter.signboard_uri).toBe('signboard://open-card?id=stock');
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

test('navigates board search results from the keyboard', async ({ page }) => {
  const searchInput = page.locator('#boardSearchInput');
  const planCardButton = page.locator('.card-title-button').filter({ hasText: 'Plan release notes' });
  const polishCardButton = page.locator('.card-title-button').filter({ hasText: 'Polish homepage copy' });

  await searchInput.focus();
  await searchInput.fill('the');
  await page.keyboard.press('Enter');
  await expect(planCardButton).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(polishCardButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveValue('the');

  await page.keyboard.press('Escape');
  await expect(searchInput).toHaveValue('');

  await searchInput.fill('copy');
  await page.keyboard.press('Enter');
  await expect(polishCardButton).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorTitle')).toHaveText('Polish homepage copy');
});

test('navigates board popovers and settings sections from the keyboard', async ({ page }) => {
  const listActionsButton = page.locator('.list-actions-button').first();
  await listActionsButton.click();
  await expect(page.locator('.list-actions-option').filter({ hasText: 'Add new card' })).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.list-actions-option').filter({ hasText: 'Add new list' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('.list-actions-option').filter({ hasText: 'Archive this list' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#listActionsPopover')).toBeHidden();
  await expect(listActionsButton).toBeFocused();

  const filterButton = page.locator('#labelFilterButton');
  await filterButton.click();
  await expect(page.locator('#labelFilterPopover input').nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#labelFilterPopover input').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#labelFilterPopover input').nth(3)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#labelFilterPopover')).toBeHidden();
  await expect(filterButton).toBeFocused();

  const cardLabelButton = page.locator('.card-label-button').first();
  await cardLabelButton.click();
  await expect(page.locator('.card-label-popover input').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.card-label-popover input').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-label-popover')).toHaveCount(0);
  await expect(cardLabelButton).toBeFocused();

  await page.keyboard.press(getShortcut(','));
  await expect(page.locator('#modalBoardSettings')).toBeVisible();
  await expect(page.locator('#boardSettingsNavApp')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#boardSettingsNavGeneral')).toBeFocused();
  await expect(page.locator('#boardSettingsPanelGeneral')).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('End');
  await expect(page.locator('#boardSettingsNavImport')).toBeFocused();
  await expect(page.locator('#boardSettingsPanelImport')).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBoardSettings')).toBeHidden();
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

test('keeps slow cross-list dragging healthy over blank board areas', async ({ page, boardRoot }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 942, height: 746 });

  const todoListPath = path.join(boardRoot, '000-To-do-stock');
  const doingListPath = path.join(boardRoot, '001-Doing-stock');
  const doneListPath = path.join(boardRoot, '002-Done-stock');

  await Promise.all([
    fs.rm(path.join(doingListPath, '000-polish-copy-stock.md'), { force: true }),
    cardFrontmatter.writeCard(path.join(todoListPath, '001-test-weather-variations-stock.md'), {
      frontmatter: {
        title: 'Add a way to test all weather variations',
        createdAt: '2026-04-01T12:00:00.000Z',
      },
      body: '',
    }),
    cardFrontmatter.writeCard(path.join(doneListPath, '001-add-hard-mode-stock.md'), {
      frontmatter: {
        title: 'Add Hard Mode',
        createdAt: '2026-04-02T12:00:00.000Z',
      },
      body: 'Describe hard mode here.',
    }),
    cardFrontmatter.writeCard(path.join(doneListPath, '002-dark-mode-keyboard-stock.md'), {
      frontmatter: {
        title: 'Bug: Clicking on Dark Mode causes keyboard to show on mobile',
        createdAt: '2026-04-03T12:00:00.000Z',
      },
      body: 'When a user clicks on the Dark Mode...',
    }),
    cardFrontmatter.writeCard(path.join(doneListPath, '003-add-menu-stock.md'), {
      frontmatter: {
        title: 'Add Menu',
        createdAt: '2026-04-04T12:00:00.000Z',
      },
      body: '',
    }),
  ]);
  await seedBoardState(page, boardRoot);

  const firstList = page.locator('.list').first();
  const doingList = page.locator('.list').nth(1);
  const doneList = page.locator('.list').nth(2);
  const draggedCard = firstList.locator('.card').filter({ hasText: 'Add a way to test all weather variations' });

  await expect(firstList.locator('.card')).toHaveCount(2);
  await expect(doingList.locator('.card')).toHaveCount(0);
  await expect(doneList.locator('.card')).toHaveCount(4);

  const cardBox = await draggedCard.boundingBox();
  const firstListBox = await firstList.boundingBox();
  const doingListBox = await doingList.boundingBox();
  const doneListBox = await doneList.boundingBox();
  const boardBox = await page.locator('#board').boundingBox();

  if (!cardBox || !firstListBox || !doingListBox || !doneListBox || !boardBox) {
    throw new Error('Unable to measure drag stress positions.');
  }

  const start = {
    x: cardBox.x + (cardBox.width / 2),
    y: cardBox.y + (cardBox.height / 2),
  };
  const waypoints = [
    {
      label: 'done-top-right-edge',
      x: Math.min(doneListBox.x + doneListBox.width + 34, boardBox.x + boardBox.width - 8),
      y: doneListBox.y + 95,
    },
    {
      label: 'done-card-stack',
      x: doneListBox.x + (doneListBox.width / 2),
      y: doneListBox.y + Math.min(doneListBox.height - 36, 330),
    },
    {
      label: 'done-right-edge-card-stack',
      x: Math.min(doneListBox.x + doneListBox.width + 28, boardBox.x + boardBox.width - 8),
      y: doneListBox.y + Math.min(doneListBox.height - 60, 300),
    },
    {
      label: 'blank-below-done',
      x: doneListBox.x + (doneListBox.width / 2),
      y: boardBox.y + boardBox.height - 64,
    },
    {
      label: 'blank-gap-between-doing-and-done',
      x: (doingListBox.x + doingListBox.width + doneListBox.x) / 2,
      y: boardBox.y + boardBox.height - 64,
    },
    {
      label: 'blank-below-doing',
      x: doingListBox.x + (doingListBox.width / 2),
      y: boardBox.y + boardBox.height - 64,
    },
    {
      label: 'blank-below-todo',
      x: firstListBox.x + (firstListBox.width / 2),
      y: boardBox.y + boardBox.height - 64,
    },
    {
      label: 'doing-empty-list',
      x: doingListBox.x + (doingListBox.width / 2),
      y: doingListBox.y + 132,
    },
    {
      label: 'done-top-again',
      x: Math.min(doneListBox.x + doneListBox.width + 24, boardBox.x + boardBox.width - 8),
      y: doneListBox.y + 92,
    },
  ];

  const allSamples = [];
  let currentPoint = start;

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 6, start.y + 6);
  await expect.poll(async () => {
    const state = await getBoardCardDragState(page, {
      x: start.x + 6,
      y: start.y + 6,
    });
    return {
      activeDrag: state.activeDrag,
      fallbackCount: state.fallbackCount,
    };
  }).toEqual({
    activeDrag: true,
    fallbackCount: 1,
  });

  for (let lap = 0; lap < 8; lap += 1) {
    for (const waypoint of waypoints) {
      const nextPoint = {
        x: waypoint.x,
        y: waypoint.y,
      };
      const samples = await moveMouseSlowlyAndSampleDrag(page, currentPoint, nextPoint, {
        label: `${waypoint.label}-lap-${lap + 1}`,
        steps: 18,
        pauseMs: 12,
      });
      allSamples.push(...samples);
      currentPoint = nextPoint;

      const unhealthySample = samples.find((sample) => (
        !sample.activeDrag ||
        sample.fallbackCount !== 1 ||
        sample.ghostCount !== 1 ||
        sample.fallbackInCardListCount !== 0 ||
        (sample.pointerDistance !== null && sample.pointerDistance > 180)
      ));

      if (unhealthySample) {
        throw new Error(`Card drag became unhealthy: ${JSON.stringify(unhealthySample, null, 2)}`);
      }
    }
  }

  await page.mouse.up();
  await expect.poll(async () => {
    const state = await getBoardCardDragState(page);
    return {
      activeDrag: state.activeDrag,
      fallbackCount: state.fallbackCount,
      ghostCount: state.ghostCount,
      draggingCount: state.draggingCount,
    };
  }).toEqual({
    activeDrag: false,
    fallbackCount: 0,
    ghostCount: 0,
    draggingCount: 0,
  });

  const finalState = await getBoardCardDragState(page);
  for (const count of Object.values(finalState.cardsByPath)) {
    expect(count).toBe(1);
  }

  await expect.poll(async () => {
    const fileNamesByList = await Promise.all([
      fs.readdir(todoListPath),
      fs.readdir(doingListPath),
      fs.readdir(doneListPath),
    ]);
    return fileNamesByList.flat().filter((fileName) => fileName.endsWith('.md')).length;
  }).toBe(6);

  await expect.poll(async () => {
    const fileNamesByList = await Promise.all([
      fs.readdir(todoListPath),
      fs.readdir(doingListPath),
      fs.readdir(doneListPath),
    ]);
    return fileNamesByList.flat().filter((fileName) => fileName.endsWith('.tmp')).length;
  }).toBe(0);
});

test('drops cards into the lower area of an empty list column', async ({ page, boardRoot }) => {
  const emptyListPath = path.join(boardRoot, '001-Doing-stock');
  const emptyListCards = await fs.readdir(emptyListPath);
  await Promise.all(
    emptyListCards.map((fileName) => fs.rm(path.join(emptyListPath, fileName), { force: true }))
  );
  await seedBoardState(page, boardRoot);

  const firstList = page.locator('.list').first();
  const emptyList = page.locator('.list').nth(1);
  const card = firstList.locator('.card').first();

  await expect(card.locator('h3')).toHaveText('Plan release notes');
  await expect(emptyList.locator('.card')).toHaveCount(0);

  const cardBox = await card.boundingBox();
  const emptyListBox = await emptyList.boundingBox();
  const boardBox = await page.locator('#board').boundingBox();

  if (!cardBox || !emptyListBox || !boardBox) {
    throw new Error('Unable to measure card/list positions.');
  }

  const start = {
    x: cardBox.x + (cardBox.width / 2),
    y: cardBox.y + (cardBox.height / 2),
  };
  const lowerEmptyListTarget = {
    x: emptyListBox.x + (emptyListBox.width / 2),
    y: boardBox.y + boardBox.height - 72,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8);
  await expect.poll(async () => {
    return await page.evaluate(() => document.body.classList.contains('board-card-drag-active'));
  }).toBe(true);

  const dropTargetIncludesEmptyList = await page.evaluate(({ x, y }) => {
    return document.elementsFromPoint(x, y).some((element) => (
      element instanceof HTMLElement &&
      element.classList.contains('cards') &&
      String(element.dataset.path || '').includes('001-Doing-stock')
    ));
  }, lowerEmptyListTarget);

  expect(dropTargetIncludesEmptyList).toBe(false);

  const tallestListHeightDuringDrag = await page.evaluate(() => {
    return Math.max(
      0,
      ...Array.from(document.querySelectorAll('.list')).map((element) => (
        element instanceof HTMLElement ? element.getBoundingClientRect().height : 0
      ))
    );
  });
  expect(tallestListHeightDuringDrag).toBeLessThan(420);

  await page.mouse.move(lowerEmptyListTarget.x, lowerEmptyListTarget.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    return await page.evaluate(() => ({
      activeDrag: document.body.classList.contains('board-card-drag-active'),
      fallbackCount: document.querySelectorAll('.card-sortable--fallback').length,
      ghostCount: document.querySelectorAll('.card-sortable--ghost').length,
    }));
  }).toEqual({
    activeDrag: false,
    fallbackCount: 0,
    ghostCount: 0,
  });

  await expect(emptyList.locator('.card').filter({ hasText: 'Plan release notes' })).toBeVisible();
  await expect(firstList.locator('.card').filter({ hasText: 'Plan release notes' })).toHaveCount(0);
});

test('drops cards into the lower area of a short non-empty list column', async ({ page }) => {
  const firstList = page.locator('.list').first();
  const doneList = page.locator('.list').nth(2);
  const card = firstList.locator('.card').first();

  await expect(card.locator('h3')).toHaveText('Plan release notes');
  await expect(doneList.locator('.card').filter({ hasText: 'Ship beta' })).toBeVisible();

  const cardBox = await card.boundingBox();
  const doneListBox = await doneList.boundingBox();
  const boardBox = await page.locator('#board').boundingBox();

  if (!cardBox || !doneListBox || !boardBox) {
    throw new Error('Unable to measure card/list positions.');
  }

  const start = {
    x: cardBox.x + (cardBox.width / 2),
    y: cardBox.y + (cardBox.height / 2),
  };
  const lowerDoneListTarget = {
    x: doneListBox.x + (doneListBox.width / 2),
    y: boardBox.y + boardBox.height - 72,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8);

  const dropTargetIncludesDoneList = await page.evaluate(({ x, y }) => {
    return document.elementsFromPoint(x, y).some((element) => (
      element instanceof HTMLElement &&
      element.classList.contains('cards') &&
      String(element.dataset.path || '').includes('002-Done-stock')
    ));
  }, lowerDoneListTarget);

  expect(dropTargetIncludesDoneList).toBe(false);

  await page.mouse.move(lowerDoneListTarget.x, lowerDoneListTarget.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    return await page.evaluate(() => ({
      activeDrag: document.body.classList.contains('board-card-drag-active'),
      fallbackCount: document.querySelectorAll('.card-sortable--fallback').length,
      ghostCount: document.querySelectorAll('.card-sortable--ghost').length,
    }));
  }).toEqual({
    activeDrag: false,
    fallbackCount: 0,
    ghostCount: 0,
  });

  await expect(doneList.locator('.card').filter({ hasText: 'Plan release notes' })).toBeVisible();
  await expect(doneList.locator('.card')).toHaveCount(2);
  await expect(firstList.locator('.card').filter({ hasText: 'Plan release notes' })).toHaveCount(0);
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

test('switches to table view and moves a card through the list column', async ({ page, boardRoot }) => {
  await page.locator('#boardSearchInput').focus();
  await page.keyboard.press(getCurrentBoardPlannerShortcut('1'));
  await expect(page.locator('main#board')).toHaveClass(/board-view-table/);
  await expect(page.locator('.board-table-row')).toHaveCount(3);

  await page.keyboard.press(getShortcut('1'));
  await expect(page.locator('main#board')).not.toHaveClass(/board-view-table/);
  await expect(page.locator('.list')).toHaveCount(3);

  await openBoardMenu(page);
  await page.locator('#boardViewButton').click();
  await expect(page.locator('#boardViewPopover')).toBeVisible();
  await expect(page.locator('#boardViewPopover')).toContainText(usesMetaModifier ? '⌘⌥1' : 'Ctrl+Alt+1');
  await page.locator('#boardViewPopover').getByRole('button', { name: /Table/ }).click();

  await expect(page.locator('main#board')).toHaveClass(/board-view-table/);
  await expect(page.locator('.board-table-row')).toHaveCount(3);
  await expect(page.locator('.board-table-heading-updated')).toHaveText('Updated');
  await expect(page.locator('.board-table-heading-created')).toHaveText('Created');
  await expect(page.locator('.board-table-sort-select')).toHaveValue('board');
  await page.locator('.board-table-sort-select').selectOption({ label: 'Created, oldest first' });
  await expect(page.locator('.board-table-row').first()).toContainText('Ship beta');
  await page.locator('.board-table-sort-select').selectOption({ label: 'Updated, oldest first' });
  await expect(page.locator('.board-table-row').first()).toContainText('Plan release notes');

  const planRow = page.locator('.board-table-row').filter({ hasText: 'Plan release notes' });
  await expect(planRow).toBeVisible();
  await planRow.locator('.board-table-list-select').selectOption({ label: 'Doing' });

  const movedPlanRow = page.locator('.board-table-row').filter({ hasText: 'Plan release notes' });
  await expect(movedPlanRow.locator('.board-table-list-select')).toHaveValue(/001-Doing-stock$/);

  await expect.poll(async () => {
    const toDoEntries = await fs.readdir(path.join(boardRoot, '000-To-do-stock'));
    const doingEntries = await fs.readdir(path.join(boardRoot, '001-Doing-stock'));
    return {
      inToDo: toDoEntries.some((entry) => entry.includes('plan-release')),
      inDoing: doingEntries.some((entry) => entry.includes('plan-release')),
    };
  }).toEqual({
    inToDo: false,
    inDoing: true,
  });

  await movedPlanRow.locator('.board-table-card-title-button').click();
  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorTitle')).toHaveText('Plan release notes');
  await expect(page.locator('#cardEditorTimestampMetadata')).toContainText('Created');
  await expect(page.locator('#cardEditorTimestampMetadata')).toContainText('Updated');
  await expect(page.locator('#cardEditorTimestampMetadata time').first()).not.toContainText(/:\d{2}/);
  await expect(page.locator('#cardEditorTimestampMetadata time').first()).toHaveAttribute('title', /:\d{2}/);

  const editorBox = await page.locator('#cardEditorOverType').boundingBox();
  const timestampBox = await page.locator('#cardEditorTimestampMetadata').boundingBox();
  expect(editorBox).toBeTruthy();
  expect(timestampBox).toBeTruthy();
  expect(timestampBox.y).toBeGreaterThanOrEqual(editorBox.y + editorBox.height - 1);

  await page.locator('#cardEditorClose').click();
  await expect(page.locator('#modalEditCard')).toBeHidden();
});

test('updates task item due dates from Planner calendar drops', async ({ page, boardRoot }) => {
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');
  const sourceIso = formatLocalIsoDate(getCurrentMonthDate(10));
  const targetIso = formatLocalIsoDate(getCurrentMonthDate(11));
  const taskText = 'Review task due calendar drag';

  await writeCardWithSingleTaskDue(cardPath, sourceIso, taskText);
  await seedBoardState(page, boardRoot);
  await openCurrentBoardPlannerView(page, '2', '.planner-calendar');

  const sourceCard = page
    .locator(`.planner-calendar .board-calendar-day-cards[data-date="${sourceIso}"] .planner-calendar-card`)
    .filter({ hasText: taskText });
  const targetDayCards = page.locator(`.planner-calendar .board-calendar-day-cards[data-date="${targetIso}"]`);

  await expect(sourceCard).toBeVisible();
  await expect(targetDayCards).toBeVisible();

  await expect(await getPlannerTemporalSortableEndTarget(sourceCard, targetIso)).toEqual(expect.objectContaining({
    toDate: targetIso,
    parentDate: sourceIso,
  }));
  await dropPlannerTemporalCardOnDate(sourceCard, targetIso);

  await expect.poll(async () => {
    const card = await cardFrontmatter.readCard(cardPath);
    return card.body;
  }).toContain(`- [ ] (due: ${targetIso}) ${taskText}`);

  const updatedCard = await cardFrontmatter.readCard(cardPath);
  expect(updatedCard.body).not.toContain(`- [ ] (due: ${sourceIso}) ${taskText}`);
  expect(updatedCard.frontmatter.due).toBeUndefined();
  await expect(targetDayCards.locator('.planner-calendar-card').filter({ hasText: taskText })).toBeVisible();
});

test('updates task item due dates from Planner This Week drops', async ({ page, boardRoot }) => {
  const cardPath = path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md');
  const sourceIso = formatLocalIsoDate(getCurrentWeekDate(1));
  const targetIso = formatLocalIsoDate(getCurrentWeekDate(2));
  const taskText = 'Review task due week drag';

  await writeCardWithSingleTaskDue(cardPath, sourceIso, taskText);
  await seedBoardState(page, boardRoot);
  await openCurrentBoardPlannerView(page, '3', '.planner-this-week');

  const sourceCard = page
    .locator(`.planner-this-week .board-this-week-day-cards[data-date="${sourceIso}"] .planner-this-week-card`)
    .filter({ hasText: taskText });
  const targetDayCards = page.locator(`.planner-this-week .board-this-week-day-cards[data-date="${targetIso}"]`);

  await expect(sourceCard).toBeVisible();
  await expect(targetDayCards).toBeVisible();

  await expect(await getPlannerTemporalSortableEndTarget(sourceCard, targetIso)).toEqual(expect.objectContaining({
    toDate: targetIso,
    parentDate: sourceIso,
  }));
  await dropPlannerTemporalCardOnDate(sourceCard, targetIso);

  await expect.poll(async () => {
    const card = await cardFrontmatter.readCard(cardPath);
    return card.body;
  }).toContain(`- [ ] (due: ${targetIso}) ${taskText}`);

  const updatedCard = await cardFrontmatter.readCard(cardPath);
  expect(updatedCard.body).not.toContain(`- [ ] (due: ${sourceIso}) ${taskText}`);
  expect(updatedCard.frontmatter.due).toBeUndefined();
  await expect(targetDayCards.locator('.planner-this-week-card').filter({ hasText: taskText })).toBeVisible();
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
  await expect(page.locator('#userInputBoardPath')).toBeVisible();
  await expect(page.locator('#userInputListPath')).toBeVisible();
  await expect(page.locator('#userInputBoardPath option')).toHaveText(['Playwright Board']);
  await expect(page.locator('#modalAddCardToList .new-card-modal-helper')).toContainText('Shift');

  const selectStyle = await page.locator('#userInputBoardPath').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      appearance: style.getPropertyValue('appearance') || style.getPropertyValue('-webkit-appearance'),
    };
  });

  expect(selectStyle.backgroundImage).toContain('data:image/svg+xml');
  expect(selectStyle.appearance).toBe('none');

  const boardToListGap = await getVerticalGap(page.locator('#userInputBoardPath'), page.locator('#userInputListPath'));
  const selectToInputGap = await getVerticalGap(page.locator('#userInputListPath'), page.locator('#userInputCardName'));
  const inputToButtonGap = await getVerticalGap(page.locator('#userInputCardName'), page.locator('#btnAddCardToList'));
  expect(boardToListGap).toBeGreaterThanOrEqual(8);
  expect(selectToInputGap).toBeGreaterThanOrEqual(8);
  expect(inputToButtonGap).toBeGreaterThanOrEqual(6);
});

test('quick add can target another open board', async ({ electronApp, boardRoot }) => {
  const { page, boardRoots } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board']);

  await page.keyboard.press(getShortcut('N'));
  await expect(page.locator('#modalAddCardToList')).toBeVisible();
  await expect(page.locator('#userInputBoardPath option')).toHaveText(['Playwright Board', 'Roadmap Board']);

  await page.locator('#userInputBoardPath').selectOption({ label: 'Roadmap Board' });
  await expect.poll(async () => page.locator('#userInputListPath').inputValue()).toContain('/Roadmap Board/000-To-do-stock/');

  await page.locator('#userInputCardName').fill('Capture roadmap note');
  await page.locator('#btnAddCardToList').click();

  await expect(page.locator('#modalAddCardToList')).toBeHidden();
  await expect(page.locator('#boardName')).toHaveText('Playwright Board');
  await expect.poll(async () => {
    const entries = await fs.readdir(path.join(boardRoots[1], '000-To-do-stock'));
    return entries.some((entry) => entry.includes('capture-roadmap-note'));
  }).toBe(true);

  await page.keyboard.press(getShortcut('N'));
  await page.locator('#userInputBoardPath').selectOption({ label: 'Roadmap Board' });
  await expect.poll(async () => page.locator('#userInputListPath').inputValue()).toContain('/Roadmap Board/000-To-do-stock/');

  await page.locator('#userInputCardName').fill('Open roadmap note');
  await page.keyboard.press('Shift+Enter');

  await expect(page.locator('#modalAddCardToList')).toBeHidden();
  await expect(page.locator('#boardName')).toHaveText('Roadmap Board');
  await expect(page.locator('#modalEditCard')).toBeVisible();
  await expect(page.locator('#cardEditorTitle')).toHaveText('Open roadmap note');
  await expect(page.locator('#cardEditorOverType .overtype-input')).toBeFocused();
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

test('keeps more than six boards open and routes overflow through the switcher', async ({ electronApp, boardRoot }) => {
  const boardNames = [
    'Long Project Alpha',
    'Long Project Beta',
    'Long Project Gamma',
    'Long Project Delta',
    'Long Project Epsilon',
    'Long Project Zeta',
    'Long Project Eta',
  ];
  const { page } = await prepareOpenBoardsPage(electronApp, boardRoot, boardNames);

  await page.setViewportSize({ width: 760, height: 720 });
  await expect(page.locator('#boardTabs .board-tab-more')).toBeVisible();
  await expect(page.locator('#boardTabs .board-tab-add')).toBeVisible();
  await expect(page.locator('#boardTabs .board-tab.is-active .board-tab-label')).toHaveText('Playwright Board');
  await expect.poll(async () => page.evaluate(() => {
    const searchInput = document.getElementById('boardSearchInput');
    const visibleTabs = [...document.querySelectorAll('#boardTabs .board-tab')]
      .filter((tab) => !tab.classList.contains('hidden') && !tab.classList.contains('is-overflow-hidden'));

    if (!searchInput || visibleTabs.length === 0) {
      return false;
    }

    const searchRect = searchInput.getBoundingClientRect();
    const tabRects = visibleTabs.map((tab) => tab.getBoundingClientRect());
    const maxTabRight = Math.max(...tabRects.map((rect) => rect.right));
    const minTabTop = Math.min(...tabRects.map((rect) => rect.top));
    const maxTabBottom = Math.max(...tabRects.map((rect) => rect.bottom));
    const tabsShareSearchRow = maxTabBottom > searchRect.top && searchRect.bottom > minTabTop;

    return tabsShareSearchRow && maxTabRight <= searchRect.left - 1;
  })).toBe(true);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('openBoardPaths') || '[]').length)).toBe(8);

  await page.locator('#boardTabs .board-tab-more .board-tab-label').click();
  await expect(page.locator('#modalBoardSwitcher')).toBeVisible();
  await expect(page.locator('.board-switcher-option')).toHaveCount(8);
  await expect(page.locator('.board-switcher-option-title')).toContainText([
    'Playwright Board',
    ...boardNames,
  ]);

  await page
    .locator('.board-switcher-option')
    .filter({ hasText: 'Long Project Eta' })
    .locator('.board-switcher-close')
    .click();

  await expect(page.locator('.board-switcher-option')).toHaveCount(7);
  await expect(page.locator('#boardSwitcherResults')).not.toContainText('Long Project Eta');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('openBoardPaths') || '[]').length)).toBe(7);
});

test('navigates and closes board tabs from the keyboard', async ({ electronApp, boardRoot }) => {
  const { page } = await prepareOpenBoardsPage(electronApp, boardRoot, ['Roadmap Board', 'Ideas Board']);
  const playwrightTab = page.locator('#boardTabs .board-tab-label').filter({ hasText: 'Playwright Board' });
  const roadmapTab = page.locator('#boardTabs .board-tab-label').filter({ hasText: 'Roadmap Board' });
  const ideasTab = page.locator('#boardTabs .board-tab-label').filter({ hasText: 'Ideas Board' });

  await playwrightTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(roadmapTab).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#boardName')).toHaveText('Roadmap Board');
  await expect(page.locator('#boardTabs .board-tab.is-active .board-tab-label')).toHaveText('Roadmap Board');

  await page.keyboard.press('ArrowRight');
  await expect(ideasTab).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#boardTabs')).not.toContainText('Ideas Board');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('openBoardPaths') || '[]').length)).toBe(2);
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
  await expect.poll(async () => page.evaluate(() => {
    const bodyFont = getComputedStyle(document.body).fontFamily;
    return [
      '.planner-view-tab',
      '.planner-scope-option',
      '#plannerScopeLabel',
      '#plannerFilterButton',
    ].every((selector) => {
      const element = document.querySelector(selector);
      return element && getComputedStyle(element).fontFamily === bodyFont;
    });
  })).toBe(true);

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

  const plannerSearchInput = page.locator('#plannerSearchInput');
  const plannerPolishCard = page.locator('.planner-calendar-card').filter({ hasText: 'Polish homepage copy' });
  await plannerSearchInput.focus();
  await plannerSearchInput.fill('polish');
  await page.keyboard.press('Enter');
  await expect(plannerPolishCard).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(plannerSearchInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(plannerSearchInput).toHaveValue('');
  await expect(page.locator('.planner-calendar-card').filter({ hasText: 'Plan release notes' })).toBeVisible();

  await page.locator('#plannerFilterButton').click();
  await expect(page.locator('#plannerFilterPopover').getByRole('button', { name: 'All dated cards' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#plannerFilterPopover').getByRole('button', { name: 'Today' })).toBeFocused();
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

  const switchLabelStyles = await page.locator('label[for="boardSettingsTooltipsToggle"]').evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      display: styles.display,
      marginBottom: styles.marginBottom,
      textTransform: styles.textTransform,
    };
  });
  expect(switchLabelStyles.display).toContain('flex');
  expect(switchLabelStyles.marginBottom).toBe('0px');
  expect(switchLabelStyles.textTransform).toBe('none');

  const notificationsDetails = page.locator('#boardSettingsNotificationsDetails');
  await expect(notificationsDetails).toBeHidden();
  await expect(notificationsDetails).toHaveAttribute('aria-hidden', 'true');

  await page.locator('label[for="boardSettingsNotificationsToggle"]').click();
  await expect(notificationsDetails).toBeVisible();
  await expect(notificationsDetails).toHaveAttribute('aria-hidden', 'false');

  await page.locator('label[for="boardSettingsNotificationsToggle"]').click();
  await expect(notificationsDetails).toBeHidden();
  await expect(notificationsDetails).toHaveAttribute('aria-hidden', 'true');
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

test('navigates archive browser results from search with the keyboard', async ({ page, boardRoot }) => {
  await openFirstCardInEditor(page);
  await page.keyboard.press(getArchiveCardShortcut());
  await expect.poll(async () => {
    return await pathExists(path.join(boardRoot, 'XXX-Archive', '000-plan-release-stock.md'));
  }).toBe(true);

  await page.keyboard.press(getShortcut('Shift+A'));
  const searchInput = page.locator('#archiveBrowserSearchInput');
  const archiveRow = page.locator('.archive-browser-row').filter({ hasText: 'Plan release notes' });

  await expect(searchInput).toBeFocused();
  await searchInput.fill('release');
  await page.keyboard.press('Enter');
  await expect(archiveRow).toBeFocused();
  await expect(page.locator('#archiveBrowserDetail')).toContainText('Plan release notes');

  await page.keyboard.press('Escape');
  await expect(searchInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(searchInput).toHaveValue('');
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

test('persists the global quick add shortcut setting', async ({ page }) => {
  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();

  const shortcutInput = page.locator('#boardSettingsQuickAddShortcut');
  const shortcutStatus = page.locator('#boardSettingsQuickAddShortcutStatus');

  await expect(shortcutInput).toHaveValue('');
  await expect(shortcutStatus).toContainText('Disabled');

  await shortcutInput.fill(' CommandOrControl + Shift + Space ');
  await shortcutInput.blur();

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.electronAPI.readAppSettings();
      return settings.quickAdd.globalShortcut;
    });
  }).toBe('CommandOrControl+Shift+Space');
  await expect(shortcutInput).toHaveValue('CommandOrControl+Shift+Space');
});

test('publishes the External Published Calendar and respects board opt-out', async ({ page, boardRoot, request }) => {
  await cardFrontmatter.updateFrontmatter(
    path.join(boardRoot, '000-To-do-stock', '000-plan-release-stock.md'),
    { due: '2026-04-05' },
  );

  await openBoardMenu(page);
  await page.locator('#openBoardSettings').click();
  await expect(page.locator('#modalBoardSettings')).toBeVisible();

  const calendarToggle = page.locator('#boardSettingsExternalCalendarToggle');
  const calendarStatus = page.locator('#boardSettingsExternalCalendarStatus');
  const calendarPortGroup = page.locator('#boardSettingsExternalCalendarPortGroup');
  const calendarUrlGroup = page.locator('#boardSettingsExternalCalendarUrlGroup');
  const calendarUrlInput = page.locator('#boardSettingsExternalCalendarUrl');

  await expect(calendarToggle).not.toBeChecked();
  await expect(calendarPortGroup).toBeHidden();
  await expect(calendarPortGroup).toHaveAttribute('aria-hidden', 'true');
  await expect(calendarUrlGroup).toBeHidden();
  await expect(calendarUrlGroup).toHaveAttribute('aria-hidden', 'true');

  await page.locator('label[for="boardSettingsExternalCalendarToggle"]').click();
  await expect(calendarToggle).toBeChecked();
  await expect(calendarPortGroup).toBeVisible();
  await expect(calendarPortGroup).toHaveAttribute('aria-hidden', 'false');
  await expect(calendarUrlGroup).toBeVisible();
  await expect(calendarUrlGroup).toHaveAttribute('aria-hidden', 'false');

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.electronAPI.readAppSettings();
      return {
        enabled: settings.externalPublishedCalendar.enabled,
        running: settings.externalPublishedCalendarStatus.running,
        url: settings.externalPublishedCalendarStatus.url,
      };
    });
  }).toMatchObject({
    enabled: true,
    running: true,
  });

  await expect(calendarStatus).toContainText('Publishing');
  await expect(calendarUrlInput).toHaveValue(/http:\/\/127\.0\.0\.1:48273\/external-published-calendar\/.+\.ics/);

  const calendarUrl = await calendarUrlInput.inputValue();
  const response = await request.get(calendarUrl);
  expect(response.ok()).toBe(true);
  const feed = await response.text();
  expect(feed).toContain('BEGIN:VCALENDAR');
  expect(feed).toContain('SUMMARY:Plan release notes');

  await page.locator('#boardSettingsNavWorkflow').click();
  const includeToggle = page.locator('#boardSettingsExternalCalendarIncludeToggle');
  await expect(includeToggle).toBeChecked();
  await page.locator('label[for="boardSettingsExternalCalendarIncludeToggle"]').click();
  await expect(includeToggle).not.toBeChecked();
  await page.locator('#boardSettingsClose').click();
  await expect(page.locator('#modalBoardSettings')).toBeHidden();

  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const settings = await window.board.readBoardSettings(window.boardRoot);
      return settings.externalPublishedCalendar.include;
    });
  }).toBe(false);

  const optedOutResponse = await request.get(calendarUrl);
  expect(optedOutResponse.ok()).toBe(true);
  const optedOutFeed = await optedOutResponse.text();
  expect(optedOutFeed).not.toContain('SUMMARY:Plan release notes');
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
