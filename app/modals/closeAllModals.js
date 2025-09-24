async function closeAllModals(e){
    if (e.target.id != 'board' && e.key !== 'Escape') return;
    
    const modalAddCard = document.getElementById('modalAddCard');
    const modalEditCard = document.getElementById('modalEditCard');
    const modalAddCardToList = document.getElementById('modalAddCardToList');

    if ( e.target.id == 'board' || e.key == 'Escape' ) {
        if ( modalAddCard.style.display === 'block' ) {
            modalAddCard.style.display = 'none';
        }
        if ( modalEditCard.style.display === 'block' ) {
            modalEditCard.style.display = 'none';
            const cardEditorTitle = document.getElementById('cardEditorTitle');
            OverType.destroyAll();
            const cardEditorContents = document.getElementById('cardEditorOverType');
            cardEditorContents.value = '';
            cardEditorTitle.textContent = '';
            document.getElementById('board').style = 'filter: none';
        }
        if ( modalAddCardToList.style.display === 'block' ) {
            modalAddCardToList.style.display = 'none';
            document.getElementById('board').style = 'filter: none';
        }
        if ( modalAddList.style.display === 'block' ) {
            modalAddList.style.display = 'none';
            document.getElementById('board').style = 'filter: none';
        }
    } else {
        if ( modalAddCard.style.display === 'block' && !modalAddCard.contains(e.target) ) {
            modalAddCard.style.display = 'none';
        }

        if ( modalEditCard.style.display === 'block' && !modalEditCard.contains(e.target) ) {
            modalEditCard.style.display = 'none';
            const cardEditorTitle = document.getElementById('cardEditorTitle');
            OverType.destroyAll();
            const cardEditorContents = document.getElementById('cardEditorOverType');
            cardEditorContents.value = '';
            cardEditorTitle.textContent = '';
            document.getElementById('board').style = 'filter: none';
        }

        if ( modalAddCardToList.style.display === 'block' && !modalAddCardToList.contains(e.target) ) {
            modalAddCardToList.style.display = 'none';
            document.getElementById('board').style = 'filter: none';
        }
    }
    await renderBoard();
}