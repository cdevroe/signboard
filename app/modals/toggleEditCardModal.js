function getEditorFrontmatter() {
    const state = document.getElementById('cardEditorCardMetadata').value;

    try {
        const parsed = JSON.parse(state || '{}');
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch {
        return {};
    }
}

function setEditorFrontmatter(frontmatter) {
    document.getElementById('cardEditorCardMetadata').value = JSON.stringify(frontmatter || {});
}

const TIMESTAMP_TOOLBAR_ICON = `
<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
  <circle cx="9" cy="9" r="7" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></circle>
  <path d="M9 4.5v4.5l3 2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
</svg>`;

function addTimestampToolbarButton(editor) {
    if (!editor || !editor.container) {
        return;
    }

    const toolbar = editor.container.querySelector('.overtype-toolbar');
    if (!toolbar) {
        return;
    }

    if (toolbar.querySelector('[data-action="insert-timestamp-list-item"]')) {
        return;
    }

    const button = document.createElement('button');
    button.className = 'overtype-toolbar-button';
    button.type = 'button';
    button.title = 'Add timestamped list item';
    button.setAttribute('aria-label', 'Add timestamped list item');
    button.setAttribute('data-action', 'insert-timestamp-list-item');
    button.innerHTML = TIMESTAMP_TOOLBAR_ICON;
    button.addEventListener('click', (event) => {
        event.preventDefault();
        insertTimestampListItem(editor.textarea);
    });

    const viewModeButton = toolbar.querySelector('[data-action="toggle-view-menu"]');
    if (viewModeButton && viewModeButton.parentNode === toolbar) {
        toolbar.insertBefore(button, viewModeButton);
        return;
    }

    toolbar.appendChild(button);
}

function setEditorLabelDisplay(labelIds) {
    const cardEditorCardLabels = document.getElementById('cardEditorCardLabels');
    if (!cardEditorCardLabels) {
        return;
    }

    const ids = Array.isArray(labelIds) ? labelIds.map((labelId) => String(labelId)) : [];
    if (ids.length === 0) {
        cardEditorCardLabels.textContent = '';
        return;
    }

    const names = ids.map((labelId) => {
        const label = getBoardLabelById(labelId);
        return label ? label.name : 'Unknown label';
    });

    cardEditorCardLabels.textContent = names.join(', ');
}

let pendingEditorBody = '';
let pendingEditorSaveTimer = null;
let editorSaveInFlight = Promise.resolve();
let cardEditorListMoveFeedbackTimer = null;

function getActiveEditorCardPath() {
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    return cardEditorCardPath ? String(cardEditorCardPath.value || '').trim() : '';
}

function isCardEditorActive() {
    const modalEditCard = document.getElementById('modalEditCard');
    if (!modalEditCard || modalEditCard.style.display !== 'block') {
        return false;
    }

    return getActiveEditorCardPath().length > 0;
}

function clearQueuedEditorSave() {
    if (pendingEditorSaveTimer) {
        clearTimeout(pendingEditorSaveTimer);
        pendingEditorSaveTimer = null;
    }

    pendingEditorBody = '';
}

function enqueueEditorSave(bodyValue) {
    if (!isCardEditorActive()) {
        return editorSaveInFlight;
    }

    const bodyToSave = typeof bodyValue === 'string' ? bodyValue : '';
    editorSaveInFlight = editorSaveInFlight
        .then(() => saveEditorCard(bodyToSave))
        .catch((error) => {
            console.error('Failed to save card.', error);
        });

    return editorSaveInFlight;
}

function queueEditorSave(bodyValue) {
    if (!isCardEditorActive()) {
        return;
    }

    pendingEditorBody = typeof bodyValue === 'string' ? bodyValue : '';

    if (pendingEditorSaveTimer) {
        clearTimeout(pendingEditorSaveTimer);
    }

    pendingEditorSaveTimer = setTimeout(() => {
        pendingEditorSaveTimer = null;
        enqueueEditorSave(pendingEditorBody);
    }, 300);
}

async function flushEditorSaveIfNeeded() {
    if (pendingEditorSaveTimer) {
        clearTimeout(pendingEditorSaveTimer);
        pendingEditorSaveTimer = null;
        if (isCardEditorActive()) {
            enqueueEditorSave(pendingEditorBody);
        } else {
            pendingEditorBody = '';
        }
    }

    await editorSaveInFlight;
}

async function saveEditorCard(bodyValue) {
    if (!isCardEditorActive()) {
        return;
    }

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardPath = getActiveEditorCardPath();
    if (!cardPath) {
        return;
    }

    const currentFrontmatter = getEditorFrontmatter();
    const normalizedFrontmatter = await window.board.normalizeFrontmatter({
        ...currentFrontmatter,
        title: cardEditorTitle.textContent.trim(),
    });

    setEditorFrontmatter(normalizedFrontmatter);

    await window.board.writeCard(cardPath, {
        frontmatter: normalizedFrontmatter,
        body: typeof bodyValue === 'string' ? bodyValue : '',
    });
}

let activeDueDatePickerInput = null;

function destroyActiveDueDatePicker() {
    if (activeDueDatePickerInput && activeDueDatePickerInput._fdatepicker) {
        activeDueDatePickerInput._fdatepicker.destroy();
    }

    if (activeDueDatePickerInput && activeDueDatePickerInput.parentNode) {
        activeDueDatePickerInput.parentNode.removeChild(activeDueDatePickerInput);
    }

    activeDueDatePickerInput = null;
}

function positionDueDatePickerAnchorInput(anchorInput, triggerElement) {
    if (!anchorInput || !triggerElement || typeof triggerElement.getBoundingClientRect !== 'function') {
        return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const top = Math.round(triggerRect.bottom + window.scrollY);
    const left = Math.round(triggerRect.left + window.scrollX);

    anchorInput.style.top = `${top}px`;
    anchorInput.style.left = `${left}px`;
}

function createDueDatePickerAnchorInput(triggerElement) {
    const anchorInput = document.createElement('input');
    anchorInput.type = 'text';
    anchorInput.className = 'due-date-picker-anchor-input';
    anchorInput.tabIndex = -1;
    anchorInput.setAttribute('aria-hidden', 'true');
    anchorInput.setAttribute('data-fdatepicker', 'due-date-anchor');

    anchorInput.style.position = 'absolute';
    anchorInput.style.height = '1px';
    anchorInput.style.width = '1px';
    anchorInput.style.opacity = '0';
    anchorInput.style.pointerEvents = 'none';
    anchorInput.style.zIndex = '-1';

    positionDueDatePickerAnchorInput(anchorInput, triggerElement);
    document.body.appendChild(anchorInput);

    return anchorInput;
}

function parseDueDateStringToDate(dueDateValue) {
    const normalizedDueDate = String(dueDateValue || '').trim();
    if (!normalizedDueDate) {
        return null;
    }

    const [year, month, day] = normalizedDueDate.split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function openDueDatePickerAtTrigger({
    triggerElement,
    dueDateValue,
    onSelect,
}) {
    if (!triggerElement || typeof FDatepicker !== 'function') {
        return;
    }

    if (typeof closeAllLabelPopovers === 'function') {
        closeAllLabelPopovers();
    }

    destroyActiveDueDatePicker();

    const anchorInput = createDueDatePickerAnchorInput(triggerElement);
    activeDueDatePickerInput = anchorInput;

    const picker = new FDatepicker(anchorInput, {
        format: 'Y-m-d',
        autoClose: true,
    });

    const initialDate = parseDueDateStringToDate(dueDateValue);
    if (initialDate) {
        picker.setDate(initialDate);
    }

    anchorInput.onchange = async () => {
        if (String(anchorInput.value || '').trim().length === 0 && typeof onSelect === 'function') {
            await onSelect('');
        }
    };

    picker.update({
        format: 'Y-m-d',
        autoClose: true,
        onClose: () => {
            setTimeout(() => {
                if (activeDueDatePickerInput === anchorInput) {
                    destroyActiveDueDatePicker();
                } else if (anchorInput && anchorInput.parentNode) {
                    if (anchorInput._fdatepicker) {
                        anchorInput._fdatepicker.destroy();
                    }
                    anchorInput.parentNode.removeChild(anchorInput);
                }
            }, 0);
        },
        onSelect: async (value) => {
            if (typeof onSelect === 'function') {
                await onSelect(value);
            }
        }
    });

    picker.open();
    if (picker.popup) {
        picker.popup.classList.add('sb-themed-fdatepicker');
    }
    if (typeof picker.setPosition === 'function') {
        picker.setPosition();
    }
}

async function toggleEditCardModal(cardPath, options = {}) {
    const shouldOpenDueDatePicker = Boolean(options && options.openDueDatePicker);
    const modalEditCard = document.getElementById('modalEditCard');

    const card = await window.board.readCard(cardPath);

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardID = await window.board.getCardID(cardPath);
    const cardEditorCardID = document.getElementById('cardEditorCardID');
    cardEditorCardID.textContent = cardID;
    cardEditorCardID.onclick = (e) => {
        e.preventDefault();
        window.board.openCard(cardEditorCardPath.value);
    };

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
    const cardEditorSetLabelsLink = document.getElementById('cardEditorSetLabelsLink');

    setEditorFrontmatter(card.frontmatter);
    cardEditorCardPath.value = cardPath;
    cardEditorTitle.textContent = card.frontmatter.title || '';
    cardEditorCardDueDateDisplay.textContent = '';
    setEditorLabelDisplay(card.frontmatter.labels);

    if (card.frontmatter.due) {
        cardEditorCardDueDateDisplay.textContent = await window.board.formatDueDate(card.frontmatter.due);
    }

    const [editor] = new OverType('#cardEditorOverType', {
        value: card.body,
        fontSize: '16px',
        lineHeight: 1.6,
        fontFamily: 'system-ui',
        padding: '16px',
        toolbar: true,
        placeholder: 'Notes...',
        onChange: handleNotesSave
    });

    if (typeof applyEditorThemeFromActiveMode === 'function') {
        applyEditorThemeFromActiveMode();
    } else if (getBoardThemeMode() === 'dark') {
        OverType.setTheme(customOverTypeThemes.dark);
    } else {
        OverType.setTheme(customOverTypeThemes.light);
    }

    editor.setValue(card.body);
    addTimestampToolbarButton(editor);

    cardEditorTitle.onkeydown = (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }
    };

    cardEditorTitle.onkeyup = async (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }

        const cardEditorContents = document.getElementsByClassName('overtype-input');
        await handleNotesSave(cardEditorContents[0].value,false);
    };

    const cardEditorSetDueDateLink = document.getElementById('cardEditorSetDueDateLink');
    const openDueDatePickerControl = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const editorFrontmatter = getEditorFrontmatter();
        openDueDatePickerAtTrigger({
            triggerElement: cardEditorSetDueDateLink,
            dueDateValue: editorFrontmatter.due,
            onSelect: async (value) => {
                await handleMetadataSave(value, 'due');
            },
        });
    };
    cardEditorSetDueDateLink.onclick = openDueDatePickerControl;

    if (cardEditorSetLabelsLink) {
      cardEditorSetLabelsLink.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const frontmatter = getEditorFrontmatter();
        const selectedLabels = Array.isArray(frontmatter.labels) ? frontmatter.labels : [];

        toggleCardLabelSelector(
            cardEditorSetLabelsLink,
            cardEditorCardPath.value,
            selectedLabels,
            async (nextLabelIds) => {
                const currentFrontmatter = getEditorFrontmatter();
                const normalizedFrontmatter = await window.board.normalizeFrontmatter({
                    ...currentFrontmatter,
                    labels: nextLabelIds,
                });

                setEditorFrontmatter(normalizedFrontmatter);
                setEditorLabelDisplay(normalizedFrontmatter.labels);

                const cardEditorContents = document.getElementsByClassName('overtype-input');
                pendingEditorBody = cardEditorContents[0]?.value || '';
                await flushEditorSaveIfNeeded();
                await enqueueEditorSave(pendingEditorBody);
            },
        );
      };
    }

    const cardEditorArchiveLink = document.getElementById('cardEditorArchiveLink');
    cardEditorArchiveLink.onclick = async (e) => {
        const cardEditorCardPath = document.getElementById('cardEditorCardPath');

        await window.board.moveCard( cardEditorCardPath.value, window.boardRoot + 'XXX-Archive/' + window.board.getCardFileName(cardEditorCardPath.value));
        e.target.id = 'board';
        await closeAllModals(e);

        return;
    };

    const cardEditorDupeLink = document.getElementById('cardEditorDupeLink');
    cardEditorDupeLink.removeEventListener('click', handleClickDuplicateCard, { once: true });
    cardEditorDupeLink.addEventListener('click', handleClickDuplicateCard, {once:true});

    const cardEditorMoveListLink = document.getElementById('cardEditorMoveListLink');
    if (cardEditorMoveListLink) {
        cardEditorMoveListLink.removeEventListener('click', handleClickMoveCard);
        cardEditorMoveListLink.addEventListener('click', handleClickMoveCard);
        await updateCardEditorMoveLink(cardEditorCardPath.value);
    }

    const cardEditorListSelect = document.getElementById('cardEditorListSelect');
    if (cardEditorListSelect) {
        cardEditorListSelect.removeEventListener('change', handleChangeCardListSelect);
        cardEditorListSelect.addEventListener('change', handleChangeCardListSelect);
        await updateCardEditorListDropdown(cardEditorCardPath.value);
    }

    const cardEditorClose = document.getElementById('cardEditorClose');
    cardEditorClose.removeEventListener('click', handleClickCloseCard, { once: true });
    cardEditorClose.addEventListener('click', handleClickCloseCard, {once:true});

    modalEditCard.style.display = 'block'; // Display after everything is loaded

    if (typeof setBoardInteractive === 'function') {
        setBoardInteractive(false);
    } else {
        const board = document.getElementById('board');
        if (board) {
            board.style.filter = 'blur(3px)';
            board.style.pointerEvents = 'none';
            board.style.userSelect = 'none';
        }
    }

    if (shouldOpenDueDatePicker) {
        cardEditorSetDueDateLink.focus();
        const editorFrontmatter = getEditorFrontmatter();
        openDueDatePickerAtTrigger({
            triggerElement: cardEditorSetDueDateLink,
            dueDateValue: editorFrontmatter.due,
            onSelect: async (value) => {
                await handleMetadataSave(value, 'due');
            },
        });
    }

    return;
}

