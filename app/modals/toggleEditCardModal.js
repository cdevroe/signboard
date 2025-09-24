async function toggleEditCardModal( cardPath ) {
    const modalEditCard = document.getElementById('modalEditCard');
    
    const fullMarkdown = await window.board.readCard(cardPath);
    let lines = fullMarkdown.split(/\r?\n/);
    const titleContent = lines[0];

    // Using OverType would result in line breaks being added
    // to the card notes. This removes them.
    let lineHasContents = false;
    lines = lines.filter((line, index) => {
        if (index === 0) {
            return true;
        }
        if (!lineHasContents && line.trim() === "") {
            return false;
        }
        lineHasContents = true;
        return true;
    });

    const md = lines.slice(1).join("\n");

    const cardID = window.board.getCardID(cardPath);
    const cardEditorCardID = document.getElementById('cardEditorCardID');
    cardEditorCardID.textContent = cardID;

    cardEditorCardID.addEventListener('click',(e) => {
        e.preventDefault();
        window.board.openCard(cardPath);
    });

    const cardEditorTitle = document.getElementById('cardEditorTitle');

    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    cardEditorCardPath.value = cardPath;

    cardEditorTitle.textContent = titleContent.replace('# ', '');

    const themeMode = localStorage.getItem('theme');
    
    const [editor] = new OverType('#cardEditorOverType', {
        value: md,
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
    
    editor.setValue( md );
    
    modalEditCard.style.display = 'block'; // Display after everything is loaded

    cardEditorTitle.addEventListener( 'keydown', (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }
    });

    cardEditorTitle.addEventListener( 'keyup', (e) => {
        
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }

        const cardEditorTitle = document.getElementById('cardEditorTitle');
        const cardEditorContents = document.getElementsByClassName('overtype-input');
        const cardEditorCardPath = document.getElementById('cardEditorCardPath');
        
        window.board.writeCard(cardEditorCardPath.value, '# ' + cardEditorTitle.innerHTML + "\n\n" + cardEditorContents[0].value);
    });

    const cardEditorArchiveLink = document.getElementById('cardEditorArchiveLink');
    cardEditorArchiveLink.addEventListener('click', async (e) => {
        const cardEditorCardPath = document.getElementById('cardEditorCardPath');

        await window.board.moveCard( cardEditorCardPath.value, window.boardRoot + 'XXX-Archive/' + window.board.getCardFileName(cardEditorCardPath.value));
        e.target.id = 'board';
        await closeAllModals(e);

        return;
        
    });

    const cardEditorDupeLink = document.getElementById('cardEditorDupeLink');
    cardEditorDupeLink.removeEventListener('click', handleClickDuplicateCard, { once: true });
    cardEditorDupeLink.addEventListener('click', handleClickDuplicateCard, {once:true});

    const cardEditorClose = document.getElementById('cardEditorClose');
    cardEditorClose.removeEventListener('click', handleClickCloseCard, { once: true });
    cardEditorClose.addEventListener('click', handleClickCloseCard, {once:true});

    document.getElementById('board').style = 'filter: blur(3px)';

    return;
}

async function handleNotesSave(value,instance) {    
    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorContents = value;
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');

    if ( cardEditorContents.length > 0 && cardEditorContents != 'Notes...' ) {
        await window.board.writeCard(cardEditorCardPath.value, '# ' + cardEditorTitle.innerHTML + "\n\n" + cardEditorContents);
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
    
    const cardContents = await window.board.readCard(cardEditorCardPath.value);

    const lines = cardContents.split(/\r?\n/);
    const titleContent = lines[0];
    const newCardContents = cardContents.replace(titleContent,titleContent.replace('#','# Copy of '))

    let currentCardName = await window.board.getCardFileName(cardEditorCardPath.value);
    let newCardName = '999' + currentCardName.slice(3,currentCardName.length).slice(0, -8) + await rand5() + '.md';

    let newCardPath = cardEditorCardPath.value.replace( currentCardName, newCardName );

    await window.board.writeCard( newCardPath, newCardContents);
    e.target.id = 'board';
    await closeAllModals(e);

    return;
}