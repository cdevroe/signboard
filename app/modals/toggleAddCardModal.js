async function toggleAddCardModal( x,y ) {
    const modalAddCard = document.getElementById('modalAddCard');
    const isOpen = !modalAddCard.classList.contains('hidden');

    if ( x ) {
        modalAddCard.classList.remove('hidden');
        modalAddCard.style.position = 'absolute';
        modalAddCard.style.top = y + 'px';
        modalAddCard.style.left = x + 'px';
        modalAddCard.style.display = 'flex';
        return;
    }

    if ( isOpen ) {
        modalAddCard.classList.add('hidden');
        modalAddCard.style.display = 'none';
    } else {
        modalAddCard.classList.remove('hidden');
        modalAddCard.style.display = 'flex';
    }
}
