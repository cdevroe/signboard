async function toggleEditCardModal( cardPath ) {
    const modalEditCard = document.getElementById('modalEditCard');
    
    const fullMarkdown = await window.board.readCard(cardPath);
    const titleContent = fullMarkdown.split(/\r?\n/)[0];

    let frontMatter     = fullMarkdown.split('**********');
    let isFrontMatter   = frontMatter.length > 1 ? true : false; // True means there is frontmatter
    let lines           = isFrontMatter ? frontMatter[1].split(/\r?\n/) : fullMarkdown.split(/\r?\n/);

    // Using OverType would result in line breaks being added
    // to the card notes. This removes them.
    let lineHasContents = false;
    let metadataString = '';
    let metadataArray = [];
    if ( isFrontMatter ) { // Handle metadata
        let metalines = frontMatter[0].split(/\r?\n/);
        
        metalines = metalines.filter((line, index) =>{
            if ( index === 0 ) { // Removes card title
                return false;
            }
            if ( line.trim() === "") { // Removes empty lines
                return false;
            }
            metadataString += line.trim() + "\n";
            metadataArray[line.split(': ')[0]] = line.split(': ')[1].trim();
        });

        
    }
    
    lines = lines.filter((line, index) => {
        if ( !isFrontMatter && index === 0) { // Removes card title
            return false;
        }
        if (!lineHasContents && line.trim() === "") { // Removes leading empty lines
            return false;
        }
        lineHasContents = true;
        return true;
    });
    const md = isFrontMatter ? lines.join("\n") : lines.slice(1).join("\n");

    const cardID = window.board.getCardID(cardPath);
    const cardEditorCardID = document.getElementById('cardEditorCardID');
    cardEditorCardID.textContent = cardID;

    if ( metadataArray && metadataArray['Due-date'] ) {
        const cardEditorCardDueDate = document.getElementById('cardEditorCardDueDateDisplay');
        const [year, month, day] = metadataArray['Due-date'].split("-").map(Number);
        const dateToDisplay = new Date(year, month -1, day);

        const dateOptions = { month: "short", day: "numeric" };
        const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(dateToDisplay);

        cardEditorCardDueDate.textContent = formattedDate;
    }

    cardEditorCardID.addEventListener('click',(e) => {
        e.preventDefault();
        window.board.openCard(cardPath);
    });

    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorCardMetadata = document.getElementById('cardEditorCardMetadata');
    cardEditorCardMetadata.value = isFrontMatter && metadataString.length > 0 ? metadataString : '';

    console.log(cardEditorCardMetadata.value);
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

    cardEditorTitle.addEventListener( 'keydown', (e) => {
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }
    });

    cardEditorTitle.addEventListener( 'keyup', async (e) => {
        
        if ( e.code == 'Enter' ) { e.preventDefault(); return; }

        const cardEditorContents = document.getElementsByClassName('overtype-input');
        await handleNotesSave(cardEditorContents[0].value,false);
    });

    const cardEditorSetDueDateLink = document.getElementById('cardEditorSetDueDateLink');
    const datepickerInput = document.getElementById('cardEditorCardDueDate');
    const datepicker = new FDatepicker(datepickerInput, {
        format: 'Y-m-d',
        autoClose: true,
    });

    if ( metadataArray && metadataArray['Due-date'] ) {
        const [year, month, day] = metadataArray['Due-date'].split("-").map(Number);
        datepicker.setDate(new Date(year, month - 1, day));

        // Now that we've set the initial date
        // Add an onSelect
        datepicker.update({onSelect: async (value) => { await handleMetadataSave(value,'Due-date')}})
    }

    cardEditorSetDueDateLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        datepicker.open();
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

    modalEditCard.style.display = 'block'; // Display after everything is loaded

    document.getElementById('board').style = 'filter: blur(3px)';

    return;
}

async function handleNotesSave(value,instance) {    
    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorContents = value;
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardEditorCardMetadata = document.getElementById('cardEditorCardMetadata');

    if ( cardEditorContents.length > 0 && cardEditorContents != 'Notes...' ) {
        await window.board.writeCard(cardEditorCardPath.value, '# ' + cardEditorTitle.innerHTML + "\n\n" + cardEditorCardMetadata.value + "\n" + "**********\n\n" + cardEditorContents);
    }
    
    return;
};

async function handleMetadataSave(value,metaName) {
    //console.log(value);
    const cardEditorTitle = document.getElementById('cardEditorTitle');
    const cardEditorContents = document.getElementsByClassName('overtype-input');
    const cardEditorCardPath = document.getElementById('cardEditorCardPath');
    const cardEditorCardMetadata = document.getElementById('cardEditorCardMetadata');

    if ( cardEditorCardMetadata.value.length > 0 ) {
        let metalines = cardEditorCardMetadata.value.split(/\r?\n/);
        let changedMetalines = '';
        let metaNameFound = false;
        await metalines.forEach((line) => {

            if ( line.trim() != "" ) {
                key = line.split(': ')[0];
                data = line.split(': ')[1];

                if ( key.trim() === metaName ) {
                    changedMetalines += key + ': ' + value + "\n";
                    metaNameFound = true;
                } else {
                    changedMetalines += key + ': ' + data.trim() + "\n";
                }

            }
        });

        //console.log(changedMetalines);

        if ( metaNameFound ) {
            cardEditorCardMetadata.value = changedMetalines;
        } else {
            cardEditorCardMetadata.value += metaName+": "+value+"\n";
        }
    } else {
        cardEditorCardMetadata.value = metaName+": "+value+"\n";
    }

    //console.log(cardEditorCardMetadata.value);

    if ( cardEditorCardMetadata.value.length > 0 ) {
        await window.board.writeCard(cardEditorCardPath.value, '# ' + cardEditorTitle.innerHTML + "\n\n" + cardEditorCardMetadata.value + "\n" + "**********\n\n" + cardEditorContents[0].value);
    }

    if ( metaName == 'Due-date' ) {
        const cardEditorCardDueDate = document.getElementById('cardEditorCardDueDateDisplay');
        const [year, month, day] = value.split("-").map(Number);
        const dateToDisplay = new Date(year, month -1, day);

        const dateOptions = { month: "short", day: "numeric" };
        const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(dateToDisplay);

        cardEditorCardDueDate.textContent = formattedDate;
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