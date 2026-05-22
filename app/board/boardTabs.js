const OPEN_BOARDS_STORAGE_KEY = 'openBoardPaths';
const ACTIVE_BOARD_STORAGE_KEY = 'activeBoardPath';
const BOARD_TABS_CONTROLS_GAP_PX = 12;
let boardTabsSortable = null;
let boardTabsOverflowFrameId = null;
let boardTabsResizeListenerInitialized = false;

function normalizeBoardPath(dir) {
    if (!dir || typeof dir !== 'string') {
        return '';
    }

    const normalizedDir = dir.replace(/\\/g, '/').trim();
    if (!normalizedDir) {
        return '';
    }

    return normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
}

function getDirectorySelectionPath(selection) {
    if (!selection) {
        return '';
    }

    if (typeof selection === 'string') {
        return normalizeBoardPath(selection);
    }

    if (selection && typeof selection === 'object' && typeof selection.path === 'string') {
        return normalizeBoardPath(selection.path);
    }

    return '';
}

async function authorizeBoardAccess(selection) {
    const normalizedPath = getDirectorySelectionPath(selection);
    if (!normalizedPath || !window.board) {
        return '';
    }

    let result = null;
    if (
        selection &&
        typeof selection === 'object' &&
        typeof selection.token === 'string' &&
        typeof window.board.authorizeBoardSelection === 'function'
    ) {
        result = await window.board.authorizeBoardSelection(selection.token);
    } else if (typeof window.board.setActiveBoardRoot === 'function') {
        result = await window.board.setActiveBoardRoot(normalizedPath);
    }

    if (result && result.ok && typeof result.boardRoot === 'string') {
        return normalizeBoardPath(result.boardRoot);
    }

    return result && result.ok ? normalizedPath : '';
}

async function clearAuthorizedBoardAccess() {
    if (!window.board || typeof window.board.clearActiveBoardRoot !== 'function') {
        return;
    }

    await window.board.clearActiveBoardRoot();
}

function getBoardLabelFromPath(boardPath) {
    const normalizedPath = normalizeBoardPath(boardPath).replace(/\/+$/, '');
    const pathParts = normalizedPath.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1] || 'Board';
}

function sanitizeOpenBoards(openBoards) {
    const uniqueBoards = [];

    for (const boardPath of Array.isArray(openBoards) ? openBoards : []) {
        const normalizedPath = normalizeBoardPath(boardPath);
        if (!normalizedPath) {
            continue;
        }

        if (uniqueBoards.includes(normalizedPath)) {
            continue;
        }

        uniqueBoards.push(normalizedPath);
    }

    return uniqueBoards;
}

function getStoredOpenBoards() {
    let openBoards = [];

    try {
        const raw = localStorage.getItem(OPEN_BOARDS_STORAGE_KEY);
        openBoards = JSON.parse(raw) || [];
    } catch {
        openBoards = [];
    }

    return sanitizeOpenBoards(openBoards);
}

function setStoredOpenBoards(openBoards) {
    localStorage.setItem(OPEN_BOARDS_STORAGE_KEY, JSON.stringify(sanitizeOpenBoards(openBoards)));
}

function getStoredActiveBoard() {
    return normalizeBoardPath(localStorage.getItem(ACTIVE_BOARD_STORAGE_KEY) || localStorage.getItem('boardPath'));
}

function setStoredActiveBoard(boardPath) {
    const normalizedPath = normalizeBoardPath(boardPath);
    localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, normalizedPath);
    localStorage.setItem('boardPath', normalizedPath);
}

function ensureBoardInTabs(boardPath) {
    const normalizedPath = normalizeBoardPath(boardPath);
    const openBoards = getStoredOpenBoards();

    if (openBoards.includes(normalizedPath)) {
        return {
            openBoards,
            added: false,
        };
    }

    const updatedOpenBoards = [...openBoards, normalizedPath];
    setStoredOpenBoards(updatedOpenBoards);
    return {
        openBoards: updatedOpenBoards,
        added: true,
    };
}

