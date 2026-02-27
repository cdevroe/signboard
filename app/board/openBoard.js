async function pickAndOpenBoard() {
    const dir = await window.chooser.pickDirectory({ /* defaultPath: '/some/path' */ });
    if (!dir) {
        return false;
    }

    const boardPathInput = document.getElementById('boardPath');
    if (boardPathInput) {
        boardPathInput.value = dir;
    }

    await window.board.importFromTrello(dir);
    return openBoard(dir);
}

async function openBoard( dir ) {
    const boardPath = normalizeBoardPath(dir);
    if (!boardPath) {
        return false;
    }

    if (typeof closeBoardSettingsModal === 'function') {
        await closeBoardSettingsModal();
    }

    if (typeof flushBoardLabelSettingsSave === 'function') {
        await flushBoardLabelSettingsSave();
    }

    const tabResult = ensureBoardInTabs(boardPath);
    if (tabResult && tabResult.limitReached) {
        if (typeof alertBoardTabLimit === 'function') {
            alertBoardTabLimit();
        }
        renderBoardTabs();
        return false;
    }

    const directories = await window.board.listDirectories( boardPath );

    if ( directories.length == 0 ) {
        await Promise.all([
            window.board.createList(boardPath + '000-To-do-stock'),
            window.board.createList(boardPath + '001-Doing-stock'),
            window.board.createList(boardPath + '002-Done-stock'),
            window.board.createList(boardPath + 'XXX-Archive'),
        ]);

        await window.board.createCard( boardPath + '000-To-do-stock/000-hello-stock.md', `👋 Hello

Welcome to Signboard!

Here are some fun things to get you started:

- Create new cards by clicking the + button on any list
- Edit the title or notes on any card by tapping on them
- Reorder cards in a list or move them between lists by dragging them
- Archive a card by tapping the archive icon
- Reorder lists by dragging them
- Create new lists by clicking the "+ Add List" button
- Add due dates to cards
- Customize your labels in the Board Settings area
- Customize your light and dark color schemes per board

***Keyboard Shortcuts***

Control button on Windows. Command button on macOS.

- CMD + N - New card or task (with the ability to choose list)
- CMD + Shift + N - New list
- Escape - Dismiss all open modals

I hope you enjoy Signboard. If you have any feedback, please let me know. colin@cdevroe.com` );
    }

    window.boardRoot = boardPath;
    setStoredActiveBoard(window.boardRoot);

    if (typeof resetBoardLabelFilter === 'function') {
        resetBoardLabelFilter();
    }

    if (typeof resetBoardSearch === 'function') {
        resetBoardSearch();
    }

    await renderBoard();
    return true;
}
