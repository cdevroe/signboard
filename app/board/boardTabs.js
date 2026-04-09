const OPEN_BOARDS_STORAGE_KEY = 'openBoardPaths';
const ACTIVE_BOARD_STORAGE_KEY = 'activeBoardPath';
const MAX_OPEN_BOARDS = 6;
const UNIFIED_BOARD_PATH = '__unified__';
let boardTabsSortable = null;

function normalizeBoardPath(dir) {
    if (!dir || typeof dir !== 'string') {
        return '';
    }

    if (dir === UNIFIED_BOARD_PATH) {
        return UNIFIED_BOARD_PATH;
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

    if (normalizedPath === UNIFIED_BOARD_PATH) {
        return UNIFIED_BOARD_PATH;
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
    if (boardPath === UNIFIED_BOARD_PATH) {
        return 'All Boards';
    }
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
        if (uniqueBoards.length >= MAX_OPEN_BOARDS) {
            break;
        }
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
            limitReached: false,
        };
    }

    if (openBoards.length >= MAX_OPEN_BOARDS) {
        return {
            openBoards,
            added: false,
            limitReached: true,
        };
    }

    const updatedOpenBoards = [...openBoards, normalizedPath];
    setStoredOpenBoards(updatedOpenBoards);
    return {
        openBoards: updatedOpenBoards,
        added: true,
        limitReached: false,
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
        animation: 150,
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

function alertBoardTabLimit() {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`You can only open up to ${MAX_OPEN_BOARDS} boards at once. Close a board tab to open another.`);
    }
}