function replaceStoredBoardPath(previousPath, nextPath) {
    const normalizedPreviousPath = normalizeBoardPath(previousPath);
    const normalizedNextPath = normalizeBoardPath(nextPath);

    if (!normalizedPreviousPath || !normalizedNextPath) {
        return false;
    }

    if (normalizedPreviousPath === normalizedNextPath) {
        return true;
    }

    const openBoards = getStoredOpenBoards();
    const previousIndex = openBoards.indexOf(normalizedPreviousPath);
    if (previousIndex === -1) {
        return false;
    }

    const updatedOpenBoards = openBoards.filter((path) => path !== normalizedPreviousPath);
    if (!updatedOpenBoards.includes(normalizedNextPath)) {
        updatedOpenBoards.splice(Math.min(previousIndex, updatedOpenBoards.length), 0, normalizedNextPath);
    }

    setStoredOpenBoards(updatedOpenBoards);

    if (normalizeBoardPath(window.boardRoot) === normalizedPreviousPath) {
        window.boardRoot = normalizedNextPath;
    }

    if (getStoredActiveBoard() === normalizedPreviousPath) {
        setStoredActiveBoard(normalizedNextPath);
    }

    return true;
}

function clearRenderedBoard() {
    if (typeof setBoardChromeState === 'function') {
        setBoardChromeState(false);
    }

    if (typeof renderBoardEmptyState === 'function') {
        renderBoardEmptyState();
        return;
    }

    const boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.innerHTML = '';
    }
}

async function prepareForBoardSwitch() {
    if (typeof closeBoardSwitcher === 'function') {
        closeBoardSwitcher();
    }
    if (typeof hideShortcutHelpModal === 'function') {
        hideShortcutHelpModal();
    }
    if (typeof closeBoardMenuPopover === 'function') {
        closeBoardMenuPopover();
    }
    if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' }, { skipRerender: true });
    }
}

async function switchToBoardPath(boardPath) {
    const normalizedPath = normalizeBoardPath(boardPath);
    if (!normalizedPath) {
        return false;
    }

    if (normalizeBoardPath(window.boardRoot) === normalizedPath) {
        setStoredActiveBoard(normalizedPath);
        renderBoardTabs();
        if (typeof announceSignboardStatus === 'function') {
            announceSignboardStatus(`Current board: ${getBoardLabelFromPath(normalizedPath)}.`);
        }
        return true;
    }

    await prepareForBoardSwitch();

    const authorizedBoardPath = await authorizeBoardAccess(normalizedPath);
    if (!authorizedBoardPath) {
        return false;
    }

    window.boardRoot = authorizedBoardPath;
    setStoredActiveBoard(authorizedBoardPath);
    if (typeof resetBoardLabelFilter === 'function') {
        resetBoardLabelFilter();
    }
    if (typeof resetBoardSearch === 'function') {
        resetBoardSearch();
    }
    await renderBoard();
    if (typeof announceSignboardStatus === 'function') {
        announceSignboardStatus(`Switched to ${getBoardLabelFromPath(authorizedBoardPath)}.`);
    }
    return true;
}