async function handleNotesSave(value,instance) {
    if ( value === 'Notes...' ) {
        return;
    }

    queueEditorSave(value);

    return;
};

async function handleMetadataSave(value,metaName) {
    if (metaName !== 'due') {
        return;
    }

    const cardEditorContents = document.getElementsByClassName('overtype-input');
    const frontmatter = getEditorFrontmatter();

    const normalizedDueValue = value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value || '').trim();

    const normalizedFrontmatter = await window.board.normalizeFrontmatter({
        ...frontmatter,
        due: normalizedDueValue.length > 0 ? normalizedDueValue : null,
    });

    setEditorFrontmatter(normalizedFrontmatter);

    pendingEditorBody = cardEditorContents[0]?.value || '';
    await flushEditorSaveIfNeeded();
    await enqueueEditorSave(pendingEditorBody);

    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');

    if ( normalizedFrontmatter.due ) {
        cardEditorCardDueDateDisplay.textContent = await window.board.formatDueDate(normalizedFrontmatter.due);
    } else {
        cardEditorCardDueDateDisplay.textContent = '';
    }

    return;
};

function getCardListPath(cardPath) {
    const normalized = String(cardPath || '');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) {
        return '';
    }
    return normalized.slice(0, lastSlash);
}

function getPathDirectoryName(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : '';
}

