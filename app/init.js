var turndown = new TurndownService();
const renderMarkdown = (md) => marked.parse(md);

async function init() {
    const previousOpenedBoard = localStorage.getItem('boardPath');

    if (previousOpenedBoard) {
        const labelBoardPath = document.getElementById('pickFolder');
        labelBoardPath.textContent = 'Switch Board';
        
        window.boardRoot = previousOpenedBoard;
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

        await closeAllModals(e);
    });
    document.getElementById('btnAddNewList').addEventListener('click', async () => {
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
    document.getElementById('pickFolder').addEventListener('click', async () => {
        const dir = await window.chooser.pickDirectory({ /* defaultPath: '/some/path' */ });
        if (dir) {
            document.getElementById('boardPath').value = dir;
            await window.board.importFromTrello(dir);
            await openBoard(dir);
        }
    });
}
init();