async function closeBoardTab(boardPath) {
    if (typeof closeBoardSettingsModal === 'function') {
        await closeBoardSettingsModal();
    } else if (typeof flushBoardSettingsSave === 'function') {
        await flushBoardSettingsSave();
    } else if (typeof flushBoardLabelSettingsSave === 'function') {
        await flushBoardLabelSettingsSave();
    }

    if (typeof closeArchiveBrowserModal === 'function') {
        closeArchiveBrowserModal();
    }

    const normalizedPath = normalizeBoardPath(boardPath);
    const openBoards = getStoredOpenBoards();
    const removedIndex = openBoards.indexOf(normalizedPath);
    if (removedIndex === -1) {
        return;
    }

    const updatedOpenBoards = openBoards.filter((path) => path !== normalizedPath);
    setStoredOpenBoards(updatedOpenBoards);

    const activeBoard = normalizeBoardPath(window.boardRoot || getStoredActiveBoard());
    const closedActiveBoard = activeBoard === normalizedPath;

    if (updatedOpenBoards.length === 0) {
        await clearAuthorizedBoardAccess();
        window.boardRoot = '';
        setStoredActiveBoard('');
        renderBoardTabs();
        if (typeof ensureBoardLabelsLoaded === 'function') {
            await ensureBoardLabelsLoaded();
        }
        clearRenderedBoard();
        return;
    }

    if (!closedActiveBoard) {
        renderBoardTabs();
        return;
    }

    const nextActiveIndex = Math.min(removedIndex, updatedOpenBoards.length - 1);
    const nextActiveBoard = updatedOpenBoards[nextActiveIndex];
    const authorizedBoardPath = await authorizeBoardAccess(nextActiveBoard);
    if (!authorizedBoardPath) {
        await clearAuthorizedBoardAccess();
        window.boardRoot = '';
        setStoredActiveBoard('');
        renderBoardTabs();
        clearRenderedBoard();
        return;
    }

    window.boardRoot = authorizedBoardPath;
    setStoredActiveBoard(authorizedBoardPath);
    if (typeof resetBoardLabelFilter === 'function') {
        resetBoardLabelFilter();
    }
    if (typeof resetBoardSearch === 'function') {
        resetBoardSearch();
    }
    await renderBoard();
}

function initializeBoardTabsSortable(tabsEl, canSortTabs = true) {
    if (boardTabsSortable && (!tabsEl || boardTabsSortable.el !== tabsEl || !canSortTabs)) {
        boardTabsSortable.destroy();
        boardTabsSortable = null;
    }

    if (!canSortTabs || !tabsEl || typeof Sortable !== 'function' || boardTabsSortable) {
        return;
    }

    boardTabsSortable = new Sortable(tabsEl, {
        animation: (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) ? 0 : 150,
        draggable: '.board-tab[data-board-path]',
        filter: '.board-tab-close',
        preventOnFilter: false,
        ghostClass: 'board-tab--ghost',
        chosenClass: 'board-tab--chosen',
        dragClass: 'board-tab--dragging',
        onEnd: (evt) => {
            if (evt.oldIndex === evt.newIndex) {
                return;
            }

            const reorderedBoards = [...tabsEl.querySelectorAll('.board-tab[data-board-path]')]
                .map((tab) => normalizeBoardPath(tab.getAttribute('data-board-path')))
                .filter(Boolean);

            setStoredOpenBoards(reorderedBoards);
            renderBoardTabs();
        }
    });
}

function restoreBoardTabs() {
    const storedActiveBoard = getStoredActiveBoard();
    let openBoards = getStoredOpenBoards();

    if (openBoards.length === 0 && storedActiveBoard) {
        openBoards = [storedActiveBoard];
        setStoredOpenBoards(openBoards);
    }

    if (openBoards.length === 0) {
        renderBoardTabs();
        return '';
    }

    const activeBoard = openBoards.includes(storedActiveBoard) ? storedActiveBoard : openBoards[0];
    setStoredActiveBoard(activeBoard);
    return activeBoard;
}

async function promptAndOpenBoardFromTabs() {
    if (typeof pickAndOpenBoard === 'function') {
        await pickAndOpenBoard();
        return;
    }

    if (!window.chooser || typeof window.chooser.pickDirectory !== 'function') {
        return;
    }

    const dir = await window.chooser.pickDirectory({});
    if (dir) {
        await openBoard(dir);
    }
}

