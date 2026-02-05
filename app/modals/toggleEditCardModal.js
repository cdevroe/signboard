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

    const cardID = await window.board.getCardID(cardPath);
    const cardEditorCardID = document.getElementById('cardEditorCardID');
    cardEditorCardID.textContent = cardID;
    cardEditorCardID.onclick = (e) => {
        e.preventDefault();
        window.board.openCard(cardPath);
    };

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');

    setEditorFrontmatter(card.frontmatter);
    cardEditorCardPath.value = cardPath;
    cardEditorTitle.textContent = card.frontmatter.title || '';
    cardEditorCardDueDateDisplay.textContent = '';

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

    const cardEditorClose = document.getElementById('cardEditorClose');
    cardEditorClose.removeEventListener('click', handleClickCloseCard, { once: true });
    cardEditorClose.addEventListener('click', handleClickCloseCard, {once:true});

    modalEditCard.style.display = 'block'; // Display after everything is loaded

    document.getElementById('board').style = 'filter: blur(3px)';

    return;
}

async function handleNotesSave(value,instance) {
    if ( value === 'Notes...' ) {
        return;
    }

    await saveEditorCard(value);

    return;
};

async function handleMetadataSave(value,metaName) {
    if (metaName !== 'due') {
        return;
    }

    const cardEditorContents = document.getElementsByClassName('overtype-input');
    const frontmatter = getEditorFrontmatter();

    const normalizedFrontmatter = await window.board.normalizeFrontmatter({
        ...frontmatter,
        due: value && value.trim().length > 0 ? value : null,
    });

    setEditorFrontmatter(normalizedFrontmatter);

    await saveEditorCard(cardEditorContents[0].value);

    const cardEditorCardDueDateDisplay = document.getElementById('cardEditorCardDueDateDisplay');

    if ( normalizedFrontmatter.due ) {
        cardEditorCardDueDateDisplay.textContent = await window.board.formatDueDate(normalizedFrontmatter.due);
    } else {
        cardEditorCardDueDateDisplay.textContent = '';
    }

    return;
};

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
    await closeAllModals(e);

    return;
}
