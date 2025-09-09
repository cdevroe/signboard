async function toggleAddCardModal( x,y ) {
    const modalAddCard = document.getElementById('modalAddCard');

    if ( x ) {
        modalAddCard.style.position = 'absolute';
        modalAddCard.style.top = y + 'px';
        modalAddCard.style.left = x + 'px';
        modalAddCard.style.display = 'block';
        return;
    }

    if ( modalAddCard.style.display && modalAddCard.style.display == 'block' ) {
        modalAddCard.style.display = 'none';
    } else {
        modalAddCard.style.display = 'block';        
    }
}