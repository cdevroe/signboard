const OPEN_BOARDS_STORAGE_KEY = 'openBoardPaths';
const ACTIVE_BOARD_STORAGE_KEY = 'activeBoardPath';
const MAX_OPEN_BOARDS = 6;
let boardTabsSortable = null;

function normalizeBoardPath(dir) {
    if (!dir || typeof dir !== 'string') {
        return '';
    }

    return dir.endsWith('/') ? dir : `${dir}/`;
}

function getBoardLabelFromPath(boardPath) {
    const pathParts = boardPath.split('/').filter(Boolean);
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

function clearRenderedBoard() {
    const boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.innerHTML = '';
    }

    const boardNameEl = document.getElementById('boardName');
    if (boardNameEl) {
        boardNameEl.textContent = 'No Board Open';
    }
}

async function closeBoardTab(boardPath) {
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
        window.boardRoot = '';
        setStoredActiveBoard('');
        renderBoardTabs();
        clearRenderedBoard();
        return;
    }

    if (!closedActiveBoard) {
        renderBoardTabs();
        return;
    }

    const nextActiveIndex = Math.min(removedIndex, updatedOpenBoards.length - 1);
    const nextActiveBoard = updatedOpenBoards[nextActiveIndex];
    window.boardRoot = nextActiveBoard;
    setStoredActiveBoard(nextActiveBoard);
    await renderBoard();
}

function initializeBoardTabsSortable(tabsEl) {
    if (!tabsEl || typeof Sortable !== 'function') {
        return;
    }

    if (boardTabsSortable && boardTabsSortable.el !== tabsEl) {
        boardTabsSortable.destroy();
        boardTabsSortable = null;
    }

    if (boardTabsSortable) {
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
    tabsWrapper.classList.remove('hidden');
    const activeBoard = normalizeBoardPath(window.boardRoot || getStoredActiveBoard());

    for (const boardPath of openBoards) {
        const boardTab = document.createElement('div');
        boardTab.classList.add('board-tab');
        boardTab.setAttribute('data-board-path', boardPath);
        boardTab.setAttribute('role', 'presentation');
        boardTab.title = boardPath;

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

            window.boardRoot = boardPath;
            setStoredActiveBoard(boardPath);
            await renderBoard();
        });

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

        boardTab.appendChild(tabButton);
        boardTab.appendChild(closeButton);
        tabsEl.appendChild(boardTab);
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

    initializeBoardTabsSortable(tabsEl);
}
