async function processAddNewCard( cardName, listPath, options = {} ){
    let countCardsInList = await window.board.countCards(listPath);
    countCardsInList++;
    
    const nextCardNumber = countCardsInList.toLocaleString('en-US', {
        minimumIntegerDigits: 3,
        useGrouping: false
    });

    let userCreatedFileName = await sanitizeFileName( cardName.slice(0,25).toLowerCase().split(' ').join('-') + '-' + await rand5() + '.md');

    const fileName = nextCardNumber + '-' + userCreatedFileName;

    const cardPath = listPath + fileName;

    await window.board.createCard( cardPath, cardName);
    
    await closeAllModals(createCloseAllModalsRequest(), { rerender: true });

    if (options && options.openAfterCreate && typeof toggleEditCardModal === 'function') {
        await toggleEditCardModal(cardPath, { focusNotes: true });
    }

    return cardPath;
}
