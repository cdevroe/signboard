async function toggleAddListModal( x,y ) {
    const modalAddList = document.getElementById('modalAddList');
    const isOpen = !modalAddList.classList.contains('hidden');

    if ( x ) {
        modalAddList.classList.remove('hidden');
        modalAddList.style.position = 'absolute';
        modalAddList.style.top = y + 'px';
        modalAddList.style.left = x + 'px';
        modalAddList.style.display = 'flex';
        return;
    }

    if ( isOpen ) {
        modalAddList.classList.add('hidden');
        modalAddList.style.display = 'none';
    } else {
        modalAddList.classList.remove('hidden');
        modalAddList.style.display = 'flex';
    }
}
