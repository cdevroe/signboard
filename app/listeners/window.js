const SHORTCUT_HELP_MODAL_ID = 'modalKeyboardShortcuts';

let shortcutHelpVisible = false;

function getShortcutHelpModal() {
    return document.getElementById(SHORTCUT_HELP_MODAL_ID);
}

function showShortcutHelpModal() {
    const modal = getShortcutHelpModal();
    if (!modal) {
        return;
    }

    if (typeof setAccessibleModalVisible === 'function') {
        setAccessibleModalVisible(modal, true, {
            display: 'block',
            labelledBy: 'keyboardShortcutsTitle',
        });
    } else {
        modal.style.display = 'block';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }
    shortcutHelpVisible = true;
}

function hideShortcutHelpModal() {
    const modal = getShortcutHelpModal();
    if (!modal) {
        shortcutHelpVisible = false;
        return;
    }

    if (typeof setAccessibleModalVisible === 'function') {
        setAccessibleModalVisible(modal, false);
    } else {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    shortcutHelpVisible = false;
}

function syncShortcutHelpModifierLabels() {
    if (typeof syncShortcutDisplayText === 'function') {
        syncShortcutDisplayText();
    }
}

function isEditableShortcutTarget(target) {
    if (!target) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    if (typeof target.closest !== 'function') {
        return false;
    }

    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'));
}

async function openPlannerViewForShortcut(viewId, options = {}) {
    if (typeof setPlannerActiveView === 'function') {
        setPlannerActiveView(viewId, { render: false });
    }

    if (typeof openPlannerView === 'function') {
        return openPlannerView({
            viewId,
            scope: options.scope === 'current' ? 'current' : 'all',
        });
    }

    return false;
}

function hasPlannerDateViewShortcutModifiers(event) {
    if (!event || !hasPrimaryShortcutModifier(event) || event.shiftKey) {
        return false;
    }

    if (isShortcutMacPlatform() && event.ctrlKey) {
        return false;
    }

    if (!isShortcutMacPlatform() && event.metaKey) {
        return false;
    }

    return true;
}

function isDigit1ShortcutEvent(event) {
    const key = String(event && event.key ? event.key : '').trim();
    return event && (event.code === 'Digit1' || key === '1' || key === '¡');
}

async function handleBoardViewShortcut(e, options = {}) {
    const ignoreEditableTarget = Boolean(options.ignoreEditableTarget);

    if (!hasPlannerDateViewShortcutModifiers(e)) {
        return false;
    }

    const isBoardViewDigitShortcut = isDigit1ShortcutEvent(e);
    if (!ignoreEditableTarget && isEditableShortcutTarget(e.target) && !isBoardViewDigitShortcut) {
        return false;
    }

    const shortcutScope = e.altKey ? 'current' : 'all';

    switch (e.code) {
        case 'Digit1': {
            e.preventDefault();
            if (typeof closePlannerView === 'function' && typeof isPlannerOpen === 'function' && isPlannerOpen()) {
                closePlannerView();
            }
            if (typeof setActiveBoardView === 'function') {
                setActiveBoardView(e.altKey ? 'table' : 'kanban');
            }
            return true;
        }
        case 'Digit2':
            e.preventDefault();
            await openPlannerViewForShortcut('calendar', { scope: shortcutScope });
            return true;
        case 'Digit3':
            e.preventDefault();
            await openPlannerViewForShortcut('this-week', { scope: shortcutScope });
            return true;
        case 'Digit4':
            if (!e.altKey) {
                return false;
            }
            e.preventDefault();
            await openPlannerViewForShortcut('day', { scope: shortcutScope });
            return true;
        case 'Digit5':
            if (!e.altKey) {
                return false;
            }
            e.preventDefault();
            await openPlannerViewForShortcut('agenda', { scope: shortcutScope });
            return true;
        default:
            if (isDigit1ShortcutEvent(e)) {
                e.preventDefault();
                if (typeof closePlannerView === 'function' && typeof isPlannerOpen === 'function' && isPlannerOpen()) {
                    closePlannerView();
                }
                if (typeof setActiveBoardView === 'function') {
                    setActiveBoardView(e.altKey ? 'table' : 'kanban');
                }
                return true;
            }
            return false;
    }
}

function isKeyboardShortcutsShortcut(event) {
    if (!event || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) {
        return false;
    }

    const key = String(event.key || '').trim();
    return event.code === 'Slash' || key === '/';
}

function isBoardSwitcherShortcut(event) {
    if (!event || !hasPrimaryShortcutModifier(event) || event.altKey || event.shiftKey) {
        return false;
    }

    if (isShortcutMacPlatform() && event.ctrlKey) {
        return false;
    }

    if (!isShortcutMacPlatform() && event.metaKey) {
        return false;
    }

    const key = String(event.key || '').trim().toLowerCase();
    return event.code === 'KeyK' || key === 'k';
}

function isShortcutMacPlatform() {
    if (typeof isPrimaryShortcutMacPlatform === 'function') {
        return isPrimaryShortcutMacPlatform();
    }

    const platformValue = String(
        (
            typeof navigator !== 'undefined' &&
            navigator &&
            ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)
        ) || ''
    ).toLowerCase();

    return platformValue.includes('mac');
}

