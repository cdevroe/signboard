function setBoardInteractive(isInteractive) {
    const board = document.getElementById('board');
    if (!board) return;

    board.style.filter = isInteractive ? 'none' : 'blur(3px)';
    board.style.pointerEvents = isInteractive ? '' : 'none';
    board.style.userSelect = isInteractive ? '' : 'none';
}

async function closeAllModals(e, options = {}){
    if (e.target.id != 'board' && e.key !== 'Escape') return;

    closeAllLabelPopovers();

    const shouldRerender = Boolean(options.rerender);
    
    const modalAddCard = document.getElementById('modalAddCard');
    const modalEditCard = document.getElementById('modalEditCard');
    const modalAddCardToList = document.getElementById('modalAddCardToList');
    const modalAddList = document.getElementById('modalAddList');
    const modalBoardSettings = document.getElementById('modalBoardSettings');
    const editModalWasOpen = modalEditCard.style.display === 'block';
    const boardSettingsWasOpen = modalBoardSettings && modalBoardSettings.style.display === 'block';

    if (editModalWasOpen && typeof flushEditorSaveIfNeeded === 'function') {
        await flushEditorSaveIfNeeded();
    }

    if (boardSettingsWasOpen && typeof flushBoardLabelSettingsSave === 'function') {
        await flushBoardLabelSettingsSave();
    }

    if ( e.target.id == 'board' || e.key == 'Escape' ) {
        if ( modalAddCard.style.display === 'block' ) {
            modalAddCard.style.display = 'none';
        }
        if ( modalEditCard.style.display === 'block' ) {
            modalEditCard.style.display = 'none';
            const cardEditorTitle = document.getElementById('cardEditorTitle');
            
            const cardEditorContents = document.getElementsByClassName('overtype-input');
            cardEditorContents[0].value = '';
            cardEditorTitle.textContent = '';
            const cardEditorCardMetadata = document.getElementById('cardEditorCardMetadata');
            cardEditorCardMetadata.value = '';
            const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
            cardEditorCardDueDateDisplay.textContent = '';
            const cardEditorCardLabels = document.getElementById('cardEditorCardLabels');
            if (cardEditorCardLabels) {
                cardEditorCardLabels.textContent = '';
            }
            setBoardInteractive(true);
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
            modalBoardSettings.style.display = 'none';
            setBoardInteractive(true);
        }
    } else {
        if ( modalAddCard.style.display === 'block' && !modalAddCard.contains(e.target) ) {
            modalAddCard.style.display = 'none';
        }

        if ( modalEditCard.style.display === 'block' && !modalEditCard.contains(e.target) ) {
            modalEditCard.style.display = 'none';
            const cardEditorTitle = document.getElementById('cardEditorTitle');
            
            const cardEditorContents = document.getElementsByClassName('overtype-input');
            cardEditorContents[0].value = '';
            cardEditorTitle.textContent = '';
            const cardEditorCardMetadata = document.getElementById('cardEditorCardMetadata');
            cardEditorCardMetadata.value = '';
            const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
            cardEditorCardDueDateDisplay.textContent = '';
            const cardEditorCardLabels = document.getElementById('cardEditorCardLabels');
            if (cardEditorCardLabels) {
                cardEditorCardLabels.textContent = '';
            }
            setBoardInteractive(true);
        }

        if ( modalAddCardToList.style.display === 'block' && !modalAddCardToList.contains(e.target) ) {
            modalAddCardToList.style.display = 'none';
            setBoardInteractive(true);
        }

        if ( modalBoardSettings && modalBoardSettings.style.display === 'block' && !modalBoardSettings.contains(e.target) ) {
            modalBoardSettings.style.display = 'none';
            setBoardInteractive(true);
        }
    }

    FDatepicker.destroyAll();
    OverType.destroyAll();

    if (shouldRerender || editModalWasOpen || boardSettingsWasOpen) {
        await renderBoard();
    }
}
