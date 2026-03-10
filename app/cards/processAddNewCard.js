async function processAddNewCard( cardName, listPath ){
    let countCardsInList = await window.board.countCards(listPath);
    countCardsInList++;
    
    const nextCardNumber = countCardsInList.toLocaleString('en-US', {
        minimumIntegerDigits: 3,
        useGrouping: false
    });

    let userCreatedFileName = await sanitizeFileName( cardName.slice(0,25).toLowerCase().split(' ').join('-') + '-' + await rand5() + '.md');

    const fileName = nextCardNumber + '-' + userCreatedFileName;

    await window.board.createCard( listPath + fileName, cardName);
    
    await closeAllModals(createCloseAllModalsRequest(), { rerender: true });
}