async function promptAndOpenBoardFromTabs() {
    const openBoards = getStoredOpenBoards();
    if (openBoards.length >= MAX_OPEN_BOARDS) {
        alertBoardTabLimit();
        return;
    }

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
        return;
    }

    tabsWrapper.classList.remove('hidden');
    const activeBoard = normalizeBoardPath(window.boardRoot || getStoredActiveBoard());

    const boardsToDisplay = [...openBoards];

    for (const boardPath of boardsToDisplay) {
        const boardTab = document.createElement('div');
        boardTab.classList.add('board-tab');
        boardTab.setAttribute('data-board-path', boardPath);
        boardTab.setAttribute('role', 'presentation');
        boardTab.title = boardPath === UNIFIED_BOARD_PATH ? 'View all open boards' : boardPath;

        if (boardPath === UNIFIED_BOARD_PATH) {
            boardTab.classList.add('board-tab-unified');
        }

        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.classList.add('board-tab-label');
        tabButton.textContent = getBoardLabelFromPath(boardPath);
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', boardPath === activeBoard ? 'true' : 'false');
        tabButton.setAttribute('aria-label', `Open ${getBoardLabelFromPath(boardPath)} board`);

        if (boardPath === activeBoard) {
            boardTab.classList.add('is-active');
        }

        tabButton.addEventListener('click', async () => {
            if (normalizeBoardPath(window.boardRoot) === boardPath) {
                return;
            }

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

            const authorizedBoardPath = await authorizeBoardAccess(boardPath);
            if (!authorizedBoardPath) {
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
        });

        if (boardPath === UNIFIED_BOARD_PATH) {
            const icon = document.createElement('span');
            icon.className = 'board-tab-unified-icon';
            icon.innerHTML = '<i data-feather="layers"></i>';
            tabButton.prepend(icon);
        }

        boardTab.appendChild(tabButton);

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.classList.add('board-tab-close');
        closeButton.setAttribute('aria-label', `Close ${getBoardLabelFromPath(boardPath)} board`);
        closeButton.title = `Close ${getBoardLabelFromPath(boardPath)}`;
        closeButton.textContent = '×';
        closeButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await closeBoardTab(boardPath);
        });
        boardTab.appendChild(closeButton);
        tabsEl.appendChild(boardTab);
    }

    // Global drag tracking for tabs
    if (!window.__tabDragTrackerInitialized) {
        window.__tabDragTrackerInitialized = true;
        document.addEventListener('mousemove', (e) => {
            if (document.body.classList.contains('board-card-drag-active')) {
                const hit = document.elementFromPoint(e.clientX, e.clientY);
                const boardTab = hit ? hit.closest('.board-tab[data-board-path]') : null;
                
                // Clear highlights from other tabs
                document.querySelectorAll('.board-tab--drop-target').forEach(el => {
                    if (el !== boardTab) el.classList.remove('board-tab--drop-target');
                });
                
                if (boardTab) {
                    const boardPath = boardTab.getAttribute('data-board-path');
                    const UNIFIED_BOARD_PATH = '__unified__';
                    
                    // Don't highlight if it's the "All Boards" tab or if the card already belongs to this board
                    if (boardPath === UNIFIED_BOARD_PATH) {
                        window.__activeBoardDropTarget = null;
                        return;
                    }

                    if (typeof Sortable !== 'undefined' && Sortable.active && Sortable.active.options.group.name === 'cards') {
                        const draggedItem = Sortable.active.dragged;
                        const cardPath = draggedItem ? draggedItem.getAttribute('data-path') : null;
                        if (cardPath && cardPath.startsWith(boardPath)) {
                            window.__activeBoardDropTarget = null;
                            return;
                        }
                    }

                    window.__activeBoardDropTarget = boardPath;
                    boardTab.classList.add('board-tab--drop-target');
                } else {
                    window.__activeBoardDropTarget = null;
                }
            } else {
                window.__activeBoardDropTarget = null;
            }
        });
    }

    const addBoardTab = document.createElement('div');
    addBoardTab.classList.add('board-tab', 'board-tab-add');
    addBoardTab.setAttribute('role', 'presentation');

    const addBoardButton = document.createElement('button');
    addBoardButton.type = 'button';
    addBoardButton.classList.add('board-tab-label', 'board-tab-add-label');
    addBoardButton.textContent = '+ Add Board';
    addBoardButton.setAttribute('aria-label', 'Add board');

    const canAddMoreBoards = openBoards.length < MAX_OPEN_BOARDS;
    if (!canAddMoreBoards) {
        addBoardTab.classList.add('is-disabled');
        addBoardButton.disabled = true;
        addBoardButton.title = `Maximum ${MAX_OPEN_BOARDS} open boards`;
    } else {
        addBoardButton.title = 'Add board';
        addBoardButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await promptAndOpenBoardFromTabs();
        });
    }

    addBoardTab.appendChild(addBoardButton);
    tabsEl.appendChild(addBoardTab);

    const actualBoardsCount = openBoards.filter(b => b !== UNIFIED_BOARD_PATH).length;
    if (actualBoardsCount > 1 && !openBoards.includes(UNIFIED_BOARD_PATH)) {
        const addUnifiedTab = document.createElement('div');
        addUnifiedTab.classList.add('board-tab', 'board-tab-add');
        addUnifiedTab.setAttribute('role', 'presentation');

        const addUnifiedButton = document.createElement('button');
        addUnifiedButton.type = 'button';
        addUnifiedButton.classList.add('board-tab-label', 'board-tab-add-label');
        addUnifiedButton.innerHTML = '<i data-feather="layers" style="width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px;"></i> All Boards';
        addUnifiedButton.title = 'Open All Boards view';
        
        if (openBoards.length >= MAX_OPEN_BOARDS) {
            addUnifiedTab.classList.add('is-disabled');
            addUnifiedButton.disabled = true;
            addUnifiedButton.title = `Maximum ${MAX_OPEN_BOARDS} open boards`;
        } else {
            addUnifiedButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const updatedOpenBoards = [...openBoards, UNIFIED_BOARD_PATH];
                setStoredOpenBoards(updatedOpenBoards);
                
                window.boardRoot = UNIFIED_BOARD_PATH;
                setStoredActiveBoard(UNIFIED_BOARD_PATH);
                if (typeof resetBoardLabelFilter === 'function') resetBoardLabelFilter();
                if (typeof resetBoardSearch === 'function') resetBoardSearch();
                await renderBoard();
            });
        }

        addUnifiedTab.appendChild(addUnifiedButton);
        tabsEl.appendChild(addUnifiedTab);
    }

    initializeBoardTabsSortable(tabsEl, openBoards.length > 1);

    if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
        feather.replace();
    }
}
