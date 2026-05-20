const EXTERNAL_BOARD_SYNC_INTERVAL_MS = 500;
const EXTERNAL_BOARD_RENDER_DEBOUNCE_MS = 150;
const DUE_NOTIFICATION_CHECK_INTERVAL_MS = 60 * 1000;
const DUE_NOTIFICATION_LAST_RUN_DATE_KEY = 'dueCardsNotificationLastRunDate';
const DEFAULT_DUE_NOTIFICATION_TIME = '09:00';
const SIGNBOARD_COMMERCIAL_LICENSE_PRICE = 49;
const SIGNBOARD_COMMERCIAL_LICENSE_PAYMENT_URL = 'https://buy.stripe.com/7sY4gAaT14WO3dY2mg8N205';
const SIGNBOARD_TIP_JAR_PAYMENT_URL = 'https://donate.stripe.com/14A3cw1ircpgeWGf928N206';
const ABOUT_SIGNBOARD_FALLBACK_INFO = Object.freeze({
    appName: 'Signboard',
    appVersion: '',
    authorName: 'Colin Devroe',
    authorUrl: 'https://cdevroe.com/',
    copyright: '© 2025-2026 Colin Devroe',
    license: 'MIT',
    websiteUrl: 'https://cdevroe.com/signboard/',
});

let externalBoardSyncIntervalId = null;
let externalBoardSyncInFlight = false;
let externalBoardWatchRoot = '';
let externalBoardWatchToken = 0;
let externalBoardRefreshPending = false;
let externalBoardRenderTimeoutId = null;
let externalBoardRenderInFlight = false;
let dueCardNotificationIntervalId = null;
let aboutSignboardInfoPromise = null;

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

function readDueNotificationLastRunDate() {
    return String(localStorage.getItem(DUE_NOTIFICATION_LAST_RUN_DATE_KEY) || '').trim();
}

function writeDueNotificationLastRunDate(lastRunDate) {
    localStorage.setItem(DUE_NOTIFICATION_LAST_RUN_DATE_KEY, String(lastRunDate || '').trim());
}

async function collectDueTodayCards(boardRoot, todayIsoDate) {
    return collectDueTodayItemsForBoard(window.board, boardRoot, todayIsoDate);
}

async function runDueCardNotificationCheck() {
    if (
        !window.electronAPI ||
        typeof window.electronAPI.notifyDueCards !== 'function' ||
        !window.board
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

    const notificationSettings = typeof getAppNotificationSettings === 'function'
        ? getAppNotificationSettings()
        : {};

    if (notificationSettings.enabled !== true) {
        return;
    }

    if (!hasReachedDueNotificationTime(now, notificationSettings.time)) {
        return;
    }

    if (readDueNotificationLastRunDate() === todayIsoDate) {
        return;
    }

    let allDueItems = [];

    for (const boardRoot of boardRoots) {
        let boardName = '';
        try {
            boardName = typeof getBoardLabelFromPath === 'function'
                ? getBoardLabelFromPath(boardRoot)
                : String(boardRoot || '').replace(/\/+$/, '').split('/').pop();
        } catch {
            boardName = '';
        }

        const dueItems = await collectDueTodayCards(boardRoot, todayIsoDate);
        allDueItems = allDueItems.concat(dueItems.map((item) => ({
            ...item,
            boardName,
        })));
    }

    const notificationBody = buildDueNotificationBody(allDueItems);
    if (notificationBody) {
        await window.electronAPI.notifyDueCards({
            title: 'Signboard',
            body: notificationBody,
        });
    }

    writeDueNotificationLastRunDate(todayIsoDate);
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
    return isModalOpen('modalEditCard')
        || isModalOpen('modalBoardSettings')
        || isModalOpen('modalArchiveBrowser')
        || isModalOpen('modalCommercialLicense')
        || isModalOpen('modalAboutSignboard');
}

function getCommercialLicensePriceLabel() {
    return `$${SIGNBOARD_COMMERCIAL_LICENSE_PRICE}`;
}

function getCommercialLicensePaymentUrl() {
    return getValidatedExternalUrl(SIGNBOARD_COMMERCIAL_LICENSE_PAYMENT_URL);
}

function getTipJarPaymentUrl() {
    return getValidatedExternalUrl(SIGNBOARD_TIP_JAR_PAYMENT_URL);
}

function getValidatedExternalUrl(rawValue) {
    const candidate = String(rawValue || '').trim();
    if (!candidate) {
        return '';
    }

    try {
        const parsedUrl = new URL(candidate);
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
            return parsedUrl.href;
        }
    } catch {
        return '';
    }

    return '';
}