function hasPrimaryShortcutModifier(event) {
    if (!event) {
        return false;
    }

    return isShortcutMacPlatform() ? event.metaKey : event.ctrlKey;
}

function hasPrimaryShiftOnly(event) {
    if (!event || !hasPrimaryShortcutModifier(event) || !event.shiftKey || event.altKey) {
        return false;
    }

    return isShortcutMacPlatform() ? !event.ctrlKey : !event.metaKey;
}

function isBoardSettingsShortcut(event) {
    if (!event || !hasPrimaryShortcutModifier(event) || event.altKey || event.shiftKey) {
        return false;
    }

    if (isShortcutMacPlatform() && event.ctrlKey) {
        return false;
    }

    if (!isShortcutMacPlatform() && event.metaKey) {
        return false;
    }

    const key = String(event.key || '').trim();
    return event.code === 'Comma' || key === ',';
}

function isColorSchemeCycleShortcut(event) {
    if (!event || !event.shiftKey) {
        return false;
    }

    const key = String(event.key || '').trim().toLowerCase();
    if (event.code !== 'KeyC' && key !== 'c') {
        return false;
    }

    if (isShortcutMacPlatform()) {
        return event.metaKey && event.ctrlKey && !event.altKey;
    }

    return event.ctrlKey && event.altKey && !event.metaKey;
}

function isArchiveBrowserShortcut(event) {
    if (!hasPrimaryShiftOnly(event)) {
        return false;
    }

    const key = String(event.key || '').trim().toLowerCase();
    return event.code === 'KeyA' || key === 'a';
}

function isPlannerToggleShortcut(event) {
    if (!hasPrimaryShiftOnly(event)) {
        return false;
    }

    const key = String(event.key || '').trim().toLowerCase();
    return event.code === 'KeyP' || key === 'p';
}

function isMoveCardLeftShortcut(event) {
    if (!hasPrimaryShiftOnly(event)) {
        return false;
    }

    const key = String(event.key || '').trim();
    return event.code === 'BracketLeft' || key === '[' || key === '{';
}

function isMoveCardRightShortcut(event) {
    if (!hasPrimaryShiftOnly(event)) {
        return false;
    }

    const key = String(event.key || '').trim();
    return event.code === 'BracketRight' || key === ']' || key === '}';
}

function isArchiveCardShortcut(event) {
    if (!event || !hasPrimaryShortcutModifier(event) || !event.altKey || !event.shiftKey) {
        return false;
    }

    if (isShortcutMacPlatform() && event.ctrlKey) {
        return false;
    }

    if (!isShortcutMacPlatform() && event.metaKey) {
        return false;
    }

    return event.code === 'Backspace' || event.key === 'Backspace';
}

function focusBoardSearchInput() {
    const searchInput = document.getElementById('boardSearchInput');
    if (!searchInput) {
        return false;
    }

    searchInput.focus();
    if (typeof searchInput.select === 'function') {
        searchInput.select();
    }

    return true;
}

