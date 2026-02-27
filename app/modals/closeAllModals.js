function setBoardInteractive(isInteractive) {
    const board = document.getElementById('board');
    if (!board) return;

    board.style.filter = isInteractive ? 'none' : 'blur(3px)';
    board.style.pointerEvents = isInteractive ? '' : 'none';
    board.style.userSelect = isInteractive ? '' : 'none';
}

function resetCardEditorModalState() {
    const cardEditorTitle = document.getElementById('cardEditorTitle');
    if (cardEditorTitle) {
        cardEditorTitle.textContent = '';
    }

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (cardEditorCardPath) {
        cardEditorCardPath.value = '';
    }

    const cardEditorCardMetadata = document.getElementById('cardEditorCardMetadata');
    if (cardEditorCardMetadata) {
        cardEditorCardMetadata.value = '';
    }

    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
    if (cardEditorCardDueDateDisplay) {
        cardEditorCardDueDateDisplay.textContent = '';
    }

    const cardEditorCardLabels = document.getElementById('cardEditorCardLabels');
    if (cardEditorCardLabels) {
        cardEditorCardLabels.textContent = '';
    }
}

function isCardEditorRelatedClickTarget(target) {
    if (!target || typeof target.closest !== 'function') {
        return false;
    }

    if (target.closest('#modalEditCard')) {
        return true;
    }

    if (target.closest('.card-label-popover')) {
        return true;
    }

    if (target.closest('.sb-themed-fdatepicker')) {
        return true;
    }

    if (target.closest('[data-fdatepicker="due-date-anchor"]')) {
        return true;
    }

    return false;
}

async function closeAllModals(e, options = {}){
    const eventTarget = e && e.target ? e.target : null;
    const isEscape = e && e.key === 'Escape';
    const isClick = e && e.type === 'click';
    const closeAllRequest = Boolean(eventTarget && eventTarget.id === 'board') || isEscape;

    if (!closeAllRequest && !isClick) {
        return;
    }

    const shouldRerender = Boolean(options.rerender);

    const modalAddCard = document.getElementById('modalAddCard');
    const modalEditCard = document.getElementById('modalEditCard');
    const modalAddCardToList = document.getElementById('modalAddCardToList');
    const modalAddList = document.getElementById('modalAddList');
    const modalBoardSettings = document.getElementById('modalBoardSettings');
    const editModalWasOpen = modalEditCard.style.display === 'block';
    const boardSettingsWasOpen = modalBoardSettings && modalBoardSettings.style.display === 'block';

    let editModalClosed = false;
    let boardSettingsClosed = false;

    if (closeAllRequest && typeof closeAllLabelPopovers === 'function') {
        closeAllLabelPopovers();
    }

    if ( closeAllRequest ) {
        if ( modalAddCard.style.display === 'block' ) {
            modalAddCard.style.display = 'none';
        }
        if ( modalEditCard.style.display === 'block' ) {
            if (typeof flushEditorSaveIfNeeded === 'function') {
                await flushEditorSaveIfNeeded();
            }
            modalEditCard.style.display = 'none';
            resetCardEditorModalState();
            setBoardInteractive(true);
            editModalClosed = true;
        }
        if ( modalAddCardToList.style.display === 'block' ) {
            modalAddCardToList.style.display = 'none';
            setBoardInteractive(true);
        }
        if ( modalAddList.style.display === 'block' ) {
            modalAddList.style.display = 'none';
            setBoardInteractive(true);
        }
        if ( modalBoardSettings && modalBoardSettings.style.display === 'block' ) {
            if (typeof flushBoardLabelSettingsSave === 'function') {
                await flushBoardLabelSettingsSave();
            }
            modalBoardSettings.style.display = 'none';
            setBoardInteractive(true);
            boardSettingsClosed = true;
        }
    } else {
        if ( modalAddCard.style.display === 'block' && eventTarget && !modalAddCard.contains(eventTarget) ) {
            modalAddCard.style.display = 'none';
        }

        const clickIsInsideCardEditor = isCardEditorRelatedClickTarget(eventTarget);
        if ( modalEditCard.style.display === 'block' && !clickIsInsideCardEditor ) {
            if (typeof flushEditorSaveIfNeeded === 'function') {
                await flushEditorSaveIfNeeded();
            }
            modalEditCard.style.display = 'none';
            resetCardEditorModalState();
            setBoardInteractive(true);
            editModalClosed = true;
        }

        if ( modalAddCardToList.style.display === 'block' && eventTarget && !modalAddCardToList.contains(eventTarget) ) {
            modalAddCardToList.style.display = 'none';
            setBoardInteractive(true);
        }

        if ( modalAddList.style.display === 'block' && eventTarget && !modalAddList.contains(eventTarget) ) {
            modalAddList.style.display = 'none';
            setBoardInteractive(true);
        }

        if ( modalBoardSettings && modalBoardSettings.style.display === 'block' && eventTarget && !modalBoardSettings.contains(eventTarget) ) {
            if (typeof flushBoardLabelSettingsSave === 'function') {
                await flushBoardLabelSettingsSave();
            }
            modalBoardSettings.style.display = 'none';
            setBoardInteractive(true);
            boardSettingsClosed = true;
        }
    }

    if (editModalClosed) {
        FDatepicker.destroyAll();
        OverType.destroyAll();
        if (typeof clearQueuedEditorSave === 'function') {
            clearQueuedEditorSave();
        }
    }

    if (shouldRerender || editModalClosed || boardSettingsClosed) {
        await renderBoard();
    }
}