function renderCommercialLicenseModalState() {
    const priceLabel = getCommercialLicensePriceLabel();
    const payButton = document.getElementById('commercialLicensePayButton');
    const tipButton = document.getElementById('commercialLicenseTipButton');
    const helper = document.getElementById('commercialLicensePaymentHelper');
    const paymentUrl = getCommercialLicensePaymentUrl();
    const tipUrl = getTipJarPaymentUrl();

    document.querySelectorAll('[data-commercial-license-price]').forEach((element) => {
        element.textContent = priceLabel;
    });

    if (payButton) {
        payButton.textContent = `Pay ${priceLabel}`;
        payButton.disabled = !paymentUrl;
        payButton.dataset.paymentUrl = paymentUrl;
        payButton.setAttribute('aria-disabled', paymentUrl ? 'false' : 'true');
    }

    if (tipButton) {
        tipButton.disabled = !tipUrl;
        tipButton.dataset.paymentUrl = tipUrl;
        tipButton.setAttribute('aria-disabled', tipUrl ? 'false' : 'true');
    }

    if (helper) {
        const helperMessages = [];
        if (!paymentUrl) {
            helperMessages.push('Add your commercial Stripe Payment Link to SIGNBOARD_COMMERCIAL_LICENSE_PAYMENT_URL before release.');
        }
        if (!tipUrl) {
            helperMessages.push('Add your tip link to SIGNBOARD_TIP_JAR_PAYMENT_URL before release.');
        }

        helper.textContent = helperMessages.length > 0
            ? helperMessages.join(' ')
            : 'Personal use stays free. Commercial use is a simple one-time payment, and personal users can optionally leave a tip.';
    }
}

function normalizeAboutSignboardInfo(rawInfo = {}) {
    const info = rawInfo && typeof rawInfo === 'object' ? rawInfo : {};
    return {
        appName: String(info.appName || ABOUT_SIGNBOARD_FALLBACK_INFO.appName).trim() || ABOUT_SIGNBOARD_FALLBACK_INFO.appName,
        appVersion: String(info.appVersion || '').trim(),
        authorName: String(info.authorName || ABOUT_SIGNBOARD_FALLBACK_INFO.authorName).trim() || ABOUT_SIGNBOARD_FALLBACK_INFO.authorName,
        authorUrl: getValidatedExternalUrl(info.authorUrl || ABOUT_SIGNBOARD_FALLBACK_INFO.authorUrl) || ABOUT_SIGNBOARD_FALLBACK_INFO.authorUrl,
        copyright: String(info.copyright || ABOUT_SIGNBOARD_FALLBACK_INFO.copyright).trim() || ABOUT_SIGNBOARD_FALLBACK_INFO.copyright,
        license: String(info.license || ABOUT_SIGNBOARD_FALLBACK_INFO.license).trim() || ABOUT_SIGNBOARD_FALLBACK_INFO.license,
        websiteUrl: getValidatedExternalUrl(info.websiteUrl || ABOUT_SIGNBOARD_FALLBACK_INFO.websiteUrl) || ABOUT_SIGNBOARD_FALLBACK_INFO.websiteUrl,
    };
}

async function getAboutSignboardInfo() {
    if (aboutSignboardInfoPromise) {
        return aboutSignboardInfoPromise;
    }

    if (!window.electronAPI || typeof window.electronAPI.getAppInfo !== 'function') {
        aboutSignboardInfoPromise = Promise.resolve(ABOUT_SIGNBOARD_FALLBACK_INFO);
        return aboutSignboardInfoPromise;
    }

    aboutSignboardInfoPromise = window.electronAPI.getAppInfo()
        .then((info) => normalizeAboutSignboardInfo(info))
        .catch((error) => {
            console.error('Failed to load About Signboard info.', error);
            return ABOUT_SIGNBOARD_FALLBACK_INFO;
        });

    return aboutSignboardInfoPromise;
}

function applyAboutSignboardInfo(info) {
    const normalizedInfo = normalizeAboutSignboardInfo(info);
    const versionLabel = normalizedInfo.appVersion
        ? `Version ${normalizedInfo.appVersion}`
        : 'Version unavailable';

    document.querySelectorAll('[data-about-app-version]').forEach((element) => {
        element.textContent = versionLabel;
    });
    document.querySelectorAll('[data-about-license]').forEach((element) => {
        element.textContent = normalizedInfo.license;
    });
    document.querySelectorAll('[data-about-copyright]').forEach((element) => {
        element.textContent = normalizedInfo.copyright;
    });
}

async function renderAboutSignboardModalState() {
    const info = await getAboutSignboardInfo();
    applyAboutSignboardInfo(info);
}

