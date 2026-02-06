<<<<<<< ours
const BOARD_TABS_STORAGE_KEY = 'boardTabs';

function getBoardTabsState() {
    if (!window.__boardTabsState) {
        window.__boardTabsState = {
            tabs: [],
            activeRoot: '',
            sortable: null,
        };
    }

    return window.__boardTabsState;
}

function normalizeBoardRoot(boardPath) {
    const normalized = String(boardPath || '').trim();
    if (!normalized) {
        return '';
    }

    return normalized.replace(/[\\/]+$/, '') + '/';
}

function getBoardDirectoryPath(boardRoot) {
    return normalizeBoardRoot(boardRoot).replace(/[\\/]+$/, '');
}

function getBoardNameFallback(boardRoot) {
    const cleaned = String(boardRoot || '').replace(/[\\/]+$/, '');
    const segments = cleaned.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] || 'Board';
}

function parseStoredBoardTabs(rawValue) {
    if (!rawValue) {
        return [];
    }

    let parsed = [];
    try {
        parsed = JSON.parse(rawValue);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    const tabs = [];
    const seenRoots = new Set();
    for (const entry of parsed) {
        const rootValue = typeof entry === 'string' ? entry : entry && entry.root;
        const root = normalizeBoardRoot(rootValue);
        if (!root || seenRoots.has(root)) {
            continue;
        }

        const fallbackName = getBoardNameFallback(root);
        const name =
            entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.trim().length > 0
                ? entry.name.trim()
                : fallbackName;

        tabs.push({ root, name });
        seenRoots.add(root);
    }

    return tabs;
}

function persistBoardTabs() {
    const state = getBoardTabsState();
    const serializableTabs = state.tabs.map((tab) => ({
        root: tab.root,
        name: tab.name || getBoardNameFallback(tab.root),
    }));

    localStorage.setItem(BOARD_TABS_STORAGE_KEY, JSON.stringify(serializableTabs));

    if (state.activeRoot) {
        localStorage.setItem('boardPath', state.activeRoot);
    } else {
        localStorage.removeItem('boardPath');
    }
}

function upsertBoardTab(boardRoot, boardName) {
    const root = normalizeBoardRoot(boardRoot);
    if (!root) {
        return null;
    }

    const state = getBoardTabsState();
    const existingTab = state.tabs.find((tab) => tab.root === root);
    const nextName = String(boardName || '').trim() || getBoardNameFallback(root);

    if (existingTab) {
        existingTab.name = nextName;
        return existingTab;
    }

    const newTab = { root, name: nextName };
    state.tabs.push(newTab);
    return newTab;
}

function setActiveBoardTab(boardRoot) {
    const root = normalizeBoardRoot(boardRoot);
    const state = getBoardTabsState();
    state.activeRoot = root;
}

function renderBoardTabs() {
    const tabsContainer = document.getElementById('boardTabs');
    if (!tabsContainer) {
        return;
    }

    const state = getBoardTabsState();
    tabsContainer.innerHTML = '';

    for (const tab of state.tabs) {
        const tabEl = document.createElement('div');
        tabEl.className = 'board-tab';
        tabEl.dataset.boardRoot = tab.root;
        if (tab.root === state.activeRoot) {
            tabEl.classList.add('is-active');
        }

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'board-tab-open';
        openButton.dataset.boardRoot = tab.root;
        openButton.textContent = tab.name || getBoardNameFallback(tab.root);
        openButton.title = tab.root;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'board-tab-close';
        closeButton.dataset.boardRoot = tab.root;
        closeButton.setAttribute('aria-label', `Close ${openButton.textContent}`);
        closeButton.title = `Close ${openButton.textContent}`;
        closeButton.textContent = 'x';

        tabEl.appendChild(openButton);
        tabEl.appendChild(closeButton);
        tabsContainer.appendChild(tabEl);
    }
}

function reorderTabsFromDom() {
    const tabsContainer = document.getElementById('boardTabs');
    if (!tabsContainer) {
        return;
    }

    const state = getBoardTabsState();
    const existingByRoot = new Map(state.tabs.map((tab) => [tab.root, tab]));
    const reorderedRoots = [...tabsContainer.querySelectorAll('.board-tab')]
        .map((tabEl) => normalizeBoardRoot(tabEl.dataset.boardRoot))
        .filter(Boolean);

    state.tabs = reorderedRoots
        .map((root) => existingByRoot.get(root))
        .filter(Boolean);

    persistBoardTabs();
}

function restoreBoardTabsFromStorage() {
    const state = getBoardTabsState();
    const storedTabs = parseStoredBoardTabs(localStorage.getItem(BOARD_TABS_STORAGE_KEY));
    const legacyBoardPath = normalizeBoardRoot(localStorage.getItem('boardPath'));
    const tabMap = new Map(storedTabs.map((tab) => [tab.root, tab]));

    if (legacyBoardPath && !tabMap.has(legacyBoardPath)) {
        tabMap.set(legacyBoardPath, {
            root: legacyBoardPath,
            name: getBoardNameFallback(legacyBoardPath),
        });
    }

    state.tabs = [...tabMap.values()];
    state.activeRoot =
        legacyBoardPath && tabMap.has(legacyBoardPath)
            ? legacyBoardPath
            : (state.tabs[0] && state.tabs[0].root) || '';
}

function clearBoardView() {
    window.boardRoot = '';
    const boardName = document.getElementById('boardName');
    if (boardName) {
        boardName.textContent = 'BoardName';
    }

    const boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.innerHTML = '';
    }

    const boardPathInput = document.getElementById('boardPath');
    if (boardPathInput) {
        boardPathInput.value = '';
    }

    resetBoardLabelFilter();
    resetBoardSearch();
    if (typeof setBoardLabels === 'function') {
        setBoardLabels([]);
    }
    if (typeof renderBoardLabelFilterButton === 'function') {
        renderBoardLabelFilterButton();
    }
    if (typeof renderBoardLabelFilterPopover === 'function') {
        renderBoardLabelFilterPopover();
    }
}

