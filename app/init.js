const EXTERNAL_BOARD_SYNC_INTERVAL_MS = 500;
const EXTERNAL_BOARD_RENDER_DEBOUNCE_MS = 150;
const DUE_NOTIFICATION_CHECK_INTERVAL_MS = 60 * 1000;
const DUE_NOTIFICATION_LAST_RUN_MAP_KEY = 'dueCardsNotificationLastRunByBoard';
const DEFAULT_DUE_NOTIFICATION_TIME = '09:00';

let externalBoardSyncIntervalId = null;
let externalBoardSyncInFlight = false;
let externalBoardWatchRoot = '';
let externalBoardWatchToken = 0;
let externalBoardRefreshPending = false;
let externalBoardRenderTimeoutId = null;
let externalBoardRenderInFlight = false;
let dueCardNotificationIntervalId = null;

function formatLocalIsoDate(dateValue = new Date()) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDueNotificationBoardRoots() {
    const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [];
    if (Array.isArray(openBoards) && openBoards.length > 0) {
        return openBoards;
    }

    const activeBoardPath = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(window.boardRoot)
        : String(window.boardRoot || '').trim();

    return activeBoardPath ? [activeBoardPath] : [];
}

function normalizeDueNotificationTime(value) {
    const candidate = String(value || '').trim();
    if (/^(?:0[1-9]|1\d|2[0-4]):[0-5]\d$/.test(candidate)) {
        return candidate;
    }

    return DEFAULT_DUE_NOTIFICATION_TIME;
}

function hasReachedDueNotificationTime(now, timeValue) {
    const [hours, minutes] = normalizeDueNotificationTime(timeValue).split(':').map(Number);
    const normalizedHours = hours === 24 ? 0 : hours;
    const triggerTime = new Date(now);
    triggerTime.setHours(normalizedHours, minutes, 0, 0);
    return now.getTime() >= triggerTime.getTime();
}

function readDueNotificationLastRunByBoard() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DUE_NOTIFICATION_LAST_RUN_MAP_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? { ...parsed } : {};
    } catch {
        return {};
    }
}

function writeDueNotificationLastRunByBoard(lastRunByBoard) {
    localStorage.setItem(DUE_NOTIFICATION_LAST_RUN_MAP_KEY, JSON.stringify(lastRunByBoard || {}));
}

async function collectDueTodayCards(boardRoot, todayIsoDate) {
    const dueCards = [];
    const normalizedBoardRoot = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(boardRoot)
        : String(boardRoot || '').trim();

    if (!normalizedBoardRoot) {
        return dueCards;
    }

    let lists = [];
    try {
        lists = await window.board.listLists(normalizedBoardRoot);
    } catch {
        return dueCards;
    }

    for (const listName of lists) {
        const listPath = `${normalizedBoardRoot}${listName}`;
        let cardFiles = [];

        try {
            cardFiles = await window.board.listCards(listPath);
        } catch {
            continue;
        }

        for (const cardFileName of cardFiles) {
            const cardPath = `${listPath}/${cardFileName}`;
            try {
                const card = await window.board.readCard(cardPath);
                const dueValue = String(card?.frontmatter?.due || '').trim();
                if (dueValue !== todayIsoDate) {
                    continue;
                }

                const cardTitle = String(card?.frontmatter?.title || '').trim() || 'Untitled';
                dueCards.push({
                    title: cardTitle,
                });
            } catch {
                // Ignore unreadable cards and continue scanning.
            }
        }
    }

    return dueCards;
}

async function runDueCardNotificationCheck() {
    if (
        !window.electronAPI ||
        typeof window.electronAPI.notifyDueCards !== 'function' ||
        !window.board ||
        typeof window.board.readBoardSettings !== 'function'
    ) {
        return;
    }

    const boardRoots = getDueNotificationBoardRoots();
    if (boardRoots.length === 0) {
        return;
    }

    const now = new Date();
    const todayIsoDate = formatLocalIsoDate(now);
    if (!todayIsoDate) {
        return;
    }

    const lastRunByBoard = readDueNotificationLastRunByBoard();
    let lastRunUpdated = false;

    for (const boardRoot of boardRoots) {
        let settings = null;
        try {
            settings = await window.board.readBoardSettings(boardRoot);
        } catch {
            continue;
        }

        const notifications = settings && settings.notifications && typeof settings.notifications === 'object'
            ? settings.notifications
            : {};

        if (notifications.enabled !== true) {
            continue;
        }

        if (!hasReachedDueNotificationTime(now, notifications.time)) {
            continue;
        }

        if (lastRunByBoard[boardRoot] === todayIsoDate) {
            continue;
        }

        const dueCards = await collectDueTodayCards(boardRoot, todayIsoDate);
        if (dueCards.length === 1) {
            await window.electronAPI.notifyDueCards({
                title: 'Signboard',
                body: dueCards[0].title,
            });
        } else if (dueCards.length > 1) {
            await window.electronAPI.notifyDueCards({
                title: 'Signboard',
                body: 'Multiple cards due today',
            });
        }

        lastRunByBoard[boardRoot] = todayIsoDate;
        lastRunUpdated = true;
    }

    if (lastRunUpdated) {
        writeDueNotificationLastRunByBoard(lastRunByBoard);
    }
}

