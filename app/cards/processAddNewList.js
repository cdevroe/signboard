async function processAddNewList( listName ){
    let currentLists = await window.board.listLists( window.boardRoot );
    let countLists = currentLists.length;

    let nextListNumber = countLists.toLocaleString('en-US', {
        minimumIntegerDigits: 3,
        useGrouping: false
    });

    let userCreatedListName = await sanitizeFileName( listName.slice(0,25) + '-' + await rand5());

    const fileName = nextListNumber + '-' + userCreatedListName;

    await window.board.createList( window.boardRoot + fileName );
    
    let e = {}; e.target = {}; e.target.id = 'board';
    
    await closeAllModals(e, { rerender: true });
    return;
}