function getCardEditorListDisplayName(directoryName) {
    const normalized = String(directoryName || '');
    const listNameMatch = normalized.match(/^\d{3}-(.*?)(-[^-]{5}|-stock)$/);
    if (listNameMatch) {
        return listNameMatch[1];
    }

    if (/^\d{3}-.+/.test(normalized)) {
        return normalized.slice(4);
    }

    return normalized || 'Untitled';
}

async function getOrderedListPaths() {
    if (!window.boardRoot) {
        return [];
    }
    const listNames = await window.board.listLists(window.boardRoot);
    return listNames.map((listName) => window.boardRoot + listName);
}

async function updateCardEditorListDropdown(cardPath) {
    const listSelect = document.getElementById('cardEditorListSelect');
    if (!listSelect) {
        return;
    }

    const listPaths = await getOrderedListPaths();
    const currentListPath = getCardListPath(cardPath);

    listSelect.innerHTML = '';

    if (listPaths.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No lists';
        listSelect.appendChild(emptyOption);
        listSelect.disabled = true;
        return;
    }

    for (const listPath of listPaths) {
        const option = document.createElement('option');
        option.value = listPath;
        option.textContent = getCardEditorListDisplayName(getPathDirectoryName(listPath));
        if (listPath === currentListPath) {
            option.selected = true;
        }
        listSelect.appendChild(option);
    }

    if (!listPaths.includes(currentListPath)) {
        listSelect.value = listPaths[0];
    }

    listSelect.disabled = false;
}