function startDueCardNotificationSchedule() {
    runDueCardNotificationCheck().catch((error) => {
        console.error('Initial due-card notification check failed.', error);
    });

    if (dueCardNotificationIntervalId) {
        clearInterval(dueCardNotificationIntervalId);
    }

    dueCardNotificationIntervalId = window.setInterval(() => {
        runDueCardNotificationCheck().catch((error) => {
            console.error('Periodic due-card notification check failed.', error);
        });
    }, DUE_NOTIFICATION_CHECK_INTERVAL_MS);

    window.addEventListener('beforeunload', () => {
        if (dueCardNotificationIntervalId) {
            clearInterval(dueCardNotificationIntervalId);
            dueCardNotificationIntervalId = null;
        }
    }, { once: true });
}

function isModalOpen(modalId) {
    const modal = document.getElementById(modalId);
    return Boolean(modal && modal.style.display === 'block');
}

function isExternalBoardRefreshBlocked() {
    return isModalOpen('modalEditCard') || isModalOpen('modalBoardSettings');
}

function scheduleExternalBoardRefresh() {
    if (externalBoardRenderTimeoutId) {
        return;
    }

    externalBoardRenderTimeoutId = window.setTimeout(() => {
        externalBoardRenderTimeoutId = null;
        runExternalBoardRefresh().catch((error) => {
            console.error('Failed to refresh board after external file change.', error);
        });
    }, EXTERNAL_BOARD_RENDER_DEBOUNCE_MS);
}

async function runExternalBoardRefresh() {
    if (!window.boardRoot) {
        externalBoardRefreshPending = false;
        return;
    }

    if (isExternalBoardRefreshBlocked() || externalBoardRenderInFlight) {
        externalBoardRefreshPending = true;
        return;
    }

    externalBoardRenderInFlight = true;
    externalBoardRefreshPending = false;

    try {
        await renderBoard();
    } finally {
        externalBoardRenderInFlight = false;
    }
}

async function externalBoardSyncTick() {
    if (externalBoardSyncInFlight) {
        return;
    }

    if (!window.board || typeof window.board.startBoardWatch !== 'function' || typeof window.board.getBoardWatchToken !== 'function') {
        return;
    }

    externalBoardSyncInFlight = true;

    try {
        const currentBoardRoot = typeof normalizeBoardPath === 'function'
            ? normalizeBoardPath(window.boardRoot)
            : String(window.boardRoot || '');

        if (!currentBoardRoot) {
            if (externalBoardWatchRoot && typeof window.board.stopBoardWatch === 'function') {
                await window.board.stopBoardWatch();
            }

            externalBoardWatchRoot = '';
            externalBoardWatchToken = 0;
            externalBoardRefreshPending = false;
            return;
        }

        if (externalBoardWatchRoot !== currentBoardRoot) {
            const watchResult = await window.board.startBoardWatch(currentBoardRoot);
            if (watchResult && watchResult.ok) {
                externalBoardWatchRoot = currentBoardRoot;
                externalBoardWatchToken = Number(await window.board.getBoardWatchToken()) || 0;
            }
            return;
        }

        if (externalBoardRefreshPending && !isExternalBoardRefreshBlocked()) {
            scheduleExternalBoardRefresh();
        }

        const latestToken = Number(await window.board.getBoardWatchToken());
        if (!Number.isFinite(latestToken) || latestToken <= externalBoardWatchToken) {
            return;
        }

        externalBoardWatchToken = latestToken;
        scheduleExternalBoardRefresh();
    } finally {
        externalBoardSyncInFlight = false;
    }
}