function isBoardTabElementVisible(tabElement) {
    if (!(tabElement instanceof HTMLElement)) {
        return false;
    }

    if (
        tabElement.classList.contains('hidden') ||
        tabElement.classList.contains('is-overflow-hidden') ||
        tabElement.getAttribute('aria-hidden') === 'true'
    ) {
        return false;
    }

    const style = window.getComputedStyle(tabElement);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function getVisibleBoardTabLabelButtons() {
    const tabsEl = document.getElementById('boardTabs');
    if (!tabsEl) {
        return [];
    }

    return Array.from(tabsEl.querySelectorAll('.board-tab-label'))
        .filter((button) => button instanceof HTMLButtonElement)
        .filter((button) => !button.disabled)
        .filter((button) => isBoardTabElementVisible(button.closest('.board-tab')));
}

function focusBoardTabLabelByIndex(index) {
    const buttons = getVisibleBoardTabLabelButtons();
    if (buttons.length === 0) {
        return false;
    }

    const safeIndex = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons[safeIndex].focus();
    return true;
}

function focusBoardTabLabelByPath(boardPath) {
    const normalizedPath = normalizeBoardPath(boardPath);
    if (!normalizedPath) {
        return false;
    }

    const button = getVisibleBoardTabLabelButtons()
        .find((candidate) => {
            const tabElement = candidate.closest('.board-tab[data-board-path]');
            return tabElement && normalizeBoardPath(tabElement.getAttribute('data-board-path')) === normalizedPath;
        });

    if (!button) {
        return false;
    }

    button.focus();
    return true;
}

function moveBoardTabLabelFocus(button, offset) {
    const buttons = getVisibleBoardTabLabelButtons();
    if (buttons.length === 0) {
        return false;
    }

    const currentIndex = buttons.indexOf(button);
    const fallbackIndex = Number(offset) < 0 ? buttons.length - 1 : 0;
    const nextIndex = currentIndex >= 0 ? currentIndex + Number(offset || 0) : fallbackIndex;
    return focusBoardTabLabelByIndex(nextIndex);
}

async function closeBoardTabFromKeyboard(button) {
    if (!(button instanceof HTMLButtonElement)) {
        return false;
    }

    const tabElement = button.closest('.board-tab[data-board-path]');
    const boardPath = tabElement ? normalizeBoardPath(tabElement.getAttribute('data-board-path')) : '';
    if (!boardPath) {
        return false;
    }

    const buttonsBeforeClose = getVisibleBoardTabLabelButtons();
    const currentIndex = Math.max(0, buttonsBeforeClose.indexOf(button));
    await closeBoardTab(boardPath);
    focusBoardTabLabelByIndex(Math.min(currentIndex, getVisibleBoardTabLabelButtons().length - 1));
    return true;
}

function handleBoardTabLabelKeydown(event) {
    if (!event || !(event.currentTarget instanceof HTMLButtonElement)) {
        return;
    }

    const button = event.currentTarget;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        moveBoardTabLabelFocus(button, 1);
        return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        moveBoardTabLabelFocus(button, -1);
        return;
    }

    if (event.key === 'Home') {
        event.preventDefault();
        event.stopPropagation();
        focusBoardTabLabelByIndex(0);
        return;
    }

    if (event.key === 'End') {
        event.preventDefault();
        event.stopPropagation();
        focusBoardTabLabelByIndex(getVisibleBoardTabLabelButtons().length - 1);
        return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
        const tabElement = button.closest('.board-tab[data-board-path]');
        if (!tabElement) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        closeBoardTabFromKeyboard(button).catch((error) => {
            console.error('Failed to close board tab from keyboard.', error);
        });
    }
}

