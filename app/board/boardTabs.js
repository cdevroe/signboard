const OPEN_BOARDS_STORAGE_KEY = 'openBoardPaths';
const ACTIVE_BOARD_STORAGE_KEY = 'activeBoardPath';
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

function getStoredOpenBoards() {
    let openBoards = [];

    try {
        const raw = localStorage.getItem(OPEN_BOARDS_STORAGE_KEY);
        openBoards = JSON.parse(raw) || [];
    } catch {
        openBoards = [];
    }

    const uniqueBoards = [];
    for (const boardPath of openBoards) {
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

function setStoredOpenBoards(openBoards) {
    localStorage.setItem(OPEN_BOARDS_STORAGE_KEY, JSON.stringify(openBoards));
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
        return openBoards;
    }

    const updatedOpenBoards = [...openBoards, normalizedPath];
    setStoredOpenBoards(updatedOpenBoards);
    return updatedOpenBoards;
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
        draggable: '.board-tab',
        filter: '.board-tab-close',
        preventOnFilter: false,
        ghostClass: 'board-tab--ghost',
        chosenClass: 'board-tab--chosen',
        dragClass: 'board-tab--dragging',
        onEnd: (evt) => {
            if (evt.oldIndex === evt.newIndex) {
                return;
            }

            const reorderedBoards = [...tabsEl.querySelectorAll('.board-tab')]
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
        return;
    }

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

    initializeBoardTabsSortable(tabsEl);
}