async function closeBoardTab(boardRoot) {
    const root = normalizeBoardRoot(boardRoot);
    if (!root) {
        return;
    }

    const state = getBoardTabsState();
    const closingIndex = state.tabs.findIndex((tab) => tab.root === root);
    if (closingIndex < 0) {
        return;
    }

    const wasActive = state.activeRoot === root;
    state.tabs.splice(closingIndex, 1);

    if (!wasActive) {
        renderBoardTabs();
        persistBoardTabs();
        return;
    }

    if (state.tabs.length === 0) {
        state.activeRoot = '';
        if (typeof closeBoardSettingsModal === 'function') {
            await closeBoardSettingsModal();
        }
        clearBoardView();
        renderBoardTabs();
        persistBoardTabs();
        return;
    }

    const nextIndex = Math.max(0, closingIndex - 1);
    const nextTab = state.tabs[Math.min(nextIndex, state.tabs.length - 1)];
    state.activeRoot = nextTab.root;
    renderBoardTabs();
    persistBoardTabs();
    try {
        await openBoard(nextTab.root);
    } catch (error) {
        console.error('Unable to switch to the next open board tab.', error);
        state.tabs = state.tabs.filter((tab) => tab.root !== nextTab.root);
        state.activeRoot = '';
        renderBoardTabs();
        persistBoardTabs();

        if (state.tabs.length > 0) {
            try {
                await openBoard(state.tabs[state.tabs.length - 1].root);
            } catch (nextError) {
                console.error('Unable to recover to another board tab.', nextError);
                clearBoardView();
            }
        } else {
            clearBoardView();
        }
    }
}

async function updateBoardTabName(boardRoot) {
    const root = normalizeBoardRoot(boardRoot);
    if (!root) {
        return;
    }

    let boardName = getBoardNameFallback(root);
    try {
        boardName = await window.board.getBoardName(root);
    } catch (error) {
        console.error('Unable to resolve board name for tab.', error);
    }

    upsertBoardTab(root, boardName);
    renderBoardTabs();
    persistBoardTabs();
}

function initializeBoardTabsControls() {
    const tabsContainer = document.getElementById('boardTabs');
    if (!tabsContainer) {
        return;
    }

    tabsContainer.addEventListener('click', async (event) => {
        const closeButton = event.target.closest('.board-tab-close');
        if (closeButton) {
            event.preventDefault();
            event.stopPropagation();
            await closeBoardTab(closeButton.dataset.boardRoot);
            return;
        }

        const openButton = event.target.closest('.board-tab-open');
        if (!openButton) {
            return;
        }

        event.preventDefault();
        const root = normalizeBoardRoot(openButton.dataset.boardRoot);
        if (!root) {
            return;
        }

        if (root === normalizeBoardRoot(window.boardRoot)) {
            setActiveBoardTab(root);
            renderBoardTabs();
            persistBoardTabs();
            return;
        }

        try {
            await openBoard(root);
        } catch (error) {
            console.error('Unable to open board tab.', error);
        }
    });

    const state = getBoardTabsState();
    if (!state.sortable && typeof Sortable !== 'undefined') {
        state.sortable = new Sortable(tabsContainer, {
            animation: 150,
            draggable: '.board-tab',
            filter: '.board-tab-close',
            preventOnFilter: false,
            onEnd: () => {
                reorderTabsFromDom();
                renderBoardTabs();
            },
        });
    }
}