function createBoardTabElement(boardPath, activeBoard) {
    const boardLabel = getBoardLabelFromPath(boardPath);
    const boardTab = document.createElement('div');
    boardTab.classList.add('board-tab');
    boardTab.setAttribute('data-board-path', boardPath);
    boardTab.setAttribute('role', 'presentation');
    boardTab.title = boardPath;

    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.classList.add('board-tab-label');
    tabButton.textContent = boardLabel;
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-selected', boardPath === activeBoard ? 'true' : 'false');
    tabButton.setAttribute('aria-label', `Open ${boardLabel} board`);

    if (boardPath === activeBoard) {
        boardTab.classList.add('is-active');
    }

    tabButton.addEventListener('click', async (event) => {
        const restoreFocus = event.detail === 0;
        await switchToBoardPath(boardPath);
        if (restoreFocus) {
            focusBoardTabLabelByPath(boardPath);
        }
    });
    tabButton.addEventListener('keydown', handleBoardTabLabelKeydown);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.classList.add('board-tab-close');
    closeButton.setAttribute('aria-label', `Close ${boardLabel} board`);
    closeButton.title = `Close ${boardLabel}`;
    closeButton.textContent = '×';
    closeButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await closeBoardTab(boardPath);
    });

    boardTab.appendChild(tabButton);
    boardTab.appendChild(closeButton);
    return boardTab;
}

function createBoardOverflowTabElement() {
    const overflowTab = document.createElement('div');
    overflowTab.classList.add('board-tab', 'board-tab-more', 'hidden');
    overflowTab.setAttribute('role', 'presentation');

    const overflowButton = document.createElement('button');
    overflowButton.type = 'button';
    overflowButton.classList.add('board-tab-label', 'board-tab-more-label');
    overflowButton.textContent = 'More';
    overflowButton.setAttribute('aria-label', 'Show more open boards');
    overflowButton.setAttribute('aria-haspopup', 'dialog');
    overflowButton.title = 'Show more open boards';
    overflowButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof openBoardSwitcher === 'function') {
            openBoardSwitcher();
        }
    });
    overflowButton.addEventListener('keydown', handleBoardTabLabelKeydown);

    overflowTab.appendChild(overflowButton);
    return overflowTab;
}

function createAddBoardTabElement() {
    const addBoardTab = document.createElement('div');
    addBoardTab.classList.add('board-tab', 'board-tab-add');
    addBoardTab.setAttribute('role', 'presentation');

    const addBoardButton = document.createElement('button');
    addBoardButton.type = 'button';
    addBoardButton.classList.add('board-tab-label', 'board-tab-add-label');
    addBoardButton.textContent = '+ Add Board';
    addBoardButton.setAttribute('aria-label', 'Add board');
    addBoardButton.title = 'Add board';
    addBoardButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await promptAndOpenBoardFromTabs();
    });
    addBoardButton.addEventListener('keydown', handleBoardTabLabelKeydown);

    addBoardTab.appendChild(addBoardButton);
    return addBoardTab;
}

function getBoardTabGap(tabsEl) {
    if (!tabsEl || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
        return 0;
    }

    const styles = window.getComputedStyle(tabsEl);
    return parseFloat(styles.columnGap || styles.gap || '0') || 0;
}

function getBoardTabWidth(tab) {
    if (!tab || typeof tab.getBoundingClientRect !== 'function') {
        return 0;
    }

    return tab.getBoundingClientRect().width;
}

function getBoardTabsTotalWidth(tabWidths, gap) {
    const widths = Array.isArray(tabWidths) ? tabWidths.filter((width) => width > 0) : [];
    if (widths.length === 0) {
        return 0;
    }

    return widths.reduce((total, width) => total + width, 0) + (gap * Math.max(0, widths.length - 1));
}

function getBoardTabsAvailableWidth(tabsWrapper) {
    if (!tabsWrapper || typeof tabsWrapper.getBoundingClientRect !== 'function') {
        return 0;
    }

    let availableWidth = tabsWrapper.clientWidth;
    const controlsEl = document.querySelector('body:not(.board-empty) .headerTopRow');
    if (!controlsEl || typeof controlsEl.getBoundingClientRect !== 'function') {
        return availableWidth;
    }

    const wrapperRect = tabsWrapper.getBoundingClientRect();
    const controlsRect = controlsEl.getBoundingClientRect();
    const rowsOverlap = wrapperRect.bottom > controlsRect.top && controlsRect.bottom > wrapperRect.top;
    if (!rowsOverlap || controlsRect.left <= wrapperRect.left) {
        return availableWidth;
    }

    const controlsLimitedWidth = controlsRect.left - wrapperRect.left - BOARD_TABS_CONTROLS_GAP_PX;
    return Math.max(0, Math.min(availableWidth, controlsLimitedWidth));
}

