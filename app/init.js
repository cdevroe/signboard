async function init() {
    const restoredBoard = restoreBoardTabs();
    const initializeHeaderControls = () => {
        initializeBoardLabelControls();
        initializeBoardSearchControls();
    };

    if (!restoredBoard) {
        window.boardRoot = '';
        if (typeof setBoardChromeState === 'function') {
            setBoardChromeState(false);
        }

        const emptyBoardCallToAction = document.getElementById('emptyBoardCallToAction');
        if (emptyBoardCallToAction) {
            emptyBoardCallToAction.addEventListener('click', async () => {
                if (typeof handleEmptyBoardCallToActionClick === 'function') {
                    await handleEmptyBoardCallToActionClick(emptyBoardCallToAction);
                    return;
                }
                await promptAndOpenBoardFromTabs();
            });
        }

        window.setTimeout(initializeHeaderControls, 0);
    } else {
        initializeHeaderControls();
    }

    if (restoredBoard) {
        window.boardRoot = restoredBoard;
        renderBoard().catch((error) => {
            console.error('Failed to render board on startup.', error);
        });
    }

    const userInput = document.getElementById('userInput');
    userInput.addEventListener('keydown',(key) => {
        if (key.code != 'Enter') return;
        const btnAddCard = document.getElementById('btnAddCard');
        btnAddCard.click();
    });
    const userInputCardName = document.getElementById('userInputCardName');
    userInputCardName.addEventListener('keydown',(key) => {
        if (key.code != 'Enter') return;
        const btnAddCardToList = document.getElementById('btnAddCardToList');
        btnAddCardToList.click();
    });
    document.addEventListener('click', async (e) => {
        if (e.target.offsetParent && e.target.offsetParent.className && e.target.offsetParent.className == 'overtype-preview' && e.target.tagName === "A") {
            e.preventDefault();
            window.electronAPI.openExternal(e.target.href);
            return;
        }

        closeLabelFilterIfClickOutside(e.target);
        closeCardLabelSelectorIfClickOutside(e.target);

        await closeAllModals(e);
    });
    document.getElementById('btnAddNewList').addEventListener('click', async (e) => {
        e.stopPropagation();
        const listName = document.getElementById('userInputListName');
        toggleAddListModal( (window.innerWidth / 2)-200, (window.innerHeight / 2)-100 );
        listName.focus();
        const btnAddList = document.getElementById('btnAddList');

        btnAddList.onclick = async (e) => {
            e.stopPropagation();   
            const listName = document.getElementById('userInputListName');

            if ( listName.value.length < 3 ) {
                return;
            }
            
            await processAddNewList( listName.value );

            listName.value = '';

            return;
        };

        listName.onkeydown = (key) => {
            if (key.code != 'Enter') return;
            const btnAddList = document.getElementById('btnAddList');
            btnAddList.click();
        };
    });
}
init();
