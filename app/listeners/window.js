const SHORTCUT_HELP_HOLD_DELAY_MS = 2000;
const SHORTCUT_HELP_MODAL_ID = 'modalKeyboardShortcuts';

let shortcutHelpHoldTimerId = null;
let shortcutHelpVisible = false;

function isMacShortcutPlatform() {
    const platformValue = String(
        (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
    ).toLowerCase();
    return platformValue.includes('mac');
}

const usesMetaShortcutModifier = isMacShortcutPlatform();

function isShortcutHelpModifierKey(event) {
    const key = String(event.key || '').toLowerCase();
    return usesMetaShortcutModifier ? key === 'meta' : key === 'control';
}

function isShortcutHelpModifierPressed(event) {
    return usesMetaShortcutModifier ? event.metaKey : event.ctrlKey;
}

function getShortcutHelpModal() {
    return document.getElementById(SHORTCUT_HELP_MODAL_ID);
}

function clearShortcutHelpHoldTimer() {
    if (!shortcutHelpHoldTimerId) {
        return;
    }

    window.clearTimeout(shortcutHelpHoldTimerId);
    shortcutHelpHoldTimerId = null;
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

function startShortcutHelpHoldTimer() {
    if (shortcutHelpHoldTimerId || shortcutHelpVisible) {
        return;
    }

    shortcutHelpHoldTimerId = window.setTimeout(() => {
        shortcutHelpHoldTimerId = null;
        showShortcutHelpModal();
    }, SHORTCUT_HELP_HOLD_DELAY_MS);
}

function syncShortcutHelpModifierLabels() {
    // Keep the modal list and hint text aligned with the platform shortcut modifier.
    const modifierLabel = usesMetaShortcutModifier ? 'Command' : 'Control';
    const modifierKey = usesMetaShortcutModifier ? '⌘' : 'Ctrl';

    document.querySelectorAll('.shortcut-modifier-label').forEach((element) => {
        element.textContent = modifierLabel;
    });
    document.querySelectorAll('.shortcut-key-modifier').forEach((element) => {
        element.textContent = modifierKey;
    });
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

syncShortcutHelpModifierLabels();

window.addEventListener('keydown', async (e) => {
        if (isShortcutHelpModifierKey(e) && isShortcutHelpModifierPressed(e)) {
            startShortcutHelpHoldTimer();
        } else if (!isShortcutHelpModifierPressed(e)) {
            clearShortcutHelpHoldTimer();
            hideShortcutHelpModal();
        } else if (!isShortcutHelpModifierKey(e)) {
            // Any shortcut selection while holding the modifier should close the helper.
            clearShortcutHelpHoldTimer();
            hideShortcutHelpModal();
        }

        if ( e.key == 'Escape' ) {
            await closeAllModals(e);
            return;
        }
    
        if (!e.ctrlKey && !e.metaKey) return;

        if (handleBoardViewShortcut(e)) {
            return;
        }
        
        if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'n') {
            e.preventDefault(); // Prevent default behavior (if any)
            
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

window.addEventListener('keyup', (e) => {
    if (isShortcutHelpModifierKey(e) || !isShortcutHelpModifierPressed(e)) {
        clearShortcutHelpHoldTimer();
        hideShortcutHelpModal();
    }
});

window.addEventListener('blur', () => {
    clearShortcutHelpHoldTimer();
    hideShortcutHelpModal();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
        clearShortcutHelpHoldTimer();
        hideShortcutHelpModal();
    }
});