async function openBoardSettingsFromShortcut() {
    if (!window.boardRoot) {
        return false;
    }

    if (typeof closeBoardSwitcher === 'function') {
        closeBoardSwitcher();
    }

    if (typeof isBoardSettingsModalOpen === 'function' && isBoardSettingsModalOpen()) {
        return true;
    }

    const openSettingsButton = document.getElementById('openBoardSettings');
    if (openSettingsButton && typeof openSettingsButton.click === 'function') {
        openSettingsButton.click();
        return true;
    }

    if (typeof closeBoardMenuPopover === 'function') {
        closeBoardMenuPopover();
    }
    if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' });
    }
    if (typeof ensureBoardLabelsLoaded === 'function') {
        await ensureBoardLabelsLoaded();
    }
    if (typeof openBoardSettingsModal === 'function') {
        openBoardSettingsModal();
        return true;
    }

    return false;
}

function toggleThemeModeFromShortcut() {
    const themeToggleButton = document.getElementById('themeToggle');
    if (!themeToggleButton || typeof themeToggleButton.click !== 'function') {
        return false;
    }

    themeToggleButton.click();
    return true;
}

async function switchBoardViewFromCommand(viewId) {
    const normalizedViewId = String(viewId || '').trim().toLowerCase() === 'table'
        ? 'table'
        : 'kanban';

    if (typeof closeBoardSwitcher === 'function') {
        closeBoardSwitcher();
    }

    hideShortcutHelpModal();

    if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' });
    }

    if (typeof closePlannerView === 'function' && typeof isPlannerOpen === 'function' && isPlannerOpen()) {
        closePlannerView();
    }

    if (typeof setActiveBoardView === 'function') {
        setActiveBoardView(normalizedViewId);
        return true;
    }

    return false;
}

async function openArchiveBrowserFromShortcut() {
    if (!window.boardRoot) {
        return false;
    }

    if (typeof closeBoardSwitcher === 'function') {
        closeBoardSwitcher();
    }

    if (typeof isArchiveBrowserModalOpen === 'function' && isArchiveBrowserModalOpen()) {
        return true;
    }

    if (typeof closeBoardMenuPopover === 'function') {
        closeBoardMenuPopover();
    }
    if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' });
    }
    if (typeof openArchiveBrowserModal === 'function') {
        await openArchiveBrowserModal();
        return true;
    }

    const openArchiveButton = document.getElementById('openArchiveBrowser');
    if (openArchiveButton && typeof openArchiveButton.click === 'function') {
        openArchiveButton.click();
        return true;
    }

    return false;
}

function isAnyShortcutBlockingModalOpen() {
    const modalIds = [
        'modalAddCard',
        'modalEditCard',
        'modalAddCardToList',
        'modalAddList',
        'modalBoardSettings',
        'modalArchiveBrowser',
        'modalAboutSignboard',
        'modalCommercialLicense',
    ];

    return modalIds.some((modalId) => {
        const modal = document.getElementById(modalId);
        return Boolean(modal && (modal.style.display === 'block' || modal.style.display === 'flex' || modal.style.display === 'grid'));
    });
}

function isAddCardOrListShortcut(event) {
    if (!event || !hasPrimaryShortcutModifier(event) || event.altKey) {
        return false;
    }

    if (isShortcutMacPlatform() && event.ctrlKey) {
        return false;
    }

    if (!isShortcutMacPlatform() && event.metaKey) {
        return false;
    }

    const key = String(event.key || '').trim().toLowerCase();
    return event.code === 'KeyN' || key === 'n';
}

