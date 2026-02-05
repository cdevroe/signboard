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

function enqueueEditorSave(bodyValue) {
    const bodyToSave = typeof bodyValue === 'string' ? bodyValue : '';
    editorSaveInFlight = editorSaveInFlight
        .then(() => saveEditorCard(bodyToSave))
        .catch((error) => {
            console.error('Failed to save card.', error);
        });

    return editorSaveInFlight;
}

function queueEditorSave(bodyValue) {
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
        enqueueEditorSave(pendingEditorBody);
    }

    await editorSaveInFlight;
}

async function saveEditorCard(bodyValue) {
    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');

    const currentFrontmatter = getEditorFrontmatter();
    const normalizedFrontmatter = await window.board.normalizeFrontmatter({
        ...currentFrontmatter,
        title: cardEditorTitle.textContent.trim(),
    });

    setEditorFrontmatter(normalizedFrontmatter);

    await window.board.writeCard(cardEditorCardPath.value, {
        frontmatter: normalizedFrontmatter,
        body: typeof bodyValue === 'string' ? bodyValue : '',
    });
}

async function toggleEditCardModal( cardPath ) {
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

    const themeMode = localStorage.getItem('theme');

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

    if ( themeMode == 'dark' ) {
        OverType.setTheme(customOverTypeThemes.dark);
    } else {
        OverType.setTheme(customOverTypeThemes.light);
    }

    editor.setValue(card.body);

    cardEditorTitle.onkeydown = (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }
    };

    cardEditorTitle.onkeyup = async (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }

        const cardEditorContents = document.getElementsByClassName('overtype-input');
        await handleNotesSave(cardEditorContents[0].value,false);
    };

    const cardEditorSetDueDateLink = document.getElementById('cardEditorSetDueDateLink');
    const datepickerInput = document.getElementById('cardEditorCardDueDate');
    const datepicker = new FDatepicker(datepickerInput, {
        format: 'Y-m-d',
        autoClose: true,
    });

    if (card.frontmatter.due) {
        const [year, month, day] = card.frontmatter.due.split('-').map(Number);
        datepicker.setDate(new Date(year, month - 1, day));
    }

    datepicker.update({
        format: 'Y-m-d',
        autoClose: true,
        onSelect: async (value) => { await handleMetadataSave(value,'due'); }
    });

    datepickerInput.onchange = (e) => {
        if ( e.target.value === '' ) {
            handleMetadataSave('', 'due');
        }
    };

    cardEditorSetDueDateLink.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        datepicker.open();
    };

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

async function getOrderedListPaths() {
    if (!window.boardRoot) {
        return [];
    }
    const listNames = await window.board.listLists(window.boardRoot);
    return listNames.map((listName) => window.boardRoot + listName);
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

    const fileName = await window.board.getCardFileName(cardEditorCardPath.value);
    const suffix = fileName.replace(/^\d{3}/, '');
    const nextNumber = await getNextCardNumber(moveInfo.targetPath);
    const newFileName = nextNumber + suffix;
    const newPath = moveInfo.targetPath + '/' + newFileName;

    await window.board.moveCard(cardEditorCardPath.value, newPath);

    cardEditorCardPath.value = newPath;

    const cardEditorCardID = document.getElementById('cardEditorCardID');
    if (cardEditorCardID) {
        cardEditorCardID.textContent = await window.board.getCardID(newPath);
    }

    await renderBoard();
    await updateCardEditorMoveLink(newPath);

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
