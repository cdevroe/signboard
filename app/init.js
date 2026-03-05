const EXTERNAL_BOARD_SYNC_INTERVAL_MS = 500;
const EXTERNAL_BOARD_RENDER_DEBOUNCE_MS = 150;

let externalBoardSyncIntervalId = null;
let externalBoardSyncInFlight = false;
let externalBoardWatchRoot = '';
let externalBoardWatchToken = 0;
let externalBoardRefreshPending = false;
let externalBoardRenderTimeoutId = null;
let externalBoardRenderInFlight = false;

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
}
init();
