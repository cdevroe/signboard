const OPEN_BOARDS_STORAGE_KEY = 'openBoardPaths';
const ACTIVE_BOARD_STORAGE_KEY = 'activeBoardPath';

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
        const boardTab = document.createElement('button');
        boardTab.type = 'button';
        boardTab.textContent = getBoardLabelFromPath(boardPath);
        boardTab.title = boardPath;
        boardTab.classList.add('board-tab');
        boardTab.setAttribute('role', 'tab');
        boardTab.setAttribute('aria-selected', boardPath === activeBoard ? 'true' : 'false');

        if (boardPath === activeBoard) {
            boardTab.classList.add('is-active');
        }

        boardTab.addEventListener('click', async () => {
            if (normalizeBoardPath(window.boardRoot) === boardPath) {
                return;
            }

            window.boardRoot = boardPath;
            setStoredActiveBoard(boardPath);
            await renderBoard();
        });

        tabsEl.appendChild(boardTab);
    }
}
