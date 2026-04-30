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

    modal.style.display = 'block';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    shortcutHelpVisible = true;
}

function hideShortcutHelpModal() {
    const modal = getShortcutHelpModal();
    if (!modal) {
        shortcutHelpVisible = false;
        return;
    }

    modal.style.display = 'none';
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
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

function handleBoardViewShortcut(e) {
    if (e.shiftKey || e.altKey || isEditableShortcutTarget(e.target) || typeof setActiveBoardView !== 'function') {
        return false;
    }

    let nextViewId = '';
    switch (e.code) {
        case 'Digit1':
            nextViewId = 'kanban';
            break;
        case 'Digit2':
            nextViewId = 'calendar';
            break;
        case 'Digit3':
            nextViewId = 'this-week';
            break;
        default:
            return false;
    }

    e.preventDefault();
    setActiveBoardView(nextViewId);
    return true;
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
            console.error('Unable to open board settings from shortcut.', error);
        });
    });
}

if (window.electronAPI && typeof window.electronAPI.onToggleThemeMode === 'function') {
    window.electronAPI.onToggleThemeMode(() => {
        hideShortcutHelpModal();
        toggleThemeModeFromShortcut();
    });
}

window.addEventListener('keydown', async (e) => {
        if ( e.key == 'Escape' ) {
            if (typeof isBoardSwitcherOpen === 'function' && isBoardSwitcherOpen()) {
                e.preventDefault();
                closeBoardSwitcher();
                return;
            }
            hideShortcutHelpModal();
            await closeAllModals(e);
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

        if (isBoardSwitcherShortcut(e)) {
            e.preventDefault();
            hideShortcutHelpModal();
            if (typeof toggleBoardSwitcherFromShortcut === 'function') {
                toggleBoardSwitcherFromShortcut();
            }
            return;
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

        if (isMoveCardLeftShortcut(e) || isMoveCardRightShortcut(e)) {
            if (typeof isCardEditorActive === 'function' && isCardEditorActive()) {
                e.preventDefault();
                hideShortcutHelpModal();
                const direction = isMoveCardLeftShortcut(e) ? 'left' : 'right';
                if (typeof moveActiveEditorCardToAdjacentList === 'function') {
                    await moveActiveEditorCardToAdjacentList(direction);
                }
            }
            return;
        }

        if (isArchiveCardShortcut(e)) {
            if (typeof isCardEditorActive === 'function' && isCardEditorActive()) {
                e.preventDefault();
                hideShortcutHelpModal();
                if (typeof archiveActiveEditorCard === 'function') {
                    await archiveActiveEditorCard();
                }
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

        if (handleBoardViewShortcut(e)) {
            hideShortcutHelpModal();
            if (typeof closeBoardSwitcher === 'function') {
                closeBoardSwitcher();
            }
            return;
        }

        if (String(e.key || '').toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
            if (focusBoardSearchInput()) {
                e.preventDefault();
                hideShortcutHelpModal();
                if (typeof closeBoardSwitcher === 'function') {
                    closeBoardSwitcher();
                }
            }
            return;
        }
        
        if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'n') {
            e.preventDefault(); // Prevent default behavior (if any)
            hideShortcutHelpModal();
            if (typeof closeBoardSwitcher === 'function') {
                closeBoardSwitcher();
            }
            
            if ( e.shiftKey ) { // Add List
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

                };

                listName.onkeydown = (key) => {
                    if (key.code != 'Enter') return;
                    const btnAddList = document.getElementById('btnAddList');
                    btnAddList.click();
                };

            } else {
                const listsToSelect = await window.board.listLists( window.boardRoot );

                const userInputListPath = document.getElementById('userInputListPath');
                userInputListPath.innerHTML = '';
                const cardName = document.getElementById('userInputCardName');

                listsToSelect.forEach((optionText, index) => {
                    const option = document.createElement("option");
                    option.value = `${window.boardRoot + optionText + '/'}`;
                    option.text = optionText.slice(4,optionText.length-6);
                    userInputListPath.appendChild(option);
                });

                document.getElementById('board').style = 'filter: blur(3px)';

                toggleAddCardToListModal( (window.innerWidth / 2)-200, (window.innerHeight / 2)-100 );
                cardName.focus();

                const btnAddCardToList = document.getElementById('btnAddCardToList');

                btnAddCardToList.onclick = async (e) => {
                    e.stopPropagation();
                    
                    const cardName = document.getElementById('userInputCardName');
                    const listPath = document.getElementById('userInputListPath');
                    
                    await processAddNewCard( cardName.value, listPath.value );

                    cardName.value = '';
                    listPath.value = '';

                };
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