async function openAboutSignboardModal() {
    const modal = document.getElementById('modalAboutSignboard');
    if (!modal) {
        return;
    }

    await renderAboutSignboardModalState();

    if (typeof hideShortcutHelpModal === 'function') {
        hideShortcutHelpModal();
    }

    if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' });
    }

    modal.style.display = 'block';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(false);
    }
}

function closeAboutSignboardModal() {
    const modal = document.getElementById('modalAboutSignboard');
    if (!modal || modal.style.display !== 'block') {
        return;
    }

    modal.style.display = 'none';
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(true);
    }
}

function initializeAboutSignboardControls() {
    const closeButton = document.getElementById('aboutSignboardClose');
    const supportButton = document.getElementById('aboutSignboardSupportButton');

    renderAboutSignboardModalState().catch((error) => {
        console.error('Failed to initialize About Signboard modal.', error);
    });

    if (window.electronAPI && typeof window.electronAPI.onOpenAboutSignboard === 'function') {
        window.electronAPI.onOpenAboutSignboard(() => {
            openAboutSignboardModal().catch((error) => {
                console.error('Failed to open About Signboard modal.', error);
            });
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeAboutSignboardModal();
        });
    }

    if (supportButton) {
        supportButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeAboutSignboardModal();
            openCommercialLicenseModal();
        });
    }
}

function openCommercialLicenseModal() {
    const modal = document.getElementById('modalCommercialLicense');
    if (!modal) {
        return;
    }

    renderCommercialLicenseModalState();
    modal.style.display = 'block';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(false);
    }
}

function closeCommercialLicenseModal() {
    const modal = document.getElementById('modalCommercialLicense');
    if (!modal || modal.style.display !== 'block') {
        return;
    }

    modal.style.display = 'none';
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(true);
    }
}

function closeBoardMenuPopover() {
    const popover = document.getElementById('boardMenuPopover');
    if (!popover) {
        return;
    }

    popover.classList.add('hidden');
    popover.setAttribute('aria-hidden', 'true');

    if (typeof closeBoardViewPopover === 'function') {
        closeBoardViewPopover();
    }
}

function closeBoardMenuPopoverIfClickOutside(target) {
    const button = document.getElementById('boardMenuButton');
    const popover = document.getElementById('boardMenuPopover');
    if (!button || !popover || popover.classList.contains('hidden')) {
        return;
    }

    if (button.contains(target) || popover.contains(target)) {
        return;
    }

    closeBoardMenuPopover();
}

function positionBoardMenuPopover(button, popover) {
    if (!(button instanceof Element) || !(popover instanceof Element)) {
        return;
    }

    const viewportPadding = 8;
    popover.style.left = '0px';
    popover.style.top = '0px';

    const buttonBounds = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const preferredLeft = buttonBounds.right - popoverRect.width;
    const clampedLeft = Math.min(
        window.innerWidth - popoverRect.width - viewportPadding,
        Math.max(viewportPadding, preferredLeft),
    );

    let nextTop = buttonBounds.bottom + 8;
    if (nextTop + popoverRect.height > window.innerHeight - viewportPadding) {
        const aboveButton = buttonBounds.top - popoverRect.height - 8;
        if (aboveButton >= viewportPadding) {
            nextTop = aboveButton;
        } else {
            nextTop = Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);
        }
    }

    popover.style.left = `${Math.round(clampedLeft)}px`;
    popover.style.top = `${Math.round(nextTop)}px`;
}

function toggleBoardMenuPopover() {
    const button = document.getElementById('boardMenuButton');
    const popover = document.getElementById('boardMenuPopover');
    if (!button || !popover) {
        return;
    }

    if (typeof closeBoardLabelFilterPopover === 'function') {
        closeBoardLabelFilterPopover();
    }
    if (typeof closeCardLabelPopover === 'function') {
        closeCardLabelPopover();
    }
    if (typeof closeListActionsPopover === 'function') {
        closeListActionsPopover();
    }

    const isHidden = popover.classList.contains('hidden');
    popover.classList.toggle('hidden', !isHidden);
    popover.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
    if (isHidden) {
        positionBoardMenuPopover(button, popover);
    }
}

function initializeBoardMenuControls() {
    const button = document.getElementById('boardMenuButton');
    const popover = document.getElementById('boardMenuPopover');
    if (!button || !popover) {
        return;
    }

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleBoardMenuPopover();
    });

    popover.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    window.addEventListener('resize', () => {
        if (!popover.classList.contains('hidden')) {
            positionBoardMenuPopover(button, popover);
        }
    });
}