async function resolveCardMoveTarget(cardPath) {
    const listPaths = await getOrderedListPaths();
    const currentListPath = getCardListPath(cardPath);
    const currentIndex = listPaths.indexOf(currentListPath);

    if (currentIndex === -1) {
        return {
            listPaths,
            currentIndex,
            targetIndex: -1,
            targetPath: '',
            isRightmost: false,
        };
    }

    const isRightmost = currentIndex === listPaths.length - 1;
    const targetIndex = isRightmost ? currentIndex - 1 : currentIndex + 1;
    const targetPath = (targetIndex >= 0 && targetIndex < listPaths.length)
        ? listPaths[targetIndex]
        : '';

    return {
        listPaths,
        currentIndex,
        targetIndex,
        targetPath,
        isRightmost,
    };
}

async function getNextCardNumber(listPath) {
    const cards = await window.board.listCards(listPath);
    let maxNumber = -1;

    for (const name of cards) {
        const match = name.match(/^(\d{3})/);
        if (match) {
            maxNumber = Math.max(maxNumber, Number(match[1]));
        }
    }

    const nextNumber = maxNumber + 1;
    return nextNumber.toLocaleString('en-US', {
        minimumIntegerDigits: 3,
        useGrouping: false
    });
}

async function moveCardToListPath(cardPath, targetListPath) {
    if (!cardPath || !targetListPath) {
        return '';
    }

    const fileName = await window.board.getCardFileName(cardPath);
    const suffix = fileName.replace(/^\d{3}/, '');
    const nextNumber = await getNextCardNumber(targetListPath);
    const newFileName = nextNumber + suffix;
    const newPath = targetListPath + '/' + newFileName;

    await window.board.moveCard(cardPath, newPath);
    return newPath;
}

