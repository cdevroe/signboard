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

        await window.board.createCard( boardPath + '000-To-do-stock/000-hello-stock.md', `👋 Start Here

Welcome to Signboard.

This board lives in a folder on your computer. Lists are folders. Cards are Markdown files. That means your work stays portable, readable, and very easy to make your own.

## Try these first

- Edit this card title or body.
- Drag this card to another list, then drag it back.
- Create a new card with the + button.
- Add a label or due date to this card.
- Archive this card when you are done exploring.

## A tiny pretend plan

Here are a few example tasks so you can see how checklists and task due dates work:

- [ ] (due: 2026-03-11) Rename this board to something you actually care about
- [ ] (due: 2026-03-12) Add a card for one real task you need to finish this week
- [ ] (due: 2026-03-13) Create a new list for ideas, errands, or "waiting on"
- [x] Opened Signboard and kicked the tires

## Things worth trying

- Add a due date to the whole card and then switch to Calendar view.
- Create a few cards and drag them between To do, Doing, and Done.
- Open Board Settings and customize labels for your own system.
- Change the board colors and make the space feel like yours.

## Keyboard shortcuts

On macOS use Cmd. On Windows and Linux use Ctrl.

- Hold Cmd or Ctrl for two seconds to peek at the shortcuts helper
- Cmd/Ctrl + N creates a new card
- Cmd/Ctrl + Shift + N creates a new list
- Cmd/Ctrl + 1 opens Kanban view
- Cmd/Ctrl + 2 opens Calendar view
- Cmd/Ctrl + 3 opens This Week view
- Esc closes open modals

## One last thing

If you want, leave this card here as a little orientation guide. Or archive it immediately and start fresh. Both are valid productivity philosophies.` );
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
