async function toggleAddCardToListModal( x,y ) {
    const modalAddCardToList = document.getElementById('modalAddCardToList');
    const isOpen = !modalAddCardToList.classList.contains('hidden');
    
    if ( x ) {
        modalAddCardToList.classList.remove('hidden');
        modalAddCardToList.style.position = 'absolute';
        modalAddCardToList.style.top = y + 'px';
        modalAddCardToList.style.left = x + 'px';
        modalAddCardToList.style.display = 'flex';
        return;
    }

    if ( isOpen ) {
        modalAddCardToList.classList.add('hidden');
        modalAddCardToList.style.display = 'none';
    } else {
        modalAddCardToList.classList.remove('hidden');
        modalAddCardToList.style.display = 'flex';
    }
}
