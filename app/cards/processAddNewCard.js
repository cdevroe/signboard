async function processAddNewCard( cardName, listPath, options = {} ){
    const targetBoardRoot = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(options.boardRoot || '')
        : String(options.boardRoot || '').trim();
    const activeBoardRoot = typeof normalizeBoardPath === 'function'
        ? normalizeBoardPath(window.boardRoot || '')
        : String(window.boardRoot || '').trim();
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

    const shouldRerenderActiveBoard = !targetBoardRoot || targetBoardRoot === activeBoardRoot;
    await closeAllModals(createCloseAllModalsRequest(), { rerender: shouldRerenderActiveBoard });

    if (options && options.openAfterCreate && typeof toggleEditCardModal === 'function') {
        if (targetBoardRoot && targetBoardRoot !== activeBoardRoot && typeof switchToBoardPath === 'function') {
            await switchToBoardPath(targetBoardRoot);
        }
        await toggleEditCardModal(cardPath, { focusNotes: true });
    }

    if (typeof announceSignboardStatus === 'function') {
        announceSignboardStatus(`Created card "${cardName}".`);
    }

    return cardPath;
}