function showCardEditorListMoveFeedback() {
    const feedbackEl = document.getElementById('cardEditorListMoveFeedback');
    if (!feedbackEl) {
        return;
    }

    if (cardEditorListMoveFeedbackTimer) {
        clearTimeout(cardEditorListMoveFeedbackTimer);
        cardEditorListMoveFeedbackTimer = null;
    }

    feedbackEl.classList.remove('is-visible');
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add('is-visible');

    cardEditorListMoveFeedbackTimer = setTimeout(() => {
        feedbackEl.classList.remove('is-visible');
        cardEditorListMoveFeedbackTimer = null;
    }, 1200);
}

async function refreshCardEditorAfterMove(newPath) {
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (cardEditorCardPath) {
        cardEditorCardPath.value = newPath;
    }

    const cardEditorCardID = document.getElementById('cardEditorCardID');
    if (cardEditorCardID) {
        cardEditorCardID.textContent = await window.board.getCardID(newPath);
    }

    await renderBoard();
    await updateCardEditorMoveLink(newPath);
    await updateCardEditorListDropdown(newPath);
}

function setCardEditorMoveIcon(moveLink, iconName) {
    if (!moveLink || !window.feather || !window.feather.icons || !window.feather.icons[iconName]) {
        return;
    }

    moveLink.innerHTML = window.feather.icons[iconName].toSvg();
}