function isBoardSearchShortcut(event) {
    if (!event || (!event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey) {
        return false;
    }

    const key = String(event.key || '').trim().toLowerCase();
    return event.code === 'KeyF' || key === 'f';
}

function isWorkspaceViewShortcut(event) {
    if (!hasPlannerDateViewShortcutModifiers(event)) {
        return false;
    }

    switch (event.code) {
        case 'Digit1':
            return true;
        case 'Digit2':
        case 'Digit3':
            return true;
        case 'Digit4':
        case 'Digit5':
            return event.altKey || Boolean(typeof isPlannerOpen === 'function' && isPlannerOpen());
        default:
            return isDigit1ShortcutEvent(event);
    }
}

function shouldCloseCardEditorForGlobalShortcut(event) {
    if (typeof isCardEditorActive !== 'function' || !isCardEditorActive()) {
        return false;
    }

    if (
        isMoveCardLeftShortcut(event) ||
        isMoveCardRightShortcut(event) ||
        isArchiveCardShortcut(event) ||
        isColorSchemeCycleShortcut(event) ||
        isKeyboardShortcutsShortcut(event)
    ) {
        return false;
    }

    return (
        isBoardSwitcherShortcut(event) ||
        isPlannerToggleShortcut(event) ||
        isBoardSettingsShortcut(event) ||
        isArchiveBrowserShortcut(event) ||
        isAddCardOrListShortcut(event) ||
        isBoardSearchShortcut(event) ||
        isWorkspaceViewShortcut(event)
    );
}

async function closeCardEditorForGlobalShortcutIfNeeded(event) {
    if (!shouldCloseCardEditorForGlobalShortcut(event)) {
        return false;
    }

    if (typeof closeAllModals !== 'function') {
        return false;
    }

    await closeAllModals({ key: 'Escape' });
    return true;
}

function closePlannerBeforeBoardCreationShortcut() {
    if (typeof isPlannerOpen === 'function' && isPlannerOpen() && typeof closePlannerView === 'function') {
        closePlannerView();
    }
}

async function openAddListFromShortcut() {
    closePlannerBeforeBoardCreationShortcut();

    const listName = document.getElementById('userInputListName');
    toggleAddListModal((window.innerWidth / 2) - 200, (window.innerHeight / 2) - 100);
    listName.focus();

    const btnAddList = document.getElementById('btnAddList');

    btnAddList.onclick = async (e) => {
        e.stopPropagation();

        const listName = document.getElementById('userInputListName');

        if (listName.value.length < 3) {
            return;
        }

        await processAddNewList(listName.value);

        listName.value = '';
    };

    listName.onkeydown = (key) => {
        if (key.code != 'Enter') return;
        const btnAddList = document.getElementById('btnAddList');
        btnAddList.click();
    };
}

let quickAddListLoadRequestId = 0;

function getQuickAddOpenBoardRoots() {
    const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [];
    const activeBoard = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(window.boardRoot || (typeof getStoredActiveBoard === 'function' ? getStoredActiveBoard() : ''))
        : String(window.boardRoot || '').trim();

    const boardRoots = [];
    if (activeBoard) {
        boardRoots.push(activeBoard);
    }

    for (const boardRoot of openBoards) {
        const normalizedBoardRoot = typeof normalizeBoardPath === 'function'
            ? normalizeBoardPath(boardRoot)
            : String(boardRoot || '').trim();

        if (normalizedBoardRoot && !boardRoots.includes(normalizedBoardRoot)) {
            boardRoots.push(normalizedBoardRoot);
        }
    }

    return boardRoots;
}

function renderQuickAddBoardOptions(selectedBoardRoot = '') {
    const boardSelect = document.getElementById('userInputBoardPath');
    if (!boardSelect) {
        return '';
    }

    const boardRoots = getQuickAddOpenBoardRoots();
    const normalizedSelectedBoardRoot = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(selectedBoardRoot)
        : String(selectedBoardRoot || '').trim();
    const selectedBoard = boardRoots.includes(normalizedSelectedBoardRoot)
        ? normalizedSelectedBoardRoot
        : boardRoots[0] || '';

    boardSelect.replaceChildren();

    for (const boardRoot of boardRoots) {
        const option = document.createElement('option');
        option.value = boardRoot;
        option.textContent = typeof getBoardLabelFromPath === 'function'
            ? getBoardLabelFromPath(boardRoot)
            : boardRoot.replace(/\/+$/, '').split('/').pop();
        boardSelect.appendChild(option);
    }

    boardSelect.disabled = boardRoots.length === 0;
    if (selectedBoard) {
        boardSelect.value = selectedBoard;
    }

    return selectedBoard;
}

function setQuickAddSubmitEnabled(isEnabled) {
    const submitButton = document.getElementById('btnAddCardToList');
    if (submitButton) {
        submitButton.disabled = !isEnabled;
    }
}

async function renderQuickAddListOptions(boardRoot, selectedListPath = '') {
    const listSelect = document.getElementById('userInputListPath');
    if (!listSelect) {
        return '';
    }

    const normalizedBoardRoot = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(boardRoot)
        : String(boardRoot || '').trim();
    const requestId = ++quickAddListLoadRequestId;

    listSelect.disabled = true;
    setQuickAddSubmitEnabled(false);
    listSelect.replaceChildren();

    const loadingOption = document.createElement('option');
    loadingOption.value = '';
    loadingOption.textContent = normalizedBoardRoot ? 'Loading lists...' : 'No open boards';
    listSelect.appendChild(loadingOption);

    if (!normalizedBoardRoot || !window.board || typeof window.board.listLists !== 'function') {
        return '';
    }

    try {
        const listsToSelect = await window.board.listLists(normalizedBoardRoot);
        if (requestId !== quickAddListLoadRequestId) {
            return '';
        }

        listSelect.replaceChildren();

        const listNames = Array.isArray(listsToSelect) ? listsToSelect : [];
        for (const listName of listNames) {
            const option = document.createElement('option');
            option.value = `${normalizedBoardRoot}${listName}/`;
            option.textContent = typeof getBoardListDisplayName === 'function'
                ? getBoardListDisplayName(listName)
                : String(listName || '').trim();
            listSelect.appendChild(option);
        }

        const normalizedSelectedListPath = typeof normalizeBoardPath === 'function'
            ? normalizeBoardPath(selectedListPath)
            : String(selectedListPath || '').trim();
        const optionValues = Array.from(listSelect.options).map((option) => option.value);
        const selectedList = optionValues.includes(normalizedSelectedListPath)
            ? normalizedSelectedListPath
            : optionValues[0] || '';

        if (selectedList) {
            listSelect.value = selectedList;
        }

        listSelect.disabled = listNames.length === 0;
        setQuickAddSubmitEnabled(listNames.length > 0);
        return selectedList;
    } catch (error) {
        if (requestId !== quickAddListLoadRequestId) {
            return '';
        }

        console.error('Unable to load lists for quick add.', error);
        listSelect.replaceChildren();
        const errorOption = document.createElement('option');
        errorOption.value = '';
        errorOption.textContent = 'Unable to load lists';
        listSelect.appendChild(errorOption);
        listSelect.disabled = true;
        setQuickAddSubmitEnabled(false);
        return '';
    }
}

async function submitQuickAddCardModal(options = {}) {
    const cardName = document.getElementById('userInputCardName');
    const listPath = document.getElementById('userInputListPath');
    const boardPath = document.getElementById('userInputBoardPath');
    const submitButton = document.getElementById('btnAddCardToList');

    if (!cardName || !listPath || !listPath.value) {
        return '';
    }

    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        const cardPath = await processAddNewCard(cardName.value, listPath.value, {
            boardRoot: boardPath ? boardPath.value : '',
            openAfterCreate: Boolean(options.openAfterCreate),
        });

        cardName.value = '';
        return cardPath;
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function openAddCardFromShortcut(options = {}) {
    closePlannerBeforeBoardCreationShortcut();

    const userInputBoardPath = document.getElementById('userInputBoardPath');
    const cardName = document.getElementById('userInputCardName');
    const selectedBoardRoot = renderQuickAddBoardOptions(options.boardRoot || window.boardRoot);

    if (userInputBoardPath) {
        userInputBoardPath.onchange = async () => {
            const selectedBoardRoot = userInputBoardPath.value;
            if (typeof waitForNativeMenuTrackingToSettle === 'function') {
                await waitForNativeMenuTrackingToSettle();
            }
            if (!userInputBoardPath.isConnected || userInputBoardPath.value !== selectedBoardRoot) {
                return;
            }

            await renderQuickAddListOptions(selectedBoardRoot);
        };
    }

    await renderQuickAddListOptions(selectedBoardRoot);

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(false);
    } else {
        document.getElementById('board').style = 'filter: blur(3px)';
    }

    toggleAddCardToListModal((window.innerWidth / 2) - 200, (window.innerHeight / 2) - 100);
    if (cardName) {
        cardName.focus();
    }

    const btnAddCardToList = document.getElementById('btnAddCardToList');

    btnAddCardToList.onclick = async (e) => {
        e.stopPropagation();
        await submitQuickAddCardModal({
            openAfterCreate: Boolean(e && e.shiftKey),
        });
    };
}

async function openQuickAddCardFromCommand() {
    hideShortcutHelpModal();

    if (typeof closeBoardSwitcher === 'function') {
        closeBoardSwitcher();
    }

    if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' }, { skipRerender: true });
    }

    await openAddCardFromShortcut();
}

