window.addEventListener('keydown', async (e) => {

        if ( e.key == 'Escape' ) {
            await closeAllModals(e);
            return;
        }
    
        if (!e.ctrlKey && !e.metaKey) return;
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault(); // Prevent default behavior (if any)
            
            if ( e.shiftKey ) { // Add List
                const listName = document.getElementById('userInputListName');
                toggleAddListModal( (window.innerWidth / 2)-200, (window.innerHeight / 2)-100 );
                listName.focus();

                const btnAddList = document.getElementById('btnAddList');

                btnAddList.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    
                    const listName = document.getElementById('userInputListName');

                    if ( listName.value.length < 3 ) {
                        return;
                    }
                    
                    await processAddNewList( listName.value );

                    listName.value = '';
                    await closeAllModals(e);

                }, { once: true });

                listName.addEventListener('keydown',(key) => {
                    if (key.code != 'Enter') return;
                    const btnAddList = document.getElementById('btnAddList');
                    btnAddList.click();
                });

            } else {
                const listsToSelect = await window.board.listLists( window.boardRoot );

                const userInputListPath = document.getElementById('userInputListPath');
                userInputListPath.innerHTML = '';
                const cardName = document.getElementById('userInputCardName');

                listsToSelect.forEach((optionText, index) => {
                    const option = document.createElement("option");
                    option.value = `${window.boardRoot + optionText + '/'}`;
                    option.text = optionText.slice(4,optionText.length-6);
                    userInputListPath.appendChild(option);
                });

                document.getElementById('board').style = 'filter: blur(3px)';

                toggleAddCardToListModal( (window.innerWidth / 2)-200, (window.innerHeight / 2)-100 );
                cardName.focus();

                const btnAddCardToList = document.getElementById('btnAddCardToList');

                btnAddCardToList.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    
                    const cardName = document.getElementById('userInputCardName');
                    const listPath = document.getElementById('userInputListPath');
                    
                    await processAddNewCard( cardName.value, listPath.value );

                    cardName.value = '';
                    listPath.value = '';
                    await closeAllModals(e);

                }, { once: true });
            }

        }
    });