async function updateCardEditorMoveLink(cardPath) {
    const moveLink = document.getElementById('cardEditorMoveListLink');
    if (!moveLink) {
        return null;
    }

    const moveInfo = await resolveCardMoveTarget(cardPath);
    const isRightmost = moveInfo.listPaths.length > 0 && moveInfo.isRightmost;
    const iconName = isRightmost ? 'arrow-left' : 'arrow-right';
    const title = isRightmost ? 'Move to previous list' : 'Move to next list';

    setCardEditorMoveIcon(moveLink, iconName);
    moveLink.title = title;
    moveLink.setAttribute('aria-label', title);
    moveLink.dataset.targetPath = moveInfo.targetPath || '';
    moveLink.dataset.direction = isRightmost ? 'left' : 'right';

    return moveInfo;
}

async function handleClickMoveCard(e) {
    e.preventDefault();
    e.stopPropagation();

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (!cardEditorCardPath || !cardEditorCardPath.value) {
        return;
    }

    await flushEditorSaveIfNeeded();

    const moveInfo = await resolveCardMoveTarget(cardEditorCardPath.value);
    if (!moveInfo || !moveInfo.targetPath) {
        await updateCardEditorMoveLink(cardEditorCardPath.value);
        return;
    }

    const newPath = await moveCardToListPath(cardEditorCardPath.value, moveInfo.targetPath);
    if (!newPath) {
        return;
    }

    await refreshCardEditorAfterMove(newPath);
    return;
}

async function handleChangeCardListSelect(e) {
    e.stopPropagation();

    const listSelect = e.currentTarget;
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    if (!listSelect || !cardEditorCardPath || !cardEditorCardPath.value) {
        return;
    }

    const targetListPath = String(listSelect.value || '').trim();
    if (!targetListPath) {
        return;
    }

    const currentListPath = getCardListPath(cardEditorCardPath.value);
    if (targetListPath === currentListPath) {
        return;
    }

    listSelect.disabled = true;

    try {
        await flushEditorSaveIfNeeded();
        const newPath = await moveCardToListPath(cardEditorCardPath.value, targetListPath);
        if (!newPath) {
            return;
        }

        await refreshCardEditorAfterMove(newPath);
        showCardEditorListMoveFeedback();
    } finally {
        const latestCardPath = document.getElementById('cardEditorCardPath')?.value || cardEditorCardPath.value;
        await updateCardEditorListDropdown(latestCardPath);
    }

    return;
}

async function handleClickCloseCard( e ) {
    e.target.id = 'board';
    e.stopPropagation();
    await closeAllModals(e);
    return;
}

async function handleClickDuplicateCard( e ) {
    e.stopPropagation();
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');

    const card = await window.board.readCard(cardEditorCardPath.value);

    let currentCardName = await window.board.getCardFileName(cardEditorCardPath.value);
    let newCardName = '999' + currentCardName.slice(3,currentCardName.length).slice(0, -8) + await rand5() + '.md';

    let newCardPath = cardEditorCardPath.value.replace( currentCardName, newCardName );

    const copiedFrontmatter = await window.board.normalizeFrontmatter({
        ...card.frontmatter,
        title: `Copy of ${card.frontmatter.title || 'Untitled'}`,
    });

    await window.board.writeCard(newCardPath, {
        frontmatter: copiedFrontmatter,
        body: card.body,
    });

    e.target.id = 'board';
    await closeAllModals(e, { rerender: true });
    await toggleEditCardModal(newCardPath);

    return;
}