syncShortcutHelpModifierLabels();

if (window.electronAPI && typeof window.electronAPI.onOpenKeyboardShortcuts === 'function') {
    window.electronAPI.onOpenKeyboardShortcuts(() => {
        showShortcutHelpModal();
    });
}

if (window.electronAPI && typeof window.electronAPI.onOpenBoardSwitcher === 'function') {
    window.electronAPI.onOpenBoardSwitcher(() => {
        hideShortcutHelpModal();
        if (typeof openBoardSwitcher === 'function') {
            openBoardSwitcher();
        }
    });
}

if (window.electronAPI && typeof window.electronAPI.onOpenBoardSettings === 'function') {
    window.electronAPI.onOpenBoardSettings(() => {
        hideShortcutHelpModal();
        openBoardSettingsFromShortcut().catch((error) => {
            console.error('Unable to open settings from shortcut.', error);
        });
    });
}

if (window.electronAPI && typeof window.electronAPI.onOpenQuickAddCard === 'function') {
    window.electronAPI.onOpenQuickAddCard(() => {
        openQuickAddCardFromCommand().catch((error) => {
            console.error('Unable to open quick add from global shortcut.', error);
        });
    });
}

if (window.electronAPI && typeof window.electronAPI.onToggleThemeMode === 'function') {
    window.electronAPI.onToggleThemeMode(() => {
        hideShortcutHelpModal();
        toggleThemeModeFromShortcut();
    });
}

