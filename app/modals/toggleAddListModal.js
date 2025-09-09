async function toggleAddListModal( x,y ) {
    const modalAddCard = document.getElementById('modalAddList');

    if ( x ) {
        modalAddList.style.position = 'absolute';
        modalAddList.style.top = y + 'px';
        modalAddList.style.left = x + 'px';
        modalAddList.style.display = 'block';
        return;
    }

    if ( modalAddList.style.display && modalAddList.style.display == 'block' ) {
        modalAddList.style.display = 'none';
    } else {
        modalAddList.style.display = 'block';        
    }
}