async function restoreBoardSession() {
    restoreBoardTabsFromStorage();
    renderBoardTabs();
    persistBoardTabs();

    const state = getBoardTabsState();
    if (!state.activeRoot) {
        return;
    }

    try {
        await openBoard(state.activeRoot);
    } catch (error) {
        console.error('Unable to restore the previous board tab.', error);
        const failedRoot = state.activeRoot;
        state.tabs = state.tabs.filter((tab) => tab.root !== failedRoot);
        state.activeRoot = (state.tabs[0] && state.tabs[0].root) || '';
        renderBoardTabs();
        persistBoardTabs();
        clearBoardView();

        if (state.activeRoot) {
            try {
                await openBoard(state.activeRoot);
            } catch (nextError) {
                console.error('Unable to restore any board tab.', nextError);
            }
        }
    }
}

async function openBoard(dir) {
    const boardRoot = normalizeBoardRoot(dir);
    if (!boardRoot) {
        return;
    }

    const boardDirectory = getBoardDirectoryPath(boardRoot);

    if (typeof closeBoardSettingsModal === 'function') {
        await closeBoardSettingsModal();
    }

    if (typeof flushBoardLabelSettingsSave === 'function') {
        await flushBoardLabelSettingsSave();
    }

    const directories = await window.board.listDirectories(boardDirectory);

    if (directories.length == 0) {
        await window.board.createList(boardDirectory + '/000-To-do-stock');
        await window.board.createList(boardDirectory + '/001-Doing-stock');
        await window.board.createList(boardDirectory + '/002-Done-stock');
        await window.board.createList(boardDirectory + '/003-On-hold-stock');
        await window.board.createList(boardDirectory + '/XXX-Archive');

        await window.board.createCard(boardDirectory + '/000-To-do-stock/000-hello-stock.md', `👋 Hello
=======
async function openBoard( dir ) {
    const boardPath = normalizeBoardPath(dir);
    if (!boardPath) {
        return;
    }

    const directories = await window.board.listDirectories( boardPath );

    if ( directories.length == 0 ) {
        await window.board.createList( boardPath + '000-To-do-stock');
        await window.board.createList( boardPath + '001-Doing-stock');
        await window.board.createList( boardPath + '002-Done-stock');
        await window.board.createList( boardPath + '003-On-hold-stock');
        await window.board.createList( boardPath + 'XXX-Archive');

        await window.board.createCard( boardPath + '000-To-do-stock/000-hello-stock.md', `👋 Hello
>>>>>>> theirs

Welcome to Signboard! This card is your first task. Tap on it to view more or edit.

- Create new cards by clicking the + button on any list
- Edit the title or notes on any card by tapping on it
- Reorder cards in a list or move them between lists by dragging them
- Archive a card by tapping on it and tapping the archive icon
- Reorder lists by dragging them
- Create new lists by clicking the "+ Add List" button

***Keyboard Shortcuts***

Control button on Windows. Command button on macOS.

- CMD + N - New card or task (with the ability to choose list)
- CMD + Shift + N - New list
- Escape - Dismiss all open modals

I hope you enjoy Signboard. If you have any feedback, please let me know. colin@cdevroe.com`);
    }

    window.boardRoot = boardRoot;
    upsertBoardTab(boardRoot);
    setActiveBoardTab(boardRoot);
    renderBoardTabs();
    persistBoardTabs();
    resetBoardLabelFilter();
    resetBoardSearch();

    const pickFolderButton = document.getElementById('pickFolder');
    if (pickFolderButton) {
        pickFolderButton.textContent = 'Open Board';
    }

    const boardPathInput = document.getElementById('boardPath');
    if (boardPathInput) {
        boardPathInput.value = boardDirectory;
    }

<<<<<<< ours
    await updateBoardTabName(boardRoot);
    await renderBoard();
=======
    ensureBoardInTabs(boardPath);
    window.boardRoot = boardPath;
    setStoredActiveBoard(window.boardRoot);
    await renderBoard();
    
>>>>>>> theirs
}