function startExternalBoardSync() {
    if (externalBoardSyncIntervalId) {
        clearInterval(externalBoardSyncIntervalId);
    }

    externalBoardSyncIntervalId = window.setInterval(() => {
        externalBoardSyncTick().catch((error) => {
            console.error('External board sync tick failed.', error);
        });
    }, EXTERNAL_BOARD_SYNC_INTERVAL_MS);

    externalBoardSyncTick().catch((error) => {
        console.error('Initial external board sync failed.', error);
    });

    window.addEventListener('beforeunload', () => {
        if (externalBoardSyncIntervalId) {
            clearInterval(externalBoardSyncIntervalId);
            externalBoardSyncIntervalId = null;
        }

        if (externalBoardRenderTimeoutId) {
            clearTimeout(externalBoardRenderTimeoutId);
            externalBoardRenderTimeoutId = null;
        }

        if (window.board && typeof window.board.stopBoardWatch === 'function') {
            window.board.stopBoardWatch().catch(() => {
                // Ignore cleanup failures while unloading.
            });
        }
    }, { once: true });
}

async function init() {
    initializeTooltips();

    const restoredBoard = restoreBoardTabs();
    const initializeHeaderControls = () => {
        initializeBoardLabelControls();
        initializeBoardSearchControls();
        initializeBoardViewControls();
    };

    if (!restoredBoard) {
        window.boardRoot = '';
        if (typeof setBoardChromeState === 'function') {
            setBoardChromeState(false);
        }

        const emptyBoardCallToAction = document.getElementById('emptyBoardCallToAction');
        if (emptyBoardCallToAction) {
            emptyBoardCallToAction.addEventListener('click', async () => {
                if (typeof handleEmptyBoardCallToActionClick === 'function') {
                    await handleEmptyBoardCallToActionClick(emptyBoardCallToAction);
                    return;
                }
                await promptAndOpenBoardFromTabs();
            });
        }

        window.setTimeout(initializeHeaderControls, 0);
    } else {
        initializeHeaderControls();
    }

    if (restoredBoard) {
        window.boardRoot = restoredBoard;
        renderBoard().catch((error) => {
            console.error('Failed to render board on startup.', error);
        });
    }

    const userInput = document.getElementById('userInput');
    userInput.addEventListener('keydown',(key) => {
        if (key.code != 'Enter') return;
        const btnAddCard = document.getElementById('btnAddCard');
        btnAddCard.click();
    });
    const userInputCardName = document.getElementById('userInputCardName');
    userInputCardName.addEventListener('keydown',(key) => {
        if (key.code != 'Enter') return;
        const btnAddCardToList = document.getElementById('btnAddCardToList');
        btnAddCardToList.click();
    });
    document.addEventListener('click', async (e) => {
        const clickedLink = e.target instanceof Element ? e.target.closest('a[href]') : null;
        if (clickedLink) {
            const rawHref = String(clickedLink.getAttribute('href') || '').trim();
            if (rawHref && rawHref !== '#') {
                try {
                    const resolvedUrl = new URL(rawHref, window.location.href);
                    const supportedProtocols = ['http:', 'https:', 'mailto:'];
                    if (supportedProtocols.includes(resolvedUrl.protocol)) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.electronAPI.openExternal(resolvedUrl.href);
                        return;
                    }
                } catch {
                    // Ignore malformed URLs and continue normal click handling.
                }
            }
        }

        closeLabelFilterIfClickOutside(e.target);
        closeCardLabelSelectorIfClickOutside(e.target);
        if (typeof closeBoardViewPopoverIfClickOutside === 'function') {
            closeBoardViewPopoverIfClickOutside(e.target);
        }

        await closeAllModals(e);
    });
    document.getElementById('btnAddNewList').addEventListener('click', async (e) => {
        e.stopPropagation();
        const listName = document.getElementById('userInputListName');
        toggleAddListModal( (window.innerWidth / 2)-200, (window.innerHeight / 2)-100 );
        listName.focus();
        const btnAddList = document.getElementById('btnAddList');

        btnAddList.onclick = async (e) => {
            e.stopPropagation();   
            const listName = document.getElementById('userInputListName');

            if ( listName.value.length < 3 ) {
                return;
            }
            
            await processAddNewList( listName.value );

            listName.value = '';

            return;
        };

        listName.onkeydown = (key) => {
            if (key.code != 'Enter') return;
            const btnAddList = document.getElementById('btnAddList');
            btnAddList.click();
        };
    });

    startExternalBoardSync();
    startDueCardNotificationSchedule();
}
init();