if (window.electronAPI && typeof window.electronAPI.onSwitchBoardView === 'function') {
    window.electronAPI.onSwitchBoardView((viewId) => {
        switchBoardViewFromCommand(viewId).catch((error) => {
            console.error('Unable to switch board view from menu command.', error);
        });
    });
}

window.addEventListener('keydown', async (e) => {
        if ( e.key == 'Escape' ) {
            if (typeof isBoardSwitcherOpen === 'function' && isBoardSwitcherOpen()) {
                e.preventDefault();
                closeBoardSwitcher();
                return;
            }
            if (typeof isPlannerFilterPopoverOpen === 'function' && isPlannerFilterPopoverOpen()) {
                e.preventDefault();
                closePlannerFilterPopover();
                return;
            }
            const hadBlockingModal = isAnyShortcutBlockingModalOpen();
            hideShortcutHelpModal();
            await closeAllModals(e);
            if (!hadBlockingModal && typeof isPlannerOpen === 'function' && isPlannerOpen() && typeof closePlannerView === 'function') {
                e.preventDefault();
                closePlannerView();
            }
            return;
        }

        if (typeof isBoardSwitcherOpen === 'function' && isBoardSwitcherOpen()) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                e.preventDefault();
                if (e.key === 'ArrowDown' && typeof moveBoardSwitcherSelection === 'function') {
                    moveBoardSwitcherSelection(1);
                    return;
                }
                if (e.key === 'ArrowUp' && typeof moveBoardSwitcherSelection === 'function') {
                    moveBoardSwitcherSelection(-1);
                    return;
                }
                if (e.key === 'Enter' && typeof selectActiveBoardSwitcherOption === 'function') {
                    await selectActiveBoardSwitcherOption();
                    return;
                }
            }
        }
    
        if (!e.ctrlKey && !e.metaKey) return;

        let closedCardEditorForShortcut = false;
        if (shouldCloseCardEditorForGlobalShortcut(e)) {
            closedCardEditorForShortcut = await closeCardEditorForGlobalShortcutIfNeeded(e);
        }

        if (isMoveCardLeftShortcut(e) || isMoveCardRightShortcut(e)) {
            if (typeof isCardEditorActive === 'function' && isCardEditorActive()) {
                e.preventDefault();
                hideShortcutHelpModal();
                const direction = isMoveCardLeftShortcut(e) ? 'left' : 'right';
                if (typeof moveActiveEditorCardToAdjacentList === 'function') {
                    await moveActiveEditorCardToAdjacentList(direction);
                }
                return;
            }
        }

        if (isArchiveCardShortcut(e)) {
            if (typeof isCardEditorActive === 'function' && isCardEditorActive()) {
                e.preventDefault();
                hideShortcutHelpModal();
                if (typeof archiveActiveEditorCard === 'function') {
                    await archiveActiveEditorCard();
                }
                return;
            }
        }

        if (isBoardSwitcherShortcut(e)) {
            e.preventDefault();
            hideShortcutHelpModal();
            if (typeof toggleBoardSwitcherFromShortcut === 'function') {
                toggleBoardSwitcherFromShortcut();
            }
            return;
        }

        if (isPlannerToggleShortcut(e)) {
            e.preventDefault();
            hideShortcutHelpModal();
            if (typeof togglePlannerView === 'function') {
                await togglePlannerView();
            }
            return;
        }

        if (isKeyboardShortcutsShortcut(e)) {
            e.preventDefault();
            if (typeof closeBoardSwitcher === 'function') {
                closeBoardSwitcher();
            }

            if (shortcutHelpVisible) {
                hideShortcutHelpModal();
            } else {
                showShortcutHelpModal();
            }
            return;
        }

        if (typeof isPlannerOpen === 'function' && isPlannerOpen()) {
            if (
                typeof handlePlannerViewShortcut === 'function' &&
                handlePlannerViewShortcut(e, { ignoreEditableTarget: closedCardEditorForShortcut })
            ) {
                hideShortcutHelpModal();
                if (typeof closeBoardSwitcher === 'function') {
                    closeBoardSwitcher();
                }
                return;
            }

            if (isBoardSearchShortcut(e) && (closedCardEditorForShortcut || !isEditableShortcutTarget(e.target))) {
                if (typeof focusPlannerSearchInput === 'function' && focusPlannerSearchInput()) {
                    e.preventDefault();
                    hideShortcutHelpModal();
                    if (typeof closeBoardSwitcher === 'function') {
                        closeBoardSwitcher();
                    }
                }
                return;
            }

            const shouldAllowAfterClosingEditor = closedCardEditorForShortcut && (
                isArchiveBrowserShortcut(e) ||
                isAddCardOrListShortcut(e)
            );

            if (
                !shouldAllowAfterClosingEditor &&
                (
                    isColorSchemeCycleShortcut(e) ||
                    isArchiveBrowserShortcut(e) ||
                    isMoveCardLeftShortcut(e) ||
                    isMoveCardRightShortcut(e) ||
                    isArchiveCardShortcut(e) ||
                    isAddCardOrListShortcut(e)
                )
            ) {
                e.preventDefault();
                return;
            }
        }

        if (isBoardSettingsShortcut(e)) {
            e.preventDefault();
            hideShortcutHelpModal();
            await openBoardSettingsFromShortcut();
            return;
        }

        if (isColorSchemeCycleShortcut(e)) {
            e.preventDefault();
            hideShortcutHelpModal();
            if (typeof closeBoardSwitcher === 'function') {
                closeBoardSwitcher();
            }
            if (typeof cycleBoardColorSchemeFromShortcut === 'function') {
                await cycleBoardColorSchemeFromShortcut();
            }
            return;
        }

        if (isArchiveBrowserShortcut(e)) {
            e.preventDefault();
            hideShortcutHelpModal();
            await openArchiveBrowserFromShortcut();
            return;
        }

        if (await handleBoardViewShortcut(e, { ignoreEditableTarget: closedCardEditorForShortcut })) {
            hideShortcutHelpModal();
            if (typeof closeBoardSwitcher === 'function') {
                closeBoardSwitcher();
            }
            return;
        }

        if (isBoardSearchShortcut(e)) {
            if (focusBoardSearchInput()) {
                e.preventDefault();
                hideShortcutHelpModal();
                if (typeof closeBoardSwitcher === 'function') {
                    closeBoardSwitcher();
                }
            }
            return;
        }
        
        if (isAddCardOrListShortcut(e)) {
            e.preventDefault(); // Prevent default behavior (if any)
            hideShortcutHelpModal();
            if (typeof closeBoardSwitcher === 'function') {
                closeBoardSwitcher();
            }
            
            if ( e.shiftKey ) { // Add List
                await openAddListFromShortcut();
            } else {
                await openQuickAddCardFromCommand();
            }

        }
    });

window.addEventListener('blur', () => {
    hideShortcutHelpModal();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
        hideShortcutHelpModal();
    }
});

document.addEventListener('click', (event) => {
    if (!shortcutHelpVisible) {
        return;
    }

    const modal = getShortcutHelpModal();
    if (modal && !modal.contains(event.target)) {
        hideShortcutHelpModal();
    }
});
