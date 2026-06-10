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

    const cardEditorRelatedNotes = document.getElementById('cardEditorRelatedNotes');
    if (cardEditorRelatedNotes) {
        cardEditorRelatedNotes.innerHTML = '';
        cardEditorRelatedNotes.hidden = true;
    }

    const cardEditorLinkedObjectsCount = document.getElementById('cardEditorLinkedObjectsCount');
    if (cardEditorLinkedObjectsCount) {
        cardEditorLinkedObjectsCount.textContent = '';
        cardEditorLinkedObjectsCount.hidden = true;
    }

    if (typeof clearCardEditorDropState === 'function') {
        clearCardEditorDropState();
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

    if (target.closest('#cardEditorOpenWithPopover')) {
        return true;
    }

    if (target.closest('#cardEditorLinkedObjectsPopover')) {
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

function createCloseAllModalsRequest() {
    return {
        type: 'click',
        target: {
            id: 'board',
        },
    };
}

function isVisibleModal(modal) {
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function hideModalElement(modal, options = {}) {
    if (!modal) {
        return;
    }

    if (typeof setAccessibleModalVisible === 'function') {
        setAccessibleModalVisible(modal, false, options);
        return;
    }

    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

async function closeAllModals(e, options = {}){
    const eventTarget = e && e.target ? e.target : null;
    const isEscape = e && e.key === 'Escape';
    const isClick = e && e.type === 'click';
    const closeAllRequest = Boolean(eventTarget && eventTarget.id === 'board') || isEscape;

    if (
        eventTarget &&
        typeof eventTarget.closest === 'function' &&
        (
            eventTarget.closest('#modalBoardSwitcher') ||
            eventTarget.closest('#modalObsidianVaultRequired')
        )
    ) {
        return;
    }

    if (!closeAllRequest && !isClick) {
        return;
    }

    const shouldRerender = Boolean(options.rerender);
    const skipRerender = Boolean(options.skipRerender);

    const modalAddCard = document.getElementById('modalAddCard');
    const modalEditCard = document.getElementById('modalEditCard');
    const modalAddCardToList = document.getElementById('modalAddCardToList');
    const modalAddList = document.getElementById('modalAddList');
    const modalBoardSettings = document.getElementById('modalBoardSettings');
    const modalArchiveBrowser = document.getElementById('modalArchiveBrowser');
    const modalObsidianVaultRequired = document.getElementById('modalObsidianVaultRequired');
    const modalAboutSignboard = document.getElementById('modalAboutSignboard');
    const modalCommercialLicense = document.getElementById('modalCommercialLicense');
    const editModalWasOpen = isVisibleModal(modalEditCard);
    const boardSettingsWasOpen = modalBoardSettings && modalBoardSettings.style.display === 'block';

    let editModalClosed = false;
    let boardSettingsClosed = false;

    if (closeAllRequest && typeof closeAllLabelPopovers === 'function') {
        closeAllLabelPopovers();
    }
    if (closeAllRequest && typeof closeListActionsPopover === 'function') {
        closeListActionsPopover();
    }
    if (closeAllRequest && typeof closeCardEditorOpenWithPopover === 'function') {
        closeCardEditorOpenWithPopover();
    }
    if (closeAllRequest && typeof closeCardEditorLinkedObjectsPopover === 'function') {
        closeCardEditorLinkedObjectsPopover();
    }

    if ( closeAllRequest ) {
        if ( isVisibleModal(modalAddCard) ) {
            hideModalElement(modalAddCard);
        }
        if ( isVisibleModal(modalEditCard) ) {
            if (typeof flushEditorSaveIfNeeded === 'function') {
                await flushEditorSaveIfNeeded();
            }
            hideModalElement(modalEditCard);
            resetCardEditorModalState();
            setBoardInteractive(true);
            editModalClosed = true;
        }
        if ( isVisibleModal(modalAddCardToList) ) {
            hideModalElement(modalAddCardToList);
            setBoardInteractive(true);
        }
        if ( isVisibleModal(modalAddList) ) {
            hideModalElement(modalAddList);
            setBoardInteractive(true);
        }
        if ( modalBoardSettings && modalBoardSettings.style.display === 'block' ) {
            if (typeof flushAppSettingsSave === 'function') {
                await flushAppSettingsSave();
            }
            if (typeof flushBoardLabelSettingsSave === 'function') {
                await flushBoardLabelSettingsSave();
            }
            hideModalElement(modalBoardSettings);
            setBoardInteractive(true);
            boardSettingsClosed = true;
        }
        if ( modalArchiveBrowser && modalArchiveBrowser.style.display === 'block' ) {
            if (typeof closeArchiveBrowserModal === 'function') {
                closeArchiveBrowserModal();
            } else {
                hideModalElement(modalArchiveBrowser);
                setBoardInteractive(true);
            }
        }
        if ( modalObsidianVaultRequired && modalObsidianVaultRequired.style.display === 'block' ) {
            hideModalElement(modalObsidianVaultRequired);
            setBoardInteractive(true);
        }
        if ( modalAboutSignboard && modalAboutSignboard.style.display === 'block' ) {
            hideModalElement(modalAboutSignboard);
            setBoardInteractive(true);
        }
        if ( modalCommercialLicense && modalCommercialLicense.style.display === 'block' ) {
            hideModalElement(modalCommercialLicense);
            setBoardInteractive(true);
        }
    } else {
        if ( isVisibleModal(modalAddCard) && eventTarget && !modalAddCard.contains(eventTarget) ) {
            hideModalElement(modalAddCard);
        }

        const clickIsInsideCardEditor = isCardEditorRelatedClickTarget(eventTarget);
        if ( isVisibleModal(modalEditCard) && !clickIsInsideCardEditor ) {
            if (typeof flushEditorSaveIfNeeded === 'function') {
                await flushEditorSaveIfNeeded();
            }
            hideModalElement(modalEditCard);
            resetCardEditorModalState();
            setBoardInteractive(true);
            editModalClosed = true;
        }

        if ( isVisibleModal(modalAddCardToList) && eventTarget && !modalAddCardToList.contains(eventTarget) ) {
            hideModalElement(modalAddCardToList);
            setBoardInteractive(true);
        }

        if ( isVisibleModal(modalAddList) && eventTarget && !modalAddList.contains(eventTarget) ) {
            hideModalElement(modalAddList);
            setBoardInteractive(true);
        }

        if ( modalBoardSettings && modalBoardSettings.style.display === 'block' && eventTarget && !modalBoardSettings.contains(eventTarget) ) {
            if (typeof flushAppSettingsSave === 'function') {
                await flushAppSettingsSave();
            }
            if (typeof flushBoardLabelSettingsSave === 'function') {
                await flushBoardLabelSettingsSave();
            }
            hideModalElement(modalBoardSettings);
            setBoardInteractive(true);
            boardSettingsClosed = true;
        }

        if ( modalArchiveBrowser && modalArchiveBrowser.style.display === 'block' && eventTarget && !modalArchiveBrowser.contains(eventTarget) ) {
            if (typeof closeArchiveBrowserModal === 'function') {
                closeArchiveBrowserModal();
            } else {
                hideModalElement(modalArchiveBrowser);
                setBoardInteractive(true);
            }
        }

        if ( modalObsidianVaultRequired && modalObsidianVaultRequired.style.display === 'block' && eventTarget && !modalObsidianVaultRequired.contains(eventTarget) ) {
            hideModalElement(modalObsidianVaultRequired);
            setBoardInteractive(true);
        }

        if ( modalAboutSignboard && modalAboutSignboard.style.display === 'block' && eventTarget && !modalAboutSignboard.contains(eventTarget) ) {
            hideModalElement(modalAboutSignboard);
            setBoardInteractive(true);
        }

        if ( modalCommercialLicense && modalCommercialLicense.style.display === 'block' && eventTarget && !modalCommercialLicense.contains(eventTarget) ) {
            hideModalElement(modalCommercialLicense);
            setBoardInteractive(true);
        }
    }

    if (editModalClosed) {
        if (typeof destroyTaskLineDueDateControls === 'function') {
            destroyTaskLineDueDateControls();
        }
        FDatepicker.destroyAll();
        OverType.destroyAll();
        if (typeof clearQueuedEditorSave === 'function') {
            clearQueuedEditorSave();
        }
        if (typeof clearActiveCardEditorState === 'function') {
            clearActiveCardEditorState();
        }
    }

    if (!skipRerender && (shouldRerender || editModalClosed || boardSettingsClosed)) {
        await renderBoard();
        if (editModalClosed && typeof isPlannerOpen === 'function' && isPlannerOpen() && typeof renderPlannerView === 'function') {
            await renderPlannerView();
        }
    }
}