function getBoardTabPriority(openBoards, activeBoard) {
    const activeIndex = Math.max(0, openBoards.indexOf(activeBoard));
    const priority = [];

    if (openBoards[activeIndex]) {
        priority.push(openBoards[activeIndex]);
    }

    for (let offset = 1; offset < openBoards.length; offset += 1) {
        const previous = openBoards[activeIndex - offset];
        const next = openBoards[activeIndex + offset];

        if (previous) {
            priority.push(previous);
        }
        if (next) {
            priority.push(next);
        }
    }

    return priority;
}

function setBoardTabsOverflowCount(overflowTab, hiddenCount) {
    const overflowButton = overflowTab ? overflowTab.querySelector('.board-tab-more-label') : null;
    if (!overflowTab || !overflowButton) {
        return;
    }

    const overflowLabel = `${hiddenCount} more`;
    overflowButton.textContent = overflowLabel;
    overflowButton.setAttribute('aria-label', `Show ${hiddenCount} more open ${hiddenCount === 1 ? 'board' : 'boards'}`);
    overflowButton.title = `Show ${hiddenCount} more open ${hiddenCount === 1 ? 'board' : 'boards'}`;
}

function updateBoardTabsOverflow() {
    boardTabsOverflowFrameId = null;

    const tabsWrapper = document.getElementById('boardTabsWrapper');
    const tabsEl = document.getElementById('boardTabs');
    if (!tabsWrapper || !tabsEl || tabsWrapper.classList.contains('hidden')) {
        return;
    }

    const openBoards = getStoredOpenBoards();
    const activeBoard = normalizeBoardPath(window.boardRoot || getStoredActiveBoard());
    const boardTabs = [...tabsEl.querySelectorAll('.board-tab[data-board-path]')];
    const addBoardTab = tabsEl.querySelector('.board-tab-add');
    const overflowTab = tabsEl.querySelector('.board-tab-more');
    if (openBoards.length === 0 || boardTabs.length === 0 || !addBoardTab || !overflowTab) {
        return;
    }

    boardTabs.forEach((tab) => {
        tab.classList.remove('is-overflow-hidden');
        tab.style.removeProperty('max-width');
    });
    overflowTab.classList.remove('hidden');
    setBoardTabsOverflowCount(overflowTab, Math.max(1, openBoards.length - 1));
    overflowTab.style.visibility = 'hidden';

    const availableWidth = getBoardTabsAvailableWidth(tabsWrapper);
    const gap = getBoardTabGap(tabsEl);
    const boardTabWidths = new Map(boardTabs.map((tab) => [
        normalizeBoardPath(tab.getAttribute('data-board-path')),
        getBoardTabWidth(tab),
    ]));
    const addBoardTabWidth = getBoardTabWidth(addBoardTab);
    const overflowTabWidth = getBoardTabWidth(overflowTab);
    const allBoardWidths = openBoards.map((boardPath) => boardTabWidths.get(boardPath) || 0);
    const allTabsWidth = getBoardTabsTotalWidth([...allBoardWidths, addBoardTabWidth], gap);

    if (allTabsWidth <= availableWidth) {
        overflowTab.style.visibility = '';
        overflowTab.classList.add('hidden');
        boardTabs.forEach((tab) => {
            tab.classList.remove('is-overflow-hidden');
            tab.removeAttribute('aria-hidden');
        });
        return;
    }

    const visibleBoards = new Set();
    let visibleWidths = [];
    const priority = getBoardTabPriority(openBoards, openBoards.includes(activeBoard) ? activeBoard : openBoards[0]);

    for (const boardPath of priority) {
        const tabWidth = boardTabWidths.get(boardPath) || 0;
        const nextWidths = [...visibleWidths, tabWidth, overflowTabWidth, addBoardTabWidth];
        const nextTotalWidth = getBoardTabsTotalWidth(nextWidths, gap);

        if (visibleBoards.size === 0 || nextTotalWidth <= availableWidth) {
            visibleBoards.add(boardPath);
            visibleWidths = [...visibleWidths, tabWidth];
        }
    }

    const hiddenCount = Math.max(0, openBoards.length - visibleBoards.size);
    setBoardTabsOverflowCount(overflowTab, hiddenCount);
    overflowTab.style.visibility = '';
    overflowTab.classList.toggle('hidden', hiddenCount === 0);

    const visibleBoardTabs = boardTabs.filter((tab) => visibleBoards.has(normalizeBoardPath(tab.getAttribute('data-board-path'))));
    if (hiddenCount > 0 && visibleBoardTabs.length > 0) {
        const fixedTabWidths = overflowTabWidth + addBoardTabWidth;
        const visibleItemCount = visibleBoardTabs.length + 2;
        const availableBoardTabWidth = availableWidth - fixedTabWidths - (gap * Math.max(0, visibleItemCount - 1));
        const maxBoardTabWidth = Math.floor(availableBoardTabWidth / visibleBoardTabs.length);

        if (maxBoardTabWidth > 0) {
            visibleBoardTabs.forEach((tab) => {
                tab.style.maxWidth = `${Math.min(180, maxBoardTabWidth)}px`;
            });
        }
    }

    boardTabs.forEach((tab) => {
        const boardPath = normalizeBoardPath(tab.getAttribute('data-board-path'));
        const isVisible = visibleBoards.has(boardPath);
        tab.classList.toggle('is-overflow-hidden', !isVisible);
        if (isVisible) {
            tab.removeAttribute('aria-hidden');
        } else {
            tab.setAttribute('aria-hidden', 'true');
        }
    });
}