function initializeCommercialLicenseControls() {
    const openButton = document.getElementById('openCommercialLicenseModal');
    const sponsorPillButton = document.getElementById('openSponsorPillButton');
    const closeButton = document.getElementById('commercialLicenseClose');
    const payButton = document.getElementById('commercialLicensePayButton');
    const tipButton = document.getElementById('commercialLicenseTipButton');

    renderCommercialLicenseModalState();

    const handleOpenCommercialLicenseModal = async (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        closeBoardMenuPopover();
        if (typeof closeAllModals === 'function') {
            await closeAllModals({ key: 'Escape' });
        }
        openCommercialLicenseModal();
    };

    if (openButton) {
        openButton.addEventListener('click', handleOpenCommercialLicenseModal);
    }

    if (sponsorPillButton) {
        sponsorPillButton.addEventListener('click', handleOpenCommercialLicenseModal);
    }

    if (closeButton) {
        closeButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeCommercialLicenseModal();
        });
    }

    if (payButton) {
        payButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const paymentUrl = String(payButton.dataset.paymentUrl || '').trim();
            if (!paymentUrl) {
                return;
            }

            if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                window.electronAPI.openExternal(paymentUrl);
            }
        });
    }

    if (tipButton) {
        tipButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const paymentUrl = String(tipButton.dataset.paymentUrl || '').trim();
            if (!paymentUrl) {
                return;
            }

            if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                window.electronAPI.openExternal(paymentUrl);
            }
        });
    }
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

    if (isModalOpen('modalEditCard') && typeof refreshActiveCardEditorFromDiskIfClean === 'function') {
        await refreshActiveCardEditorFromDiskIfClean();
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

    if (window.board && typeof window.board.adoptLegacyBoardRoots === 'function' && typeof getStoredOpenBoards === 'function') {
        try {
            await window.board.adoptLegacyBoardRoots(getStoredOpenBoards());
        } catch (error) {
            console.warn('Unable to migrate previously opened boards into trusted board access.', error);
        }
    }

    if (typeof migrateAppSettingsFromOpenBoards === 'function') {
        await migrateAppSettingsFromOpenBoards();
    } else if (typeof loadAppSettings === 'function') {
        await loadAppSettings();
    }

    const restoredBoard = restoreBoardTabs();
    const initializeHeaderControls = () => {
    initializeAboutSignboardControls();
    initializeBoardMenuControls();
    initializeCommercialLicenseControls();
        initializeBoardLabelControls();
        initializeBoardSearchControls();
        initializeBoardViewControls();
        initializePlannerControls();
        initializeArchiveBrowserControls();
        initializeBoardSwitcherControls();
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
        authorizeBoardAccess(restoredBoard).then((authorizedBoardPath) => {
            if (!authorizedBoardPath) {
                window.boardRoot = '';
                setStoredActiveBoard('');
                renderBoardTabs();
                if (typeof setBoardChromeState === 'function') {
                    setBoardChromeState(false);
                }
                return;
            }

            window.boardRoot = authorizedBoardPath;
            renderBoard().catch((error) => {
                console.error('Failed to render board on startup.', error);
            });
        }).catch((error) => {
            console.error('Failed to authorize restored board.', error);
        });
    }

    const userInput = document.getElementById('userInput');
    userInput.addEventListener('keydown', async (key) => {
        if (key.code != 'Enter') return;
        key.preventDefault();
        const activeListPath = document.getElementById('hiddenListPath');
        if (!key.shiftKey) {
            const btnAddCard = document.getElementById('btnAddCard');
            btnAddCard.click();
            return;
        }
        if (!activeListPath) {
            return;
        }
        await processAddNewCard(userInput.value, activeListPath.value, { openAfterCreate: true });
        userInput.value = '';
        activeListPath.value = '';
    });
    const userInputCardName = document.getElementById('userInputCardName');
    userInputCardName.addEventListener('keydown', async (key) => {
        if (key.code != 'Enter') return;
        key.preventDefault();
        if (!key.shiftKey) {
            const btnAddCardToList = document.getElementById('btnAddCardToList');
            btnAddCardToList.click();
            return;
        }
        if (typeof submitQuickAddCardModal !== 'function') {
            return;
        }
        await submitQuickAddCardModal({ openAfterCreate: true });
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
        if (typeof closeBoardMenuPopoverIfClickOutside === 'function') {
            closeBoardMenuPopoverIfClickOutside(e.target);
        }
        if (typeof closePlannerFilterPopoverIfClickOutside === 'function') {
            closePlannerFilterPopoverIfClickOutside(e.target);
        }
        if (typeof closeListActionsPopoverIfClickOutside === 'function') {
            closeListActionsPopoverIfClickOutside(e.target);
        }

        await closeAllModals(e);
    });

    startExternalBoardSync();
    startDueCardNotificationSchedule();
}
init();