function scheduleBoardTabsOverflowUpdate() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        updateBoardTabsOverflow();
        return;
    }

    if (boardTabsOverflowFrameId) {
        window.cancelAnimationFrame(boardTabsOverflowFrameId);
    }

    boardTabsOverflowFrameId = window.requestAnimationFrame(updateBoardTabsOverflow);
}

function ensureBoardTabsResizeListener() {
    if (boardTabsResizeListenerInitialized || typeof window === 'undefined') {
        return;
    }

    boardTabsResizeListenerInitialized = true;
    window.addEventListener('resize', scheduleBoardTabsOverflowUpdate);
}

function renderBoardTabs() {
    const tabsWrapper = document.getElementById('boardTabsWrapper');
    const tabsEl = document.getElementById('boardTabs');
    if (!tabsWrapper || !tabsEl) {
        return;
    }

    const openBoards = getStoredOpenBoards();

    tabsEl.innerHTML = '';
    if (openBoards.length === 0) {
        tabsWrapper.classList.add('hidden');
        initializeBoardTabsSortable(null, false);
        if (typeof syncPlannerAvailability === 'function') {
            syncPlannerAvailability();
        }
        return;
    }

    tabsWrapper.classList.remove('hidden');
    const activeBoard = normalizeBoardPath(window.boardRoot || getStoredActiveBoard());

    for (const boardPath of openBoards) {
        tabsEl.appendChild(createBoardTabElement(boardPath, activeBoard));
    }

    tabsEl.appendChild(createBoardOverflowTabElement());
    tabsEl.appendChild(createAddBoardTabElement());

    initializeBoardTabsSortable(tabsEl, openBoards.length > 1);
    ensureBoardTabsResizeListener();
    scheduleBoardTabsOverflowUpdate();
    if (typeof syncPlannerAvailability === 'function') {
        syncPlannerAvailability();
    }
}
